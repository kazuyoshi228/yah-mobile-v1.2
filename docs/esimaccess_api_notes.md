# eSIMAccess API 確定仕様メモ（yah.mobile）

作成日: 2026-07-06 ／ 出典: 公式ドキュメント通読（下部ソース参照）
用途: 並走導入（[esimaccess_parallel_introduction.md](./esimaccess_parallel_introduction.md)）の実装時リファレンス。

> ⚠️ API 本体（docs.esimaccess.com）は JS レンダリングで自動取得不可のため、公式 KB 記事＋検索から確認できた範囲を記録。実装前に **console/公式 API リファレンスで最終確認**すること（とくにリクエスト/レスポンスの完全なスキーマ）。

---

## 共通

- ベースURL: `https://api.esimaccess.com/api/v1/open/`
- 認証: ヘッダ `RT-AccessCode`（Developer Console 発行の `accessCode`）＋ **HMAC-SHA256 署名**（公式 Agent Skill が自動処理と記載）
- 形式: JSON / REST
- 課金: **前払い残高方式**（write 操作は残高消費、read は無料）
- バージョン: v1.1 で単一→**バッチ発行**、オフライン後払い→**オンライン前払い**、`cancel`/`suspend`/`unsuspend`/`revoke` 追加

---

## エンドポイント

### 発行（Order Profiles）
- バッチ発行・オンライン前払い。リクエストに `packageCode` / `price` / `amount` / `transactionId`（自前の取引参照）。レスポンスに `orderNo`。
- 発行後、`ac`（LPA/アクティベーションコード）・`qrCodeUrl` 等は状態照会（下記）で取得。

### 状態・使用量照会 — `POST /esim/list`
- リクエスト: `iccid`、`pager { pageNum, pageSize }`
- レスポンス `esimList[]` の主フィールド:

| フィールド | 説明 |
|---|---|
| `orderNo` | 注文識別子 |
| `iccid` / `imsi` / `eid` | 各種識別子 |
| `ac` | アクティベーションコード（LPA） |
| `qrCodeUrl` | インストール用 QR の URL |
| `smdpStatus` | SM-DP+ 状態（例: `RELEASED`, `INSTALLATION`） |
| `esimStatus` | eSIM 稼働状態（例: `GOT_RESOURCE`, `IN_USE`） |
| `activeType` | 有効化方式 |
| `expiredTime` | 有効期限 |
| `totalVolume` | 総データ量（bytes） |
| `orderUsage` | 消費データ（bytes） |
| `totalDuration` / `durationUnit` | 有効期間／単位（`DAY` 等） |
| `packageList[]` | `packageCode` / `duration` / `volume` / `locationCode` |

- **残量 = `totalVolume − orderUsage`**

### トップアップ — `POST /esim/topup`
- リクエスト: `ICCID` または `esimtranno`、`packageCode`（`TOPUP_` プレフィックス）または Slug、`TransactionID`
- レスポンス: 新しい残り期間・総データ量
- 制約: **最大10回**／`Active`(In Use) または `New` 状態のみ／期限切れ後は不可／非リロード可プランは対象外（`supportTopUpType: 1` で判定）／**有効期間とデータは加算**
- 可用パッケージ確認: パッケージ一覧を `type=TOPUP` ＋ `iccid` で照会

### キャンセル / 返金
- `action=cancel` ＋ `iccid` でキャンセル API を呼ぶ（v1.1 追加）
- **未使用オーダーは残高へ返金**可（`suspend`/`unsuspend`/`revoke` も提供）
- ⚠️ 未有効化のみ可か等の前提は**要最終確認**

### 残高照会 — `POST /balance/query`
- マーチャント残高を取得。低残高時はアカウントメール通知あり。

---

## Webhook（受信通知）

- 設定: コンソール `https://console.esimaccess.com/developer/index` で通知URLを登録
- 形式: JSON（URLクエリ文字列へ変換ツールあり）
- **署名/受信検証の記載は公式ドキュメントに見当たらない → 要確認。** 受信側で多層防御が必要（親レポート §4.3）。

