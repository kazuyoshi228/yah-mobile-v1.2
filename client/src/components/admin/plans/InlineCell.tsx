/**
 * admin/plans/InlineCell.tsx — テーブルセルのインライン編集（P4-3・PlansTab.tsx から無編集移動）
 */
import { useRef, useState } from "react";
import { EditingCell } from "../types";

// ─────────────────────────────────────────────
// InlineCell
// ─────────────────────────────────────────────
export function InlineCell({
  value,
  planId,
  field,
  type = "text",
  suffix,
  prefix,
  editingCell,
  setEditingCell,
  onSave,
}: {
  value: string | number;
  planId: string;
  field: EditingCell["field"];
  type?: "text" | "number";
  suffix?: string;
  prefix?: string;
  editingCell: EditingCell | null;
  setEditingCell: (c: EditingCell | null) => void;
  onSave: (planId: string, field: EditingCell["field"], value: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const isEditing = editingCell?.planId === planId && editingCell?.field === field;
  const [draft, setDraft] = useState(String(value));

  const startEdit = () => {
    setDraft(String(value));
    setEditingCell({ planId, field });
    setTimeout(() => inputRef.current?.select(), 0);
  };
  const commit = () => {
    if (draft.trim() === String(value)) {
      setEditingCell(null);
      return;
    }
    onSave(planId, field, draft.trim());
    setEditingCell(null);
  };
  const cancel = () => {
    setDraft(String(value));
    setEditingCell(null);
  };

  if (isEditing) {
    return (
      <input
        ref={inputRef}
        type={type}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
          }
          if (e.key === "Escape") {
            e.preventDefault();
            cancel();
          }
          if (e.key === "Tab") {
            e.preventDefault();
            commit();
          }
        }}
        onBlur={commit}
        autoFocus
        className="w-full border-b border-black bg-transparent outline-none px-0 py-0.5 text-black"
        style={{ fontSize: "0.875rem", minWidth: "60px" }}
      />
    );
  }

  return (
    <button
      onClick={startEdit}
      title="Click to edit"
      className="group flex items-center gap-1 text-left hover:text-black transition-colors cursor-text w-full"
    >
      <span style={{ fontSize: "0.875rem" }}>
        {prefix}
        {type === "number" ? Number(value).toLocaleString() : value}
        {suffix}
      </span>
      <svg
        className="w-3 h-3 text-black/20 group-hover:text-black/50 flex-shrink-0 transition-colors"
        fill="none"
        viewBox="0 0 12 12"
        stroke="currentColor"
        strokeWidth="1.5"
      >
        <path d="M8.5 1.5l2 2L4 10H2V8L8.5 1.5z" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
}

