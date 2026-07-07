# 設計書：柱2 — eSIMAccess 単一プロバイダ化（Provider抽象 ＋ eSIMAccess実装 ＋ TOPUP ＋ 販売停止ガード）

対象ブランチ: `dev` ／ 作成: 2026-07-07（改訂: 方針確定を反映）／ ステータス: **設計（要承認→実装）**
関連: [esimaccess_api_notes.md](./esimaccess_api_notes.md)（確定API）／ [plan_v0.51_v2.md](./plan_v0.51_v2.md) 柱2 ／ [spec_refund.md](./spec_refund.md)（返金）

---

## 0. 決定事項（確定・2026-07-07）

- 🎯 **eSIMAccess を“唯一の稼働プロバイダ”にする**。**ローンチ前なので一気切替**（カナリア省略）。全 eSIMAccess 日本プランを取り込む（`provider="esimaccess"`）。
- **エラー時＝すべて自動返金**（既存 Lane A/B）。**代替QR・自動フェイルオーバーは作らない**（採用しない）。
- **Bappy/OMAX ＝ 販売停止（`isActive:false`）・コードは“休眠”として残す**（削除しない＝現稼働パスを触る大手術を避ける／既存Bappy eSIMの同期も継続）。
- **Provider抽象は“薄く”残す**：将来の別プロバイダ追加余地（「他社もいる」前提）。今回実装するのは eSIMAccess のみ、Bappyは休眠impl。
- **SPOFの実害対策 ＝ 「販売停止ガード ＋ 自動返金 ＋ 死活監視」**（2社冗長ではない＝意識的な受容。トラフィック増で再検討）。
- ✅ **TOPUP は本けん（eSIMAccess実装＝Phase2）で“同時実装”する**（§4に詳細）。理由：eSIMAccess の topup は **データ枯渇（Depleted）でも可**で、**Bappyで塞いでいた topup 機能を復活**できるため。

---

## 1. 目的・全体像

発行/同期/topup を **`getProvider(name)` 経由**に統一（薄い Provider抽象）。eSIMAccess を実装して**唯一の稼働プロバイダ**にし、Bappy は休眠。単一プロバイダの実害は**販売停止ガード＋自動返金**で封じる。

```
購入(Stripe) → fulfillEsim → getProvider(order.provider="esimaccess").createEsim
   → esimaccessWebhook(ORDER_STATUS) → getEsimDetail(query) で ICCID/QR 確定
発行失敗(最終) → 自動返金(実装済 Lane A)
eSIMAccessダウン(死活監視) → 販売停止フラグON → 購入callableが弾く（課金しない）
topup(Stripe) → getProvider(...).topup（TOPUP_パッケージ）
返金 → 未有効化なら cancel(残高返金) → Stripe refund（真実源 webhook）
```

---

## 2. Provider 抽象（薄い）

`functions/src/providers/types.ts`（新規）
```ts
export type ProviderName = "esimaccess" | "bappy";

export interface CreateEsimParams { providerPlanId: string; orderId: string; transactionId: string; }
export interface EsimDetail {
  providerRef: string;            // eSIMAccess: esimTranNo / Bappy: link uuid（安定ID）
  iccid: string | null;
  activationCode: string | null;  // LPA (ac)
  qrCodeUrl: string | null;
  status: string | null;          // 生ステータス（正規化は esimStatus.ts 側）
  dataRemainingMb: number | null;
  dataTotalMb: number | null;
  expiryDate: number | null;      // epoch ms（DB-04整合）
}
export interface TopupParams { providerRef: string; providerPlanId: string; transactionId: string; periodNum?: number; }

export interface EsimProvider {
  readonly name: ProviderName;
  createEsim(p: CreateEsimParams): Promise<{ providerRef: string; detail?: EsimDetail }>;
  getEsimDetail(providerRef: string): Promise<EsimDetail>;
  topup(p: TopupParams): Promise<EsimDetail>;            // ★同時実装（§4）
  cancel?(providerRef: string): Promise<{ ok: boolean }>; // eSIMAccessのみ（未使用=残高返金）
  queryBalance?(): Promise<{ balanceUsd: number }>;       // eSIMAccessのみ（残高監視）
}

// order/esim_link の provider で分岐。未設定は "bappy"（既存互換）。新規販売は全て "esimaccess"。
export function getProvider(name?: string | null): EsimProvider;
```

