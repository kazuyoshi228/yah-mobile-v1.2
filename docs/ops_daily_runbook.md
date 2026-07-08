# 運用ランブック（最終版）— 日次オペレーション & 残高チャージ

更新: 2026-07-09 ／ 対象: yah.mobile 本番（`yah-mobile-v1-3ed24` / https://yah.mobi）
関連: [返金/障害手順](./refund_incident_procedures.md)｜[システム仕様](./current_specifications.md)｜CLAUDE.md（運用ルール）

> 🚨 大原則：本番データ変更前に**読み取り専用で現状確認**／本番デプロイ・実返金は**明示判断**で／**シークレットは貼らない・コミットしない**。

---

## 1. 監視の全体像（自動で見ているもの）
| 監視 | 周期 | 何を | 異常時 |
|---|---|---|---|
| `providerHealthCheck` | 15分 | eSIMAccess 疎通＋**残高**（queryBalance） | API down→**販売停止ガード自動ON**／残高 **< $20** でオーナー警告（1h/回） |
| `hungOrderMonitor` | 定期 | provisioning で滞留した注文 | オーナー通知 |
| `esimRetryJob` | 定期 | 発行失敗の自動リトライ（最大3回） | 最終失敗→failed＋自動返金（Lane A） |
| Cloud Error Reporting | 常時 | Functions 例外・フロントエラー(S1b) | ダッシュボードで確認 |

通知先: `notifyOwner` → OWNER_EMAIL（＋Slack）。**メールが来たら本表の該当行を実施**。

---

## 2. 毎日のデイリータスク表
| 時間帯 | タスク | 見る場所 | 基準／アクション |
|---|---|---|---|
| **朝（必須）** | eSIMAccess **残高**確認 | /admin（残高表示）or 通知履歴 | **< $100 で当日チャージ**（§3）。$20未満は自動警告済のはず |
| 朝 | **失敗/滞留注文**の有無 | /admin/orders（status=failed/provisioning/pending_retry で絞込） | failed=自動返金済か確認。provisioning が15分以上→§障害 |
| 朝 | **返金**の当日分 | /admin/orders（refundStatus）or Stripe | processing のまま滞留がないか |
| 朝 | **問い合わせ**新着 | /admin/inquiries（pending） | refund系は注文情報を見て対応（§返金手順） |
| 随時 | オーナー通知メール | 受信箱/Slack | 内容に応じ本表・障害手順へ |
| 夜（任意） | 当日の注文/売上ざっと | /admin（KPI） | 異常な失敗率がないか |

> ソロ運用の最小セットは**朝の4項目**（残高・失敗注文・返金・問い合わせ）。5分で回せる。

---

## 3. 残高チャージ運用（eSIMAccess）🔴 売上直結
**なぜ重要**: 残高が **$0 になると eSIM 発行が失敗**し、販売停止ガードが自動で購入をブロックする（機会損失）。

| 項目 | 値 |
|---|---|
| 自動警告しきい値（コード） | **$20 未満**（`LOW_BALANCE_USD`・1時間に1回オーナー通知）＝最終バックストップ |
| **運用の安全在庫（日次基準）** | **$100 を下回ったらチャージ**（自動警告を待たず前倒し） |
| 目安 | IIJ系の卸原価 × 想定日次発行数の数日分を常に確保 |

**チャージ手順**
1. eSIMAccess パートナーポータル（esimaccess.com）にログイン。
2. 残高（Balance）を確認 → Deposit / Top-up でチャージ（クレカ等）。
3. 数分後、`providerHealthCheck`（15分周期）が新残高を検知。手動確認は /admin の残高表示。
4. もし直前に $0 で販売停止していた場合、残高回復後に**自動でガード解除**（「eSIMAccess API が回復しました」通知が来る）。それでも購入不可なら [障害手順](./refund_incident_procedures.md)。

**チェック**: 週次で「残高の減り方 vs 発行数」を見て、安全在庫（$100）が妥当か見直す。連休・繁忙期前は多めにチャージ。

---

## 4. デプロイ運用（再掲・取り違え厳禁）
| 対象 | ブランチ | コマンド |
|---|---|---|
| 確認用(dev) | dev | `firebase hosting:channel:deploy dev --expires 30d` |
| 本番 | main | `firebase deploy --only hosting`（要明示判断） |
| Functions | main | `firebase deploy --only functions:<name>`（スコープ付き） |

- 本番リリースは **dev確認 → 明示判断**。認証切れ（invalid_rapt/reauth）は `firebase login --reauth`。
- 詳細な障害・返金・復旧手順は [refund_incident_procedures.md](./refund_incident_procedures.md)。

## 5. 週次/月次
- **週次**: 残高トレンド、失敗率、問い合わせ傾向、返金件数。
- **月次**: Stripe 売上と注文突合、依存更新、バックアップ方針、価格/競合の見直し。
