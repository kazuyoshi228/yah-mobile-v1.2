import * as logger from "firebase-functions/logger";
/**
 * mailer.ts — Gmail MCP メール送信ヘルパー
 *
 * Gmail MCP（BUILT_IN_FORGE_API_URL + BUILT_IN_FORGE_API_KEY）を使用して
 * メールを送信する共通ユーティリティ。
 *
 * 使用方法:
 *   import { sendEmail } from "./mailer";
 *   await sendEmail({ to: "user@example.com", subject: "件名", html: "<p>本文</p>" });
 */

import * as nodemailer from "nodemailer";
import { ENV } from "./env";

export interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
}

/**
 * nodemailer を使用して Gmail SMTP（smtp.gmail.com）経由でメールを送信する。
 *
 * 認証は GMAIL_USER / GMAIL_PASS（アプリパスワード）。上限 ~2,000通/日（Workspace）。
 * 現行規模（招待制・GA前・~66通/日）では十分。5k〜10k人/月に伸びた段階で
 * smtp-relay.gmail.com（~10,000通/日）への切替を検討する（DKIM/SPF/DMARC・relay設定は
 * 準備済み。切替は transport の host/port 差し替えのみ。詳細 docs/design_smtp_relay.md）。
 * 送信失敗時は例外をスローする。
 */
export async function sendEmail({ to, subject, html }: SendEmailOptions): Promise<void> {
  const user = ENV.gmailUser;
  const pass = ENV.gmailPass;

  if (!user || !pass) {
    logger.warn("[Mailer] GMAIL_USER or GMAIL_PASS not set — skipping email");
    return;
  }

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user,
      pass,
    },
  });

  try {
    await transporter.sendMail({
      from: ENV.mailFrom || user,
      to,
      subject,
      html,
    });
    logger.info(`[Mailer] Email successfully sent to ${to}`);
  } catch (error: any) {
    logger.error(`[Mailer] Failed to send email to ${to}:`, error);
    throw new Error(`Gmail (nodemailer) failed: ${error.message}`);
  }
}

// ─── ユーザー向けメールテンプレート ──────────────────────────────────────────
//
// 注文ライフサイクル系メールは order.language（i18n.language）で6言語出し分ける。
// 未設定/未知は en フォールバック。共通の HTML シェルと言語別コピーで構成する。

export type MailLang = "ja" | "en" | "ko" | "zh-CN" | "zh-TW" | "th";

export function normalizeLang(language?: string | null): MailLang {
  const l = (language ?? "").toLowerCase();
  if (l.startsWith("ja")) return "ja";
  if (l.startsWith("ko")) return "ko";
  if (l === "zh-tw" || l.includes("hant")) return "zh-TW";
  if (l.startsWith("zh")) return "zh-CN";
  if (l.startsWith("th")) return "th";
  return "en";
}

const FOOTER: Record<MailLang, string> = {
  ja: `このメールはyah.mobileからの自動送信です。<br>ご不明な点は <a href="https://yah.mobi/app#contact" style="color: #555;">サポートページ</a> よりお問い合わせください。`,
  en: `This is an automated message from yah.mobile.<br>If you have any questions, please reach us via our <a href="https://yah.mobi/app#contact" style="color: #555;">support page</a>.`,
  ko: `이 메일은 yah.mobile에서 자동으로 발송되었습니다.<br>문의 사항이 있으시면 <a href="https://yah.mobi/app#contact" style="color: #555;">지원 페이지</a>를 통해 연락해 주세요.`,
  "zh-CN": `这是来自 yah.mobile 的自动发送邮件。<br>如有任何疑问，请通过我们的<a href="https://yah.mobi/app#contact" style="color: #555;">支持页面</a>与我们联系。`,
  "zh-TW": `這是來自 yah.mobile 的自動發送郵件。<br>如有任何疑問，請透過我們的<a href="https://yah.mobi/app#contact" style="color: #555;">支援頁面</a>與我們聯絡。`,
  th: `อีเมลนี้เป็นข้อความอัตโนมัติจาก yah.mobile<br>หากมีคำถาม โปรดติดต่อเราผ่าน<a href="https://yah.mobi/app#contact" style="color: #555;">หน้าฝ่ายสนับสนุน</a>`,
};

const TONE = {
  info: { bg: "#f8fafc", border: "#e2e8f0", text: "#334155" },
  warn: { bg: "#fffbeb", border: "#fde68a", text: "#92400e" },
  error: { bg: "#fef2f2", border: "#fecaca", text: "#991b1b" },
  success: { bg: "#f0fdf4", border: "#bbf7d0", text: "#166534" },
} as const;