- `providers/esimaccess.ts`（新規・本命）／`providers/bappy.ts`（既存 `bappy/*` の薄い委譲・休眠）。

### 正規化マッピング
| 抽象 | eSIMAccess | Bappy（休眠） |
|---|---|---|
| createEsim | `/esim/order`(transactionId,packageInfoList)→orderNo → 非同期 | `createLink` |
| getEsimDetail | `/esim/query`(esimTranNo/orderNo)→ iccid/ac/qrCodeUrl/status/usage/expiry | `getLinkDetail` |
| topup | `/esim/topup`(esimTranNo,TOPUP_packageCode,transactionId) | `addTopupPlan` |
| cancel | `/esim/cancel`(esimTranNo・未使用のみ残高返金) | — |
| queryBalance | `/balance/query` | — |

> eSIMAccess は**発行が非同期**（order→Webhook `ORDER_STATUS(GOT_RESOURCE)`→query）。`createEsim` は `providerRef` を返し、`ICCID/QR` は `getEsimDetail` で確定（Webhook駆動＋未確定時 `200010` はポーリング）。IFはこの非同期に耐える形。

---

## 3. eSIMAccess 実装（Phase2 本体）

`functions/src/providers/esimaccess.ts`
- **認証**：write系は **HMAC-SHA256 署名**（`RT-AccessCode`＋`RT-RequestID`(uuid.v4)＋`RT-Signature`＋`RT-Timestamp`。`signData=TS+ReqID+AccessCode+Body`／key=`SecretKey`）。read は `RT-AccessCode` でも可だが実装は署名で統一。
- **createEsim**：`POST /esim/order`（`transactionId`=冪等キー=orderId由来、`packageInfoList:[{packageCode,count:1,price}]`）→ `orderNo` を `providerRef` 系に保存。
- **getEsimDetail**：`POST /esim/query`（`esimTranNo`優先、無ければ`orderNo`）→ 正規化（bytes→MB、`expiredTime`→epoch ms、残量=`totalVolume−orderUsage`）。
- **cancel**：`POST /esim/cancel`（未使用[GOT_RESOURCE/RELEASED]のみ＝残高返金）。
- **queryBalance**：`POST /balance/query`（残高監視・§5）。
- クライアント：`functions/src/providers/esimaccess/{auth,client,order,query,topup}.ts` に分割（Bappy構成に倣う）。

---

## 4. ★ TOPUP（本けんで“同時実装”する — 明記）

**方針：本 eSIMAccess 統合（Phase2）で topup も実装する。** Bappy時代は「データ0で拾えない」ため塞いでいたが、**eSIMAccess は New/In Use/Depleted で topup 可（期限切れ後のみ不可）**＝**機能を正式復活**させる。

- **サーバ**：`EsimProvider.topup()` を実装（eSIMAccess `/esim/topup`）。`functions/src/callables.ts` の `ordersInitTopupCheckout`（Stripe後）→ 発行元プロバイダの `getProvider(link.provider).topup(...)` を呼ぶ形に一般化（現行 `addTopupPlan` 直呼びを置換）。
- **可用プラン取得**：`/package/list`（`type=TOPUP` ＋ `esimTranNo`/`packageCode`）で「その eSIM に打てる TOPUP」を取得。`supportTopUpType` 2/3 が対象。
- **プラン登録**：`plans`(planType=`topup`, provider=`esimaccess`) に **eSIMAccess の実 `TOPUP_` packageCode＋JPY価格**を登録（Bappyダミー問題の再発防止）。既存 `TopupPage.tsx`／`ordersInitTopupCheckout` はそのまま利用（provider経由に内部だけ差し替え）。
- **表示**：`esimStatus.ts` の「Need Top-up」判定はそのまま。topup後は `getEsimDetail` の新 `totalVolume/expiredTime` を反映。
- **プロバイダ固定**：topup は必ず**発行元（＝esimaccess）**へ。`esim_link.provider` で振り分け（Bappy発行の既存eSIMは休眠Bappy topupだが、新規は全てesimaccess）。

