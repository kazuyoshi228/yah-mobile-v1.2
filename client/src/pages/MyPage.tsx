import { useAuth } from "@/_core/hooks/useAuth";
import { AnimatePresence } from "framer-motion";
import { useState } from "react";
import { Link, useLocation } from "wouter";
import Nav from "@/components/Nav";
import Footer from "@/components/Footer";
import { Spinner } from "@/components/mypage/Spinner";
import { NotificationBell, NotificationPanel } from "@/components/mypage/Notifications";
import { OrderList } from "@/components/mypage/OrderList";
import { ProfileSection } from "@/components/mypage/ProfileSection";
import { useMyPageData } from "@/components/mypage/useMyPageData";
import { useGoogleLogin } from "@/hooks/useGoogleLogin";

export default function MyPage() {
  const { user, loading, isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();
  const [showNotifications, setShowNotifications] = useState(false);
  // 未ログイン画面のサインインをポップアップ化（ブロック時のみ /login へ）
  const { handleLogin, pending: loginPending } = useGoogleLogin({ fallbackHref: "/login?redirect=%2Fmypage" });

  // 注文・eSIM のリアルタイム購読と派生データ
  const { orders, ordersLoading, esimByOrderId } = useMyPageData(user?.uid);

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-white flex flex-col">
        <Nav />
        <div className="flex-1 flex flex-col items-center justify-center px-8 text-center">
          <p className="font-sans text-black/20 mb-6 text-[4rem] font-light leading-none">🔒</p>
          <h1 className="font-sans font-light text-black mb-3 text-[clamp(1.5rem,4vw,2.5rem)] tracking-[-0.02em]">
            Sign in to view your orders.
          </h1>
          <p className="font-sans text-black/40 mb-8 max-w-sm text-sm leading-[1.75]">
            Log in to access your purchase history, eSIM QR codes, and account details.
          </p>
          <button
            type="button"
            onClick={handleLogin}
            disabled={loginPending}
            className="text-label text-[0.75rem] inline-block bg-black text-white px-8 py-3.5 hover:bg-black/80 transition-colors duration-200 active:scale-[0.97] cursor-pointer disabled:opacity-60"
          >
            Sign in
          </button>
        </div>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white flex flex-col">
      <Nav />

      <main className="flex-1 pt-24 pb-24">
        <div className="container max-w-3xl">

          {/* ヘッダー */}
          <div className="mb-10 flex items-start justify-between gap-4">
            <div>
              <p className="text-label text-black/30 mb-4">MY PAGE</p>
              <h1 className="font-sans font-light text-black mb-2 text-[clamp(2rem,5vw,3.5rem)] leading-[1.1] tracking-[-0.03em]">
                Your orders.
              </h1>
              {user?.name && (
                <p className="font-sans text-black/60 text-sm">{user.name}</p>
              )}
              {user?.email && (
                <p className="font-sans text-black/40 text-sm">{user.email}</p>
              )}
            </div>

            {/* 通知ベル */}
            <div className="relative mt-2">
              <NotificationBell onOpen={() => setShowNotifications((v) => !v)} />
              <AnimatePresence>
                {showNotifications && (
                  <NotificationPanel onClose={() => setShowNotifications(false)} />
                )}
              </AnimatePresence>
            </div>
          </div>

          {/* コンテンツ */}
          <div className="mb-10">
            {ordersLoading ? (
              <div className="py-16 flex justify-center"><Spinner /></div>
            ) : !orders || orders.length === 0 ? (
              <div className="text-center py-24">
                <p className="font-sans text-black/20 mb-4 text-[4rem] font-light leading-none">—</p>
                <p className="font-sans text-black/40 mb-8 text-base">No orders yet.</p>
                <Link href="/app">
                  <span className="text-label inline-block bg-black text-white px-8 py-3.5 text-[0.75rem] hover:bg-black/80 transition-colors duration-200 active:scale-[0.97] cursor-pointer">
                    Buy your first eSIM
                  </span>
                </Link>
              </div>
            ) : (
              <OrderList orders={orders} onSelect={(id) => setLocation(`/mypage/orders/${id}`)} esimByOrderId={esimByOrderId} />
            )}
          </div>

          {/* プロフィール編集セクション */}
          <ProfileSection />

        </div>
      </main>

      <Footer />
    </div>
  );
}
