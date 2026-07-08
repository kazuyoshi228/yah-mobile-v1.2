/**
 * purchase-drawer/contexts/session.ts — 通貨表示＋認証状態のコンテキスト（P5）
 */
import { createContext, useContext } from "react";
import type { FsUser } from "@shared/userTypes";

export interface PurchaseSessionCtx {
  // 通貨
  currency: string;
  setCurrency: (c: string) => void;
  AVAILABLE_CURRENCIES: string[];
  formatPrice: (jpy: number) => string;
  // 認証
  isAuthenticated: boolean;
  loading: boolean;
  user: FsUser | null;
}

export const PurchaseSessionContext = createContext<PurchaseSessionCtx | null>(null);

export function usePurchaseSession(): PurchaseSessionCtx {
  const ctx = useContext(PurchaseSessionContext);
  if (!ctx) throw new Error("usePurchaseSession must be used within PurchaseSessionContext.Provider");
  return ctx;
}
