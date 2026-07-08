/**
 * admin/OrdersTab.tsx — 注文一覧タブ（管理者専用）
 *
 * 表示内容:
 * - 全注文の一覧（最新100件）
 * - 各注文の購入国・都市・タイムゾーン（IPジオロケーション）
 * - ステータス・金額・プランID・StripeセッションID
 * - クリックで注文詳細パネルを表示
 *
 * ユーザーには非表示（adminProcedure で保護済み）
 */
import { useState, useMemo } from "react";
import { useFirestoreCollection } from "@/hooks/useFirestoreCollection";
import { getFirebaseDb } from "@/lib/firebase";
import { collection, query, orderBy, limit } from "firebase/firestore";
import { labelStyle, bodyStyle } from "./types";
import { formatTimestampJa } from "@/lib/format";

// ─── 型定義 ─────────────────────────────────────────────────────────────────
type Order = {
  id: string;
  userId: string;
  planId: string;
  bappyPlanId?: string;
  status: string;
  amountJpy?: number | null;
  stripePaymentIntentId?: string | null;
  stripeSessionId?: string | null;
  guestEmail?: string | null;
  hiddenByUser?: boolean;
  purchaseCountry?: string | null;
  purchaseCity?: string | null;
  purchaseTimezone?: string | null;
  createdAt?: number | { seconds: number } | null;
  updatedAt?: number | { seconds: number } | null;

  userName?: string | null;
  userEmail?: string | null;
  orderType?: string | null;
  discountPercentage?: number | null;
  origin?: string | null;
};