> ⚠️ topup を Phase2 に含めることでスコープは増えるが、**UIと決済フローは既存流用**のため増分は「provider.topup 実装＋プラン登録＋既存呼び出しの差し替え」に限定。**同時実装が費用対効果高**。

---

## 5. 販売停止ガード（単一プロバイダの実害対策・本けんで実装）

- **死活監視の転換**：`providerHealthCheck`（15分）を **eSIMAccess の認証/残高ping**（`/balance/query` or 署名付き軽量read）に変更（Bappy pingは休眠時は任意）。
- **停止フラグ**：`system_config/provider_health.esimaccess.status="down"`（既存 `system_config` ルール配下・追加不要）。
- **購入弾き**：`ordersInitCheckout`／`ordersInitTopupCheckout` が**発行前にフラグを確認**し、`down` なら購入を停止（`HttpsError("unavailable", "只今購入を停止しています")`＝**課金しない**）。＋オーナー通知（S9到達保証）。
- ＝ **障害中は売らない**（課金トラブルを起こさない）＋ in-flight 失敗は**自動返金**。

---

## 6. データモデル（後方互換）

- `FsOrder.provider?: "esimaccess"|"bappy"|null`（新規販売=esimaccess。未設定=bappy互換）。
- `FsEsimLink.provider?` ＋ 汎用 `providerRef?`（esimaccess=esimTranNo／bappy=uuid）。既存 `bappyLinkUuid` は残置（読み取り互換）。
- `FsPlan`（拡張）：
  - `provider`（既定 esimaccess）＋ `providerPlanId`（packageCode/slug）＋ 既存 `planType`（initial/topup）。
  - **価格2種を保持**（下記 §6.1）：`priceJpy`（自社**小売JPY**・既存）＋ **`wholesalePriceUsd`**（eSIMAccess **卸USD**・`price/10000`）。
  - **キャリア識別（§6.4）**：`network`（実キャリア。例 `"IIJ"`）／`networkType`（`"4G/5G"` 等）／`ipExport`（データ出口国。`"HK"`/`"JP"`…／`nonhkip = ipExport!=="HK"`）。
  - メタ：`dataGb`/`validityDays`/`speed`/`locationCode`/`supportTopUpType`/`fupPolicy`。
  - `name`（既存）は **人間向け表示ラベル**（例 `"Japan 10GB 30Days (IIJ)"`）として**そのまま保持**。判定/絞り込みは `name` をパースせず `network`/`ipExport` で行う。
- rules：esim_links/orders は既存どおり Cloud Functions 専用書込。**新フィールド追加のみ**。plans の provider/providerPlanId のバリデーションは Phase2 で最小追加（**要承認**）。

### 6.1 価格モデル（卸USD ＋ 小売JPY の2本立て）
- **`wholesalePriceUsd`（卸・仕入）**：eSIMAccess の `price`（USD×10000）を `/10000` した値。**取り込み/同期で自動更新**。/admin では**参照＋手動補正可**。
- **`priceJpy`（小売）**：**自社マージンで決める顧客請求額（Stripe）**。/admin で**設定・変更**。
- **/admin PlansTab**：両価格を**表示・編集**でき、**マージン**（`priceJpy − wholesalePriceUsd×為替` の目安）も併記して判断しやすく。
- 🔴 **発注時に価格を送らない**（`/esim/order` の price/amount は任意）→ **卸USDがズレても発注は壊れない**（200005/200006 回避）。＝`wholesalePriceUsd` は**マージン把握のための情報**であって、発注の正しさには使わない。顧客請求は常に `priceJpy`（Stripe）。

