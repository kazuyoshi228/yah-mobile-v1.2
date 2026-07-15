/**
 * secrets.ts — Secret Manager シークレットの一元宣言（リファクタ P1-1）
 *
 * defineSecret は同名を複数箇所で宣言しても動くが、宣言が散らばると
 * 「関数の secrets: [...] への付け漏れ」「名称変更漏れ」の温床になるため、
 * 宣言はこのファイルに集約し、各関数ファイルは import して使う。
 * （シークレットの実値は Secret Manager 管理。ここには値を書かない）
 */
import { defineSecret } from "firebase-functions/params";

// Stripe（決済）
export const stripeSecretKey = defineSecret("STRIPE_SECRET_KEY");
export const stripeWebhookSecret = defineSecret("STRIPE_WEBHOOK_SECRET");

// Bappy/OMAX（休眠プロバイダ・既存eSIM同期用）
export const omaxClientId = defineSecret("OMAX_CLIENT_ID");
export const omaxClientSecret = defineSecret("OMAX_CLIENT_SECRET");

// eSIMAccess（稼働プロバイダ）
export const esimAccessCode = defineSecret("ESIMACCESS_ACCESS_CODE");
export const esimSecretKey = defineSecret("ESIMACCESS_SECRET_KEY");
export const esimaccessWebhookToken = defineSecret("ESIMACCESS_WEBHOOK_TOKEN");

// メール送信（Gmail）
export const ga4MpApiSecret = defineSecret("GA4_MP_API_SECRET");
export const gmailUser = defineSecret("GMAIL_USER");
export const gmailPass = defineSecret("GMAIL_PASS");

// オーナー通知（Forge/Slack/メール到達先）
export const forgeApiKey = defineSecret("BUILT_IN_FORGE_API_KEY");
export const slackWebhookUrl = defineSecret("SLACK_WEBHOOK_URL");
export const ownerEmail = defineSecret("OWNER_EMAIL");
