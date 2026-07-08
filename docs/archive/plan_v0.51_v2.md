# yah.mobile v0.51 実装計画書 ver.2 — 未実装項目のみ

> 🗄️ **アーカイブ（2026-07-08）**：本書の残タスクは全て [../roadmap_to_v1.md](../roadmap_to_v1.md) に移管・棚卸し済み。
> 柱2はその後**本番稼働**（P2-1〜5/§8）。残タスクの最新は **roadmap_to_v1.md を単一台帳**として参照すること。本書は履歴として保存。

作成: 2026-07-07 ／ ステータス: **アーカイブ（roadmap_to_v1.md に移管）** ／ 基準コミット: `8559f37`
前提: 完了済みの経緯は plan_v0.51.md（ver.1）参照。**本書は「これから作るもの」だけ**に絞っていた（当時）。

> 🚨 CLAUDE.md の実装フロー厳守：`functions/`・`firestore.rules`・本番/hostingデプロイは**各フェーズ着手前にユーザー承認**。

---

## 0. 現在地（要約）

**完了して本番稼働中**（詳細は ver.1 §1.5）：返金機能（Lane A/B・Stripe真実源・5言語メール・キルスイッチ）／`/contact` 専用ページ／**S1 可観測性**／**S9 アラート到達性**／**S10 プロバイダ死活監視**／**S7 運用ランブック**（[runbook_solo_ops.md](./runbook_solo_ops.md)）／**方式B Googleログイン**（authDomain=yah.mobi 同一オリジン化＋モバイルRedirect・同意画面ドメイン改善／[design_google_consent_domain.md](./design_google_consent_domain.md)）／S2 CI／S4 PWA／DB改善。

**柱2 進捗**：**Phase 0 完了**（eSIMAccess登録・API仕様確定・**日本実機テストOK＝IIJ/ドコモ・non-HK IP**）→ **eSIMAccessメイン化を決定**。**Phase 1（Provider抽象）設計済み**（[design_provider_abstraction.md](./design_provider_abstraction.md)・実装待ち）。

**現行評価：A（約94/100）**。Must-fix「返金」「可観測性」クローズ済み。

**GAに残る本丸：柱1（Webhook認証）・柱2 Phase1〜4（eSIMAccess実装＝SPOF緩和）・サポート/チャット整合。** ＋ 早期の軽量項目（S3/S5/S8）。

---

## 1. 残タスク一覧（優先度・規模つき）

| # | 項目 | 種別 | 優先 | 規模 | 状態 | GAゲート |
|---|---|---|---|---|---|---|
| 柱2 | **eSIMAccess実装**（メイン化）：Phase1抽象→Phase2実装→Phase3返金/topup連携→Phase4カナリア | functions+client | ★★★ | 大 | Phase0✅/Phase1設計済 | ✅必須 |
| 柱1 | Bappy/eSIMAccess Webhook 受信認証（多層防御・eSIMAccessは既知IP許可） | functions | ★★★ | 中 | 未（柱2 Phase2と合流） | ✅必須 |
| SUP | サポート/チャット整合 | 別PJ or フロント | ★★ | 小〜中 | 未（/contact導線は済） | ✅必須 |
| S3 | アクセシビリティ（a11y） | フロント | ★★ | 中 | 未 | 推奨 |
| S5 | lastSignedIn 毎ログイン更新 | functions/client | ★ | 小 | 未 | 任意 |
| S8 | 依存自動更新（Dependabot/Renovate） | CI設定 | ★ | 小 | 未 | 任意 |
| S6' | 管理画面の `any` 削減 | フロント | ☆ | 中 | 未 | 任意 |
| ~~S7~~ | ~~運用ランブック~~ | ドキュメント | — | — | ✅完了 | ✅ |

---

## 2. 柱1：Webhook 受信認証 【GA必須・中】

### 現状（実コード）
| Webhook | 認証 |
|---|---|
| `stripeWebhook` | ✅ 署名検証あり |
| `bappyWebhook`（`webhooks_bappy.ts`） | ❌ **無し**（`// TODO: Verify Bappy signature` 残存） |

URL＋有効な `bappyLinkUuid` を知る第三者が eSIM 状態/使用量を偽装更新しうる（金銭非直結だが要対応）。

### やること
1. **OMAX/Bappy に受信署名の有無・方式を問い合わせ**（英文ドラフト用意）。
2. 分岐：
   - **(a) 署名あり** → `bappyWebhook` に署名検証実装（Secret Manager でキー管理）。
   - **(b) 署名なし** → **多層防御**：①URLに推測不能な秘密トークン ②送信元IP許可（公開があれば） ③**行動前に `getLinkDetail` で裏取り**してから Firestore 更新 ④失敗は `notifyOwner`（S9でメール必達化済み）。