### 6.2 プラン取り込み方針（確定）
1. **まず単国JP（`locationCode=JP`）を取り込む**。多国（Asia/Global）は後日追加。
2. **取り込みは既定 `isActive:false`（ステージング）**。取り込み時に `wholesalePriceUsd`・メタを埋める。
3. **販売する数点だけ `isActive:true`＋`priceJpy` 設定**（例：1/3/5/10GB × 7/15/30日 の綺麗なラインナップ。50個並べない）。
4. **topup プラン**（`type=TOPUP`）も同方式で取り込み（planType=topup）。
5. **活性プランのSKU生存チェック**：活性の `providerPlanId` が eSIMAccess カタログに存在するか軽く定期確認（or /admin「活性プラン検証」ボタン）。廃止SKU（310241）を指さないように。

### 6.3 取り込みスクリプト
`scripts/import-esimaccess-plans.mjs`（読み取り→書き込み）：`POST /package/list`（`locationCode=JP`／`type=TOPUP`）→ `plans` へ写像投入（`isActive:false`）。冪等（`providerPlanId` で upsert）・`--dry` 対応。実行後は /admin PlansTab で活性化＋JPY設定。写像：
```
name                         → name（そのまま・表示用）
packageCode / slug           → providerPlanId
operatorList[0].operatorName → network      （実キャリア。IIJ/無印の識別）
operatorList[0].networkType  → networkType  （4G/5G）
ipExport                     → ipExport      （出口国。nonhkip判定）
price / 10000                → wholesalePriceUsd（卸USD）
volume(bytes)→dataGb, duration→validityDays, speed, supportTopUpType, fupPolicy, location→locationCode
provider = "esimaccess", isActive = false
```

### 6.4 キャリア識別（IIJ / 無印 / nonhkip）
- **目的**：「Japan 10GB (IIJ)」「同 無印」「同 (nonhkip)」等の**似て非なるプランを構造的に区別**する。判定は `network`/`ipExport` で行い、`name` はパースしない。
- **意味**：`network`＝実キャリア（IIJ＝ドコモ網）。`ipExport`＝データ出口国（`"HK"` だと香港経由、`nonhkip` は非香港＝日本旅行者に好適）。
- **用途**：(1) /admin で「ドコモ系」「非HK-IP」を絞って選定。(2) 将来の**同一eSIMAccess内キャリア・フェイルオーバー**（IIJ発注失敗→別キャリアpackageCodeへ）に使う。
- **リスク整理（キャリア冗長 vs アグリゲーター冗長）**：別キャリアのJPプランを持てば **①日本キャリア障害（例ドコモ広域ダウン）には有効**（別キャリアは無事）。ただし **②eSIMAccessプラットフォーム障害は全プラン一律ダウン**（同一API経由）＝販売停止ガード＋自動返金で受容。→ 詳細は本節の判断材料として保持。
- **⚠️ 検証**：実機テスト済みは **IIJ(ドコモ) のみ**。無印/nonhkip 等を採用する場合は**実機で日本品質を確認**してから活性化する（`ipExport`・`operatorList` を併せて確認）。

---

## 7. Webhook（柱1＝多層防御をここで確立）

`functions/src/webhooks_esimaccess.ts`（新規）
- 受信認証（署名なし）を**多層防御**で固める：
  1. **送信元IP許可**（公式5IP：`3.1.131.226 / 54.254.74.88 / 18.136.190.97 / 18.136.60.197 / 18.136.19.137`）。
  2. **秘密トークンURL**（`/webhook/save` で推測不能パス登録・Secret Manager）。
  3. **裏取り**：通知内容を鵜呑みにせず `/esim/query` で権威データ取得後に Firestore 更新。
  4. **`notifyId` で冪等**（重複無視）。`CHECK_HEALTH` には 200。
