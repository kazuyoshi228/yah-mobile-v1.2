/**
 * admin/RefundsTab.tsx — 返金タブ（管理者専用・Lane B 手動返金＋自動返金キルスイッチ）
 *
 * - 返金候補（status=="failed"）を一覧表示。自動返金済みは status=="refunded" になり本一覧に出ない。
 * - 各行の「返金する」ボタン → 確認 → adminRefundOrder callable → Stripe。
 *   確定/顧客通知/返金メールは charge.refunded webhook 側で一元処理される。
 * - 上部トグル「自動返金 ON/OFF」= system_config/refunds.autoRefundEnabled（Lane A のキルスイッチ・即時）。
 *
 * ユーザーには非表示（isAdmin で保護）。
 */
import { useState, useMemo, useEffect } from "react";
import { useFirestoreCollection } from "@/hooks/useFirestoreCollection";
import { getFirebaseDb } from "@/lib/firebase";
import { collection, query, where, doc, onSnapshot, setDoc } from "firebase/firestore";
import { callFunction, CALLABLE } from "@/lib/callable";
import { labelStyle, bodyStyle } from "./types";
import { formatTimestampJa } from "@/lib/format";

type RefundOrder = {
  id: string;
  userId: string;
  status: string;
  amountJpy?: number | null;
  planName?: string | null;
  orderType?: string | null;
  refundStatus?: string | null;
  stripePaymentIntentId?: string | null;
  language?: string | null;
  userEmail?: string | null;
  createdAt?: number | { seconds: number } | null;
};

// タイムスタンプ表示は lib/format.ts に集約（P4-2）
const formatTimestamp = (ts: number | { seconds: number } | null | undefined) => formatTimestampJa(ts);