/** 全ライフサイクルメール共通の HTML シェル。 */
function renderEmail(
  lang: MailLang,
  o: { title: string; body: string; box: { tone: keyof typeof TONE; html: string }; ctaLabel: string; ctaHref: string },
): string {
  const t = TONE[o.box.tone];
  return `
<!DOCTYPE html>
<html lang="${lang}">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f8f8f8; margin: 0; padding: 20px;">
  <div style="max-width: 560px; margin: 0 auto; background: #fff; border-radius: 8px; overflow: hidden; border: 1px solid #e0e0e0;">
    <div style="background: #000; padding: 24px 32px;">
      <h1 style="color: #fff; font-size: 20px; margin: 0; letter-spacing: 0.05em;">yah.mobile</h1>
    </div>
    <div style="padding: 32px;">
      <h2 style="font-size: 18px; color: #111; margin: 0 0 16px;">${o.title}</h2>
      <p style="color: #555; font-size: 14px; line-height: 1.7; margin: 0 0 16px;">${o.body}</p>
      <div style="background: ${t.bg}; border: 1px solid ${t.border}; border-radius: 6px; padding: 16px; margin: 0 0 24px;">
        <p style="color: ${t.text}; font-size: 13px; margin: 0;">${o.box.html}</p>
      </div>
      <a href="${o.ctaHref}" style="display: inline-block; background: #000; color: #fff; text-decoration: none; padding: 12px 28px; border-radius: 4px; font-size: 14px; font-weight: 500;">${o.ctaLabel}</a>
      <p style="color: #aaa; font-size: 12px; margin: 24px 0 0; line-height: 1.6;">${FOOTER[lang]}</p>
    </div>
  </div>
</body>
</html>`;
}

type LifecycleCopy = { subject: string; title: string; body: string; box: string; cta: string };

/**
 * eSIM準備開始メール（購入直後）
 */
export function buildEsimPreparedEmail(opts: { orderId: string; planName?: string; language?: string | null }): { subject: string; html: string } {
  const lang = normalizeLang(opts.language);
  const orderLine: Record<MailLang, string> = {
    ja: `🧾 注文番号 #${opts.orderId}`, en: `🧾 Order #${opts.orderId}`, ko: `🧾 주문번호 #${opts.orderId}`,
    "zh-CN": `🧾 订单号 #${opts.orderId}`, "zh-TW": `🧾 訂單編號 #${opts.orderId}`, th: `🧾 หมายเลขคำสั่งซื้อ #${opts.orderId}`,
  };
  const planLabel: Record<MailLang, string> = { ja: "プラン", en: "Plan", ko: "요금제", "zh-CN": "套餐", "zh-TW": "方案", th: "แพ็กเกจ" };
  const copy: Record<MailLang, LifecycleCopy> = {
    ja: { subject: "【yah.mobile】eSIMの準備を開始しました", title: "eSIMの準備を開始しました", body: "ご購入ありがとうございます。eSIMの発行処理を開始しました。<br>通常<strong>数分以内</strong>にマイページでQRコードをご確認いただけます。", box: "", cta: "マイページを確認する" },
    en: { subject: "[yah.mobile] We're preparing your eSIM", title: "We're preparing your eSIM", body: "Thank you for your purchase. We've started issuing your eSIM.<br>Your QR code is usually ready on My Page <strong>within a few minutes</strong>.", box: "", cta: "Go to My Page" },
    ko: { subject: "[yah.mobile] eSIM을 준비하고 있습니다", title: "eSIM을 준비하고 있습니다", body: "구매해 주셔서 감사합니다. eSIM 발급을 시작했습니다.<br>보통 <strong>몇 분 이내</strong>에 마이페이지에서 QR 코드를 확인하실 수 있습니다.", box: "", cta: "마이페이지 확인하기" },
    "zh-CN": { subject: "[yah.mobile] 正在为您准备 eSIM", title: "正在为您准备 eSIM", body: "感谢您的购买。我们已开始为您签发 eSIM。<br>通常<strong>几分钟内</strong>即可在“我的页面”查看二维码。", box: "", cta: "前往我的页面" },
    "zh-TW": { subject: "[yah.mobile] 正在為您準備 eSIM", title: "正在為您準備 eSIM", body: "感謝您的購買。我們已開始為您核發 eSIM。<br>通常<strong>幾分鐘內</strong>即可在「我的頁面」查看 QR 碼。", box: "", cta: "前往我的頁面" },
    th: { subject: "[yah.mobile] กำลังเตรียม eSIM ของคุณ", title: "กำลังเตรียม eSIM ของคุณ", body: "ขอบคุณสำหรับการสั่งซื้อ เราได้เริ่มออก eSIM ให้คุณแล้ว<br>โดยปกติคุณจะเห็น QR code ในหน้าของฉัน<strong>ภายในไม่กี่นาที</strong>", box: "", cta: "ไปที่หน้าของฉัน" },
  };
  const c = copy[lang];
  const box = orderLine[lang] + (opts.planName ? `<br>${planLabel[lang]}: ${opts.planName}` : "");
  return { subject: c.subject, html: renderEmail(lang, { title: c.title, body: c.body, box: { tone: "info", html: box }, ctaLabel: c.cta, ctaHref: "https://yah.mobi/mypage" }) };
}