- イベント写像：`ORDER_STATUS(GOT_RESOURCE)`→発行確定/ICCID・QR取得トリガー、`ESIM_STATUS`→lifecycle、`DATA_USAGE`/`VALIDITY_USAGE`→通知パイプライン（既存 webhooks_bappy 相当）。
- **柱1の bappyWebhook も同方針で認証追加**（休眠でも受けるため／既存TODO解消）。

---

## 8. 返金連携（既存 executeRefund に adapt）

- 発行失敗（最終）→ **自動返金**（実装済 Lane A・変更最小）。
- 追加：**未有効化の eSIMAccess 注文は `cancel`（残高返金）してから Stripe refund**＝仕入原価も回収（`executeRefund` の前段に provider.cancel を差し込む・provider=esimaccess かつ未使用時のみ）。使用後は cancel 不可＝Stripe refund のみ。

---

## 9. フロント適合・MyPage 体験改善（Phase3）

発行後の顧客体験を、eSIMAccess の豊富なデータ/Webhook で**能動的・分かりやすく**する。Phase2 の `getEsimDetail`/Webhook に乗せる（＝多くは“ついで”で実現）。

### 9.1 現状（実コード）
- `mypage/esimStatus.ts`（ready/active/topup/expired 導出）／`ActiveEsimSummary.tsx`・`OrderList.tsx`（カード）／`TopupPage.tsx`／`Notifications.tsx`。
- `FsNotification.type` に **`data_threshold_80/100` が定義済み（未配線）**。
- 発行系メール（準備/遅延/失敗）は**日本語ハードコード**。`order.language` 保存基盤は返金で整備済み（流用可）。

### 9.2 A. 発行・インストール（★最有力）
- **A1 iOS ユニバーサルリンクで1タップ install**：eSIMAccess の `ac`（`LPA:1$SMDP$MATCHINGID`）から Apple の `https://esimsetup.apple.com/esim_qrcode_provisioning?carddata=<ac>` を生成し `esim_link.appleActivationUrl` に保存 → MyPage/発行完了メールに **「iPhoneにインストール」ボタン**。QRスキャン不要＝離脱激減。
- **A2 QR/アクティベーションを常時再表示**（`qrCodeUrl`/`shortUrl`/`ac`）。再インストール・機種変の救済（eSIMAccessは再インストール可）。

### 9.3 B. データ残量・使用状況（“正確さより分かりやすさ”）
- **B1 「最終更新 ○時間前」＋更新ボタン**：eSIMAccess の使用量は **2-3時間遅延**。`esim_link.lastUsageUpdateAt` を保存し明示＋「今すぐ更新」（既存 `syncRequestedAt` トリガー or `/esim/usage/query`）。“0なのに減らない”等の誤解防止。
- **B2 状態写像の精緻化**：`esimStatus`(IN_USE/USED_UP/USED_EXPIRED/UNUSED_EXPIRED/CANCEL…)×`smdpStatus` を分かりやすい状態に。`DOWNLOAD止まり`→「インストール未完了？」サポート導線。

### 9.4 C. Top-up 導線（復活機能を使ってもらう）
- **C1 枯渇/残少で「データ追加」CTA**：docs 曰く `USED_UP+ENABLED` が最適タイミング。低残量カードに**ワンタップtopup**（eSIMAccessは data0 でも可）。
- **C2 TopupPage で実データ表示**：`/package/list type=TOPUP`（esimTranNo）で「打てるプラン」を表示（ダミー問題の再発なし）。

### 9.5 D. 能動通知（Webhook ついで＝低コスト）
- **D1 残量アラート**：`DATA_USAGE`（`remainThreshold` 0.5/0.1）→ **in-app通知＋メール**「残りわずか・topupは」。※既存 `data_threshold_80/100` を eSIMAccess の 50%/10% に合わせ整理（`data_threshold_50/10` 追加 or リネーム）。
- **D2 期限アラート**：`VALIDITY_USAGE`（残1日）→ 通知「明日で期限・延長は」。

