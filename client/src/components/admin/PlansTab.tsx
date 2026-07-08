/**
 * admin/PlansTab.tsx — eSIMプラン管理タブ (BaaS First版)
 * P4-3: PlanFormModal / PlanDeleteDialog / InlineCell は plans/ に分割。
 */
import { useFirestoreCollection } from "@/hooks/useFirestoreCollection";
import { getFirebaseDb } from "@/lib/firebase";
import { collection, query, doc, updateDoc, writeBatch } from "firebase/firestore";
import { latestCurrencyRatesQuery } from "@/lib/queries";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { EditingCell, PlanRow } from "./types";
import { PlanFormModal } from "./plans/PlanFormModal";
import { DeleteConfirmDialog } from "./plans/PlanDeleteDialog";
import { InlineCell } from "./plans/InlineCell";

// ─────────────────────────────────────────────
// PlansTab (public export)
// ─────────────────────────────────────────────
export function PlansTab() {
  const plansQuery = useMemo(() => query(collection(getFirebaseDb(), "plans")), []);
  const { data: plans = [], isLoading, error: listError } = useFirestoreCollection<any>(() => plansQuery, [plansQuery]);

  // マージン算出用の USD レート（currency_rates: JPY→通貨の乗数）。USD→JPY = usd / rates.USD。
  const ratesQuery = useMemo(() => latestCurrencyRatesQuery(), []);
  const { data: ratesData = [] } = useFirestoreCollection<{ id: string; rates: Record<string, number> }>(
    () => ratesQuery,
    [ratesQuery],
    { realtime: false },
  );
  const usdPerJpy = ratesData[0]?.rates?.USD ?? null; // 1 JPY = usdPerJpy USD
  const marginInfo = (plan: any): { jpyCost: number; margin: number; pct: number } | null => {
    const usd = plan.wholesalePriceUsd;
    if (usd == null || !usdPerJpy || !plan.priceJpy) return null;
    const jpyCost = usd / usdPerJpy; // 卸USD → JPY
    const margin = plan.priceJpy - jpyCost;
    const pct = plan.priceJpy > 0 ? (margin / plan.priceJpy) * 100 : 0;
    return { jpyCost, margin, pct };
  };

  const [modalPlan, setModalPlan] = useState<PlanRow | null | "new">(
    undefined as unknown as PlanRow | null | "new",
  );
  const [deletePlan, setDeletePlan] = useState<PlanRow | null>(null);
  const [toggleError, setToggleError] = useState<string | null>(null);
  const [editingCell, setEditingCell] = useState<EditingCell | null>(null);

  const handleToggle = async (plan: any) => {
    try {
      setToggleError(null);
      const nextActive = !plan.isActive;
      await updateDoc(doc(getFirebaseDb(), "plans", plan.id), {
        isActive: nextActive,
        updatedAt: Date.now(),
      });
      toast.success(`Plan set to ${nextActive ? "Active" : "Inactive"}`);
    } catch (err: any) {
      setToggleError(err.message || "Failed to toggle plan status");
    }
  };

  const handleInlineSave = async (planId: string, field: EditingCell["field"], rawValue: string) => {
    const plan = plans?.find((p: any) => p.id === planId);
    if (!plan) return;
    const patch: any = { updatedAt: Date.now() };
    if (field === "name") patch.name = rawValue;
    if (field === "dataGb") patch.dataGb = rawValue;
    if (field === "validityDays") {
      const v = parseInt(rawValue, 10);
      if (isNaN(v) || v <= 0) {
        toast.error("Invalid days value");
        return;
      }
      patch.validityDays = v;
    }
    if (field === "priceJpy") {
      const v = parseInt(rawValue, 10);
      if (isNaN(v) || v <= 0) {
        toast.error("Invalid price value");
        return;
      }
      patch.priceJpy = v;
    }
    if (field === "wholesalePriceUsd") {
      const v = Number(rawValue);
      if (!Number.isFinite(v) || v < 0) {
        toast.error("Invalid wholesale value");
        return;
      }
      patch.wholesalePriceUsd = v;
    }
    try {
      await updateDoc(doc(getFirebaseDb(), "plans", planId), patch);
      toast.success("Saved inline");
    } catch (err: any) {
      toast.error(err.message || "Failed to save plan inline");
    }
  };

  const handleMove = async (index: number, direction: "up" | "down") => {
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= rows.length) return;

    const newRows = [...rows];
    const temp = newRows[index];
    newRows[index] = newRows[targetIndex];
    newRows[targetIndex] = temp;

    try {
      const batch = writeBatch(getFirebaseDb());
      newRows.forEach((plan, idx) => {
        const ref = doc(getFirebaseDb(), "plans", plan.id);
        batch.update(ref, {
          sortOrder: idx * 10,
          updatedAt: Date.now()
        });
      });
      await batch.commit();
      toast.success("Order updated");
    } catch (err: any) {
      toast.error(err.message || "Failed to update order");
    }
  };

  const rows = useMemo(() => {
    if (!plans) return [];
    return [...plans].sort((a: any, b: any) => {
      const aVal = a.sortOrder !== undefined ? a.sortOrder : (a.createdAt || 0);
      const bVal = b.sortOrder !== undefined ? b.sortOrder : (b.createdAt || 0);
      return aVal - bVal;
    });
  }, [plans]);

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="flex items-center justify-between mb-5">
        <div>
          <p className="text-black" style={{ fontSize: "0.9375rem", fontWeight: 500 }}>
            eSIM Plans
          </p>
          <p className="text-black/40 mt-0.5" style={{ fontSize: "0.8125rem" }}>
            {rows.length} plan{rows.length !== 1 ? "s" : ""} total
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setModalPlan("new")}
            className="bg-black text-white px-4 py-2 hover:bg-black/80 transition-colors"
            style={{ fontSize: "0.6875rem" }}
          >
            + New Plan
          </button>
        </div>
      </div>

      {toggleError && (
        <div className="mb-4 bg-red-50 border border-red-200 px-4 py-3 flex items-center justify-between">
          <p className="text-red-700" style={{ fontSize: "0.8125rem" }}>
            {toggleError}
          </p>
          <button
            onClick={() => setToggleError(null)}
            className="text-red-400 hover:text-red-600 ml-4"
            style={{ fontSize: "0.6rem" }}
          >
            ✕
          </button>
        </div>
      )}

      {listError ? (
        <div className="py-16 text-center">
          <p className="text-red-500 mb-4" style={{ fontSize: "0.875rem" }}>
            Failed to load plans.
          </p>
        </div>
      ) : isLoading ? (
        <div className="py-16 text-center">
          <p style={{ color: "rgba(0,0,0,0.3)" }}>Loading...</p>
        </div>
      ) : rows.length === 0 ? (
        <div className="py-16 text-center border border-dashed border-[#D7D7D7]">
          <p style={{ color: "rgba(0,0,0,0.3)" }}>No plans yet</p>
          <button
            onClick={() => setModalPlan("new")}
            className="mt-4 text-black underline"
            style={{ fontSize: "0.875rem" }}
          >
            Create the first plan
          </button>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-[#E0E0E0]">
                {["ID", "Provider", "Type", "Name", "Data", "Days", "Price (¥)", "Wholesale ($)", "Margin", "Status", "Actions"].map((h) => (
                  <th
                    key={h}
                    className="text-left pb-3 pr-4"
                    style={{ color: "rgba(0,0,0,0.4)", fontSize: "0.6rem" }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((plan: any, idx: number) => (
                <tr key={plan.id} className="border-b border-[#F0F0F0] hover:bg-[#F7F7F5] transition-colors">
                  <td className="py-3 pr-4 text-black/40" style={{ fontSize: "0.8125rem" }}>
                    {plan.id}
                  </td>
                  <td className="py-3 pr-4" style={{ minWidth: "110px" }}>
                    <span
                      className={`inline-block px-1.5 py-0.5 border text-[0.55rem] font-medium tracking-wider uppercase ${
                        (plan.provider ?? "bappy") === "esimaccess"
                          ? "bg-blue-50 text-blue-700 border-blue-200"
                          : "bg-gray-100 text-gray-500 border-gray-200"
                      }`}
                    >
                      {plan.provider ?? "bappy"}
                    </span>
                    <div className="text-black/40 font-mono mt-0.5" style={{ fontSize: "0.65rem" }}>
                      {plan.providerPlanId ?? plan.bappyPlanId}
                    </div>
                  </td>
                  <td className="py-3 pr-4 text-black/60" style={{ fontSize: "0.75rem" }}>
                    {plan.planType || "-"}
                  </td>
                  <td className="py-3 pr-4" style={{ fontWeight: 500, minWidth: "120px" }}>
                    <InlineCell
                      value={plan.name}
                      planId={plan.id}
                      field="name"
                      editingCell={editingCell}
                      setEditingCell={setEditingCell}
                      onSave={handleInlineSave}
                    />
                    {(plan.network || plan.ipExport) && (
                      <div className="text-black/35 mt-0.5" style={{ fontSize: "0.65rem" }}>
                        {plan.network}
                        {plan.network && plan.ipExport ? " · " : ""}
                        {plan.ipExport ? `IP:${plan.ipExport}` : ""}
                      </div>
                    )}
                  </td>
                  <td className="py-3 pr-4" style={{ minWidth: "70px" }}>
                    <InlineCell
                      value={plan.dataGb}
                      planId={plan.id}
                      field="dataGb"
                      suffix=" GB"
                      editingCell={editingCell}
                      setEditingCell={setEditingCell}
                      onSave={handleInlineSave}
                    />
                  </td>
                  <td className="py-3 pr-4" style={{ minWidth: "60px" }}>
                    <InlineCell
                      value={plan.validityDays}
                      planId={plan.id}
                      field="validityDays"
                      type="number"
                      suffix="d"
                      editingCell={editingCell}
                      setEditingCell={setEditingCell}
                      onSave={handleInlineSave}
                    />
                  </td>
                  <td className="py-3 pr-4" style={{ fontWeight: 500, minWidth: "80px" }}>
                    <InlineCell
                      value={plan.priceJpy}
                      planId={plan.id}
                      field="priceJpy"
                      type="number"
                      prefix="¥"
                      editingCell={editingCell}
                      setEditingCell={setEditingCell}
                      onSave={handleInlineSave}
                    />
                  </td>
                  <td className="py-3 pr-4 text-black/60" style={{ minWidth: "80px" }}>
                    {plan.wholesalePriceUsd != null ? (
                      <InlineCell
                        value={plan.wholesalePriceUsd}
                        planId={plan.id}
                        field="wholesalePriceUsd"
                        type="number"
                        prefix="$"
                        editingCell={editingCell}
                        setEditingCell={setEditingCell}
                        onSave={handleInlineSave}
                      />
                    ) : (
                      <span className="text-black/25" style={{ fontSize: "0.8125rem" }}>—</span>
                    )}
                  </td>
                  <td className="py-3 pr-4" style={{ minWidth: "90px" }}>
                    {(() => {
                      const m = marginInfo(plan);
                      if (!m) return <span className="text-black/25" style={{ fontSize: "0.8125rem" }}>—</span>;
                      const positive = m.margin >= 0;
                      return (
                        <span
                          title={`卸 ≈ ¥${Math.round(m.jpyCost).toLocaleString()}（レート換算）`}
                          style={{ fontSize: "0.8125rem", color: positive ? "#15803d" : "#dc2626", fontWeight: 500 }}
                        >
                          ¥{Math.round(m.margin).toLocaleString()}
                          <span style={{ fontSize: "0.65rem", opacity: 0.7 }}> ({m.pct.toFixed(0)}%)</span>
                        </span>
                      );
                    })()}
                  </td>
                  <td className="py-3 pr-4">
                    <button
                      onClick={() => handleToggle(plan)}
                      className={`px-2.5 py-1 border text-[0.6rem] font-medium tracking-wider uppercase transition-colors ${
                        plan.isActive
                          ? "bg-green-50 text-green-700 border-green-200 hover:bg-green-100"
                          : "bg-gray-100 text-gray-500 border-gray-200 hover:bg-gray-200"
                      }`}
                    >
                      {plan.isActive ? "Active" : "Inactive"}
                    </button>
                  </td>
                  <td className="py-3">
                    <div className="flex gap-3">
                      <button
                        onClick={() => handleMove(idx, "up")}
                        disabled={idx === 0}
                        className="text-black/40 hover:text-black transition-colors disabled:opacity-20 disabled:cursor-not-allowed"
                        style={{ fontSize: "0.6rem" }}
                        title="Move Up"
                      >
                        ▲
                      </button>
                      <button
                        onClick={() => handleMove(idx, "down")}
                        disabled={idx === rows.length - 1}
                        className="text-black/40 hover:text-black transition-colors disabled:opacity-20 disabled:cursor-not-allowed"
                        style={{ fontSize: "0.6rem" }}
                        title="Move Down"
                      >
                        ▼
                      </button>
                      <button
                        onClick={() => setModalPlan(plan as PlanRow)}
                        className="text-black/40 hover:text-black transition-colors"
                        style={{ fontSize: "0.6rem" }}
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => setDeletePlan(plan as PlanRow)}
                        className="text-red-400 hover:text-red-600 transition-colors"
                        style={{ fontSize: "0.6rem" }}
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modalPlan !== undefined && (
        <PlanFormModal
          plan={modalPlan === "new" ? null : modalPlan}
          onClose={() => setModalPlan(undefined as unknown as PlanRow | null | "new")}
          onSaved={() => setModalPlan(undefined as unknown as PlanRow | null | "new")}
        />
      )}
      {deletePlan && (
        <DeleteConfirmDialog
          plan={deletePlan}
          onClose={() => setDeletePlan(null)}
          onDeleted={() => setDeletePlan(null)}
        />
      )}
    </div>
  );
}

