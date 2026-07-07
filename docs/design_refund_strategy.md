# 実装設計書（雛形）：返金対応の方針

対象ブランチ: `dev` ／ 作成: 2026-07-07 ／ ステータス: **雛形（要決定事項を埋めてから実装設計に確定）**
関連: v0.51 柱2（Must-fix「返金」）／旧 hardening⑥（保留中）／[esimaccess_parallel_introduction.md](./esimaccess_parallel_introduction.md)

> 🚨 本書は**方針の雛形**。`[要決定]` を埋め、ユーザー承認後に実装。`functions/`・返金は**お金に直結**するため、冪等性・安全ガードを最優先。本番デプロイ・実返金はユーザー指示で。

---

## 0. 背景・目的
- 現状：eSIM発行失敗時は**リトライ3回→最終失敗で status=`failed`＋オーナー通知＋OMAXメール**まで。**返金は手動**（Stripeダッシュボードで人が処理）。
- 目的：**「課金済みなのに提供できていない」ケースを、安全に・取りこぼしなく返金**できる仕組みを作る（Must-fix クローズ）。
- 前提（法務）：規約/特商法上は**デジタル商品につき原則返金不可**だが、**当社側の技術的失敗で提供できない場合は返金**する（Terms/llms.txt と整合）。→ 自動返金は「当社側失敗」に限定するのが筋。

---

## 1. 判定モデル（3レーン）

```
決済成功（課金済み）
      │
      ├─ Lane A: 明確なシステム側失敗（未提供が確定）      → 自動返金（Stripe）
      │     例) 全リトライ枯渇で eSIM 未発行（status=failed）
      │
      ├─ Lane B: グレーゾーン（原因不明／人の判断が要る）   → 問い合わせフォーム → 管理者判断 → 手動返金
      │     例) 発行済みだが「繋がらない/装着できない」・重複課金・心変わり・再接続不可
      │
      └─ Lane C: 返金しない（正常配信 or 規約対象）         → 返金なし
            例) 正常にeSIM提供済み・リトライで回復・利用済み
```

> あなたの提案（①自動 ②グレー手動）に、**Lane C（返金しない）**を明示追加。既定は「返金しない」で、**A は明確な当社失敗に限定した例外**、という構造にすると法務・会計的に安全。

---

## 2. Lane A：自動返金（システム側の明確な失敗）

### 2.1 発動条件（すべて満たす時のみ・厳密に）
- 注文が **`paid`**（課金確定）で、かつ **`stripePaymentIntentId` あり**。
- **eSIM が一度も正常発行されていない**（`esim_links` に有効な発行なし／全プロバイダで発行失敗）。
- **リトライが完全に枯渇**（`esimRetryService` 最終失敗＝これ以上自動発行しない）。
- **まだ返金していない**（`refundStatus` が未設定／`none`）。
- ＝「課金済み・未提供・回復不能」が確定した状態のみ。

### 2.2 実装点
- **フック**：`functions/src/esimRetryService.ts` の**最終失敗ブロック**（現状 `updateOrder(status:"failed")`＋notifyOwner の箇所）に **`refundOrder()` 呼び出しを追加**。
- **返金サービス（新規）**：`functions/src/refund.ts`
  - `Stripe.refunds.create({ payment_intent, reason: "requested_by_customer" }, { idempotencyKey })`。
  - `[要決定]` 全額返金のみか、割引/手数料を考慮するか（初期は**全額 `amountJpy`** 推奨）。
- **プロバイダ連携（柱2と連動）**：eSIMAccess plan の場合は **cancel API → 残高返金**も併せて実行（Bappy は cancel API 無し＝Stripe返金のみ）。`esim_link.provider` で分岐。

### 2.3 冪等性・安全ガード（お金＝最重要）
- **二重返金防止**：`order.refundStatus`（`none|processing|refunded|failed`）で状態管理＋Stripe **idempotencyKey**（例 `refund_{orderId}`）。
- **競合防止**：返金前に**リトライを完全停止**（発行成功と返金の同時進行を防ぐ）。返金は**リトライ枯渇後の最終ステップ**に限定。
- **対象状態チェック**：`fulfilled`/`refunded`/`cancelled` は返金しない。
- **金額検証**：Stripe の charge 額と `order.amountJpy` の整合を確認してから返金。
- **失敗時**：Stripe返金APIが失敗したら `refundStatus="failed"`＋`notifyOwner`（人が対応）。
- **監査**：`audit_logs`/`incident_logs` に返金イベントを記録。