3. eSIMAccess Webhook も同方針（署名記載なし＝多層防御前提）。

### 受け入れ基準
- 認証/裏取りに失敗したリクエストで Firestore を更新しない（テストで担保）。
- **要承認・functionsデプロイはユーザー指示**。

---

## 3. 柱2：eSIMAccess 単一プロバイダ化 【GA必須・大＝最大WS】

詳細設計は [design_provider_abstraction.md](./design_provider_abstraction.md) / [esimaccess_api_notes.md](./esimaccess_api_notes.md)。**方針は §0 で確定＝eSIMAccess を唯一の稼働プロバイダにし（ローンチ前の一気切替・カナリア無し）、Bappyは休眠。SPOF実害は「販売停止ガード＋自動返金＋死活監視」で受容**（2社冗長ではない）。

### 狙い・方針（2026-07-07 確定）
- **SPOF緩和** ＋ **cancel/返金・topup（枯渇時OK）・balance** を得る。
- 🎯 **eSIMAccess を唯一の稼働プロバイダ**、**Bappy/OMAX は販売停止＝休眠**（コードは残置・既存eSIM同期は継続）。**自動フェイルオーバー・代替QRは作らない**。

### フェーズと残To-Do
**Phase 0 — 契約・調査（✅完了）**
- [x] パートナー登録・API仕様確定・日本実機テストOK（IIJ=ドコモ・JP-IP）・署名/IP/cancel返金確認済み。

**Phase 1 — Provider 抽象（✅完了）** — `providers/types.ts`（`EsimProvider`/`getProvider`）／`providers/bappy.ts`（休眠委譲）／`fulfillEsim`・`esimRetryService`・`onEsimSyncRequested`・topup を `getProvider(...)` 経由へ／`shared/types` に provider/providerRef。

**Phase 2 — eSIMAccess 実装・ガード・Webhook（✅コード完了 / デプロイ未）**
- [x] **P2-1** `providers/esimaccess.ts`（createEsim/getEsimDetail/topup/cancel/queryBalance・HMAC署名 `esimaccess/auth.ts`/`client.ts`）
- [x] **P2-2** 単国JP取込 `scripts/import-esimaccess-plans.mjs` → **IIJ 6ベース＋6topup=12件を本番 plans に isActive:false 投入済み**
- [x] **P2-5** 発注/リトライを provider で routing（`order.provider=plan.provider`・retry job に provider）
- [x] **P2-3** 販売停止ガード `salesStopGuard.ts`（down で購入弾き）＋ `providerHealthCheck` を eSIMAccess 残高ping へ転換（低残高警告付き）
- [x] **P2-4** `esimaccessWebhook`（多層防御＝IP許可＋秘密トークンURL＋/esim/query裏取り＋notifyId冪等）
- [x] **§8** 返金cancel連携（未有効化eSIMAccessは cancel=残高返金 → Stripe返金）／発行系5関数に ESIMACCESS シークレット付与
- [ ] （残）**PlansTab 2価格（卸USD/小売JPY）表示・編集UI**（無くてもConsoleで価格設定は可）
- [ ] （残・要承認）`firestore.rules` の plans 新フィールド検証（最小追加）

**Phase 3 — デプロイ／有効化／実発注（⏳ ユーザー操作＋dev確認）**
- [ ] `firebase login --reauth` → シークレット3つ bind（`ESIMACCESS_ACCESS_CODE`/`ESIMACCESS_SECRET_KEY`/`ESIMACCESS_WEBHOOK_TOKEN`）
- [ ] functions デプロイ → eSIMAccess で **Webhook URL 登録**（`/webhook/save`・秘密トークン付き）
- [ ] 12プランに **JPY価格設定＋活性化**、Bappyプランを `isActive:false`
- [ ] dev で eSIMAccess plan 1件 E2E（発行→QR→同期→残量アラート→topup→cancel/返金）

### 受け入れ基準
- eSIMAccess 経由で「発行→QR→同期→topup→cancel/返金」が通る／ダウン時は販売停止＆in-flight自動返金／Bappy既存eSIMの同期回帰なし。
- **実装状況（dev push済 f17cbf4 時点）：functions 65 tests / root tsc green。バックエンドはデプロイ待ち。**

---

## 4. S7：運用ランブック（solo運用）【✅初版作成済・随時更新】

