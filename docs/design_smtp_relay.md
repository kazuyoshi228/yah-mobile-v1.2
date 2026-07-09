# 設計図：メール送信を Gmail SMTP → Workspace SMTP relay に切替（送信上限引き上げ）

対象ブランチ: `dev` ／ 作成: 2026-07-09 ／ ステータス: **設計（要承認→実装）**
目的: 送信上限 **~2,000通/日 → ~10,000通/日** に引き上げ（5k〜10k人/月に耐える）。**API/新サービスは増やさず**、既存 nodemailer の SMTP 設定のみ差し替え。

## 1. 背景
現状は `nodemailer` の `service:"gmail"`（＝smtp.gmail.com・ユーザー認証SMTP）。Workspace でも **2,000通/日で固定**（上位プランでも増えない）。1注文=2通＋リトライ/返金/自動返信で、10k人/月は上限接近→`550 Daily sending limit exceeded` の恐れ。
→ **smtp-relay.gmail.com（SMTP relay service）** は Workspace で **最大 ~10,000通/日/ユーザー**。アプリ発の送信向けで、この用途に適合。

## 2. 変更（コード・functions のみ・最小）
`functions/src/mailer.ts` の transport を差し替え（それ以外＝`sendEmail()` のIF・`buildXxxEmail`・呼び出し側・テストは**無変更**）：
```ts
// 変更前
const transporter = nodemailer.createTransport({ service: "gmail", auth: { user, pass } });
// 変更後（SMTP relay・STARTTLS・同じ認証情報）
const transporter = nodemailer.createTransport({
  host: "smtp-relay.gmail.com",
  port: 587,
  secure: false,
  requireTLS: true,
  auth: { user, pass },   // 既存 GMAIL_USER / GMAIL_PASS（アプリパスワード）を継続利用
});
```
- Secret 追加なし（既存の `GMAIL_USER`/`GMAIL_PASS` をそのまま使用）。
- `from` は現状どおり `ENV.mailFrom || user`。

## 3. Workspace 管理コンソール設定（🔴 あなた側・必須）
1. 管理コンソール → **アプリ → Google Workspace → Gmail → ルーティング → 「SMTP リレー サービス」** を追加。
2. **許可する送信者**: 「自ドメイン内のアドレスのみ」等。→ ⚠️ **`from` のドメインがこの Workspace ドメインに含まれること**（後述の注意）。
3. **認証**: 「**SMTP 認証を要求**」ON（＝GMAIL_USER/アプリパスワードで認証。Cloud Functions は固定IPが無いため**IP許可ではなく認証方式**）。「**TLS 暗号化を要求**」ON。
4. 送信アカウント（`GMAIL_USER`）に **2段階認証＋アプリパスワード**があること（現状動いているので既に有）。

## 4. 送信元(From)ドメイン → ⚠️ **初回不達の真因はここ（2026-07-09 修正済）**
確認結果（2026-07-09）：
- **Workspace 構成**: プライマリ `bonfire.co.jp` ＋ **セカンダリ登録済み `mail.yah.mobi`**（`contact@mail.yah.mobi` は Workspace ユーザー）。素の `yah.mobi` は**未登録**。
- 🔴 **初回デプロイが不達だった原因**: `MAIL_FROM` は未設定で、`env.ts` の既定 From が **`noreply@yah.mobi`**（未登録ドメイン）だった。relay の「自ドメイン内のみ許可」が envelope MAIL FROM の `yah.mobi` を弾き、`550-5.7.0 Mail relay denied ... Invalid credentials for relay for one of the domains in: ... yah.mobi` を返していた。smtp.gmail.com は From に寛容で通っていたため顕在化していなかった。
- ✅ **修正**: `env.ts` の From 既定を **`yah.mobile <contact@mail.yah.mobi>`**（登録ドメイン＝DKIM/SPF/DMARC 設定済み）に変更。→ relay の「自ドメイン内のみ」を通過し、DKIM 署名が From ドメインと一致して DMARC pass（到達率も最良）。

**あわせて DNS（`mail.yah.mobi` に対して・到達率↑／なりすまし防止）**
- **SPF**: `mail.yah.mobi` の TXT に `v=spf1 include:_spf.google.com ~all`（既にWorkspace利用なら設定済のことが多い。要確認）。
- **DKIM**: 管理コンソール → アプリ → Gmail → **メールの認証** → ドメイン `mail.yah.mobi` を選び **DKIM 鍵を生成→DNSにTXT公開→署名ON**（ドメインごとに要設定。primaryのbonfireとは別）。
- **DMARC**（任意・推奨）: `_dmarc.mail.yah.mobi` に `v=DMARC1; p=none; rua=...`（まず p=none で監視）。

## 5. 検証
1. `cd functions && npm run build && npm test`（mailer はモックなので**既存テストに影響なし**）。
2. dev/本番で **テスト送信**（受付・発行メール）が届く＋ヘッダの `Received` が relay 経由か確認。
3. `550 ... sending limit` が出ないこと（上限 ~10k/日）。
4. Error Reporting に mailer 例外が増えないこと。

## 6. リスク・ロールバック
- 設定不備（許可送信者/認証）で送信失敗 → **`from` ドメイン不一致が最有力**（§4）。
- ロールバック容易: transport を `service:"gmail"` に戻して再デプロイ（1コミット revert）。
- 恒久のスケール（>10k/日）や配信分析が要る段階では専用サービス（SendGrid/ZeptoMail）を再検討＝**別途**。今回は「増やさない」方針でrelayに寄せる。

## 7. 手順
1. （私）`mailer.ts` transport 差し替え → build/test → dev コミット。
2. （あなた）Workspace で SMTP relay 設定＋From/SPF/DKIM 確認。
3. （あなた）本番 functions デプロイ（mailer を使う `stripeWebhook`/`esimRetryJob`/`onContactCreated`）→ テスト送信で確認。