### 2.4 自動化レベル `[要決定]`
- **(a) 完全自動**：最終失敗＝即自動返金（＋通知）。速いが誤返金の余地は設計で潰す。
- **(b) 半自動**：最終失敗→オーナー通知＋**ワンクリック返金**（管理画面ボタン）。人が最後に承認。
- 推奨：**まず(b)半自動でローンチ→実績が溜まったら(a)へ**（安全側）。

---

## 3. Lane B：グレーゾーン（手動・問い合わせフォーム経由）

### 3.1 対象例
- 発行済みだが「繋がらない/装着できない/再接続できない」（端末側 vs 供給元の切り分けが要る）。
- 重複課金の申告（多くは与信の仮押さえで自動解除）。
- 心変わり・キャンセル希望（原則返金不可だが例外判断）。

### 3.2 フロー
1. お客様 → **問い合わせフォーム**（既存 `submitContactInquiry`）に「返金希望」カテゴリで送信。
2. `onContactCreated` トリガでオーナー通知（既存）。
3. 管理者が内容を確認・判断。
4. 返金する場合：**管理返金アクション**（新規 callable `adminRefundOrder(orderId, reason)`・admin限定）で Stripe返金＋`refundStatus` 更新＋顧客通知。
   - ＝ Lane A と**同じ `refund.ts` を共用**（人がトリガーするだけの違い）。

### 3.3 UI：`/admin` 返金（Refunds）タブ 【採用】
専用の **「返金」タブ**を新設し、返金の判断・実行を一箇所に集約（solo運用に最適）。

- **場所**：`AdminPage.tsx` の `TABS`/`VALID_TABS` に `refunds` を追加＋`RefundsTab.tsx` 新規（既存 orders/incident 等と同じ構成）。
- **一覧（返金キュー）**：クライアントから `orders` を直接購読（**admin は orders を read 可＝ルール確認済み** `isAdmin()`）。表示対象：
  - **Lane A候補**：`status=="failed"`（＝発行失敗・未提供・自動検知）で `refundStatus` 未処理のもの。
  - **Lane B候補**：問い合わせ（`contact_inquiries`）で「返金希望」カテゴリのもの（`orderId` で注文に紐付け）。
  - 各行：注文ID・金額・作成日・失敗理由/問い合わせ内容・`refundStatus` バッジ。
- **承認ボタン**：各行の **「返金する」** → **確認ダイアログ（金額・理由入力）** → callable **`adminRefundOrder(orderId, reason)`**（admin限定）を呼ぶ。
  - 実行中は `refundStatus="processing"` でボタン無効化（二重押し防止）。完了で `refunded` バッジ。
- **共通化**：`adminRefundOrder` は Lane A(b) の「ワンクリック承認」と**同一 callable/`refund.ts` を共用**。

### 3.4 ★返金の同期は Stripe Webhook を真実源にする（全経路対応）
`stripeWebhook` に **`charge.refunded`（/`refund.updated`）ハンドラを追加**する。これにより：
- **どこで返金しても**（`/admin` ボタン・自動 Lane A・**Stripe ダッシュボードで手動**）、**必ず Firestore に同期**：`order.status="refunded"`＋`refundStatus`/`stripeRefundId`/`refundedAt` 更新＋`refund_completed` 通知＋メール。
- `adminRefundOrder`/`refund.ts` は **Stripe返金を実行するだけ**にし、**注文statusと顧客通知は Webhook 側で確定**（＝単一の真実源・冪等）。手動ダッシュボード返金とも矛盾しない。
- 冪等：Webhook は `stripe_events`（既存の冪等ガード）＋`refundStatus` で二重処理を防ぐ。

> 参考：`status="cancelled"` は**決済前キャンセル**用途（`ordersInitCheckout` の Stripe初期化失敗時）で、返金とは別概念。返金完了は `status="refunded"`。

---

## 4. Lane C：返金しない
- 正常にeSIM提供済み（`fulfilled`＋発行あり）。
- リトライで回復（結果 `fulfilled`）。
- 利用済み/期限切れ・規約同意済みの心変わり（原則）。
- → 何もしない。問い合わせが来たら Lane B で個別判断。

