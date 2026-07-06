import React from "react";

const statusConfig: Record<string, { label: string; bg: string; text: string; dot: string }> = {
  pending:      { label: "Pending",    bg: "bg-gray-100",   text: "text-gray-500",  dot: "bg-gray-400"  },
  paid:         { label: "Paid",       bg: "bg-blue-50",    text: "text-blue-600",  dot: "bg-blue-500"  },
  provisioning: { label: "Processing", bg: "bg-amber-50",   text: "text-amber-700", dot: "bg-amber-500" },
  fulfilled:    { label: "Completed",  bg: "bg-black",      text: "text-white",     dot: "bg-green-400" },
  failed:       { label: "Failed",     bg: "bg-red-50",     text: "text-red-600",   dot: "bg-red-500"   },
  refunded:     { label: "Refunded",   bg: "bg-gray-100",   text: "text-gray-500",  dot: "bg-gray-400"  },
  cancelled:    { label: "Cancelled",  bg: "bg-gray-50",    text: "text-gray-400",  dot: "bg-gray-300"  },
};

export function StatusBadge({ status }: { status: string }) {
  const cfg = statusConfig[status] ?? statusConfig.pending;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 font-sans font-medium tracking-[0.15em] uppercase text-[0.6rem] ${cfg.bg} ${cfg.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
}
