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
- `FsPlan`：`provider`（既定 esimaccess）＋ `providerPlanId`（packageCode/slug）＋ 既存 `planType`（initial/topup）。
- rules：esim_links/orders は既存どおり Cloud Functions 専用書込。**新フィールド追加のみ**。plans の provider/providerPlanId のバリデーションは Phase2 で最小追加（**要承認**）。

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

## 9. Secret（Secret Manager）

`ESIMACCESS_ACCESS_CODE` / `ESIMACCESS_SECRET_KEY` / `ESIMACCESS_WEBHOOK_TOKEN`（秘密URL用）。※**チャット/コミットに貼らない**。

---

## 10. 実装フェーズ

| Phase | 内容 | 変更範囲 | 承認/デプロイ |
|---|---|---|---|
| **P1** | Provider抽象（`types.ts`＋`getProvider`）＋Bappy薄ラッパ＋型追加。**呼び出しをgetProvider経由に置換（挙動不変）** | functions＋shared | 要承認・**41テスト全通過で挙動不変担保** |
| **P2** | eSIMAccess実装（署名・order/query/getEsimDetail・**topup**・cancel・balance）＋全プラン取込＋`esimaccessWebhook`多層防御（＋柱1でbappyWebhook認証）＋**販売停止ガード**＋返金cancel連携＋Bappy販売停止 | functions/rules/secrets＋plansデータ | 要承認・secrets登録・本番はユーザー指示 |
| **P3** | ローンチ前 実注文検証（発行→QR→有効化→topup→cancel/返金）→ GA判定 | 検証 | — |
| （不採用） | 自動フェイルオーバー・代替QR | — | **今回やらない**（自動返金でカバー） |

---

## 11. テスト／検証・リスク・ロールバック

- **P1**：既存 functions テスト**41件＋新規（provider委譲）全通過＝挙動不変**（最重要）。
- **P2**：eSIMAccess clientの署名生成ユニット／order→query→topup→cancel のモック／販売停止ガードのユニット（downで購入弾き）／Webhook多層防御（IP不一致拒否・notifyId冪等・裏取り）。
- **P3**：本番で自分の実注文を2-3件（発行・QR・有効化・topup・未有効化cancel返金）。
- **リスク**：単一プロバイダ＝eSIMAccess障害時は販売停止（継続性なし・受容）。ロールバック：plan.provider を戻す／販売停止フラグで即停止。Bappyは休眠なので緊急時は `isActive:true` で暫定復帰も可。
- **client影響**：発行/ topup フローはサーバ側中心。TopupPage/購入導線は既存流用。
