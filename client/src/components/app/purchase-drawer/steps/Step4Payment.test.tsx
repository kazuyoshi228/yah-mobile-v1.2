import { render, screen, fireEvent } from "@testing-library/react";
import { vi, describe, it, expect } from "vitest";

// i18n: キーをそのまま返す（既存 PurchaseDrawer.test.tsx と同方式）
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, opts?: unknown) => {
      if (opts && typeof opts === "object" && (opts as { returnObjects?: boolean }).returnObjects) return [];
      if (typeof opts === "string") return opts;
      return key;
    },
    i18n: { language: "ja", changeLanguage: () => Promise.resolve() },
  }),
}));

import { Step4Payment } from "./Step4Payment";
import { StepProviders, makeCheckout, makeFlow } from "./stepTestUtils";

describe("Step4Payment — 同意・決済（P5・Context分割後の単体テスト）", () => {
  it("注文サマリに価格が表示される", () => {
    render(<StepProviders><Step4Payment /></StepProviders>);
    expect(screen.getByText("¥990")).toBeTruthy();
    expect(screen.getByText("drawer.proceedToPayment")).toBeTruthy();
  });

  it("規約チェックボックスの操作で setTermsConsented が呼ばれる", () => {
    const checkout = makeCheckout();
    render(<StepProviders checkout={checkout}><Step4Payment /></StepProviders>);
    const checkboxes = document.querySelectorAll('input[type="checkbox"]');
    fireEvent.click(checkboxes[0]); // 規約
    expect(checkout.setTermsConsented).toHaveBeenCalledWith(true);
  });

  it("同意エラー時はエラーメッセージが表示される", () => {
    const checkout = makeCheckout({ termsConsentError: true, refundConsentError: true });
    render(<StepProviders checkout={checkout}><Step4Payment /></StepProviders>);
    expect(screen.getByText("drawer.termsPrivacyConsentRequired")).toBeTruthy();
    expect(screen.getByText("drawer.refundConsentRequired")).toBeTruthy();
  });

  it("購入ボタンで handlePurchase が呼ばれる", () => {
    const checkout = makeCheckout();
    render(<StepProviders checkout={checkout}><Step4Payment /></StepProviders>);
    fireEvent.click(screen.getByText("drawer.proceedToPayment"));
    expect(checkout.handlePurchase).toHaveBeenCalledTimes(1);
  });

  it("purchaseError が表示される", () => {
    const checkout = makeCheckout({ purchaseError: "決済に失敗しました" });
    render(<StepProviders checkout={checkout}><Step4Payment /></StepProviders>);
    expect(screen.getByText("決済に失敗しました")).toBeTruthy();
  });

  it("isPurchasing 中は購入ボタンが消え待機表示になる", () => {
    const checkout = makeCheckout({ isPurchasing: true });
    render(<StepProviders checkout={checkout}><Step4Payment /></StepProviders>);
    expect(screen.queryByText("drawer.proceedToPayment")).toBeNull();
    expect(screen.getByText("安全な決済ページを準備しています")).toBeTruthy();
  });

  it("戻るボタンで setStep(0)（プラン選択へ）", () => {
    const flow = makeFlow();
    render(<StepProviders flow={flow}><Step4Payment /></StepProviders>);
    fireEvent.click(screen.getByText("drawer.back"));
    expect(flow.setStep).toHaveBeenCalledWith(0);
  });
});