| イベント | 発火条件 | ペイロード主フィールド |
|---|---|---|
| `ORDER_STATUS` | 発行完了（DL可能） | `orderNo`, `transactionId`, `orderStatus`(例 `GOT_RESOURCE`) |
| `ESIM_STATUS` | eSIM 使用開始（端末装着） | `orderNo`, `transactionId`, `iccid`, `esimStatus`(例 `IN_USE`), `smdpStatus`(例 `INSTALLATION`) |
| `DATA_USAGE` | データ残 ≤100MB | `orderNo`, `transactionId`, `iccid`, `totalVolume`, `orderUsage`, `remain` |
| `VALIDITY_USAGE` | 有効期限 残1日 | `orderNo`, `transactionId`, `iccid`, `durationUnit`, `totalDuration`, `expiredTime`, `remain` |

---

## 有効化（インストール）方式

1. QR コードスキャン（`qrCodeUrl` / `ac`）
2. EID プッシュ（EID 指定で端末へ配信）
3. アプリ内プロビジョニング（リンクからQR不要でインストール）
4. **Apple Universal Link**（SMS/メールの URL を1クリック）
5. 手動入力（SM-DP+ アドレス＋アクティベーションコード `ac`）
- 削除済み eSIM の**再インストール可**（原QR/新QRの別は要確認）

---

## 実装支援：公式 AI Agent Skill

- 導入: `npx skills add esimaccess/esimaccess-api`（GitHub から取得しエージェントの skill ディレクトリへ）
- 実体: MCP でも OpenAPI でもなく **“スキル定義”**（Claude Code / Cursor / Copilot 等向け）
- 認証（`accessCode` ＋ HMAC-SHA256 署名）を自動処理
- 17操作: 残高照会・パッケージ一覧・注文/プロファイル状態照会・データ消費照会・Webhook設定確認（read）／発行・topup・cancel/suspend/revoke・SMS送信・Webhook設定（write）

---

## エコシステム上の位置づけ

- eSIMAccess は自らを **Layer 2（アグリゲーター）** と位置づけ（100+エリア・多数SKUを1API化）。**Bappy/OMAX と同じ集約層**で、いずれも直接キャリアではない。
- → **日本の実網はパッケージ依存＝実機テストが必須**（`packageList.locationCode` で地域は分かるが実キャリアは非公開）。

---

---

## 2026-07-07 追記（公式ドキュメント実確認 — console登録後）

### 認証・環境（確定）
- **ベースURL**：`https://api.esimaccess.com/api/v1/open/`（画像は `https://p.qrsim.net/`）。
- **認証ヘッダ**：`RT-AccessCode: <accessCode>`（オンラインアカウントで発行）。
  - ただしエラーコードに `101001 timestamp expired` / `101003 signature mismatch` / `101002 IP blocklist` があり、**署名（HMAC）＋タイムスタンプが必要な操作がある可能性**。→ **write系で署名要否を要確認**（balance/query の例は RT-AccessCode のみ）。
- 🔴 **Sandbox は存在しない**。「Cancel as needed in live environment. Request funds for testing」＝**本番で実資金を入金し、cancel可能な注文でテスト**する。→ Phase 0 は「入金＋cancel前提の実テスト」に変わる。
- **レート制限**：8 req/秒。時刻はUTC、国コードはAlpha-2、データはBytes。

### 主要エンドポイント（確認済み path）
| 用途 | Method / Path | 備考 |
|---|---|---|
| 残高照会 | `POST /balance/query` | 最終更新日時付き |
| データ使用量 | `POST /esim/usage/query` | `esimTranNoList`（最大10）。**更新は2-3時間遅延** |
| 対応地域/コード | `POST /location/list` | 日本=`JP`（type1 単国）。多国コード例 `AS-12`（日本含む）等 |
| 発行済プロファイル照会 | `POST /esim/query` | ORDER_STATUS=GOT_RESOURCE後に `orderNo` で ICCID/QR 取得 |
| 発行 / topup / cancel等 | Order Profiles / `/esim/topup` / cancel・suspend・revoke | （上部参照） |

