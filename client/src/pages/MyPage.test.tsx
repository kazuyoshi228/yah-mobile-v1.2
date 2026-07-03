import { render, screen } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach } from "vitest";

// 認証状態を制御するためのモック
vi.mock("@/_core/hooks/useAuth", () => ({ useAuth: vi.fn() }));

// wouter（ナビゲーション）
vi.mock("wouter", () => ({
  useLocation: () => ["/mypage", vi.fn()],
  Link: ({ children, href }: { children?: unknown; href: string }) => <a href={href}>{children as never}</a>,
}));

// i18n
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, opts?: unknown) => (typeof opts === "string" ? opts : key),
    i18n: { language: "ja" },
  }),
}));

// Firebase / Firestore を無害化（onSnapshot はコールバックを呼ばない）
vi.mock("@/lib/firebase", () => ({ getFirebaseDb: () => ({}), getFirebaseApp: () => ({}) }));
vi.mock("firebase/firestore", () => ({
  collection: () => ({}),
  query: () => ({}),
  where: () => ({}),
  orderBy: () => ({}),
  onSnapshot: () => () => {},
}));
vi.mock("@/lib/callable", () => ({ callFunction: vi.fn(), CALLABLE: {} }));
vi.mock("@/hooks/useFirestoreCollection", () => ({ useFirestoreCollection: () => ({ data: [] }) }));
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));

// 描画の脆さを減らすため、子コンポーネントは無害化
vi.mock("@/components/Nav", () => ({ default: () => null }));
vi.mock("@/components/Footer", () => ({ default: () => null }));
vi.mock("@/components/ui/spinner", () => ({ Spinner: () => null }));
vi.mock("@/components/StatusBadge", () => ({ StatusBadge: () => null }));
vi.mock("@/components/DataUsageBar", () => ({ DataUsageBar: () => null }));

import { useAuth } from "@/_core/hooks/useAuth";
import MyPage from "./MyPage";

const mockUseAuth = vi.mocked(useAuth);

describe("MyPage — 認証ガード", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("未ログイン状態のときサインイン画面（Sign in to view your orders）が表示される", () => {
    mockUseAuth.mockReturnValue({
      user: null,
      isAuthenticated: false,
      loading: false,
    } as unknown as ReturnType<typeof useAuth>);

    render(<MyPage />);

    expect(screen.getByText(/Sign in to view your orders/i)).toBeInTheDocument();
    // ログインへの導線があること
    expect(screen.getByRole("link", { name: /sign in/i })).toHaveAttribute("href", expect.stringContaining("/login"));
  });

  it("ログイン済み状態のときサインイン画面は表示されない", () => {
    mockUseAuth.mockReturnValue({
      user: { uid: "test-uid", email: "test@example.com" },
      isAuthenticated: true,
      loading: false,
    } as unknown as ReturnType<typeof useAuth>);

    render(<MyPage />);

    expect(screen.queryByText(/Sign in to view your orders/i)).not.toBeInTheDocument();
  });
});