// ─── ステータスバッジ ─────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    pending: "bg-amber-100 text-amber-800 border-amber-200",
    pending_retry: "bg-orange-100 text-orange-800 border-orange-200",
    paid: "bg-green-100 text-green-800 border-green-200",
    provisioning: "bg-blue-100 text-blue-800 border-blue-200",
    fulfilled: "bg-emerald-100 text-emerald-800 border-emerald-200",
    completed: "bg-blue-100 text-blue-800 border-blue-200",
    active: "bg-emerald-100 text-emerald-800 border-emerald-200",
    cancelled: "bg-red-100 text-red-800 border-red-200",
    failed: "bg-red-100 text-red-800 border-red-200",
    refunded: "bg-gray-100 text-gray-600 border-gray-200",
  };
  const cls = colors[status] ?? "bg-gray-100 text-gray-600 border-gray-200";
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded border text-[0.65rem] font-medium ${cls}`}
      style={labelStyle}
    >
      {status.toUpperCase()}
    </span>
  );
}

// ─── 地域バッジ ───────────────────────────────────────────────────────────────
function GeoBadge({
  country,
  city,
  timezone,
}: {
  country?: string | null;
  city?: string | null;
  timezone?: string | null;
}) {
  if (!country && !city && !timezone) {
    return <span className="text-black/25 text-[0.75rem]">—</span>;
  }
  const parts = [city, country].filter(Boolean).join(", ");
  return (
    <div className="flex flex-col gap-0.5">
      {parts && (
        <span className="text-black text-[0.75rem]" style={bodyStyle}>
          {parts}
        </span>
      )}
      {timezone && (
        <span className="text-black/40 text-[0.65rem]" style={bodyStyle}>
          {timezone}
        </span>
      )}
    </div>
  );
}

// ─── タイムスタンプ表示は lib/format.ts に集約（P4-2） ─────────────────────────
const formatTimestamp = (ts: number | { seconds: number } | null | undefined) =>
  formatTimestampJa(ts, { withSeconds: true });

// ─── 注文詳細パネル ──────────────────────────────────────────────────────────
function OrderDetailPanel({
  order,
  onClose,
}: {
  order: Order;
  onClose: () => void;
}) {
  const firestoreUrl = `https://console.firebase.google.com/u/0/project/yah-mobile-v1-3ed24/firestore/databases/-default-/data/~2Forders~2F${order.id}`;
  const stripePaymentUrl = order.stripePaymentIntentId
    ? `https://dashboard.stripe.com/payments/${order.stripePaymentIntentId}`
    : null;

  const rows: { label: string; value: React.ReactNode }[] = [
    { label: "Order ID", value: <span className="font-mono text-[0.7rem]">{order.id}</span> },
    { label: "Status", value: <StatusBadge status={order.status} /> },
    { label: "Amount", value: order.amountJpy != null ? `¥${order.amountJpy.toLocaleString()}` : "—" },
    ...(order.discountPercentage ? [{ label: "Discount", value: `${order.discountPercentage}%` }] : []),
    { label: "Plan ID", value: <span className="font-mono text-[0.7rem]">{order.planId}</span> },
    ...(order.bappyPlanId ? [{ label: "Bappy Plan ID", value: <span className="font-mono text-[0.7rem]">{order.bappyPlanId}</span> }] : []),
    ...(order.orderType ? [{ label: "Order Type", value: order.orderType }] : []),
    { label: "User ID", value: <span className="font-mono text-[0.7rem]">{order.userId}</span> },
    ...(order.userName ? [{ label: "User Name", value: order.userName }] : []),
    ...(order.userEmail ? [{ label: "Email", value: order.userEmail }] : []),
    ...(order.guestEmail ? [{ label: "Guest Email", value: order.guestEmail }] : []),
    {
      label: "Purchase Location",
      value: <GeoBadge country={order.purchaseCountry} city={order.purchaseCity} timezone={order.purchaseTimezone} />,
    },
    ...(order.stripeSessionId
      ? [{ label: "Stripe Session", value: <span className="font-mono text-[0.65rem] break-all">{order.stripeSessionId}</span> }]
      : []),
    ...(order.stripePaymentIntentId
      ? [{ label: "Payment Intent", value: <span className="font-mono text-[0.65rem] break-all">{order.stripePaymentIntentId}</span> }]
      : []),
    ...(order.origin ? [{ label: "Origin", value: order.origin }] : []),
    { label: "Created", value: formatTimestamp(order.createdAt) },
    { label: "Updated", value: formatTimestamp(order.updatedAt) },
    { label: "Hidden", value: order.hiddenByUser ? "Yes" : "No" },
  ];

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* オーバーレイ */}
      <div
        className="absolute inset-0 bg-black/20 backdrop-blur-sm"
        onClick={onClose}
      />
      {/* パネル */}
      <div className="relative w-full max-w-lg bg-white border-l border-[#E0E0E0] shadow-2xl overflow-y-auto animate-slide-in-right">
        {/* ヘッダー */}
        <div className="sticky top-0 bg-white border-b border-[#E0E0E0] px-6 py-4 flex items-center justify-between z-10">
          <div>
            <h3
              className="text-[0.6875rem] font-medium tracking-[0.18em] uppercase text-black/40"
              style={labelStyle}
            >
              Order Detail
            </h3>
            <p className="font-mono text-[0.8rem] text-black mt-0.5">
              #{order.id.slice(0, 12)}…
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center text-black/40 hover:text-black hover:bg-black/5 rounded transition-colors duration-150 text-lg"
          >
            ×
          </button>
        </div>

        {/* 詳細行 */}
        <div className="px-6 py-4">
          {rows.map((row, i) => (
            <div
              key={i}
              className="flex items-start justify-between py-3 border-b border-[#F0F0F0] gap-4"
            >
              <span
                className="text-black/40 text-[0.75rem] shrink-0 min-w-[120px]"
                style={labelStyle}
              >
                {row.label}
              </span>
              <span className="text-black text-[0.75rem] text-right" style={bodyStyle}>
                {row.value}
              </span>
            </div>
          ))}
        </div>

        {/* 外部リンク */}
        <div className="px-6 py-4 border-t border-[#E0E0E0] space-y-2">
          <p
            className="text-[0.6875rem] font-medium tracking-[0.18em] uppercase text-black/40 mb-3"
            style={labelStyle}
          >
            External Links
          </p>
          <a
            href={firestoreUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-3 py-2 border border-[#E0E0E0] text-[0.75rem] text-black/70 hover:border-black/40 hover:text-black transition-colors duration-150"
            style={bodyStyle}
          >
            <span>🔥</span> Firestore で開く
          </a>
          {stripePaymentUrl && (
            <a
              href={stripePaymentUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-3 py-2 border border-[#E0E0E0] text-[0.75rem] text-black/70 hover:border-black/40 hover:text-black transition-colors duration-150"
              style={bodyStyle}
            >
              <span>💳</span> Stripe Dashboard で開く
            </a>
          )}
        </div>
      </div>

      {/* スライドインアニメーション */}
      <style>{`
        @keyframes slideInRight {
          from { transform: translateX(100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
        .animate-slide-in-right {
          animation: slideInRight 0.2s ease-out;
        }
      `}</style>
    </div>
  );
}

// ─── メインコンポーネント ─────────────────────────────────────────────────────
export default function OrdersTab() {
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const ordersQuery = useMemo(
    () =>
      query(
        collection(getFirebaseDb(), "orders"),
        orderBy("createdAt", "desc"),
        limit(100),
      ),
    [],
  );

  const { data: orders = [], isLoading, error: isError } = useFirestoreCollection<Order>(
    () => ordersQuery,
    [ordersQuery],
  );

  return (
    <div className="flex-1 overflow-y-auto p-6">
      {/* ヘッダー */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2
            className="text-[0.6875rem] font-medium tracking-[0.18em] uppercase text-black/40 mb-1"
            style={labelStyle}
          >
            Orders
          </h2>
          <p className="text-black/50 text-[0.8125rem]" style={bodyStyle}>
            最新 100 件の注文一覧。クリックで詳細を表示。
          </p>
        </div>
      </div>

      {/* エラー */}
      {isError && (
        <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 text-red-700 text-[0.8125rem]">
          注文データの取得に失敗しました。ページを再読み込みしてください。
        </div>
      )}

      {/* ローディング */}
      {isLoading && (
        <div className="text-black/30 text-[0.875rem]" style={bodyStyle}>
          Loading...
        </div>
      )}

      {/* テーブル */}
      {orders && (
        <div className="bg-white border border-[#E0E0E0] overflow-x-auto">
          <table className="w-full text-[0.75rem]" style={bodyStyle}>
            <thead>
              <tr className="border-b border-[#E0E0E0] bg-[#F7F7F5]">
                <th className="text-left px-4 py-3 text-black/40 font-medium whitespace-nowrap" style={labelStyle}>Date</th>
                <th className="text-left px-4 py-3 text-black/40 font-medium whitespace-nowrap" style={labelStyle}>Order ID</th>
                <th className="text-left px-4 py-3 text-black/40 font-medium whitespace-nowrap" style={labelStyle}>Status</th>
                <th className="text-right px-4 py-3 text-black/40 font-medium whitespace-nowrap" style={labelStyle}>Amount</th>
                <th className="text-left px-4 py-3 text-black/40 font-medium whitespace-nowrap" style={labelStyle}>Plan</th>
                <th className="text-left px-4 py-3 text-black/40 font-medium whitespace-nowrap" style={labelStyle}>Purchase Location</th>
                <th className="text-left px-4 py-3 text-black/40 font-medium whitespace-nowrap" style={labelStyle}>User ID</th>
              </tr>
            </thead>
            <tbody>
              {orders.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-black/30">
                    注文データがありません
                  </td>
                </tr>
              )}
              {orders.map((order) => (
                <tr
                  key={order.id}
                  className="border-b border-[#F0F0F0] hover:bg-[#F0EDE8] transition-colors duration-100 cursor-pointer"
                  onClick={() => setSelectedOrder(order)}
                >
                  <td className="px-4 py-3 whitespace-nowrap text-black/60">
                    {formatTimestamp(order.createdAt)}
                  </td>
                  <td className="px-4 py-3">
                    <span className="font-mono text-[0.7rem] text-black/70 bg-[#F7F7F5] px-1.5 py-0.5 rounded">
                      {order.id.slice(0, 8)}…
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={order.status} />
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap text-black">
                    {order.amountJpy != null ? `¥${order.amountJpy.toLocaleString()}` : "—"}
                  </td>
                  <td className="px-4 py-3 text-black/60 max-w-[140px] truncate">
                    {order.planId ?? "—"}
                  </td>
                  <td className="px-4 py-3">
                    <GeoBadge
                      country={order.purchaseCountry}
                      city={order.purchaseCity}
                      timezone={order.purchaseTimezone}
                    />
                  </td>
                  <td className="px-4 py-3">
                    <span className="font-mono text-[0.7rem] text-black/50">
                      {order.userId ? order.userId.slice(0, 10) + "…" : "—"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {orders.length > 0 && (
            <div className="px-4 py-3 border-t border-[#F0F0F0] text-black/30 text-[0.6875rem]" style={labelStyle}>
              {orders.length} orders shown
            </div>
          )}
        </div>
      )}

      {/* 注文詳細パネル */}
      {selectedOrder && (
        <OrderDetailPanel
          order={selectedOrder}
          onClose={() => setSelectedOrder(null)}
        />
      )}
    </div>
  );
}
