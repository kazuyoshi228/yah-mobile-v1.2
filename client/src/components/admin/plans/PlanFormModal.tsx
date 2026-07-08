/**
 * admin/plans/PlanFormModal.tsx — プラン新規/編集モーダル（P4-3・PlansTab.tsx から無編集移動）
 */
import { useState } from "react";
import { toast } from "sonner";
import { getFirebaseDb } from "@/lib/firebase";
import { collection, doc, addDoc, updateDoc } from "firebase/firestore";
import { EMPTY_PLAN_FORM, PlanFormData, PlanRow } from "../types";

// ─────────────────────────────────────────────
// PlanFormModal
// ─────────────────────────────────────────────
export function PlanFormModal({
  plan,
  onClose,
  onSaved,
}: {
  plan: PlanRow | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = plan !== null;
  const [form, setForm] = useState<PlanFormData>(
    isEdit
      ? {
          bappyPlanId: plan.bappyPlanId,
          name: plan.name,
          dataGb: plan.dataGb,
          validityDays: String(plan.validityDays),
          priceJpy: String(plan.priceJpy),
          wholesalePriceUsd: plan.wholesalePriceUsd != null ? String(plan.wholesalePriceUsd) : "",
          regions: plan.regions ?? "",
          sponsorProfile: plan.sponsorProfile ?? "",
          planType: plan.planType ?? "",
          isActive: plan.isActive,
        }
      : EMPTY_PLAN_FORM,
  );
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const validityDays = parseInt(form.validityDays, 10);
    const priceJpy = parseInt(form.priceJpy, 10);
    if (isNaN(validityDays) || validityDays <= 0) {
      setError("有効日数は正の整数を入力してください");
      return;
    }
    if (isNaN(priceJpy) || priceJpy <= 0) {
      setError("価格は正の整数を入力してください");
      return;
    }
    // 卸USD（任意）：空なら既存値を触らない。数値なら反映。
    const wholesaleRaw = form.wholesalePriceUsd.trim();
    const wholesalePriceUsd = wholesaleRaw === "" ? undefined : Number(wholesaleRaw);
    if (wholesalePriceUsd !== undefined && (!Number.isFinite(wholesalePriceUsd) || wholesalePriceUsd < 0)) {
      setError("卸(USD)は0以上の数値で入力してください");
      return;
    }
    const payload = {
      bappyPlanId: form.bappyPlanId.trim(),
      name: form.name.trim(),
      dataGb: form.dataGb.trim(),
      validityDays,
      priceJpy,
      ...(wholesalePriceUsd !== undefined ? { wholesalePriceUsd } : {}),
      regions: form.regions.trim() || null,
      sponsorProfile: form.sponsorProfile.trim() || null,
      planType: form.planType || null,
      isActive: form.isActive,
      updatedAt: Date.now(),
    };
    setIsPending(true);
    try {
      if (isEdit) {
        await updateDoc(doc(getFirebaseDb(), "plans", plan.id), payload);
        toast.success("Plan updated successfully");
      } else {
        await addDoc(collection(getFirebaseDb(), "plans"), {
          ...payload,
          sortOrder: Date.now(),
          createdAt: Date.now(),
        });
        toast.success("Plan created successfully");
      }
      onSaved();
    } catch (err: any) {
      setError(err.message || "Failed to save plan");
    } finally {
      setIsPending(false);
    }
  };

  const inputClass =
    "w-full bg-white border border-[#D7D7D7] px-3 py-2 text-black focus:outline-none focus:border-black transition-colors";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="bg-white w-full max-w-lg mx-4 flex flex-col max-h-[90vh] overflow-hidden"
        style={{ boxShadow: "0 8px 40px rgba(0,0,0,0.18)" }}
      >
        <div className="px-6 py-5 border-b border-[#E0E0E0] flex items-center justify-between flex-shrink-0">
          <h2 className="text-black" style={{ fontSize: "0.9375rem", fontWeight: 500 }}>
            {isEdit ? "Edit Plan" : "New Plan"}
          </h2>
          <button onClick={onClose} className="text-black/30 hover:text-black transition-colors">
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-200 px-4 py-3 text-red-700" style={{ fontSize: "0.8125rem" }}>
              {error}
            </div>
          )}
          <div className="grid grid-cols-2 gap-4">
            {[
              { key: "bappyPlanId" as const, label: "Bappy Plan ID *", placeholder: "e.g. JP_3D_1GB" },
              { key: "name" as const, label: "Plan Name *", placeholder: "e.g. Japan 3 Days 1GB" },
            ].map(({ key, label, placeholder }) => (
              <div key={key}>
                <label className="block mb-1" style={{ color: "rgba(0,0,0,0.5)", fontSize: "0.6rem" }}>
                  {label}
                </label>
                <input
                  className={inputClass}
                  value={form[key]}
                  onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                  placeholder={placeholder}
                  required
                />
              </div>
            ))}
            <div>
              <label className="block mb-1" style={{ color: "rgba(0,0,0,0.5)", fontSize: "0.6rem" }}>
                Plan Type
              </label>
              <select
                className={inputClass}
                value={form.planType}
                onChange={(e) => setForm((f) => ({ ...f, planType: e.target.value as any }))}
              >
                <option value="">(None)</option>
                <option value="initial">initial (新規用)</option>
                <option value="topup">topup (トップアップ用)</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-4 gap-4">
            <div>
              <label className="block mb-1" style={{ color: "rgba(0,0,0,0.5)", fontSize: "0.6rem" }}>
                Data (GB) *
              </label>
              <input
                className={inputClass}
                value={form.dataGb}
                onChange={(e) => setForm((f) => ({ ...f, dataGb: e.target.value }))}
                placeholder="e.g. 1 or unlimited"
                required
              />
            </div>
            <div>
              <label className="block mb-1" style={{ color: "rgba(0,0,0,0.5)", fontSize: "0.6rem" }}>
                Days *
              </label>
              <input
                className={inputClass}
                type="number"
                min={1}
                value={form.validityDays}
                onChange={(e) => setForm((f) => ({ ...f, validityDays: e.target.value }))}
                placeholder="e.g. 3"
                required
              />
            </div>
            <div>
              <label className="block mb-1" style={{ color: "rgba(0,0,0,0.5)", fontSize: "0.6rem" }}>
                Price (¥) *
              </label>
              <input
                className={inputClass}
                type="number"
                min={1}
                value={form.priceJpy}
                onChange={(e) => setForm((f) => ({ ...f, priceJpy: e.target.value }))}
                placeholder="e.g. 990"
                required
              />
            </div>
            <div>
              <label className="block mb-1" style={{ color: "rgba(0,0,0,0.5)", fontSize: "0.6rem" }}>
                Wholesale ($) 卸
              </label>
              <input
                className={inputClass}
                type="number"
                min={0}
                step="0.01"
                value={form.wholesalePriceUsd}
                onChange={(e) => setForm((f) => ({ ...f, wholesalePriceUsd: e.target.value }))}
                placeholder="e.g. 2.70"
              />
            </div>
          </div>

          <div>
            <label className="block mb-1" style={{ color: "rgba(0,0,0,0.5)", fontSize: "0.6rem" }}>
              Regions (optional)
            </label>
            <input
              className={inputClass}
              value={form.regions}
              onChange={(e) => setForm((f) => ({ ...f, regions: e.target.value }))}
              placeholder='e.g. ["Japan"]'
            />
          </div>
          <div>
            <label className="block mb-1" style={{ color: "rgba(0,0,0,0.5)", fontSize: "0.6rem" }}>
              Sponsor Profile (optional)
            </label>
            <input
              className={inputClass}
              value={form.sponsorProfile}
              onChange={(e) => setForm((f) => ({ ...f, sponsorProfile: e.target.value }))}
              placeholder="e.g. JP_DOCOMO"
            />
          </div>
          <div>
            <label className="block mb-1" style={{ color: "rgba(0,0,0,0.5)", fontSize: "0.6rem" }}>
              Status
            </label>
            <div className="flex gap-3">
              {([true, false] as const).map((v) => (
                <button
                  key={String(v)}
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, isActive: v }))}
                  className={`px-4 py-2 border transition-colors ${
                    form.isActive === v ? "border-black bg-black text-white" : "border-[#D7D7D7] text-black/50 hover:border-black/40"
                  }`}
                  style={{ fontSize: "0.6875rem" }}
                >
                  {v ? "Active" : "Inactive"}
                </button>
              ))}
            </div>
          </div>
        </form>

        <div className="px-6 py-4 border-t border-[#E0E0E0] flex gap-3 flex-shrink-0">
          <button
            onClick={handleSubmit as unknown as React.MouseEventHandler}
            disabled={isPending}
            className="bg-black text-white px-6 py-2.5 hover:bg-black/80 transition-colors disabled:opacity-50"
            style={{ fontSize: "0.6875rem" }}
          >
            {isPending ? "Saving..." : isEdit ? "Save Changes" : "Create Plan"}
          </button>
          <button onClick={onClose} className="text-black/40 hover:text-black transition-colors" style={{ fontSize: "0.6875rem" }}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