/**
 * eSIM発行遅延メール（リトライ中）
 */
export function buildEsimDelayedEmail(opts: { orderId: string; language?: string | null }): { subject: string; html: string } {
  const lang = normalizeLang(opts.language);
  const copy: Record<MailLang, LifecycleCopy> = {
    ja: { subject: "【yah.mobile】eSIMの発行に少し時間がかかっています", title: "eSIMの発行に少し時間がかかっています", body: "eSIMの発行処理に通常より時間がかかっています。<br>引き続き自動で処理中です。<strong>完了次第メールでお知らせします</strong>。<br>しばらくお待ちください。", box: `⏳ 注文番号 #${opts.orderId} の処理中です。通常15分以内に完了します。`, cta: "マイページを確認する" },
    en: { subject: "[yah.mobile] Your eSIM is taking a little longer", title: "Your eSIM is taking a little longer", body: "Issuing your eSIM is taking longer than usual.<br>We're still processing it automatically and <strong>will email you as soon as it's ready</strong>.<br>Thank you for your patience.", box: `⏳ Order #${opts.orderId} is being processed. This usually completes within 15 minutes.`, cta: "Go to My Page" },
    ko: { subject: "[yah.mobile] eSIM 발급에 시간이 조금 걸리고 있습니다", title: "eSIM 발급에 시간이 조금 걸리고 있습니다", body: "eSIM 발급 처리가 평소보다 오래 걸리고 있습니다.<br>계속 자동으로 처리 중이며 <strong>완료되는 대로 메일로 알려드리겠습니다</strong>.<br>잠시만 기다려 주세요.", box: `⏳ 주문 #${opts.orderId} 을(를) 처리 중입니다. 보통 15분 이내에 완료됩니다.`, cta: "마이페이지 확인하기" },
    "zh-CN": { subject: "[yah.mobile] 您的 eSIM 需要更多时间", title: "您的 eSIM 需要更多时间", body: "签发您的 eSIM 所需时间比平常更久。<br>我们仍在自动处理，<strong>完成后会立即通过邮件通知您</strong>。<br>感谢您的耐心等待。", box: `⏳ 订单 #${opts.orderId} 正在处理中，通常在 15 分钟内完成。`, cta: "前往我的页面" },
    "zh-TW": { subject: "[yah.mobile] 您的 eSIM 需要多一點時間", title: "您的 eSIM 需要多一點時間", body: "核發您的 eSIM 所需時間比平常更久。<br>我們仍在自動處理，<strong>完成後會立即以郵件通知您</strong>。<br>感謝您的耐心等候。", box: `⏳ 訂單 #${opts.orderId} 正在處理中，通常在 15 分鐘內完成。`, cta: "前往我的頁面" },
    th: { subject: "[yah.mobile] eSIM ของคุณใช้เวลานานขึ้นเล็กน้อย", title: "eSIM ของคุณใช้เวลานานขึ้นเล็กน้อย", body: "การออก eSIM ใช้เวลานานกว่าปกติ<br>เรายังคงดำเนินการโดยอัตโนมัติ และ<strong>จะส่งอีเมลแจ้งทันทีที่เสร็จ</strong><br>ขอบคุณสำหรับความอดทนรอ", box: `⏳ กำลังดำเนินการคำสั่งซื้อ #${opts.orderId} โดยปกติจะเสร็จภายใน 15 นาที`, cta: "ไปที่หน้าของฉัน" },
  };
  const c = copy[lang];
  return { subject: c.subject, html: renderEmail(lang, { title: c.title, body: c.body, box: { tone: "warn", html: c.box }, ctaLabel: c.cta, ctaHref: "https://yah.mobi/mypage" }) };
}

/**
 * eSIM発行失敗メール（最終失敗）
 */
