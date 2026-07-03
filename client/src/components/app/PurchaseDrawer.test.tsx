import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach } from "vitest";

// ─── Mocks ────────────────────────────────────────────────────────────────────

// i18n: t はフォールバック文字列 or キーを返す。returnObjects の場合は [] を返す（stepLabels対策）。
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

// Callable（決済作成）をモック。useCallableMutation は mutateAsync を持つオブジェクトを返す。
const mockMutateAsync = vi.fn();
vi.mock("@/lib/callable", () => ({
  CALLABLE: {
    ordersInitCheckout: "ordersInitCheckout",
    ordersInitTopupCheckout: "ordersInitTopupCheckout",
  },
  useCallableMutation: () => ({ mutateAsync: mockMutateAsync, isPending: false }),
  callFunction: vi.fn(),
}));

// ログイン済みユーザー
vi.mock("@/_core/hooks/useAuth", () => ({
  useAuth: () => ({
    user: { uid: "test-uid", email: "test@example.com" },
    isAuthenticated: true,
    loading: false,
  }),
}));

// Firestore 直接購読は使わず、プランをテスト用に固定
const testPlan = {
  id: "plan_doc_1",
  bappyPlanId: "JP_7D_1GB",
  name: "Japan 7 Days 1GB",
  dataGb: 1,
  validityDays: 7,
  priceJpy: 990,
  isActive: true,
  planType: "initial",
  sortOrder: 0,
  createdAt: 0,
  updatedAt: 0,
};
vi.mock("@/hooks/useFirestoreCollection", () => ({
  useFirestoreCollection: () => ({ data: [testPlan], isLoading: false }),
  useFirestoreDoc: () => ({ data: null, isLoading: false }),
}));

// Firebase 初期化・Firestore SDK 呼び出しを無害化
vi.mock("@/lib/firebase", () => ({
  getFirebaseDb: () => ({}),
  getFirebaseAuth: () => ({}),
  getFirebaseApp: () => ({}),
}));
vi.mock("firebase/firestore", () => ({
  collection: () => ({}),
  query: () => ({}),
  where: () => ({}),
  orderBy: () => ({}),
  limit: () => ({}),
  doc: () => ({}),
  getDoc: vi.fn().mockResolvedValue({ exists: () => false }),
  addDoc: vi.fn(),
  updateDoc: vi.fn(),
  onSnapshot: () => () => {},
  serverTimestamp: () => ({}),
}));

import PurchaseDrawer from "./PurchaseDrawer";

describe("PurchaseDrawer — 購入フロー", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockMutateAsync.mockResolvedValue({ checkoutUrl: "https://checkout.stripe.com/test", orderId: "order-123" });
    // window.location.href / origin をテスト用に差し替え
    Object.defineProperty(window, "location", {
      configurable: true,
      writable: true,
      value: { href: "", origin: "https://yah.mobi" },
    });
  });

  const renderAtPaymentStep = () =>
    render(
      <PurchaseDrawer
        open={true}
        onOpenChange={vi.fn()}
        initialPlanId="JP_7D_1GB"
        initialStep={4}
      />,
    );

  it("同意にチェックして購入すると ordersInitCheckout が正しい引数で呼ばれ、checkoutURL にリダイレクトされる", async () => {
    renderAtPaymentStep();

    // 決済ボタン（step 4）が出るまで待つ
    const buyButton = await screen.findByRole("button", { name: /proceedToPayment/i });

    // 同意チェックボックス（利用規約/プライバシー/マーケ任意/返金）をすべてチェック
    const checkboxes = screen.getAllByRole("checkbox");
    checkboxes.forEach((cb) => fireEvent.click(cb));

    fireEvent.click(buyButton);

    await waitFor(() => expect(mockMutateAsync).toHaveBeenCalled());
    expect(mockMutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        bappyPlanId: "JP_7D_1GB",
        termsConsented: true,
        privacyConsented: true,
        origin: "https://yah.mobi",
      }),
    );
    await waitFor(() => expect(window.location.href).toBe("https://checkout.stripe.com/test"));
  });

  it("同意チェックなしで購入ボタンを押すと決済は呼ばれず、同意エラーが表示される", async () => {
    renderAtPaymentStep();
    const buyButton = await screen.findByRole("button", { name: /proceedToPayment/i });

    fireEvent.click(buyButton);

    // 同意必須エラーが表示され、決済は呼ばれない
    await waitFor(() => expect(screen.getByText("drawer.termsConsentRequired")).toBeInTheDocument());
    expect(mockMutateAsync).not.toHaveBeenCalled();
    expect(window.location.href).toBe("");
  });
});