### 9.6 E. その他
- **E1 発行系メールの5言語化**：`order.language` を流用（返金メールと同型）。準備/遅延/失敗メールを 5言語に（現状 日本語のみ＝外国人顧客に届いていない）。
- **E2（任意）**：`/esim/sendSms` でインストールリンクSMS送付／機種別インストール手順ガイド。

### 9.7 対象ファイル・段階・優先度
- functions：`webhooks_esimaccess`（DATA_USAGE/VALIDITY_USAGE→`createNotification`/`sendEmail`）、`getEsimDetail` 正規化で `ac→appleActivationUrl` 生成。
- client：`ActiveEsimSummary`/`OrderList`（installボタン・最終更新・更新ボタン・topup CTA）、`TopupPage`（実TOPUP）、`Notifications`（新type）、i18n×5。
- shared：`FsEsimLink` に `activationCode`/`qrCodeUrl`/`shortUrl`/`smdpStatus`/`esimStatus`/`lastUsageUpdateAt`、`FsNotification.type` 整理。
- **すべて Phase3 に内包**。優先度：**A1（1タップinstall）と D1/D2（残量/期限アラート）が費用対効果 最高**。

---

## 10. Secret（Secret Manager）

`ESIMACCESS_ACCESS_CODE` / `ESIMACCESS_SECRET_KEY` / `ESIMACCESS_WEBHOOK_TOKEN`（秘密URL用）。※**チャット/コミットに貼らない**。

---

## 11. 実装フェーズ

| Phase | 内容 | 変更範囲 | 承認/デプロイ |
|---|---|---|---|
| **P1** | Provider抽象（`types.ts`＋`getProvider`）＋Bappy薄ラッパ＋型追加。**呼び出しをgetProvider経由に置換（挙動不変）** | functions＋shared | 要承認・**41テスト全通過で挙動不変担保** |
| **P2** | eSIMAccess実装（署名・order/query/getEsimDetail・**topup**・cancel・balance）＋**単国JPプラン取込**（`import-esimaccess-plans.mjs`・inactive）＋**PlansTab 2価格（卸USD/小売JPY）表示編集＋活性化**＋`esimaccessWebhook`多層防御（＋柱1でbappyWebhook認証）＋**販売停止ガード**＋返金cancel連携＋Bappy販売停止 | functions/rules/secrets＋plansデータ＋client(PlansTab) | 要承認・secrets登録・本番はユーザー指示 |
| **P3** | **フロント適合・MyPage体験改善（§9）**：A1 1タップinstall／B1 最終更新・更新／C1 topup CTA／D1-D2 残量・期限アラート／E1 発行系メール5言語化 ＋ ローンチ前 実注文検証（発行→QR→有効化→topup→cancel/返金）→ GA判定 | functions＋client＋i18n＋検証 | 要承認・本番はユーザー指示 |
| （不採用） | 自動フェイルオーバー・代替QR | — | **今回やらない**（自動返金でカバー） |

---

## 12. テスト／検証・リスク・ロールバック

- **P1**：既存 functions テスト**41件＋新規（provider委譲）全通過＝挙動不変**（最重要）。
- **P2**：eSIMAccess clientの署名生成ユニット／order→query→topup→cancel のモック／販売停止ガードのユニット（downで購入弾き）／Webhook多層防御（IP不一致拒否・notifyId冪等・裏取り）。
- **P3**：本番で自分の実注文を2-3件（発行・QR・有効化・topup・未有効化cancel返金）。
- **リスク**：単一プロバイダ＝eSIMAccess障害時は販売停止（継続性なし・受容）。ロールバック：plan.provider を戻す／販売停止フラグで即停止。Bappyは休眠なので緊急時は `isActive:true` で暫定復帰も可。
- **client影響**：発行/ topup フローはサーバ側中心。TopupPage/購入導線は既存流用。
