import * as logger from "firebase-functions/logger";
/**
 * server/stripe.ts — Stripe integration helpers
 *
 * Provides:
 *  - stripeClient: Stripe SDK instance
 *  - createCheckoutSession(): Create a Stripe Checkout Session
 *  - constructWebhookEvent(): Verify and parse a Stripe webhook payload
 */

import Stripe from "stripe";

/**
 * Allowed origins for Stripe return_url.
 * Any origin not in this list falls back to the primary production domain.
 */
const ALLOWED_ORIGINS = [
  "https://yah.mobi",
  "https://www.yah.mobi",
];

/**
 * Validate that the origin is in the allowlist.
 * Falls back to the primary domain to prevent open-redirect attacks.
 */
export function validateOrigin(origin: string): string {
  try {
    const url = new URL(origin);
    const normalized = url.origin; // strips path/query
    if (ALLOWED_ORIGINS.includes(normalized)) return normalized;
  } catch {
    // invalid URL — fall through to default
  }
  logger.warn(`[Stripe] Untrusted origin "${origin}" rejected, falling back to yah.mobi`);
  return "https://yah.mobi";
}

const STRIPE_SECRET_KEY_GLOBAL = process.env.STRIPE_SECRET_KEY ?? "";

if (!STRIPE_SECRET_KEY_GLOBAL) {
  logger.warn("[Stripe] STRIPE_SECRET_KEY is not set at module load time. Will check at runtime.");
}

// Lazy initialization: only create Stripe client when API key is available
let _stripeClient: Stripe | null = null;
export function getStripeClient(): Stripe {
  if (!_stripeClient) {
    const key = process.env.STRIPE_SECRET_KEY || STRIPE_SECRET_KEY_GLOBAL;
    if (!key) {
      logger.error("[Stripe] STRIPE_SECRET_KEY is fully missing at runtime!");
      throw new Error("[Stripe] STRIPE_SECRET_KEY is not set.");
    }
    // apiVersion は指定せず SDK 同梱のピン留めバージョンを使う。
    // （旧コードは "2024-06-20" を型に合わせて as キャストしており、実行時バージョンと
    //  型定義が乖離していた。SDKデフォルトに委ねることで両者を一致させる。）
    _stripeClient = new Stripe(key);
  }
  return _stripeClient;
}
// Keep backward compat export (lazy proxy)
export const stripeClient = new Proxy({} as Stripe, {
  get(_target, prop) {
    return (getStripeClient() as unknown as Record<string | symbol, unknown>)[prop];
  }
});

export interface CreateCheckoutSessionParams {
  orderId: string;
  planId: string;
  providerPlanId: string;
  amountJpy: number;
  planName: string;
  userId: string;
  userEmail: string;
  userName: string;
  stripeCustomerId?: string; // 追加: 既存顧客IDがあれば使用する
  origin: string; // window.location.origin from frontend
  extraMetadata?: Record<string, string>; // 追加メタデータ（トップアップ用など）
}

/**
 * Create a Stripe Checkout Session for eSIM purchase.
 * Uses ui_mode: "hosted" (Stripe-hosted page).
 * Returns checkoutUrl for client redirect and sessionId.
 */
export async function createCheckoutSession(
  params: CreateCheckoutSessionParams,
): Promise<{ sessionId: string; checkoutUrl: string }> {
  const {
    orderId,
    planId,
    providerPlanId,
    amountJpy,
    planName,
    userId,
    userEmail,
    userName,
    origin: rawOrigin,
  } = params;

  const origin = validateOrigin(rawOrigin);

  const session = await stripeClient.checkout.sessions.create({
    payment_method_types: ["card"],
    mode: "payment",
    allow_promotion_codes: true,
    ...(params.stripeCustomerId 
      ? { customer: params.stripeCustomerId } 
      : { customer_email: userEmail, customer_creation: "always" }),
    line_items: [
      {
        price_data: {
          currency: "jpy",
          unit_amount: amountJpy, // JPY is zero-decimal currency
          product_data: {
            name: planName,
            description: `yah.mobile eSIM — ${planName}`,
          },
        },
        quantity: 1,
      },
    ],
    client_reference_id: userId,
    metadata: {
      order_id: orderId,
      plan_id: planId,
      ...(providerPlanId ? { provider_plan_id: providerPlanId } : {}),
      user_id: userId,
      customer_email: userEmail || "",
      customer_name: userName || "",
      ...(params.extraMetadata ?? {}),
    },
    success_url: `${origin}/app?payment=complete&session_id={CHECKOUT_SESSION_ID}&orderId=${orderId}`,
    cancel_url: `${origin}/app?payment=cancelled&orderId=${orderId}`,
  });

  if (!session.url) {
    throw new Error("Stripe did not return a checkout URL");
  }

  return { sessionId: session.id, checkoutUrl: session.url };
}

/**
 * Verify and parse a Stripe webhook payload.
 * Throws if the signature is invalid.
 */
export function constructWebhookEvent(
  rawBody: Buffer,
  signature: string,
): Stripe.Event {
  const stripeWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET ?? "";
  if (!stripeWebhookSecret) {
    throw new Error("STRIPE_WEBHOOK_SECRET is not set");
  }
  return stripeClient.webhooks.constructEvent(rawBody, signature, stripeWebhookSecret);
}
