# 設計図：Astro/GEO 公開面 P1（このリポ＝yah-mobile-v0.9）

対象ブランチ: `dev` ／ 作成: 2026-07-15 ／ ステータス: **設計（要承認→実装）**
出典: ユーザー提示の「実装設計図②」を**このリポ（本番稼働中）に合わせて再構成**。対象リポ記載の `yah-mobile-v4_latest` は空フォルダ＝誤り。正はこのリポ。
目的（P1）: **esim-chatgpt 1記事**を `yah.mobi/esim/ja/esim-chatgpt` に**GEOで読める静的HTML**（JS実行前に本文・価格・FAQがテキストで入る）として配信する。

## 0. 調査で確定した前提（済）
- **feed稼働**: `https://magazine.yah.mobi/feeds/esim.json` = 200。1記事(esim-chatgpt)。
- **本文の在処**: `translations.ja` に `{title, excerpt, body(Markdown 1830字), directAnswer, metaTitle, metaDescription, faq}`。※現状 ja のみ。
- **価格**: `priceBindings=["PAK783GRS","PYTKZG843"]`（プランdocID＝packageCode）。SSOT(Firestore plans)直読みで表を焼く。`showCompetitorTable=false`。
- **契約**: `canonical=/esim/ja/esim-chatgpt`。title の `W1-03｜` プレフィックスは表示側で除去。

## 1. アーキテクチャ判断（🔴 最重要）— **Option B（Astro統合）で確定（2026-07-15 承認）**
**Astro プロジェクト1本に React SPA を内包**（Astro内部はVite＝Viteは"外す"のではなく吸収）。
```
Astro（単一ビルド）
├── /esim/**・/・/plans   → Astro 静的（SSG・GEO）
└── /app・/mypage・/login・/admin → 既存 React SPA を client:only アイランドとして丸ごと搭載
```
**移行の安全ルール**：
- **専用ブランチ `feat/astro-migration`** で作業。本番 dev/main は無改修。
- **段階検証**：まず「Astroが静的 /esim ページを吐ける」（＝新規・低リスク部）を先に証明 → 次に「SPAをAstroに内包して従来どおり動く」（＝リスク部）。中間はViteとAstro併存でも可。
- devチャンネルで **SPA全機能（購入/ログイン/マイpage/GA4）＋静的ページGEO** の回帰確認 → 承認後に本番。
以前検討した「dual-build併存」は中間形態としてのみ許容。最終形は本統合(B)。

### 移植の要点（統合で触る箇所）
- `index.html` の head（フォント preload・GA4 gtag/Consent・chat widget・OG）→ Astro Layout の `<head>` へ移設。
- `main.tsx`（Reactエントリ・i18n/firebase/PWA初期化）→ Astro ページで `<App client:only="react" />` として搭載。wouter ルーティングはクライアントで従来どおり。
- Vite設定（`@` エイリアス・`@tailwindcss/vite`）→ `astro.config.mjs` の `vite` 欄へ移植。
- PWA/service worker（workbox）・現行 `prerender.mjs`（puppeteer）→ Astro SSG が公開面SEOを担うため段階的に整理。
- パッケージ管理は pnpm。`pnpm add -D astro @astrojs/react @astrojs/mdx`。
```
pnpm build（新）:
  1) vite build        → dist/public/**（既存SPA・現状のまま）
  2) astro build       → dist/public/esim/** 等（新・公開面の静的HTML）
  3) prerender.mjs     → 現状維持（/app等のSPA用SEO。Astro化した route は対象外に）
hosting rewrite:
  /api/**              → Functions（現状維持）
  /app,/app/**,/mypage/**,/login,/admin/** → SPA index.html（現状維持）
  /esim/**             → Astro 静的（実ファイル優先で自動配信）
  それ以外             → 当面SPA（Astro化した route だけ順次Astroへ）
```
- **理由**: 本番SPAを壊さず、route単位で可逆。Astro出力は追加のみ。
- **代替案**: Astroをメインに全面移行 → SPA移設が重く、GA直後の今はリスク過大＝却下。

## 2. P1 実装スコープ（esim-chatgpt 1本）
1. **Astro導入**: `pnpm add -D astro @astrojs/react @astrojs/mdx`（Reactは島用に後で使用）。`astro.config` で outDir を dist/public に（vite出力とマージ）。**※framework追加の可否（Manus/配信制約）は着手前にユーザー確認。**
2. **`src/astro/lib/esimGuides.ts`**: build時に feed を fetch（`?ts=` でキャッシュ回避）。プレビューは環境変数でローカルMD直読み（任意）。
3. **`src/astro/pages/esim/[lang]/[slug].astro`**: `getStaticPaths()` で feed×languages 展開。描画順 = **directAnswer → 本文(MD→HTML) → プラン表 → (競合表) → FAQ**。titleプレフィックス除去。
4. **プラン表（SSOT直読み）**: build時に firebase-admin(ADC) で plans を docID(priceBindings)取得 → 表HTML生成（最安バッジ無し・キャプション=記事の`confirmedDate`「◯年◯月◯日時点」）。競合表は `showCompetitorTable` 真のとき competitorPlans/main から。
5. **head**: canonical=絶対URL・hreflang(languages)・OG・**Article + FAQPage JSON-LD**。
6. **購入導線（P1=島化しない）**: 「購入」ボタン＋プラン表の各行 → **`/app?open=true&plan=<docID>` へdeep-link**（1遷移でSPAドロワー起動・既存機構）。島化(Y5/Y6)は P2 に先送り。
7. **hosting rewrite 分岐**（§1）。/app系は無改修。

## 3. 受入基準（P1完了の定義）
- `curl https://<dev>/esim/ja/esim-chatgpt`（JS実行前HTML）に、**directAnswer・本文・¥2,600等の価格・FAQ がテキストで入っている**。
- canonical=`https://yah.mobi/esim/ja/esim-chatgpt`、Article/FAQPage JSON-LD が有効。
- **/app・購入フロー・既存SEO（プリレンダ）は無改修で全て従来どおり**（回帰なし）。
- 購入ボタンから `/app?open=true&plan=PAK783GRS` でドロワーが開く。

## 4. 影響範囲・リスク・回帰防止
- 追加中心（Astro出力・新ディレクトリ `src/astro/`）。SPA/functions/Rulesは無改修。
- ビルド統合の失敗リスク → **dev チャンネルで先行検証**、本番は承認後。
- hosting rewrite は route スコープ・1コミットで可逆。
- CI（firebase-hosting-dev.yml / merge）の build ステップに astro build を追加要（P1で対応）。
- **同一URLを両器から出さない**（/esim はAstroのみ・canonical単一）。

## 5. P1以降（別設計図で）
- P2: PurchaseDrawer 共有島化（`openDrawer()`グローバル化）＋ガイド内即ドロワー（Y5/Y6）。
- P3: トップ/プラン紹介のAstro静的化（Y8）。多言語translations拡充。
- 将来: 現行 puppeteer prerender を Astro に段階置換（Product schema類のSEOバグを構造的に解消）。

## 6. 未確認・要ユーザー判断
1. **framework追加（Astro）の可否**（Manus/配信制約）。← 着手前に確認。
2. P1は ja 1言語のみ（feedがjaのみ）。多言語は translations 拡充待ち＝magazine側の担当。