export function buildEsimFailedEmail(opts: { orderId: string; language?: string | null }): { subject: string; html: string } {
  const lang = normalizeLang(opts.language);
  const copy: Record<MailLang, LifecycleCopy> = {
    ja: { subject: "【yah.mobile】eSIM発行に問題が発生しました", title: "eSIM発行に問題が発生しました", body: "誠に申し訳ございません。eSIMの発行に問題が発生しました。<br>サポートチームが確認中です。<strong>解決次第ご連絡いたします</strong>。", box: `注文番号 #${opts.orderId} ／ 返金対応も可能です。サポートページよりお問い合わせください。`, cta: "サポートに連絡する" },
    en: { subject: "[yah.mobile] There was a problem issuing your eSIM", title: "There was a problem issuing your eSIM", body: "We're very sorry — there was a problem issuing your eSIM.<br>Our support team is looking into it and <strong>will get back to you as soon as it's resolved</strong>.", box: `Order #${opts.orderId} — a refund is also available. Please reach us via our support page.`, cta: "Contact support" },
    ko: { subject: "[yah.mobile] eSIM 발급 중 문제가 발생했습니다", title: "eSIM 발급 중 문제가 발생했습니다", body: "대단히 죄송합니다. eSIM 발급 중 문제가 발생했습니다.<br>지원팀이 확인하고 있으며 <strong>해결되는 대로 연락드리겠습니다</strong>.", box: `주문 #${opts.orderId} — 환불도 가능합니다. 지원 페이지를 통해 문의해 주세요.`, cta: "지원팀에 문의하기" },
    "zh-CN": { subject: "[yah.mobile] 签发 eSIM 时出现问题", title: "签发 eSIM 时出现问题", body: "非常抱歉，签发您的 eSIM 时出现了问题。<br>我们的支持团队正在核查，<strong>解决后会尽快与您联系</strong>。", box: `订单 #${opts.orderId} — 也可申请退款。请通过我们的支持页面与我们联系。`, cta: "联系客服" },
    "zh-TW": { subject: "[yah.mobile] 核發 eSIM 時發生問題", title: "核發 eSIM 時發生問題", body: "非常抱歉，核發您的 eSIM 時發生了問題。<br>我們的支援團隊正在確認，<strong>解決後會盡快與您聯絡</strong>。", box: `訂單 #${opts.orderId} — 亦可申請退款。請透過我們的支援頁面與我們聯絡。`, cta: "聯絡客服" },
    th: { subject: "[yah.mobile] เกิดปัญหาในการออก eSIM", title: "เกิดปัญหาในการออก eSIM", body: "เราขออภัยเป็นอย่างยิ่ง เกิดปัญหาในการออก eSIM ของคุณ<br>ทีมสนับสนุนของเรากำลังตรวจสอบ และ<strong>จะติดต่อกลับทันทีที่แก้ไขเสร็จ</strong>", box: `คำสั่งซื้อ #${opts.orderId} — สามารถขอคืนเงินได้เช่นกัน โปรดติดต่อเราผ่านหน้าฝ่ายสนับสนุน`, cta: "ติดต่อฝ่ายสนับสนุน" },
  };
  const c = copy[lang];
  return { subject: c.subject, html: renderEmail(lang, { title: c.title, body: c.body, box: { tone: "error", html: c.box }, ctaLabel: c.cta, ctaHref: "https://yah.mobi/app#contact" }) };
}

/**
 * 返金完了メール（5言語・購入時ページ言語で判定）。
 * 返金の実行/確定は Stripe charge.refunded webhook を真実源とし、そこから本メールを送る。
 * 言語は order.language（i18n.language）を正規化して選ぶ。未設定/未知は en フォールバック。
 */
type RefundLang = "en" | "ko" | "zh-CN" | "zh-TW" | "th";

function normalizeRefundLang(language?: string | null): RefundLang {
  const l = (language ?? "").toLowerCase();
  if (l.startsWith("ko")) return "ko";
  if (l === "zh-tw" || l.startsWith("zh-hant") || l.includes("hant")) return "zh-TW";
  if (l.startsWith("zh")) return "zh-CN";
  if (l.startsWith("th")) return "th";
  return "en";
}

