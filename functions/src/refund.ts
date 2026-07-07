/**
 * functions/src/refund.ts — 返金実行の共通部品
 *
 * 設計方針（docs/spec_refund.md）：
 *  - Stripe を「返金の真実源」とし、返金の確定・顧客通知・メールは charge.refunded webhook に一元化する。
 *  - 本モジュールは「返金のトリガー（Stripe への refunds.create）」だけを担い、
 *    status="refunded"／通知／メールは webhook 側（webhooks.ts handleChargeRefunded）に委譲する。
 *  - 冪等：refundStatus / status と Stripe の idempotencyKey で二重返金を防ぐ。
 *  - Lane A（当社側エラーの自動返金）はキルスイッチ isAutoRefundEnabled() で即時停止できる。
 *    Lane B（管理者の手動返金）はキルスイッチの対象外（人間の判断なので常に実行可）。
 */
import * as logger from "firebase-functions/logger";
import { db, getOrderById, updateOrder, createIncidentLog } from "./db";
import { stripeClient } from "./stripe";
import { notifyOwner } from "./adapters/notify";

/**
 * 自動返金（Lane A）のキルスイッチ。/admin のトグルが Firestore の
 * system_config/refunds.autoRefundEnabled を書き換える。関数は実行時に読む（再デプロイ不要）。
 * - ドキュメント無し／フィールド無し → 既定 ON（true）。
 * - 読取エラー → fail-closed（false）。glitch で誤って自動返金しない。
 */
export async function isAutoRefundEnabled(): Promise<boolean> {
  try {
    const snap = await db.collection("system_config").doc("refunds").get();
    if (!snap.exists) return true; // 既定ON
    const v = snap.data()?.autoRefundEnabled;
    return v === false ? false : true; // 明示 false のときだけ停止
  } catch (err) {
    logger.error("[refund] isAutoRefundEnabled read failed; failing closed (auto-refund disabled):", err);
    return false;
  }
}

export interface ExecuteRefundResult {
  ok: boolean;
  error?: string;
}

/**
 * 全額返金をトリガーする。実際の status="refunded"／通知／メールは charge.refunded webhook で確定。
 * @param orderId 対象注文ID
 * @param reason  内部理由（"system_failure" | "manual" 等）。Stripe 側の reason は固定で requested_by_customer。
 */
export async function executeRefund(orderId: string, reason: string): Promise<ExecuteRefundResult> {
  const order = await getOrderById(orderId);
  if (!order) {
    logger.error(`[executeRefund] Order not found: ${orderId}`);
    return { ok: false, error: "order_not_found" };
  }

  // 冪等：既に返金済み/処理中なら何もしない（成功扱い）
  if (order.status === "refunded" || order.refundStatus === "refunded" || order.refundStatus === "processing") {
    logger.info(`[executeRefund] Order ${orderId} already refunded/processing (status=${order.status}, refundStatus=${order.refundStatus}). Skipping.`);
    return { ok: true };
  }

  // 実課金がある注文のみ返金可能（未課金・無料は対象外）
  if (!order.stripePaymentIntentId) {
    logger.error(`[executeRefund] Order ${orderId} has no stripePaymentIntentId; cannot refund`);
    await notifyOwner({
      title: `⚠️ 返金不可（payment_intent 無し） — 注文 #${orderId}`,
      content: `注文 #${orderId} は stripePaymentIntentId を持たないため自動返金できません。手動確認が必要です。`,
    }).catch(() => undefined);
    return { ok: false, error: "no_payment_intent" };
  }

  // 多重実行防止：processing に落としてから Stripe を叩く
  await updateOrder(orderId, { refundStatus: "processing", refundReason: reason });

  try {
    await stripeClient.refunds.create(
      {
        payment_intent: order.stripePaymentIntentId,
        reason: "requested_by_customer",
      },
      { idempotencyKey: `refund_${orderId}` },
    );
    logger.info(`[executeRefund] Refund triggered for order ${orderId} (reason=${reason}). Confirmation via charge.refunded webhook.`);
    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(`[executeRefund] Stripe refund failed for order ${orderId}:`, err);
    await updateOrder(orderId, { refundStatus: "failed" }).catch(() => undefined);
    await createIncidentLog({
      type: "refund_failed",
      severity: "critical",
      title: `返金失敗（手動対応要） — 注文 #${orderId}`,
      detail: `reason=${reason} / error=${msg.slice(0, 500)}`,
      orderId,
      userId: order.userId,
    }).catch(() => undefined);
    await notifyOwner({
      title: `🚨 返金失敗 — 注文 #${orderId}（手動対応が必要）`,
      content: `Stripe 返金に失敗しました。\n**注文ID:** ${orderId}\n**理由:** ${reason}\n**エラー:** ${msg.slice(0, 500)}\n\nStripe ダッシュボードで手動返金してください。`,
    }).catch(() => undefined);
    return { ok: false, error: msg };
  }
}
