// SMTP relay 単独テスト（Cloud Functions から切り離して手元で叩く）
// 使い方:
//   export GMAIL_USER='<送信認証アカウント>'   # 例: contact@mail.yah.mobi など Workspaceアカウント
//   export GMAIL_PASS='<アプリパスワード>'      # 16桁。画面に貼らない・コミットしない
//   export MAIL_FROM='contact@mail.yah.mobi'   # 省略時は GMAIL_USER
//   export MAIL_TO='<自分の受信用アドレス>'
//   node scripts/test_smtp_relay.mjs
//
// SMTPの生ログ(debug)を全部出すので、どこで落ちるか(AUTH拒否 / relay拒否)が分かる。
import nodemailer from "nodemailer";

const user = process.env.GMAIL_USER;
const pass = process.env.GMAIL_PASS;
const from = process.env.MAIL_FROM || user;
const to = process.env.MAIL_TO || user;

if (!user || !pass) {
  console.error("GMAIL_USER / GMAIL_PASS を環境変数で渡してください。");
  process.exit(1);
}
console.log(`AUTH user = ${user}`);
console.log(`MAIL FROM = ${from}`);
console.log(`RCPT TO   = ${to}`);
console.log("---- SMTP 生ログ (smtp-relay.gmail.com:587 / STARTTLS) ----");

const transporter = nodemailer.createTransport({
  host: "smtp-relay.gmail.com",
  port: 587,
  secure: false,
  requireTLS: true,
  auth: { user, pass },
  logger: true,   // SMTP会話を全出力
  debug: true,
});

try {
  // まず接続/認証だけ検証
  await transporter.verify();
  console.log("\n✅ verify() OK — 認証は成功。relay も受理される見込み。");
  const info = await transporter.sendMail({
    from,
    to,
    subject: "yah.mobile SMTP relay test",
    text: "relay test ok",
  });
  console.log("✅ sendMail OK:", info.response);
  console.log("   accepted:", info.accepted, " rejected:", info.rejected);
} catch (e) {
  console.error("\n❌ 失敗:", e && e.message);
  if (e && e.response) console.error("   SMTP response:", e.response);
  if (e && e.responseCode) console.error("   code:", e.responseCode);
  process.exit(2);
}