export function buildRefundCompletedEmail(opts: {
  orderId: string;
  amountJpy: number;
  language?: string | null;
}): { subject: string; html: string } {
  const lang = normalizeRefundLang(opts.language);
  const amount = `¥${opts.amountJpy.toLocaleString("en-US")}`;

  const copy: Record<RefundLang, {
    subject: string; title: string; body: string;
    boxOrder: string; boxRefunded: string; note: string; cta: string; footer: string;
  }> = {
    en: {
      subject: `[yah.mobile] Your refund has been processed — Order #${opts.orderId}`,
      title: "Your refund has been processed",
      body: "We're sorry — we were unable to deliver your eSIM for this order, so we have issued a full refund. You have not been charged for this order.",
      boxOrder: `Order #${opts.orderId}`,
      boxRefunded: `Refunded ${amount} to your original payment method`,
      note: "The refund has been sent to the card or payment method you used at checkout. It typically takes 5–10 business days to appear on your statement, depending on your card issuer or bank.",
      cta: "View your orders",
      footer: "This is an automated message from yah.mobile. If you have any questions, please contact us via our support page.",
    },
    ko: {
      subject: `[yah.mobile] 환불이 완료되었습니다 — 주문 #${opts.orderId}`,
      title: "환불이 완료되었습니다",
      body: "죄송합니다. 이번 주문의 eSIM을 제공해 드리지 못하여 전액 환불해 드렸습니다. 이 주문에 대한 요금은 청구되지 않습니다.",
      boxOrder: `주문 #${opts.orderId}`,
      boxRefunded: `결제하신 원래 결제 수단으로 ${amount} 환불`,
      note: "환불금은 결제 시 사용하신 카드 또는 결제 수단으로 전송되었습니다. 카드사 또는 은행에 따라 명세서에 반영되기까지 보통 5~10 영업일이 걸립니다.",
      cta: "주문 내역 보기",
      footer: "이 메일은 yah.mobile에서 자동으로 발송되었습니다. 문의 사항이 있으시면 지원 페이지를 통해 연락해 주세요.",
    },
    "zh-CN": {
      subject: `[yah.mobile] 您的退款已处理 — 订单 #${opts.orderId}`,
      title: "您的退款已处理",
      body: "非常抱歉，我们无法为此订单提供 eSIM，因此已为您全额退款。此订单不会向您收取任何费用。",
      boxOrder: `订单 #${opts.orderId}`,
      boxRefunded: `已将 ${amount} 退回至您的原支付方式`,
      note: "退款已退回至您结账时使用的银行卡或支付方式。视发卡行或银行而定，通常需要 5–10 个工作日才会显示在您的账单中。",
      cta: "查看您的订单",
      footer: "这是来自 yah.mobile 的自动发送邮件。如有任何疑问，请通过我们的支持页面与我们联系。",
    },
    "zh-TW": {
      subject: `[yah.mobile] 您的退款已處理 — 訂單 #${opts.orderId}`,
      title: "您的退款已處理",
      body: "非常抱歉，我們無法為此訂單提供 eSIM，因此已為您全額退款。此訂單不會向您收取任何費用。",
      boxOrder: `訂單 #${opts.orderId}`,
      boxRefunded: `已將 ${amount} 退回至您的原付款方式`,
      note: "退款已退回至您結帳時使用的信用卡或付款方式。視發卡機構或銀行而定，通常需要 5–10 個工作天才會顯示在您的帳單中。",
      cta: "查看您的訂單",
      footer: "這是來自 yah.mobile 的自動發送郵件。如有任何疑問，請透過我們的支援頁面與我們聯絡。",
    },
    th: {
      subject: `[yah.mobile] คืนเงินให้คุณเรียบร้อยแล้ว — คำสั่งซื้อ #${opts.orderId}`,
      title: "คืนเงินให้คุณเรียบร้อยแล้ว",
      body: "ขออภัยเป็นอย่างยิ่ง เราไม่สามารถจัดส่ง eSIM สำหรับคำสั่งซื้อนี้ได้ จึงได้คืนเงินเต็มจำนวนให้คุณแล้ว คุณจะไม่ถูกเรียกเก็บเงินสำหรับคำสั่งซื้อนี้",
      boxOrder: `คำสั่งซื้อ #${opts.orderId}`,
      boxRefunded: `คืนเงิน ${amount} ไปยังวิธีการชำระเงินเดิมของคุณ`,
      note: "เงินคืนถูกส่งไปยังบัตรหรือวิธีการชำระเงินที่คุณใช้ตอนชำระเงิน โดยปกติจะใช้เวลาประมาณ 5–10 วันทำการจึงจะปรากฏในใบแจ้งยอดของคุณ ทั้งนี้ขึ้นอยู่กับผู้ออกบัตรหรือธนาคารของคุณ",
      cta: "ดูคำสั่งซื้อของคุณ",
      footer: "อีเมลนี้เป็นข้อความอัตโนมัติจาก yah.mobile หากคุณมีคำถามใดๆ โปรดติดต่อเราผ่านหน้าฝ่ายสนับสนุน",
    },
  };

  const c = copy[lang];
  const html = `
<!DOCTYPE html>
<html lang="${lang}">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f8f8f8; margin: 0; padding: 20px;">
  <div style="max-width: 560px; margin: 0 auto; background: #fff; border-radius: 8px; overflow: hidden; border: 1px solid #e0e0e0;">
    <div style="background: #000; padding: 24px 32px;">
      <h1 style="color: #fff; font-size: 20px; margin: 0; letter-spacing: 0.05em;">yah.mobile</h1>
    </div>
    <div style="padding: 32px;">
      <h2 style="font-size: 18px; color: #111; margin: 0 0 16px;">${c.title}</h2>
      <p style="color: #555; font-size: 14px; line-height: 1.7; margin: 0 0 16px;">
        ${c.body}
      </p>
      <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 6px; padding: 16px; margin: 0 0 24px;">
        <p style="color: #166534; font-size: 13px; margin: 0 0 8px; font-weight: 600;">${c.boxOrder}</p>
        <p style="color: #166534; font-size: 13px; margin: 0;">${c.boxRefunded}</p>
      </div>
      <p style="color: #777; font-size: 12px; line-height: 1.7; margin: 0 0 24px;">
        ${c.note}
      </p>
      <a href="https://yah.mobi/mypage" style="display: inline-block; background: #000; color: #fff; text-decoration: none; padding: 12px 28px; border-radius: 4px; font-size: 14px; font-weight: 500;">
        ${c.cta}
      </a>
      <p style="color: #aaa; font-size: 12px; margin: 24px 0 0; line-height: 1.6;">
        ${c.footer}
      </p>
    </div>
  </div>
</body>
</html>`;
  return { subject: c.subject, html };
}

/**
 * 購入受付メール（決済完了直後・eSIM発行前に送信）。
 * eSIMの発行完了は別途 buildEsimReadyEmail で通知する（2通体制）。
 */
