/**
 * admin/plans/PlanDeleteDialog.tsx — プラン削除（論理削除）確認（P4-3・PlansTab.tsx から無編集移動）
 */
import { useState } from "react";
import { toast } from "sonner";
import { getFirebaseDb } from "@/lib/firebase";
import { doc, updateDoc } from "firebase/firestore";
import { PlanRow } from "../types";

// ─────────────────────────────────────────────
// DeleteConfirmDialog
// ─────────────────────────────────────────────
export function DeleteConfirmDialog({
  plan,
  onClose,
  onDeleted,
}: {
  plan: PlanRow;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);

  const handleDelete = async () => {
    setIsPending(true);
    setDeleteError(null);
    try {
      // 論理削除（Soft Delete）に変更：過去の注文履歴から参照エラーになるのを防ぐため
      await updateDoc(doc(getFirebaseDb(), "plans", plan.id), { isActive: false });
      toast.success("Plan deleted successfully");
      onDeleted();
    } catch (err: any) {
      setDeleteError(err.message || "Failed to delete plan");
    } finally {
      setIsPending(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-white w-full max-w-sm mx-4 p-6" style={{ boxShadow: "0 8px 40px rgba(0,0,0,0.18)" }}>
        <h3 className="text-black mb-2" style={{ fontSize: "1rem", fontWeight: 500 }}>
          Delete Plan
        </h3>
        <p className="text-black/60 mb-4" style={{ fontSize: "0.875rem", lineHeight: 1.6 }}>
          <strong style={{ color: "black" }}>{plan.name}</strong> を削除します。この操作は元に戻せません。
        </p>
        {deleteError && (
          <div className="mb-4 bg-red-50 border border-red-200 px-3 py-2">
            <p className="text-red-700" style={{ fontSize: "0.8125rem" }}>
              {deleteError}
            </p>
          </div>
        )}
        <div className="flex gap-3">
          <button
            onClick={handleDelete}
            disabled={isPending}
            className="bg-red-600 text-white px-5 py-2 hover:bg-red-700 transition-colors disabled:opacity-50"
            style={{ fontSize: "0.6875rem" }}
          >
            {isPending ? "Deleting..." : "Delete"}
          </button>
          <button onClick={onClose} className="text-black/40 hover:text-black transition-colors" style={{ fontSize: "0.6875rem" }}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

