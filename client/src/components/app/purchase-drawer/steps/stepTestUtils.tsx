/**
 * steps/stepTestUtils.tsx — Step 単体テスト用の小さなコンテキストモック（P5）
 * Context 3分割により、各 Step は必要なスライスだけ与えれば描画できる。
 */
import type { ReactNode } from "react";
import { vi } from "vitest";
import { PurchaseFlowContext, type PurchaseFlowCtx } from "../contexts/flow";
import { PurchaseSessionContext, type PurchaseSessionCtx } from "../contexts/session";
import { PurchaseCheckoutContext, type PurchaseCheckoutCtx } from "../contexts/checkout";
import type { PlanOption } from "../../types";

export const testOpt: PlanOption = {
  gb: "1GB",
  priceJpy: 990,
  bappyPlanId: "JP_7D_1GB",
} as PlanOption;

export function makeFlow(over: Partial<PurchaseFlowCtx> = {}): PurchaseFlowCtx {
  return {
    step: 4,
    setStep: vi.fn(),
    drawerDays: 7,
    setDrawerDays: vi.fn(),
    drawerGb: "1GB",
    setDrawerGb: vi.fn(),
    planDays: [7, 15, 30],
    planOptions: { 7: [testOpt] },
    currentOpt: testOpt,
    lastPlanOpt: null,
    ...over,
  };
}

export function makeSession(over: Partial<PurchaseSessionCtx> = {}): PurchaseSessionCtx {
  return {
    currency: "JPY",
    setCurrency: vi.fn(),
    AVAILABLE_CURRENCIES: ["JPY", "USD"],
    formatPrice: (jpy: number) => `¥${jpy.toLocaleString()}`,
    isAuthenticated: true,
    loading: false,
    user: { uid: "u1" } as PurchaseSessionCtx["user"],
    ...over,
  };
}

export function makeCheckout(over: Partial<PurchaseCheckoutCtx> = {}): PurchaseCheckoutCtx {
  return {
    termsConsented: false, setTermsConsented: vi.fn(),
    termsConsentError: false, setTermsConsentError: vi.fn(),
    privacyConsented: false, setPrivacyConsented: vi.fn(),
    privacyConsentError: false, setPrivacyConsentError: vi.fn(),
    marketingConsented: false, setMarketingConsented: vi.fn(),
    refundConsented: false, setRefundConsented: vi.fn(),
    refundConsentError: false, setRefundConsentError: vi.fn(),
    purchaseError: null,
    isPurchasing: false,
    handlePurchase: vi.fn(),
    esimLink: null,
    esimLoading: false,
    ...over,
  };
}

export function StepProviders({
  children,
  flow = makeFlow(),
  session = makeSession(),
  checkout = makeCheckout(),
}: {
  children: ReactNode;
  flow?: PurchaseFlowCtx;
  session?: PurchaseSessionCtx;
  checkout?: PurchaseCheckoutCtx;
}) {
  return (
    <PurchaseFlowContext.Provider value={flow}>
      <PurchaseSessionContext.Provider value={session}>
        <PurchaseCheckoutContext.Provider value={checkout}>{children}</PurchaseCheckoutContext.Provider>
      </PurchaseSessionContext.Provider>
    </PurchaseFlowContext.Provider>
  );
}