export function buildPurchaseReceivedEmail(opts: { orderId: string; language?: string | null }): { subject: string; html: string } {
  const lang = normalizeLang(opts.language);
  const copy: Record<MailLang, LifecycleCopy> = {
    ja: { subject: "【yah.mobile】ご注文を受け付けました", title: "ご注文を受け付けました ✓", body: "ご購入ありがとうございます。お支払いを確認しました。<br>現在eSIMを準備しています。発行が完了しましたら、あらためてご案内メールをお送りします。", box: `🧾 注文番号 #${opts.orderId} を受け付けました。`, cta: "マイページで状況を確認する" },
    en: { subject: "[yah.mobile] Your order is confirmed", title: "Your order is confirmed ✓", body: "Thank you for your purchase. We've confirmed your payment.<br>We're now preparing your eSIM and will email you again as soon as it's issued.", box: `🧾 Order #${opts.orderId} has been received.`, cta: "Check status on My Page" },
    ko: { subject: "[yah.mobile] 주문이 접수되었습니다", title: "주문이 접수되었습니다 ✓", body: "구매해 주셔서 감사합니다. 결제를 확인했습니다.<br>현재 eSIM을 준비하고 있으며, 발급이 완료되면 다시 안내 메일을 보내드리겠습니다.", box: `🧾 주문 #${opts.orderId} 이(가) 접수되었습니다.`, cta: "마이페이지에서 상태 확인하기" },
    "zh-CN": { subject: "[yah.mobile] 您的订单已确认", title: "您的订单已确认 ✓", body: "感谢您的购买。我们已确认您的付款。<br>我们正在为您准备 eSIM，签发完成后会再次通过邮件通知您。", box: `🧾 订单 #${opts.orderId} 已受理。`, cta: "在我的页面查看状态" },
    "zh-TW": { subject: "[yah.mobile] 您的訂單已確認", title: "您的訂單已確認 ✓", body: "感謝您的購買。我們已確認您的付款。<br>我們正在為您準備 eSIM，核發完成後會再次以郵件通知您。", box: `🧾 訂單 #${opts.orderId} 已受理。`, cta: "在我的頁面查看狀態" },
    th: { subject: "[yah.mobile] ยืนยันคำสั่งซื้อของคุณแล้ว", title: "ยืนยันคำสั่งซื้อของคุณแล้ว ✓", body: "ขอบคุณสำหรับการสั่งซื้อ เราได้ยืนยันการชำระเงินของคุณแล้ว<br>ขณะนี้เรากำลังเตรียม eSIM และจะส่งอีเมลแจ้งอีกครั้งเมื่อออกให้เรียบร้อย", box: `🧾 รับคำสั่งซื้อ #${opts.orderId} แล้ว`, cta: "ตรวจสอบสถานะในหน้าของฉัน" },
  };
  const c = copy[lang];
  return { subject: c.subject, html: renderEmail(lang, { title: c.title, body: c.body, box: { tone: "info", html: c.box }, ctaLabel: c.cta, ctaHref: "https://yah.mobi/mypage" }) };
}

/** メール本文用の日付表示（言語別ロケール・日付のみ）。 */
function fmtMailDate(epochMs: number, lang: MailLang): string {
  const locale: Record<MailLang, string> = { ja: "ja-JP", en: "en-US", ko: "ko-KR", "zh-CN": "zh-CN", "zh-TW": "zh-TW", th: "th-TH" };
  return new Date(epochMs).toLocaleDateString(locale[lang], { year: "numeric", month: "short", day: "numeric" });
}

/**
 * eSIM発行完了メール（復旧成功）
 * installBy: インストール期限（epoch ms・eSIMAccess の expiredTime）。渡すと期限の注意書きを追記する。
 */
