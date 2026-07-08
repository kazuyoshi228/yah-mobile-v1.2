# 設計書：実発注E2E(0.7-1)で判明した改善3件

対象ブランチ: `dev` ／ 作成: 2026-07-08 ／ ステータス: **設計（要承認→実装）**
契機: 実発注 `#la66cbNQt1azrnf9JwWx`（Japan 1GB 7Days IIJ / ¥980）を本番で通し、eSIM発行〜QR〜接続まで成功。その過程で3点の改善要望。

> 実データ（read-only 確認済み）
> - `esim_links/26070806270015`: `provider:"esimaccess"`, `status:"active"`(発行マーカー), `lastActiveAt:null`, `dataRemainingMb=dataTotalMb=1024`(未消費), **`expiryDate:2027-01-04`**（発注日+約6ヶ月）, `userId=uF9…xwj2`
> - topupプラン6本すべて `isActive:true`・`bappyPlanId`有・`planType:"topup"`・`topupForBase` に当該ベース `PK3VHQ9T6` を含む
> - `orders(orderType=topup)` = **0件**（topup注文は一度も作成されていない）

---

## ① eSIMステータスは "Ready to Install" なのに期限に確定日が出る（表示バグ）

### 背景・原因
実装時の前提は「未有効化なら `expiryDate` は null」だったが、**eSIMAccess は発行時点で `expiredTime`（≒インストール期限・約6ヶ月）を必ず返す**。これが `esim_links.expiryDate` に入るため：
- `deriveEsimStatus` は `lastActiveAt=null`＋データ未消費で正しく **"Ready to Install"** を返す。
- しかし期限表示は `expiryDate` の**有無**で分岐しており（[OrderDetailPage.tsx:171-195](client/src/pages/OrderDetailPage.tsx#L171)・[esimStatus.ts の formatEsimExpiry](client/src/components/mypage/esimStatus.ts)・[ActiveEsimSummary.tsx](client/src/components/mypage/ActiveEsimSummary.tsx)）、未有効化でも「**Expires Jan 4, 2027**」＝データ有効期限に見える確定日を表示してしまう。7日プランなのに半年使えるかのような誤解を生む。

`expiryDate` の実体＝**未有効化時はインストール期限（この日までに開通しないと失効）**。有効化後は eSIMAccess/同期が `expiredTime` を「開通+有効日数」に更新するため、そのまま実期限として使える。

### 変更方針（フロントのみ・挙動安全）
判定基準を「expiryDate の有無」から「**有効化済みか**」に変更する。
- **有効化済み**（`lastActiveAt != null` もしくはデータ消費あり）→ `Expires <expiryDate 日時>`（現状どおり）
- **未有効化**（Ready to Install）→ 誤解を避け、次の2行を出す：
  - `Valid for {plan.validityDays} days · from activation`（実データ有効期間＝7日）
  - `Install by <expiryDate 日付>`（インストール期限。expiryDate を正しい意味で提示）

### 対象ファイル
- [esimStatus.ts](client/src/components/mypage/esimStatus.ts)：`formatEsimExpiry` を「activated フラグ＋validityDays」で分岐する形に改修（`Expires` / `Valid for … + Install by …`）。判定ヘルパ `isEsimActivated(esim)` を切り出し `deriveEsimStatus` と共用。
- [OrderDetailPage.tsx](client/src/pages/OrderDetailPage.tsx)：`rows` の期限セクションを、activated で `Expires`、未活性で `Validity`＋`Install by` の2行に。
- [ActiveEsimSummary.tsx](client/src/components/mypage/ActiveEsimSummary.tsx)：同ヘルパで表示置換。
- [esimStatus.test.ts](client/src/components/mypage/esimStatus.test.ts)：`expiryDate` 有り＋未活性 → `Valid for … / Install by …`、活性 → `Expires …` のケース追加。

---

## ② 注文受付・発行完了メールが日本語固定（多言語化）

### 背景・原因
[mailer.ts](functions/src/mailer.ts) の注文ライフサイクル系メールは `<html lang="ja">` で**日本語ハードコード**：
- `buildPurchaseReceivedEmail`（ご注文を受け付けました）
- `buildEsimReadyEmail`（eSIMの発行が完了しました）
- `buildEsimPreparedEmail` / `buildEsimDelayedEmail` / `buildEsimFailedEmail`

一方 `buildRefundCompletedEmail` は **`order.language` で5言語**（en/ko/zh-CN/zh-TW/th）に対応済み（`normalizeRefundLang` ＋ copy テーブル）。注文者が日本人以外でも受付/発行メールが日本語で届く＝体験不整合。

### 変更方針（functions — 🚨要承認・本番デプロイは別途指示）
`buildRefundCompletedEmail` の実装パターンを踏襲し、ライフサイクル系メールを言語対応にする。
- `normalizeRefundLang` を汎用 `normalizeLang` に一般化（返金側も流用）。
- 各 build 関数に `language?: string | null` を受け取らせ、`en/ko/zh-CN/zh-TW/th` の subject/title/body テーブルで出し分け（既存の日本語は `ja` として保持し、未知/未設定は **en フォールバック**）。
- 呼び出し側で `order.language` を渡す：
  - [webhooks.ts:252](functions/src/webhooks.ts#L252)（受付・`order` in scope）／[webhooks.ts:336](functions/src/webhooks.ts#L336)（発行完了・`fulfillEsim(order)` 内で order 取得）
  - [esimRetryService.ts:157/251/348](functions/src/esimRetryService.ts)（delayed/ready/failed。language が無ければ order を引くか job に持たせる）

### 影響・リスク
- **functions 変更＝本番共有バックエンド**。実装・テスト後、**本番反映はユーザーの明示指示で別途**。
- 翻訳追加のみで送信ロジック・宛先は不変。テスト（`webhooks.test.ts` / `esimRetryService.test.ts` の mailer モック）を言語引数込みに更新。

---

## ③ /topup でプランを押しても購入に進めない → **根本原因確定：IAM欠落**

### 確定した原因（Cloud Logging＋IAMポリシーで実証）
本番 `yah.mobi` で「Buy」→ Loading → 遷移せず → 赤字「Payment failed. Please try again.」。
Cloud Logging（ユーザーのテスト時刻 06:54–06:55 UTC）に：
```
WARNING ordersinittopupcheckout
The request was not authorized to invoke this service. The access token could not be verified. … 401
```
= **Cloud Run ingress の 401**（関数本体は実行されていない）。IAMポリシー比較：

| Cloud Run サービス | `roles/run.invoker` の `allUsers` |
|---|---|
| `ordersinitcheckout`（通常購入） | ✓ あり → 動作OK |
| **`ordersinittopupcheckout`（topup）** | **✗ なし → 全リクエスト401** |
| `orderretrypayment`（再決済） | ✓ あり → 動作OK |

**根本原因**：topup の gen2 Cloud Run サービスに **`allUsers → roles/run.invoker` バインディングが欠落**。Firebase callable(gen2) は認証をアプリ層（Firebase Auth＋App Check）で行うため Cloud Run 側は公開invokerが必須。base/retry には付与済みだが topup だけ 2026-07-06 デプロイ時に取りこぼした（gen2＋組織ポリシーで既知の事象）。**コードは正常。所有権/プラン検索/provider ガードは全通過することも実データで確認済み**（注文0件＝ingressで弾かれ本体未実行のため）。

### 本修正（IAM — 🚨要承認・本番への操作）
`ordersinittopupcheckout` に `allUsers` の invoker を付与し、他の課金callableと揃える。いずれか：
- **(推奨) gcloud**（ユーザー実行 or 再auth後）:
  ```
  gcloud run services add-iam-policy-binding ordersinittopupcheckout \
    --region=asia-northeast1 --member=allUsers --role=roles/run.invoker \
    --project=yah-mobile-v1-3ed24
  ```
- **Cloud Run Admin API `setIamPolicy`**（ADCトークンで AI が実行可。get→binding追加→set の読み書き）。
- **再デプロイ** `firebase deploy --only functions:ordersInitTopupCheckout`（Firebaseが公開invokerを再付与。ただし同じ組織ポリシーで再取りこぼす可能性あり）。

付与後、本番で topup を押して **Stripe 画面へ遷移**することを確認（実決済は任意）。

### 併せて（フロント・防御的改善・低リスク）
[TopupPage.tsx の `catch {}`](client/src/pages/TopupPage.tsx#L90) が空で実エラーを握り潰す。実エラーを `console.error`＋既存フロントエラー収集（`/api/client-errors`）へ送るよう変更し、今後の失敗が本番でも追えるようにする（ユーザー表示は現状維持）。この改善は dev にコミット。

---

## 検証計画（共通）
1. `npx tsc --noEmit -p tsconfig.json`（Node22）
2. `npx vitest run --config vitest.client.config.ts`（①のテスト追加含む）
3. functions：`cd functions && npm run build && npm test`（②のメール言語テスト）
4. `npm run build` →（プリレンダ）→ `firebase hosting:channel:deploy dev` で①③(A)を dev 確認
5. `dev` にコミット。**②の functions／本番 hosting 反映はユーザーの明示指示で別途**

## 実施順の提案
- **③ topup IAM付与**（🚨要承認・原因確定済・最優先。付与だけで復旧。実決済に必要）
- **① 期限表示**（フロントのみ・低リスク・すぐ dev へ）
- **③ フロント防御**（空catch解消・dev へ）
- **② メール多言語**（functions・要承認・本番は指示待ち）
