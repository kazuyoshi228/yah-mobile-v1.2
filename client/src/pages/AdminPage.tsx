/**
 * AdminPage.tsx — yah.mobile Admin Dashboard
 * 管理者専用ダッシュボード（シェル）
 * タブコンポーネントは client/src/components/admin/ に分割済み
 */
import { useAuth } from "@/_core/hooks/useAuth";
import { useState } from "react";
import { useLocation } from "wouter";
import {
  AdminTab,
  AccessTab,
  AiFirstTab,
  AnalyticsTab,
  InquiriesTab,
  OrdersTab,
  Period,
  PlansTab,
  CompetitorPlansTab,

  IncidentTab,
  CommunicationTab,
  RefundsTab,
} from "@/components/admin";
import { YahLogo } from "@/components/YahLogo";
import { useGoogleLogin } from "@/hooks/useGoogleLogin";

const TABS: { id: AdminTab; label: string }[] = [
  { id: "ai_first", label: "AI First" },
  { id: "analytics", label: "Analytics" },
  { id: "orders", label: "Orders" },
  { id: "inquiries", label: "Contact" },
  { id: "plans", label: "Plans" },
  { id: "competitorPlans", label: "Competitor Plans" },
  { id: "access", label: "Access" },

  { id: "incident", label: "障害" },
  { id: "communication", label: "Communication" },
  { id: "refunds", label: "Refunds" },
];

const VALID_TABS: AdminTab[] = ["ai_first", "analytics", "orders", "inquiries", "plans", "competitorPlans", "access", "incident", "communication", "refunds"];

export default function AdminPage() {
  const { user, loading, isAdmin } = useAuth();
  const [location, setLocation] = useLocation();
  const { handleLogin, pending: loginPending } = useGoogleLogin({ fallbackHref: "/login?redirect=%2Fadmin" });

  // パス形式（/admin/comparison）とクエリ形式（/admin?tab=comparison）の両方を解釈
  const pathName = location.split("?")[0];
  const pathSegment = pathName.replace(/^\/admin\/?/, "").split("/")[0] as AdminTab | "";
  const queryTab = new URLSearchParams(location.split("?")[1] ?? "").get("tab") as AdminTab | null;
  const urlTab: AdminTab | null =
    pathSegment && VALID_TABS.includes(pathSegment as AdminTab)
      ? (pathSegment as AdminTab)
      : queryTab && VALID_TABS.includes(queryTab)
        ? queryTab
        : null;
  const [activeTab, setActiveTab] = useState<AdminTab>(urlTab ?? "ai_first");
  const [analyticsPeriod, setAnalyticsPeriod] = useState<Period>("30d");

  const handleTabChange = (tab: AdminTab) => {
    setActiveTab(tab);
    setLocation(`/admin/${tab}`);
  };

  // ── 認証チェック ──────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <p className="font-sans text-black/30">Loading...</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center gap-6">
        <p className="font-sans text-black/50">Login required</p>
        <button
          type="button"
          onClick={handleLogin}
          disabled={loginPending}
          className="text-label text-[0.75rem] inline-block bg-black text-white px-8 py-3 hover:bg-black/80 transition-colors duration-200 active:scale-[0.97] cursor-pointer disabled:opacity-60"
        >
          Sign in
        </button>
        <button onClick={() => setLocation("/app")} className="font-sans text-black/40 hover:text-black underline transition-colors text-[0.8125rem]">
          Back to home
        </button>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center gap-4">
        <p className="font-sans text-black/50">Access denied</p>
        <button onClick={() => setLocation("/app")} className="font-sans text-black underline text-[0.875rem]">
          Back to home
        </button>
      </div>
    );
  }

  // ── レイアウト ────────────────────────────────
  return (
    <div className="min-h-screen bg-[#F7F7F5] flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-[#E0E0E0] px-6 py-4 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-4">
          <button onClick={() => setLocation("/app")} className="flex items-center hover:opacity-70 transition-opacity">
            <YahLogo variant="dark" className="h-7 w-auto" />
          </button>
          <span className="text-black/20">|</span>
          <h1 className="font-sans text-black text-[0.875rem] font-medium">Admin</h1>
        </div>
        <span className="font-sans text-black/40 text-[0.8125rem]">
          {user.name ?? user.email}
        </span>
      </header>

      {/* Tab bar */}
      <div className="bg-white border-b border-[#E0E0E0] px-6 flex gap-0 flex-shrink-0 overflow-x-auto">
        {TABS.map((tab) => (
          <button key={tab.id} onClick={() => handleTabChange(tab.id)}
            className={`text-label text-[0.6875rem] px-5 py-3.5 border-b-2 transition-colors duration-150 whitespace-nowrap ${activeTab === tab.id ? "border-black text-black" : "border-transparent text-black/40 hover:text-black/70"}`}>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === "ai_first" && <AiFirstTab period={analyticsPeriod} onPeriodChange={setAnalyticsPeriod} />}
      {activeTab === "analytics" && <AnalyticsTab period={analyticsPeriod} onPeriodChange={setAnalyticsPeriod} />}
      {activeTab === "orders" && <OrdersTab />}
      {activeTab === "plans" && <PlansTab />}
      {activeTab === "competitorPlans" && <CompetitorPlansTab />}
      {activeTab === "inquiries" && <InquiriesTab />}
      {activeTab === "access" && <AccessTab />}

      {activeTab === "incident" && <IncidentTab />}
      {activeTab === "communication" && <CommunicationTab />}
      {activeTab === "refunds" && <RefundsTab />}
    </div>
  );
}