export function buildEsimReadyEmail(opts: { orderId: string; language?: string | null; installBy?: number | null }): { subject: string; html: string } {
  const lang = normalizeLang(opts.language);
  const copy: Record<MailLang, LifecycleCopy> = {
    ja: { subject: "【yah.mobile】eSIMの発行が完了しました", title: "eSIMの発行が完了しました ✓", body: "お待たせしました。eSIMの発行が完了しました。<br>マイページからQRコードをご確認いただき、設定を行ってください。", box: `✅ 注文番号 #${opts.orderId} のeSIMが発行されました。`, cta: "マイページでQRコードを確認する" },
    en: { subject: "[yah.mobile] Your eSIM is ready", title: "Your eSIM is ready ✓", body: "Thanks for waiting — your eSIM has been issued.<br>Open My Page to view your QR code and complete setup.", box: `✅ The eSIM for order #${opts.orderId} has been issued.`, cta: "View QR code on My Page" },
    ko: { subject: "[yah.mobile] eSIM 발급이 완료되었습니다", title: "eSIM 발급이 완료되었습니다 ✓", body: "기다려 주셔서 감사합니다. eSIM 발급이 완료되었습니다.<br>마이페이지에서 QR 코드를 확인하고 설정을 진행해 주세요.", box: `✅ 주문 #${opts.orderId} 의 eSIM이 발급되었습니다.`, cta: "마이페이지에서 QR 코드 확인하기" },
    "zh-CN": { subject: "[yah.mobile] 您的 eSIM 已就绪", title: "您的 eSIM 已就绪 ✓", body: "久等了，您的 eSIM 已签发。<br>请在“我的页面”查看二维码并完成设置。", box: `✅ 订单 #${opts.orderId} 的 eSIM 已签发。`, cta: "在我的页面查看二维码" },
    "zh-TW": { subject: "[yah.mobile] 您的 eSIM 已就緒", title: "您的 eSIM 已就緒 ✓", body: "久等了，您的 eSIM 已核發。<br>請在「我的頁面」查看 QR 碼並完成設定。", box: `✅ 訂單 #${opts.orderId} 的 eSIM 已核發。`, cta: "在我的頁面查看 QR 碼" },
    th: { subject: "[yah.mobile] eSIM ของคุณพร้อมแล้ว", title: "eSIM ของคุณพร้อมแล้ว ✓", body: "ขอบคุณที่รอ eSIM ของคุณออกให้เรียบร้อยแล้ว<br>เปิดหน้าของฉันเพื่อดู QR code และตั้งค่าให้เสร็จสมบูรณ์", box: `✅ ออก eSIM สำหรับคำสั่งซื้อ #${opts.orderId} แล้ว`, cta: "ดู QR code ในหน้าของฉัน" },
  };
  // インストール期限（未使用のまま期限を過ぎると失効）— F: 期限コミュニケーション
  const installLine: Record<MailLang, (d: string) => string> = {
    ja: (d) => `⏰ <strong>${d} までにインストール</strong>してください。未使用のまま期限を過ぎると eSIM は失効します（データの有効期間は有効化した時点から始まります）。`,
    en: (d) => `⏰ <strong>Install by ${d}</strong>. Unused eSIMs expire after this date (your data validity starts when you activate).`,
    ko: (d) => `⏰ <strong>${d} 까지 설치</strong>해 주세요. 미사용 상태로 기한이 지나면 eSIM은 만료됩니다(데이터 유효기간은 활성화 시점부터 시작됩니다).`,
    "zh-CN": (d) => `⏰ 请<strong>在 ${d} 前安装</strong>。逾期未使用的 eSIM 将失效（流量有效期从激活时开始计算）。`,
    "zh-TW": (d) => `⏰ 請<strong>在 ${d} 前安裝</strong>。逾期未使用的 eSIM 將失效（數據有效期自啟用時開始計算）。`,
    th: (d) => `⏰ <strong>ติดตั้งภายใน ${d}</strong> หากไม่ใช้งานภายในกำหนด eSIM จะหมดอายุ (อายุการใช้งานดาต้าเริ่มนับเมื่อเปิดใช้งาน)`,
  };
  // 削除注意（G: 再インストール仕様が確定するまで安全側の案内）
  const deleteWarnLine: Record<MailLang, string> = {
    ja: `⚠️ <strong>インストール後は端末から eSIM を削除しないでください。</strong>誤って削除した場合や機種変更の際は、復元の可否を確認しますので先にサポートへご連絡ください。`,
    en: `⚠️ <strong>After installing, do not delete the eSIM from your device.</strong> If you accidentally delete it or switch phones, contact our support first — we'll check whether it can be restored.`,
    ko: `⚠️ <strong>설치 후에는 기기에서 eSIM을 삭제하지 마세요.</strong> 실수로 삭제했거나 기기를 변경하는 경우, 복원 가능 여부를 확인해 드리니 먼저 고객 지원에 문의해 주세요.`,
    "zh-CN": `⚠️ <strong>安装后请不要从设备中删除 eSIM。</strong>如不小心删除或更换手机，请先联系客服，我们会确认能否恢复。`,
    "zh-TW": `⚠️ <strong>安裝後請不要從裝置中刪除 eSIM。</strong>如不小心刪除或更換手機，請先聯絡客服，我們會確認能否復原。`,
    th: `⚠️ <strong>หลังติดตั้งแล้ว โปรดอย่าลบ eSIM ออกจากอุปกรณ์</strong> หากเผลอลบหรือเปลี่ยนเครื่อง โปรดติดต่อฝ่ายสนับสนุนก่อน เราจะตรวจสอบว่าสามารถกู้คืนได้หรือไม่`,
  };
  const c = copy[lang];
  const notes = [
    ...(opts.installBy ? [installLine[lang](fmtMailDate(opts.installBy, lang))] : []),
    deleteWarnLine[lang],
  ];
  const box = `${c.box}<br><br>${notes.join("<br><br>")}`;
  return { subject: c.subject, html: renderEmail(lang, { title: c.title, body: c.body, box: { tone: "success", html: box }, ctaLabel: c.cta, ctaHref: "https://yah.mobi/mypage" }) };
}

