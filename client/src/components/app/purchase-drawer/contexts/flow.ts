/**
 * purchase-drawer/contexts/flow.ts — ステップ制御＋プラン選択のコンテキスト（P5）
 * 状態の持ち主は PurchaseDrawer 本体（ここは「配り方」のみ）。
 */
import { createContext, useContext } from "react";
import type { PlanOption } from "../../types";

export interface PurchaseFlowCtx {
  // ステップ制御
  step: number;
  setStep: (n: number) => void;
  // プラン選択
  drawerDays: number;
  setDrawerDays: (n: number) => void;
  drawerGb: string | null;
  setDrawerGb: (g: string | null) => void;
  planDays: number[];
  planOptions: Record<number, PlanOption[]>;
  currentOpt: PlanOption | null | undefined;
  lastPlanOpt: { days: number; opt: PlanOption } | null;
  initialPlanId?: string;
}

export const PurchaseFlowContext = createContext<PurchaseFlowCtx | null>(null);

export function usePurchaseFlow(): PurchaseFlowCtx {
  const ctx = useContext(PurchaseFlowContext);
  if (!ctx) throw new Error("usePurchaseFlow must be used within PurchaseFlowContext.Provider");
  return ctx;
}
