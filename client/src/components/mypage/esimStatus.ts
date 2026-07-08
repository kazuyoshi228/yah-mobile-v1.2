// eSIM の利用ライフサイクル・ステータスを実フィールドから導出する。
// 注文ステータス（order.status）とは別系統：こちらは「いま使えるか」を表す。
// 優先順位: Expired → Ready to Install →（Need Top-up / Active）

export type EsimStatusKey = "ready" | "active" | "topup" | "expired";

export interface EsimStatusInput {
  status?: string | null;
  lastActiveAt?: number | null;
  dataRemainingMb?: number | null;
  dataTotalMb?: number | null;
  expiryDate?: number | Date | string | null;
}

export interface EsimStatusResult {
  key: EsimStatusKey;
  label: string;
  /** ステータスドットの Tailwind 色クラス */
  dotClass: string;
  /** ドットをパルスさせるか（Active のみ） */
  pulse: boolean;
}

/** データ残量が閾値（10%）以下、または枯渇（0以下）なら true */
export function isLowData(remainingMb?: number | null, totalMb?: number | null): boolean {
  if (remainingMb == null) return false;
  if (remainingMb <= 0) return true;
  if (totalMb != null && totalMb > 0 && remainingMb / totalMb <= 0.1) return true;
  return false;
}

/**
 * 「実際に端末で有効化されたか」を実フィールドから判定する。
 * ※ webhooks.ts の fulfillEsim は発行時に status="active" を即セットするため、
 *   status==="active" は「発行済み」を意味し、端末での有効化ではない。
 *   有効化は lastActiveAt（webhooks_bappy が付与）／データ消費（remaining<total）で判定する。
 */
export function isEsimActivated(esim: EsimStatusInput): boolean {
  return (
    esim.lastActiveAt != null ||
    (esim.dataRemainingMb != null && esim.dataTotalMb != null && esim.dataRemainingMb < esim.dataTotalMb)
  );
}

export function deriveEsimStatus(esim: EsimStatusInput): EsimStatusResult {
  const now = Date.now();
  const expired =
    esim.status === "expired" ||
    (esim.expiryDate != null && new Date(esim.expiryDate).getTime() < now);

  if (expired) return { key: "expired", label: "Expired", dotClass: "bg-gray-400", pulse: false };
  if (!isEsimActivated(esim)) return { key: "ready", label: "Ready to Install", dotClass: "bg-blue-400", pulse: false };
  if (isLowData(esim.dataRemainingMb, esim.dataTotalMb))
    return { key: "topup", label: "Need Top-up", dotClass: "bg-orange-400", pulse: false };
  return { key: "active", label: "Active", dotClass: "bg-green-400", pulse: true };
}

function fmtDateTime(d: number | Date | string): string {
  return new Date(d).toLocaleString("en-US", {
    year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
  });
}
function fmtDate(d: number | Date | string): string {
  return new Date(d).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

/**
 * eSIM の期限に関する表示行（0〜2行）を返す。判定は「有効化済みか」で分岐する。
 *
 * ※ eSIMAccess は発行時点で expiryDate（≒インストール期限・約6ヶ月）を必ず返す。
 *   これはデータ有効期限ではないため、未有効化で「Expires <その日>」と出すと
 *   7日プランなのに半年使えるかのような誤解を生む。よって：
 * - 有効化済み → 実期限「Expires <日時>」（無ければ Valid for N days）
 * - 未有効化   → 「Valid for N days · from activation」＋「Install by <日付>」（expiryDate をインストール期限として提示）
 */
export function esimExpiryLines(
  esim: EsimStatusInput,
  validityDays?: number | null,
): string[] {
  if (isEsimActivated(esim)) {
    if (esim.expiryDate) return [`Expires ${fmtDateTime(esim.expiryDate)}`];
    if (validityDays) return [`Valid for ${validityDays} days`];
    return [];
  }
  const lines: string[] = [];
  if (validityDays) lines.push(`Valid for ${validityDays} days · from activation`);
  if (esim.expiryDate) lines.push(`Install by ${fmtDate(esim.expiryDate)}`);
  return lines;
}