// ─── お問い合わせ自動返信（D: 6言語） ─────────────────────────────────────────

function escapeHtmlMail(str: string | null | undefined): string {
  if (!str) return "";
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

/**
 * お問い合わせ自動返信メール。inquiry.language（フォームのUI言語）で6言語出し分け。
 * name/message は内部でHTMLエスケープする（生値を渡してよい）。
 */
export function buildContactAutoReplyEmail(opts: { name?: string | null; message: string; language?: string | null }): { subject: string; html: string } {
  const lang = normalizeLang(opts.language);
  const copy: Record<MailLang, { subject: string; greeting: (n: string | null) => string; body: string; quoteLabel: string; note: string }> = {
    ja: { subject: "【yah.mobile】お問い合わせを受け付けました", greeting: (n) => `${n ?? "お客様"} 様`, body: "お問い合わせありがとうございます。以下の内容で受け付けました。<br>担当者より順次ご返信いたしますので、今しばらくお待ちください。", quoteLabel: "【送信内容】", note: "※本メールは自動送信です。このメールに心当たりがない場合は破棄してください。" },
    en: { subject: "[yah.mobile] We received your inquiry", greeting: (n) => `Dear ${n ?? "Customer"},`, body: "Thank you for contacting us. We've received your message below.<br>Our team will get back to you as soon as possible.", quoteLabel: "Your message:", note: "This is an automated message. If you did not submit this inquiry, please disregard this email." },
    ko: { subject: "[yah.mobile] 문의가 접수되었습니다", greeting: (n) => `${n ?? "고객"}님`, body: "문의해 주셔서 감사합니다. 아래 내용으로 접수되었습니다.<br>담당자가 순차적으로 답변드리오니 잠시만 기다려 주세요.", quoteLabel: "보내신 내용:", note: "이 메일은 자동 발송되었습니다. 본인이 보낸 문의가 아닌 경우 이 메일을 무시해 주세요." },
    "zh-CN": { subject: "[yah.mobile] 我们已收到您的咨询", greeting: (n) => `${n ?? "尊敬的客户"}：`, body: "感谢您的咨询。我们已收到以下内容。<br>我们的团队将尽快回复您，请稍候。", quoteLabel: "您的留言：", note: "这是一封自动发送的邮件。如果您没有提交此咨询，请忽略本邮件。" },
    "zh-TW": { subject: "[yah.mobile] 我們已收到您的諮詢", greeting: (n) => `${n ?? "尊敬的客戶"}：`, body: "感謝您的諮詢。我們已收到以下內容。<br>我們的團隊將盡快回覆您，請稍候。", quoteLabel: "您的留言：", note: "這是一封自動發送的郵件。如果您沒有提交此諮詢，請忽略本郵件。" },
    th: { subject: "[yah.mobile] เราได้รับข้อความของคุณแล้ว", greeting: (n) => `เรียนคุณ${n ?? "ลูกค้า"}`, body: "ขอบคุณที่ติดต่อเรา เราได้รับข้อความของคุณตามด้านล่างแล้ว<br>ทีมงานของเราจะติดต่อกลับโดยเร็วที่สุด", quoteLabel: "ข้อความของคุณ:", note: "อีเมลนี้ส่งโดยอัตโนมัติ หากคุณไม่ได้ส่งข้อความนี้ กรุณาละเว้นอีเมลฉบับนี้" },
  };
  const c = copy[lang];
  const safeName = opts.name ? escapeHtmlMail(opts.name) : null;
  const safeMessage = escapeHtmlMail(opts.message).replace(/\n/g, "<br>");
  const html = `
<!DOCTYPE html>
<html lang="${lang}">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f8f8f8; margin: 0; padding: 20px;">
  <div style="max-width: 560px; margin: 0 auto; background: #fff; border-radius: 8px; overflow: hidden; border: 1px solid #e0e0e0;">
    <div style="background: #000; padding: 24px 32px;">
      <h1 style="color: #fff; font-size: 20px; margin: 0; letter-spacing: 0.05em;">yah.mobile</h1>
    </div>
    <div style="padding: 32px;">
      <p style="color: #111; font-size: 14px; margin: 0 0 12px;">${c.greeting(safeName)}</p>
      <p style="color: #555; font-size: 14px; line-height: 1.7; margin: 0 0 16px;">${c.body}</p>
      <div style="background: #f8f8f8; padding: 16px; border-radius: 6px; margin: 0 0 24px;">
        <p style="color: #888; font-size: 12px; margin: 0 0 6px;"><strong>${c.quoteLabel}</strong></p>
        <p style="color: #333; font-size: 13px; line-height: 1.7; margin: 0;">${safeMessage}</p>
      </div>
      <p style="color: #aaa; font-size: 12px; margin: 0; line-height: 1.6;">${c.note}</p>
    </div>
  </div>
</body>
</html>`;
  return { subject: c.subject, html };
}