### Webhook（確定・詳細）
- **共通エンベロープ**：`{ notifyType, notifyId, eventGenerateTime, content }`。**`notifyId` で重複排除（冪等）**。
- **イベント種別**：`SMDP_EVENT`(超高頻度・診断用) / `ESIM_STATUS`(高・業務ロジックの主軸) / `ORDER_STATUS`(中) / `DATA_USAGE` / `VALIDITY_USAGE` / `CHECK_HEALTH`(設定時1回・200を返す)。
- **発行完了の主信号**＝`ORDER_STATUS: GOT_RESOURCE` → **ICCIDは含まれない**ので `/esim/query` を叩いて取得。topupはORDER_STATUSを発火しない。届かない時は query をポーリング。
- **ライフサイクル**は `ESIM_STATUS`（`IN_USE`/`USED_UP`/`USED_EXPIRED`/`UNUSED_EXPIRED`/`CANCEL`/`REVOKED`/`SUSPENDED` × `smdpStatus`）で追う。`IN_USE+ENABLED`＝有効化成功。
- 🟢 **署名の記載はないが、送信元IPホワイトリストが公式提供**：`3.1.131.226 / 54.254.74.88 / 18.136.190.97 / 18.136.60.197 / 18.136.19.137`。→ **柱1の多層防御に直結**（IP許可＋notifyId冪等＋`/esim/query`裏取り）。
- 秘密トークン付きURLも併用推奨。CHECK_HEALTH には 200 を返す。

### 我々の設計への影響（要点）
1. **Phase 0（契約）**：Sandbox無し → **入金＋cancel前提の実テスト**（日本パッケージを実機で発行→cancel/返金確認）。
2. **柱1 Webhook 認証**：eSIMAccess は **公開IPホワイトリスト**があるので、`bappyWebhook` と同じ多層防御（IP許可＋秘密トークンURL＋`/esim/query`裏取り＋notifyId冪等）で確実に固められる。→ 柱1の結論に使える。
3. **発行フロー**：`ORDER_STATUS(GOT_RESOURCE)` → `/esim/query` で ICCID/QR。Bappyの `createLink`→`getLinkDetail` と同型なので **Provider抽象に綺麗に載る**。
4. **返金**：cancel（未使用は残高返金）→ その上に Stripe refund を重ねる（既存 `executeRefund`）。

---

## 2026-07-07 追記②（Postmanコレクション全体で確定 — 実装レベル）

### 🔑 認証（確定）— 2方式あり
1. **Key in Header**（簡易）：`RT-AccessCode: <accessCode>` のみ。Postmanコレクションの既定はこれ（`{{accessCode}}`）。
2. **HMAC-SHA256 署名**（推奨・write系はこちらで固める）：ヘッダに
   - `RT-AccessCode`（アクセスコード）
   - `RT-RequestID`（uuid.v4 の新規UUID）
   - `RT-Signature`（署名 HexString）
   - `RT-Timestamp`（送信時刻ミリ秒・文字列）
   - **計算**：`signData = Timestamp + RequestID + AccessCode + RequestBody` → `signature = HMAC_SHA256(signData, SecretKey).toLowerCase()`
   - `SecretKey` はアカウントで発行（accessCode とは別）。
   - エラー：`101001` timestamp expired / `101002` IP blocklist / `101003` signature mismatch。
- **実装方針**：write系（order/topup/cancel/revoke）は **HMAC署名で実装**（money-moving のため）。read（balance/package/query）は RT-AccessCode でも可。→ `ESIMACCESS_ACCESS_CODE` と `ESIMACCESS_SECRET_KEY` を Secret Manager に。