- **`docs/runbook_solo_ops.md`（[こちら](./runbook_solo_ops.md)）を作成済み**（恒久・生きた文書）。障害/返金/手動発行/デプロイ/復旧/バックアップ手順を集約（バス係数=1対策）。
- 既存の実装済み機能を手順に落とす：**S10死活アラートが来たときの対応**（OMAX認証確認手順）／**返金の実行**（/admin返金タブ＋キルスイッチ）／**プロバイダ切替**（柱2導入後）。
- 2026-07 インシデント（`OMAX_CLIENT_ID` 改行→4日ダウン）を「プロバイダ認証失効」ケースとして明記。
- コード変更なし。計画書とは分離し相互リンク。

---

## 5. SUP：サポート/チャット整合 【GA必須・小〜中】

現状：`/contact` 専用ページと問い合わせフォームは本番稼働。AIチャット（`yah-chat-webdev`）は別プロジェクトで進行中（別リポジトリ・Error Reportingノイズ対応タスクあり）。

GA前にどちらか：
- **(a) AIチャットを実装・稼働**（別PJ完了を待つ）、または
- **(b) 表記のフォーム主導への修正**（"24/7 chat" 等の暫定化・CTAを `/contact` へ・Terms/Privacy/Cookie 連絡先の有効化）。

→ [design_support_ai_chat_copy.md](./design_support_ai_chat_copy.md) 準拠。**チャット稼働の見通し次第で (a)/(b) を選ぶ**。

---

## 6. 早期・軽量（GA前推奨〜任意）

- **S3 a11y（推奨・中）**：aria/キーボード点検。購入・問い合わせフォーム優先。フロントのみ。
- **S5 lastSignedIn（任意・小）**：毎ログインで更新する仕組み（現状ほぼ未更新）。functions or client。
- **S8 依存自動更新（任意・小）**：Dependabot/Renovate で npm/pnpm・Firebase SDK 更新PRを自動化。CI設定。
- **S6' 管理画面 `any` 削減（任意・中）**：型安全性の底上げ。

---

## 7. 推奨実行順（依存関係）

```
✅ 済  S7ランブック ／ 柱2 Phase0（契約・API確定・実機OK＝eSIMAccessメイン確定）
        │
▶ 次   柱2 Phase1（Provider抽象・Bappy挙動不変）  … 設計済み・実装承認待ち・functions
        │
M3     柱2 Phase2（eSIMAccess実装＋Webhook多層防御=柱1の結論を合流）  … 要承認・functions/rules/secrets
        │
M4     柱2 Phase3（フロント適合＋eSIMAccess cancel→返金連携＋topup復活）＋ S3/S5  … 要承認
        │
M5     柱2 Phase4（カナリアで日本品質実測→主をeSIMAccessに寄せる／GA判定）＋ SUP整合  … 本番はユーザー指示
```

> **柱1（Webhook認証）は柱2 Phase2に合流**：eSIMAccessは公式IP許可（既知5個）があるので、bappyWebhook/esimaccessWebhook を**多層防御（IP許可＋秘密トークンURL＋query裏取り＋notifyId冪等）**で1本化して結論づける。

---

## 8. GA ゲート（残りのみ）

- [ ] **柱2 Phase1〜4 実装**（Provider抽象→eSIMAccess実装→返金/topup連携→カナリア）＝**Must-fix「SPOF」緩和**の本丸。Phase0✅／Phase1設計済み。
- [ ] **柱1 Webhook 受信認証の結論**（多層防御を Phase2 で実装）
- [ ] **eSIMAccess 返金連携**（cancel→refund・Phase3。※汎用返金は実装済み）
- [ ] **サポート/チャット整合**（(a)チャット稼働 or (b)フォーム主導への表記修正）
- [ ] （推奨）S3 a11y

> 既に満たしたゲート：Must-fix返金 ✅／可観測性（Error Reporting＋フロント収集＋S10死活＋S9到達性）✅／CIテストゲート ✅／**S7 運用ランブック ✅**。

---

## 9. 次アクション（提案）
1. **柱2 Phase1（Provider抽象）実装の承認 → 実装**（設計書は [design_provider_abstraction.md](./design_provider_abstraction.md)）。Bappy挙動不変・41テスト通過で安全。
2. 続けて **Phase2（eSIMAccess実装＋Webhook多層防御）** の設計→承認→実装。
3. **Phase4 カナリア**で日本品質を実測しつつ主を eSIMAccess へ。SUP（サポート表記）整合で GA ゲートを閉じる。
