// eSIM の利用ライフサイクル・ステータスを実フィールドから導出する。
// 注文ステータス（order.status）とは別系統：こちらは「いま使えるか」を表す。
// 優先順位: Expired → Ready to Install →（Need Top-up / Active）

export type EsimStatusKey = "ready" | "active" | "topup" | "expired";

export interface EsimStatusInput {
  status?: string | null;
  lastActiveAt?: number | null;
  dataRemainingMb?: number | null;
  dataTotalMb?: number | null;
  expiryDate?: Date | string | null;
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

export function deriveEsimStatus(esim: EsimStatusInput): EsimStatusResult {
  const now = Date.now();
  const expired =
    esim.status === "expired" ||
    (esim.expiryDate != null && new Date(esim.expiryDate).getTime() < now);
  const activated = esim.status === "active" || esim.lastActiveAt != null;

  if (expired) return { key: "expired", label: "Expired", dotClass: "bg-gray-400", pulse: false };
  if (!activated) return { key: "ready", label: "Ready to Install", dotClass: "bg-blue-400", pulse: false };
  if (isLowData(esim.dataRemainingMb, esim.dataTotalMb))
    return { key: "topup", label: "Need Top-up", dotClass: "bg-orange-400", pulse: false };
  return { key: "active", label: "Active", dotClass: "bg-green-400", pulse: true };
}