### エンドポイント全マップ（`{{host}} = https://api.esimaccess.com`、全て POST `/api/v1/open/...`）
| 用途 | Path | 主要 in / out |
|---|---|---|
| パッケージ一覧 | `/package/list` | in: `locationCode`(JP等)・`type`(BASE/TOPUP)・`packageCode`/`slug`/`iccid`・`dataType`／ out: `packageList[]`（`packageCode`,`slug`,`name`,`price`,`volume`(bytes),`duration`,`durationUnit`,`location`,`activeType`,`supportTopUpType`,`speed`,`fupPolicy`…） |
| **発行** | `/esim/order` | in: `transactionId`(一意・冪等)・`amount`(任意)・`packageInfoList[{packageCode/slug,count,price}]`／ out: `orderNo`,`transactionId` |
| **状態/QR照会** | `/esim/query` | in: `orderNo`/`iccid`/`esimTranNo`＋`pager`／ out: `esimList[]`（`esimTranNo`,`iccid`,`ac`(LPA),`qrCodeUrl`,`shortUrl`,`smdpStatus`,`esimStatus`,`totalVolume`,`orderUsage`,`expiredTime`,`packageList[{packageCode,locationCode}]`）。※未確定時 `200010`（割当中） |
| **キャンセル(返金)** | `/esim/cancel` | in: `esimTranNo`(推奨)/`iccid`／ **未使用(GOT_RESOURCE+RELEASED)のみ可＝残高へ返金**。使用後は不可 |
| 一時停止/再開 | `/esim/suspend` `/esim/unsuspend` | in: `esimTranNo`/`iccid` |
| 失効(返金不可) | `/esim/revoke` | **Non-refundable**。有効eSIMを閉じる |
| **トップアップ** | `/esim/topup` | in: `esimTranNo`(推奨・iccidは非推奨)・`packageCode`(`TOPUP_`)・`transactionId`・`periodNum`／ out: 新`expiredTime`,`totalVolume`,`totalDuration`,`topUpEsimTranNo`。New/In Use/Depleted で可・期限切れ後不可 |
| 残高 | `/balance/query` | out: `balance`（×10000, 100000=$10） |
| 使用量 | `/esim/usage/query` | in: `esimTranNoList`(最大10)／ 2-3h遅延 |
| Webhook設定/確認 | `/webhook/save` `/webhook/query` | in: `{webhook: URL}` |
| SMS送信 | `/esim/sendSms` | in: `esimTranNo`/`iccid`・`message` |
| 対応地域 | `/location/list` | JP他 |

### 実装上の重要点（確定）
- **価格は ×10000（USD）**。**データ量は bytes**。
- **安定IDは `esimTranNo`**（iccid は再利用されるため）。状態照会・cancel・topup は esimTranNo 推奨。
- **発行フロー**：`/esim/order`→`orderNo` → Webhook `ORDER_STATUS(GOT_RESOURCE)` → `/esim/query`(orderNo) で `iccid`/`ac`/`qrCodeUrl` 取得（最大~30秒。届かなければ query をポーリング、`200010` は割当中）。
- **返金の実挙動（重要）**：`cancel` は**未インストール（GOT_RESOURCE/RELEASED）のみ残高返金**。使用開始後は `cancel` 不可・`revoke` は返金なし。→ **当社の返金連携は「未有効化の失敗注文」に自然に一致**（発行失敗＝未インストール＝cancelで残高返金 → Stripe refund）。
- Bappy との対応：`createLink`≈`/esim/order`＋`/esim/query`、`getLinkDetail`≈`/esim/query`、`addTopupPlan`≈`/esim/topup` → **Provider抽象に素直に載る**。

### Provider抽象 設計への含意
- `EsimProvider` IF（案）：`createEsim({packageCode,count,transactionId})→{providerOrderId}` / `getEsimDetail(esimTranNo|orderNo)→{iccid,ac,qrCodeUrl,status,usage,expiry}` / `topup(...)` / `cancel(esimTranNo)` / `queryBalance()`。Bappy/eSIMAccess を同IFで実装。
- Webhook：ORDER_STATUS/ESIM_STATUS/DATA_USAGE/VALIDITY_USAGE を既存の webhooks_bappy 相当にマップ。多層防御＝**IP許可（既知5IP）＋秘密トークンURL＋`/esim/query`裏取り＋`notifyId`冪等**。

---

## ソース

- Making an eSIM purchase with the API — https://esimaccess.com/making-an-esim-purchase-with-the-api/
- Can I check data usage? — https://esimaccess.com/docs/can-i-check-data-usage/
- How to Top Up a Data Plan? — https://esimaccess.com/docs/how-to-top-up-a-data-plan/
- eSIM Top Up with the API — https://esimaccess.com/esim-top-up-with-the-api/
- What notifications do you send? — https://esimaccess.com/docs/what-webhook-notifications-do-you-send/
- Setting up Webhooks for Order Notifications — https://esimaccess.com/setting-up-webhooks-for-order-notifications/
- What are the eSIM activation methods? — https://esimaccess.com/docs/what-are-the-available-esim-activation-methods/
- eSIM Access API Agent Skill — https://esimaccess.com/esim-access-api-agent-skill/
- How the eSIM ecosystem actually works — https://esimaccess.com/how-the-esim-ecosystem-actually-works-and-why-its-changing-fast/
- API Archives — https://esimaccess.com/docs-category/api/
