/**
 * purchase-drawer/context.ts — 後方互換バレル（P5 で contexts/ に3分割）
 *
 * 旧: 1つの PurchaseDrawerCtx（35フィールド）を全ステップで共有
 * 新: flow（ステップ/プラン選択）・session（通貨/認証）・checkout（同意/決済/eSIM）に分割。
 * 各 Step は必要なコンテキストだけを購読する（テスト時のモック面が小さくなる）。
 */
export { PurchaseFlowContext, usePurchaseFlow, type PurchaseFlowCtx } from "./contexts/flow";
export { PurchaseSessionContext, usePurchaseSession, type PurchaseSessionCtx } from "./contexts/session";
export { PurchaseCheckoutContext, usePurchaseCheckoutCtx, type PurchaseCheckoutCtx } from "./contexts/checkout";