---

## 5. データモデル追加（`FsOrder`・後方互換）
```ts
refundStatus?: "none" | "processing" | "refunded" | "failed" | null;
stripeRefundId?: string | null;
refundReason?: string | null;      // "system_failure" | "manual" | 自由記述
refundedAt?: number | null;        // epoch ms
```
- `status` は既存の `"refunded"` を使用（返金完了時に `refunded` へ）。

---

## 6. 通知
- **顧客**：既存 `refund_completed`（通知型）＋メール（`mailer.ts` に `buildRefundCompletedEmail` 追加）。文言は5言語で `[要決定]`。
- **オーナー**：`notifyOwner`（返金実行/失敗）。

---

## 7. セキュリティ / rules
- `adminRefundOrder` は **`enforceAppCheck` ＋ admin claims 必須**。
- 返金の**書き込みは Cloud Functions のみ**（`orders.refundStatus` 等をクライアントが書けない＝既存の orders ルールで担保、要確認）。

---

## 8. 法務整合（特商法/Terms/llms.txt）
- 現行表記：「決済後は原則返金不可（デジタル商品・特商法15条の3）」。
- **例外条項の明確化** `[要決定]`：「当社側の技術的理由で提供できない場合は返金する」を Terms/llms.txt に**明記**（Lane A の根拠）。→ 表記修正はサポート/チャット整合（GAゲート）と一緒に。

---

## 9. 検証計画
1. **Stripe テストモード**でテストカード決済→強制失敗→Lane A 自動/半自動返金の一連を確認。
2. **冪等性**：同一注文への二重返金が起きないこと（idempotencyKey＋refundStatus）。
3. **競合**：返金中に発行が成功しないこと（リトライ停止の担保）。
4. emulator/rules・functions build＆test・型チェック。
5. `dev` コミット → 本番 functions デプロイ・実返金はユーザー指示で。

---

## 10. リスク・ロールバック
- **誤返金**（正常提供なのに返金）：発動条件を厳密化＋(b)半自動でローンチして回避。
- **二重返金**：refundStatus＋idempotencyKey で防止。
- **返金取消不可**：Stripe返金は原則取消不可 → だから条件を厳しく。
- ロールバック：`refund.ts` の呼び出しを外せば自動返金は停止（手動運用に戻る）。

---

## 11. 要決定事項（埋めてから実装確定）
- [ ] 自動化レベル：**(a)完全自動 / (b)半自動（ワンクリック承認）** — 推奨(b)先行
- [ ] 返金額：全額 `amountJpy` 固定でよいか（部分返金は当面なし？）
- [ ] Lane A の対象：Bappy失敗のみか、topup失敗も含めるか
- [ ] プロバイダcancel連携：eSIMAccess導入（柱2）と同時か、Stripe返金だけ先行か
- [ ] Terms/特商法の「当社側失敗は返金」例外条項の文面
- [ ] 顧客向け返金メール文面（5言語）
- [ ] 返金窓口/期限（例：発行失敗から◯日以内は自動、以降は手動 等）

---

## 12. 実装順（提案）
0. **★Stripe Webhook 返金同期（§3.4）＋ `FsOrder` フィールド追加**：`charge.refunded` を処理し、返金→`refunded`＋通知＋メールを確定。**これだけで「Stripeで手動返金しても正しく反映＆顧客通知」される土台**が完成。
1. `refund.ts`（Stripe返金実行・冪等・状態管理）を共通部品として実装。
2. **`/admin` 返金タブ＋`adminRefundOrder`（承認ボタン）**（§3.3）＝人が最後に押す**半自動**で安全にローンチ。
3. **Lane A** を `esimRetryService` 最終失敗にフック（まずは「候補として返金タブに出す＝半自動」）。
4. 顧客通知（メール＋in-app）文面5言語・監査ログ・法務文言（Terms例外条項）。
5. （柱2後）eSIMAccess の cancel/返金連携を追加。

> ポイント：**0（Webhook同期）を最初に置く**と、以後どの経路の返金も自動で整合。1〜2で `/admin` の承認ボタンを載せ、3でLane Aの自動検知を足す、の順が安全。
