import { render, screen, fireEvent } from "@testing-library/react";
import { vi, describe, it, expect } from "vitest";

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

import { Step2Confirm } from "./Step2Confirm";
import { StepProviders, makeFlow, makeSession } from "./stepTestUtils";

describe("Step2Confirm — プラン確認（P5・Context分割後の単体テスト）", () => {
  it("選択プランの価格・データ量・日数が表示される", () => {
    render(<StepProviders><Step2Confirm /></StepProviders>);
    expect(screen.getByText("¥990")).toBeTruthy();
    expect(screen.getByText("1GB")).toBeTruthy();
    expect(screen.getByText(/7\s*drawer\.days/)).toBeTruthy();
  });

  it("currentOpt が無ければ何も描画しない", () => {
    const flow = makeFlow({ currentOpt: null });
    const { container } = render(<StepProviders flow={flow}><Step2Confirm /></StepProviders>);
    expect(container.innerHTML).toBe("");
  });

  it("ログイン済みなら「支払いへ」で setStep(4)", () => {
    const flow = makeFlow();
    render(<StepProviders flow={flow}><Step2Confirm /></StepProviders>);
    fireEvent.click(screen.getByText("drawer.continueToPayment"));
    expect(flow.setStep).toHaveBeenCalledWith(4);
  });

  it("未ログインなら「支払いへ」で setStep(3)（ログイン画面）", () => {
    const flow = makeFlow();
    const session = makeSession({ isAuthenticated: false, user: null });
    render(<StepProviders flow={flow} session={session}><Step2Confirm /></StepProviders>);
    fireEvent.click(screen.getByText("drawer.continueToPayment"));
    expect(flow.setStep).toHaveBeenCalledWith(3);
  });

  it("通貨ボタンで setCurrency が呼ばれ、JPY以外では換算表示が出る", () => {
    const session = makeSession({ currency: "USD", formatPrice: () => "$6.11" });
    render(<StepProviders session={session}><Step2Confirm /></StepProviders>);
    fireEvent.click(screen.getByText("JPY"));
    expect(session.setCurrency).toHaveBeenCalledWith("JPY");
    expect(screen.getByText(/\$6\.11/)).toBeTruthy();
  });
});
