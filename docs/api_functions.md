# Cloud Functions API 仕様（yah.mobile）

Firebase Cloud Functions v2。リージョンは特記なき限り `asia-northeast1`。
種別は **Callable**（`onCall`・App Check 必須）／ **HTTP**（`onRequest`・Webhook 等）／ **Scheduled**（`onSchedule`）／ **Firestore Trigger**。

入力スキーマの実体は `shared/schemas.ts`（zod）。Callable は undefined→null 変換のため任意項目は `.nullish()`。

---

## Callable Functions（クライアントから `httpsCallable` 経由）

クライアント側ラッパー：`client/src/lib/callable.ts`（`CALLABLE` 定数 / `callFunction` / `useCallableMutation`）。
全 Callable は `enforceAppCheck: true`。認証必須のものは `request.auth` を検証する。

### `ordersInitCheckout` — 初回購入のチェックアウト作成
`functions/src/callables.ts:403`

| 項目 | 型 | 必須 | 備考 |
|---|---|---|---|
| bappyPlanId | string(min1) | ✅ | 購入プランの Bappy プランID |
| origin | string(url) | ✅ | Stripe 戻りURLの生成元 |
| termsConsented | boolean | ✅ | 利用規約同意 |
| privacyConsented | boolean | ✅ | プライバシー同意 |
| marketingConsented | boolean | ✅ | マーケティング同意 |
| timezone | string(max100) | – | 端末タイムゾーン |

**出力**: `{ checkoutUrl, orderId }`（Stripe Checkout へリダイレクト）。
**副作用**: `orders` に `status:"pending"` の注文を作成（`planName` 保存済み）。レート制限あり。

### `ordersInitTopupCheckout` — トップアップのチェックアウト作成
`functions/src/callables.ts:509`

| 項目 | 型 | 必須 |
|---|---|---|
| esimLinkUuid | string(min1) | ✅ |
| bappyPlanId | string(min1) | ✅ |
| origin | string(url) | ✅ |
| timezone | string(max100) | – |

**副作用**: 対象 eSIM の所有者検証（IDOR 対策）後、トップアップ注文を作成。

### `orderRetryPayment` — 失敗注文の支払いリトライ
`functions/src/callables.ts:250`

| 項目 | 型 | 必須 |
|---|---|---|
| orderId | string(min1) | ✅ |
| origin | string(url) | ✅ |

**出力**: 新しい `checkoutUrl`。所有者検証あり。

### `submitContactInquiry` — お問い合わせ送信
`functions/src/callables.ts:322`

| 項目 | 型 | 必須 | 備考 |
|---|---|---|---|
| name | string(max100) | – | |
| email | string(email,max254) | ✅ | |
| location | string | – | |
| category | string | – | |
| detail | string | – | |
| message | string(max2000) | ✅ | |
| orderId | string | – | |
| formStartTime | number | ✅ | 送信までの経過時間（ボット検出） |
| _hp | string | – | ハニーポット（値が入っていれば拒否） |

**副作用**: `contact_inquiries` へ作成 → `onContactCreated` トリガでオーナー通知。

### 管理者向け Callable
| 関数 | 位置 | 用途 |
|---|---|---|
| `analyticsGetAiInsights` | callables.ts:76 | 期間集計を LLM で要約（`period: 24h/7d/30d/90d`、出力は5000字にクランプ）。`forgeApiKey` 使用 |
| `incidentRunRetryNow` | callables.ts:175 | eSIM 発行リトライを即時実行 |
| `adminMigrateIsActiveToBoolean` | callables.ts:185 | 移行用（`plans.isActive` の boolean 正規化） |

---

## HTTP Functions（`onRequest`）

| 関数 | 位置 | 用途 | 認証 |
|---|---|---|---|
| `stripeWebhook` | webhooks.ts:33 | Stripe 決済イベント受信 → eSIM 発行 | Stripe 署名検証 |
| `bappyWebhook` | webhooks_bappy.ts:31 | Bappy(OMAX) eSIM 状態変化の受信 | **OMAX 側で認証**（当方は変更しない）。失敗時 `notifyOwner` |
| `analyticsEvents` | analytics.ts:26 | フロントの解析イベント収集（同意連動） | – |
| `llmsTxt` | llmsTxt.ts:159 | `/llms.txt` を動的生成（AI エージェント向け） | 公開 |

---

## Scheduled Functions（`onSchedule`）

| 関数 | 位置 | スケジュール | 用途 |
|---|---|---|---|
| `esimRetryJob` | scheduled.ts:20 | 定期 | `esim_retry_jobs` を処理して eSIM 発行を再試行 |
| `hungOrderMonitor` | scheduled.ts:45 | every 15 minutes | `orders status=="provisioning"` かつ 30分以上更新なしを検知しオーナー通知（単一等価クエリ＋メモリ内フィルタ、複合インデックス不要） |
| `updateCurrencyRates` | currencyRates.ts:10 | 定期 | `exchange_rates` を更新 |

---

## Firestore Triggers

| 関数 | 位置 | トリガ | 用途 |
|---|---|---|---|
| `onEsimSyncRequested` | triggers.ts:73 | onDocumentUpdated `esim_links` | `syncRequestedAt` 更新でBappyから最新使用量を同期 |
| `onContactCreated` | triggers.ts:124 | onDocumentCreated `contact_inquiries` | オーナー通知 |
| `onAllowedEmailWritten` | triggers.ts:193 | onDocumentWritten `allowed_emails` | 招待制メールの整合 |
| `onInquiryUpdated` | triggers.ts:210 | onDocumentUpdated `contact_inquiries` | ステータス変更処理 |
| `onUserUpdated` | triggers.ts:222 | onDocumentUpdated `users` | プロフィール変更処理 |

---

## Secrets（Secret Manager）

`defineSecret` で参照。主なもの：`BUILT_IN_FORGE_API_KEY`（LLM）、`SLACK_WEBHOOK_URL`（通知）、`GMAIL_USER` / `GMAIL_PASS`（メール）、Stripe 系。
🚨 シークレット値はコード/ドキュメントに記載しない。