function RefundStatusBadge({ status }: { status?: string | null }) {
  const s = status ?? "none";
  const colors: Record<string, string> = {
    none: "bg-gray-100 text-gray-500 border-gray-200",
    processing: "bg-amber-100 text-amber-800 border-amber-200",
    refunded: "bg-emerald-100 text-emerald-800 border-emerald-200",
    failed: "bg-red-100 text-red-800 border-red-200",
  };
  const cls = colors[s] ?? colors.none;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded border text-[0.65rem] font-medium ${cls}`} style={labelStyle}>
      {s.toUpperCase()}
    </span>
  );
}

// ─── 自動返金キルスイッチ ─────────────────────────────────────────────────────
function AutoRefundToggle() {
  const [enabled, setEnabled] = useState<boolean | null>(null); // null=読込中
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const ref = doc(getFirebaseDb(), "system_config", "refunds");
    const unsub = onSnapshot(
      ref,
      (snap) => setEnabled(snap.exists() ? snap.data()?.autoRefundEnabled !== false : true),
      () => setEnabled(true),
    );
    return () => unsub();
  }, []);

  const toggle = async () => {
    if (enabled === null || saving) return;
    setSaving(true);
    try {
      await setDoc(
        doc(getFirebaseDb(), "system_config", "refunds"),
        { autoRefundEnabled: !enabled, updatedAt: Date.now() },
        { merge: true },
      );
    } catch (err) {
      console.error("Failed to toggle auto-refund", err);
      alert("自動返金トグルの更新に失敗しました。");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex items-center justify-between bg-white border border-[#E0E0E0] px-4 py-3 mb-6">
      <div>
        <p className="text-[0.8125rem] text-black" style={bodyStyle}>自動返金（当社側エラー時）</p>
        <p className="text-black/40 text-[0.6875rem]" style={bodyStyle}>
          発行/topup が最終失敗した課金済み注文を自動で全額返金します。障害時はここでOFFにできます（即時）。
        </p>
      </div>
      <button
        onClick={toggle}
        disabled={enabled === null || saving}
        className={`shrink-0 ml-4 px-4 py-2 rounded border text-[0.75rem] font-medium transition-colors duration-150 ${
          enabled === null
            ? "bg-gray-100 text-gray-400 border-gray-200"
            : enabled
              ? "bg-emerald-600 text-white border-emerald-600 hover:bg-emerald-700"
              : "bg-red-600 text-white border-red-600 hover:bg-red-700"
        } disabled:opacity-50`}
        style={labelStyle}
      >
        {enabled === null ? "…" : enabled ? "ON（自動返金 有効）" : "OFF（停止中）"}
      </button>
    </div>
  );
}

export default function RefundsTab() {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  // status=="failed"（返金候補）。orderBy を付けると複合indexが要るため client 側で並べ替え。
  const failedQuery = useMemo(
    () => query(collection(getFirebaseDb(), "orders"), where("status", "==", "failed")),
    [],
  );
  const { data: rows = [], isLoading, error: isError } = useFirestoreCollection<RefundOrder>(
    () => failedQuery,
    [failedQuery],
  );

  const sorted = useMemo(() => {
    const toMs = (ts: RefundOrder["createdAt"]) =>
      !ts ? 0 : typeof ts === "object" && "seconds" in ts ? ts.seconds * 1000 : ts;
    return [...rows].sort((a, b) => toMs(b.createdAt) - toMs(a.createdAt));
  }, [rows]);

  const handleRefund = async (order: RefundOrder) => {
    const amount = order.amountJpy != null ? `¥${order.amountJpy.toLocaleString()}` : "(金額不明)";
    if (!window.confirm(`注文 #${order.id} を ${amount} 全額返金します。よろしいですか？`)) return;
    setBusyId(order.id);
    setMessage(null);
    try {
      await callFunction<{ orderId: string; reason: string }, { ok: boolean }>(
        CALLABLE.adminRefundOrder,
        { orderId: order.id, reason: "manual" },
      );
      setMessage(`注文 #${order.id} の返金をトリガーしました。確定・顧客メールは Stripe webhook で処理されます。`);
    } catch (err) {
      console.error("Refund failed", err);
      setMessage(`返金に失敗しました: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusyId(null);
    }
  };

  const canRefund = (o: RefundOrder) =>
    !!o.stripePaymentIntentId && o.refundStatus !== "refunded" && o.refundStatus !== "processing";

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="mb-6">
        <h2 className="text-[0.6875rem] font-medium tracking-[0.18em] uppercase text-black/40 mb-1" style={labelStyle}>
          Refunds
        </h2>
        <p className="text-black/50 text-[0.8125rem]" style={bodyStyle}>
          発行/topup に失敗した注文（返金候補）。自動返金済みは status=refunded になり本一覧に出ません。
        </p>
      </div>

      <AutoRefundToggle />

      {message && (
        <div className="mb-4 px-4 py-3 bg-blue-50 border border-blue-200 text-blue-800 text-[0.8125rem]" style={bodyStyle}>
          {message}
        </div>
      )}
      {isError && (
        <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 text-red-700 text-[0.8125rem]">
          注文データの取得に失敗しました。ページを再読み込みしてください。
        </div>
      )}
      {isLoading && <div className="text-black/30 text-[0.875rem]" style={bodyStyle}>Loading...</div>}

      <div className="bg-white border border-[#E0E0E0] overflow-x-auto">
        <table className="w-full text-[0.75rem]" style={bodyStyle}>
          <thead>
            <tr className="border-b border-[#E0E0E0] bg-[#F7F7F5]">
              <th className="text-left px-4 py-3 text-black/40 font-medium whitespace-nowrap" style={labelStyle}>Date</th>
              <th className="text-left px-4 py-3 text-black/40 font-medium whitespace-nowrap" style={labelStyle}>Order ID</th>
              <th className="text-left px-4 py-3 text-black/40 font-medium whitespace-nowrap" style={labelStyle}>Plan</th>
              <th className="text-right px-4 py-3 text-black/40 font-medium whitespace-nowrap" style={labelStyle}>Amount</th>
              <th className="text-left px-4 py-3 text-black/40 font-medium whitespace-nowrap" style={labelStyle}>Refund</th>
              <th className="text-right px-4 py-3 text-black/40 font-medium whitespace-nowrap" style={labelStyle}>Action</th>
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 && !isLoading && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-black/30">返金候補はありません</td>
              </tr>
            )}
            {sorted.map((order) => (
              <tr key={order.id} className="border-b border-[#F0F0F0]">
                <td className="px-4 py-3 whitespace-nowrap text-black/60">{formatTimestamp(order.createdAt)}</td>
                <td className="px-4 py-3">
                  <span className="font-mono text-[0.7rem] text-black/70 bg-[#F7F7F5] px-1.5 py-0.5 rounded">{order.id.slice(0, 10)}…</span>
                </td>
                <td className="px-4 py-3 text-black/60 max-w-[160px] truncate">
                  {order.planName ?? "—"}{order.orderType === "topup" ? " (topup)" : ""}
                </td>
                <td className="px-4 py-3 text-right whitespace-nowrap text-black">
                  {order.amountJpy != null ? `¥${order.amountJpy.toLocaleString()}` : "—"}
                </td>
                <td className="px-4 py-3"><RefundStatusBadge status={order.refundStatus} /></td>
                <td className="px-4 py-3 text-right">
                  <button
                    onClick={() => handleRefund(order)}
                    disabled={busyId === order.id || !canRefund(order)}
                    className="px-3 py-1.5 rounded border border-black bg-black text-white text-[0.7rem] font-medium hover:bg-black/80 transition-colors duration-150 disabled:opacity-40 disabled:cursor-not-allowed"
                    style={labelStyle}
                    title={!order.stripePaymentIntentId ? "payment_intent が無いため返金不可" : ""}
                  >
                    {busyId === order.id ? "処理中…" : "返金する"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {sorted.length > 0 && (
          <div className="px-4 py-3 border-t border-[#F0F0F0] text-black/30 text-[0.6875rem]" style={labelStyle}>
            {sorted.length} candidates
          </div>
        )}
      </div>
    </div>
  );
}
