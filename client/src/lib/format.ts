/**
 * lib/format.ts — 表示フォーマットの共通ユーティリティ（P4-2）
 */

/** JPY金額の表示（例: ¥1,800）。金額不明はダッシュ。 */
export function formatYen(amount: number | null | undefined, fallback = "—"): string {
  if (amount == null) return fallback;
  return `¥${amount.toLocaleString()}`;
}

/**
 * epoch ms / Firestore Timestamp風 {seconds} を日本語の日時文字列へ。
 * OrdersTab / RefundsTab に重複していた formatTimestamp を集約（挙動同一）。
 */
export function formatTimestampJa(
  ts: number | { seconds: number } | null | undefined,
  opts: { withSeconds?: boolean } = {},
): string {
  if (!ts) return "—";
  const ms = typeof ts === "object" && "seconds" in ts ? ts.seconds * 1000 : ts;
  return new Date(ms).toLocaleString("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    ...(opts.withSeconds ? { second: "2-digit" as const } : {}),
  });
}
