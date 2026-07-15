/**
 * ga4.ts — GA4 Measurement Protocol でサーバーから purchase を送る（design_ga4_analytics.md）
 *
 * 購入の真実は Stripe Webhook（発券成功）。クライアント購入イベントはタブ離脱で取りこぼす・
 * 返金で水増しするため、購入だけはサーバーから送る。client_id は注文に添付された GA の
 * client_id を使い、同一ユーザーのファネルへ縫合する（無ければ擬似IDで件数のみ計上）。
 *
 * 測定IDは公開値。APIシークレットは Secret Manager（GA4_MP_API_SECRET）。
 * 送信失敗は握りつぶす（発券・返金フローに一切影響させない）。
 */
import * as logger from "firebase-functions/logger";
import { ga4MpApiSecret } from "./secrets";

const MEASUREMENT_ID = "G-DVVQ3D5M6Z";

export interface Ga4PurchaseInput {
  orderId: string;
  amountJpy: number;
  planName?: string | null;
  bappyPlanId?: string | null;
  gaClientId?: string | null;
}

/** GA4 purchase をサーバー送信（best-effort・例外は投げない）。 */
export async function sendGa4Purchase(o: Ga4PurchaseInput): Promise<void> {
  try {
    const apiSecret = ga4MpApiSecret.value();
    if (!apiSecret) { logger.warn("[ga4] GA4_MP_API_SECRET 未設定 — purchase送信スキップ"); return; }

    // client_id 無し（未同意等）は擬似IDで件数だけ計上（ファネル縫合は不可だがCV数は取れる）。
    const clientId = o.gaClientId || `${Date.now()}.${Math.floor(Math.random() * 1e9)}`;

    const body = {
      client_id: clientId,
      // 非個人化・広告非連動を明示（Consent Mode の denied 相当）
      non_personalized_ads: true,
      events: [{
        name: "purchase",
        params: {
          transaction_id: o.orderId, // GA4 が重複排除に使う（Webhook再送でも二重計上しない）
          value: o.amountJpy,
          currency: "JPY",
          items: [{
            item_id: o.bappyPlanId || o.orderId,
            item_name: o.planName || "Japan eSIM",
            price: o.amountJpy,
            quantity: 1,
          }],
        },
      }],
    };

    const url = `https://www.google-analytics.com/mp/collect?measurement_id=${MEASUREMENT_ID}&api_secret=${apiSecret}`;
    const res = await fetch(url, { method: "POST", body: JSON.stringify(body) });
    if (!res.ok) logger.warn(`[ga4] purchase送信 非2xx: ${res.status}`);
    else logger.info(`[ga4] purchase送信 OK: order=${o.orderId} value=${o.amountJpy}`);
  } catch (err) {
    logger.warn("[ga4] purchase送信失敗（無視）:", err);
  }
}
