# 設計図：GA4 詳細ファネル計測（訪問者→購入）

対象ブランチ: `dev` ／ 作成: 2026-07-15 ／ ステータス: **設計（要承認→実装）**
測定ID: `G-DVVQ3D5M6Z`（公開値）／ 計測ポリシー: **A. Consent Mode v2**（承認済み）
目的: 着地→プラン閲覧→選択→購入開始→ログイン→決済→**購入完了**の各段の離脱を、訪問者全体（同意前含む）で計測する。

---

## 1. 全体構成

```
[クライアント] gtag.js 常時ロード（Consent Mode: analytics_storage 既定 denied）
   ├ 同意前: Cookieなし匿名ping（上端の直帰も集計モデリングで可視化）
   ├ 同意後: consent update → granted（フル計測）
   └ eコマースイベント: view_item_list → select_item → begin_checkout → login → add_payment_info
        │ 注文作成時に GA client_id / session_id を order に添付
        ▼
[サーバー] stripeWebhook（発券成功時）→ Measurement Protocol で purchase 送信
   （client_id で同一ユーザーのファネルに縫合・value/currency/transaction_id 付き）
```

**なぜ purchase をサーバー送信にするか**: ①Stripe決済後にタブを閉じた客も取りこぼさない ②返金/失敗で水増ししない ③収益額が正確。Webhook が購入の真実の источник。

## 2. クライアント実装

### 2.1 gtag.js ロード＋Consent Mode（`client/index.html`）
`<head>` に、既存アプリJSより前に：
```html
<script async src="https://www.googletagmanager.com/gtag/js?id=G-DVVQ3D5M6Z"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  // Consent Mode v2: 既定は全 denied（広告系は使わない）。analytics は Cookie同意で granted に更新。
  gtag('consent', 'default', {
    ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied',
    analytics_storage: 'denied', wait_for_update: 500,
  });
  gtag('config', 'G-DVVQ3D5M6Z', { anonymize_ip: true });
</script>
```

### 2.2 同意連動（`client/src/lib/analytics.ts` / `CookieBanner.tsx`）
- Cookie「承諾」時: `gtag('consent','update',{ analytics_storage:'granted' })`（既存 `loadUmamiIfConsented` と同じ発火点＝`handleAccept`＋起動時に承諾済みなら update）。
- 「拒否」時: 何もしない（既定 denied のまま＝匿名pingのみ）。

### 2.3 gtag ラッパー（新規 `client/src/lib/ga4.ts`）
- `ga4Event(name, params)` … `window.gtag?.('event', name, params)`（未ロード/SSR安全）。
- `getGaClientId(): Promise<string|null>` … `gtag('get','G-DVVQ3D5M6Z','client_id',cb)`（注文添付用）。
- ※ GA4イベントは **Cookie同意有無に関わらず送る**（Consent Mode が denied 時は自動で匿名化・Cookieなし送信に切替わる）。自前 trackEvent の同意ゲートとはポリシーが異なる点に注意。

### 2.4 ファネルイベント設置（既存 trackEvent 呼び出し点に併設）
| GA4イベント | 発火点 | params |
|---|---|---|
| `view_item_list` | プランセクションが初回ビューイン（IntersectionObserver） | `item_list_id:"plans"`, items[] |
| `select_item` | プランカードtap（既存 plan_card_click/plan_select 点） | item{id,name:GB,price} |
| `begin_checkout` | ドロワー起動（既存 checkout_start 点） | value, currency:"JPY", items[] |
| `login` | サインイン成功（Step3Login の自動前進 effect） | method:"google" |
| `add_payment_info` | 決済ステップ到達（Step4Payment mount） | value, currency, items |
| `purchase` | **サーバー（Webhook）** | 下記 3章 |

`page_view` は gtag config が自動送出（SPA遷移は AppPage の言語/ルート変化時に `gtag('event','page_view')` 明示補完）。

### 2.5 注文への client_id 添付
- `usePurchaseCheckout` の注文作成（`ordersInitCheckout` 呼び出し）payload に `gaClientId`（＋任意 `gaSessionId`）を追加。
- 取得は 2.3 の `getGaClientId()`。取得不可（未同意でCookieなし等）の場合は null → サーバーは client_id 無しでも purchase を送る（新規ID扱い・件数は取れる）。

## 3. サーバー実装（functions・要承認・秘密）

### 3.1 Secret
- `GA4_MP_API_SECRET`（Measurement Protocol APIシークレット）を Secret Manager に登録し `stripeWebhook` に bind。測定IDはコード定数（公開値）。

### 3.2 orders callable / order ドキュメント
- `shared/schemas` の checkout 入力に `gaClientId?: string` `gaSessionId?: string`（zod `.nullish()`）を追加。
- `ordersInitCheckout` が order ドキュメントに `gaClientId` を保存。

### 3.3 purchase 送信（`functions/src/webhooks.ts` 発券成功後）
- `fulfillEsim` 成功時に `sendGa4Purchase(order)` を呼ぶ（失敗しても発券・返金に影響させない try/catch・ログのみ）。
- POST `https://www.google-analytics.com/mp/collect?measurement_id=G-DVVQ3D5M6Z&api_secret=<secret>`
  body: `{ client_id: order.gaClientId ?? <fallback uuid>, events: [{ name:"purchase", params:{ transaction_id: orderId, value: amountJpy, currency:"JPY", items:[{item_id, item_name, price, quantity:1}] } }] }`
- topup購入も同様（`ordersInitTopupCheckout` 経路）。

## 4. プライバシー/法務（コンプラ監査の誠実路線を維持）
- `PrivacyPolicy.tsx` 第三者提供欄に「Google Analytics（アクセス解析・Google LLC・米国）」を追記。
- `CookiePolicy.tsx` に GA4 Cookie（`_ga`等）と Consent Mode の説明を追記。
- Cookieバナー文言は現行のままで可（「optional analytics cookies」に GA4 が含まれる）。同意前は Cookie を書かない（Consent Mode denied）ため整合。

## 5. 影響範囲・リスク
- クライアント: index.html / analytics.ts / CookieBanner.tsx / ga4.ts(新) / 各ファネル点(AppPage, PlansSection, Step3Login, Step4Payment) / usePurchaseCheckout / PrivacyPolicy / CookiePolicy。
- functions: webhooks.ts / callables/orders.ts / shared schema / 新 util `ga4.ts` / Secret bind。**functionsデプロイは要ユーザー指示**。
- リスク: purchase二重送信 → transaction_id で GA4 が自動重複排除。CSP に `www.googletagmanager.com`(script) / `www.google-analytics.com`・`*.analytics.google.com`(connect) の許可追加が必要（firebase.json）。

## 6. 検証
1. tsc / vitest / functions build+test。
2. dev/本番で GA4 **DebugView** に page_view→view_item_list→…→(実購入で)purchase が順に出る。
3. Consent Mode: 同意前でも匿名イベントが送られる（denied 状態）ことを DebugView/Network で確認。
4. purchase の value/currency/transaction_id が正しい。返金時に purchase が増えない。
5. GA4「探索→目標到達プロセス」で 訪問→購入 の各段離脱が可視化される。

## 7. 反映
- クライアント: 次の hosting リリース。functions（purchase/secret）: 別途ユーザー指示でデプロイ。GA4 の反映は数分〜数時間のラグあり。
