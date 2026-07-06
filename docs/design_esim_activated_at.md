# 設計図：注文ステータス＋eSIMステータスの2系統表示（アクティベート日時含む）

作成日: 2026-07-06 / 対象ブランチ: `dev` / 種別: UX改善（表示・派生ロジック追加）

---

## 1. 背景・目的

マイページで eSIM の**利用ライフサイクル**（インストール前 → 有効化 → データ切れ → 期限切れ）と**アクティベート日時**が分からない。加えて、現状は注文状態 `fulfilled` を「Active」と表示しており、**「注文の状態」と「eSIM の状態」が混同**されている。

これを **2系統のステータス**に整理して表示する：
- **Order status（注文）**＝ 購入・発行の成否（`order.status`）… 注文リスト/詳細
- **eSIM status（eSIM）**＝ いま使えるか等の利用状態（`esim_link` 由来）… ACTIVE eSIM カード/詳細

## 2. 実コード確認（要点）

| 項目 | 結果 |
|---|---|
| アクティベート日時 | `functions/src/webhooks_bappy.ts` が `lastActiveAt = Date.now()`（Unix ms）で保存済み。**関数は変更しない**（読取確認のみ / CLAUDE.md 準拠） |
| eSIM 状態源 | `esim_link.status`（`active`/`expired`）・`lastActiveAt`・`dataRemainingMb`/`dataTotalMb`・`expiryDate` |
| マッピング | `useMyPageData.ts:50` / `OrderDetailPage.tsx:50` とも `{...d.data()}` spread → 全フィールド取り込み済み（マッピング変更不要） |
| カード表示条件 | `useMyPageData` は `order.status === "fulfilled"` の eSIM を ACTIVE カードに出す（発行済み=まだ未インストールも含む） |
| Top-up 遷移先 | 既存ルート `/mypage/topup/:esimLinkId`（`App.tsx:56` / `OrderDetailPage.tsx:255` に既存リンク） |
| 決定事項 | ①2系統分離 ②注文 `fulfilled`→「Completed」 ③eSIM未有効化→「Ready to Install」 ④Need Top-up 閾値=残量10%（0含む） |

## 3. eSIM ステータス（派生ロジック）

新規ヘルパー **`client/src/components/mypage/esimStatus.ts`**：
```ts
export type EsimStatusKey = "ready" | "active" | "topup" | "expired";
export function deriveEsimStatus(esim: {
  status?: string | null; lastActiveAt?: number | null;
  dataRemainingMb?: number | null; dataTotalMb?: number | null;
  expiryDate?: Date | string | null;
}): { key: EsimStatusKey; label: string; dotClass: string; pulse: boolean } {
  const now = Date.now();
  const expired = esim.status === "expired" ||
    (esim.expiryDate != null && new Date(esim.expiryDate).getTime() < now);
  const activated = esim.status === "active" || esim.lastActiveAt != null;
  const r = esim.dataRemainingMb, t = esim.dataTotalMb;
  const lowData = (r != null && r <= 0) || (r != null && t != null && t > 0 && r / t <= 0.10);

  if (expired)      return { key: "expired", label: "Expired",          dotClass: "bg-gray-400",  pulse: false };
  if (!activated)   return { key: "ready",   label: "Ready to Install", dotClass: "bg-blue-400",  pulse: false };
  if (lowData)      return { key: "topup",   label: "Need Top-up",      dotClass: "bg-orange-400",pulse: false };
  return              { key: "active",  label: "Active",           dotClass: "bg-green-400", pulse: true };
}
```
判定優先：Expired → Ready to Install →（Need Top-up / Active）。

## 4. 変更ファイル（表示・ロジック追加のみ／既存ロジック削除なし）

| ファイル | 変更 |
|---|---|
| `client/src/components/mypage/types.ts` | `EsimLink` に `lastActiveAt?: number \| null;` を追加 |
| `client/src/components/mypage/esimStatus.ts`（新規） | 上記 `deriveEsimStatus` ヘルパー |
| `client/src/components/mypage/ActiveEsimSummary.tsx` | ①ハードコードの「Active」バッジ → `deriveEsimStatus` による**動的バッジ**（ドット色/パルス/ラベル）②`Activated <日時>`（有効化済みのみ）を Expires の下に表示 ③`key==="topup"` の時 **Top-up CTA**（`/mypage/topup/:id`）④見出し「ACTIVE eSIM」→「YOUR eSIM」（状態が複数になるため中立化） |
| `client/src/pages/OrderDetailPage.tsx` | `rows` に **`Activated`**（有効化済みのみ）と **`eSIM Status`**（`deriveEsimStatus().label`）を追加（Expires の前後に配置） |
| `client/src/components/StatusBadge.tsx` | 注文 `fulfilled` の label を **"Active" → "Completed"**（注文状態としての意味に是正。緑ドットは維持） |

**日時形式**：`toLocaleString("en-US", { year, month:"short", day, hour:"2-digit", minute:"2-digit" })`（例：`Jul 6, 2026, 09:30 AM`、ブラウザTZ）。
**i18n**：既存ラベルはハードコード英語のため、追加ラベルも英語ハードコードで統一（新規i18nキーは追加しない）。

## 5. 影響範囲・リスク

- **影響範囲**：ACTIVE eSIM カード／注文詳細テーブル／注文リストのバッジ文言。既存の購入・データ・ロジックは不変。
- **リスク**：小。`lastActiveAt`/`dataRemainingMb` が null の場合は各条件で安全に分岐（未有効化は「Ready to Install」、データ不明時は topup 判定に入らず Active）。`lastActiveAt` は number 前提（`Date.now()` 書き込み）。
- **バックエンド不変**：`functions/`・`firestore.rules` は変更しない（`esim_links` 読取は既存ルールで許可済み）。

## 6. テスト／検証計画

1. `npx tsc --noEmit`（型チェック）
2. `npx vitest run --config vitest.client.config.ts`（既存テスト通過。`deriveEsimStatus` に**軽い単体テスト**を追加：ready/active/topup/expired の4分岐）
3. プレビュー / dev チャンネルで確認：
   - 有効化済みeSIM：カードが「Active」＋`Activated <日時>`／注文詳細に `Activated`・`eSIM Status: Active`
   - 未有効化（`lastActiveAt` null）：カードが「Ready to Install」／`Activated` 非表示
   - データ枯渇（残量≤10%）：「Need Top-up」＋Top-up CTA
   - 期限切れ：「Expired」
   - 注文リスト：`fulfilled` が「Completed」表示
4. `dev` にコミット → 本番反映は別途ユーザー指示（CLAUDE.md）。

---

## 承認のお願い
上記（2系統ステータス／`deriveEsimStatus`／表示更新／`fulfilled`→Completed／Need Top-up 閾値10%）で実装してよろしいでしょうか？ 承認後に着手します。
