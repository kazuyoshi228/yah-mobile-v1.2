/**
 * purchase-drawer/contexts/checkout.ts — 同意・決済実行・発行済みeSIMのコンテキスト（P5）
 */
import { createContext, useContext } from "react";
import type { FsEsimLink } from "@shared/types";

export interface PurchaseCheckoutCtx {
  // 同意・決済（step 4）
  termsConsented: boolean; setTermsConsented: (b: boolean) => void;
  termsConsentError: boolean; setTermsConsentError: (b: boolean) => void;
  privacyConsented: boolean; setPrivacyConsented: (b: boolean) => void;
  privacyConsentError: boolean; setPrivacyConsentError: (b: boolean) => void;
  marketingConsented: boolean; setMarketingConsented: (b: boolean) => void;
  refundConsented: boolean; setRefundConsented: (b: boolean) => void;
  refundConsentError: boolean; setRefundConsentError: (b: boolean) => void;
  purchaseError: string | null;
  isPurchasing: boolean;
  handlePurchase: () => void;
  // eSIM（step 6）
  esimLink: FsEsimLink | null;
  esimLoading: boolean;
}

export const PurchaseCheckoutContext = createContext<PurchaseCheckoutCtx | null>(null);

export function usePurchaseCheckoutCtx(): PurchaseCheckoutCtx {
  const ctx = useContext(PurchaseCheckoutContext);
  if (!ctx) throw new Error("usePurchaseCheckoutCtx must be used within PurchaseCheckoutContext.Provider");
  return ctx;
}
