import { describe, it, expect } from "vitest";
import { deriveEsimStatus, isLowData, esimExpiryLines } from "./esimStatus";

describe("deriveEsimStatus", () => {
  it("未有効化（lastActiveAt無し・status非active）→ ready", () => {
    expect(deriveEsimStatus({ status: null, lastActiveAt: null }).key).toBe("ready");
    expect(deriveEsimStatus({ status: "inactive" }).key).toBe("ready");
  });

  it("発行済み(status='active')でも未インストール(lastActiveAt無し・データ未消費)なら ready", () => {
    // fulfillEsim は発行時に status='active' を即セットする。実データ相当のケース。
    expect(deriveEsimStatus({
      status: "active", lastActiveAt: null, dataRemainingMb: 1000, dataTotalMb: 1000, expiryDate: null,
    }).key).toBe("ready");
  });

  it("有効化済み・データ十分 → active（パルスあり）", () => {
    const r = deriveEsimStatus({ status: "active", lastActiveAt: 1_700_000_000_000, dataRemainingMb: 4000, dataTotalMb: 5000 });
    expect(r.key).toBe("active");
    expect(r.pulse).toBe(true);
  });

  it("有効化済み・残量0 → topup", () => {
    expect(deriveEsimStatus({ status: "active", dataRemainingMb: 0, dataTotalMb: 5000 }).key).toBe("topup");
  });

  it("有効化済み・残量10%以下 → topup", () => {
    expect(deriveEsimStatus({ status: "active", dataRemainingMb: 500, dataTotalMb: 5000 }).key).toBe("topup");
    expect(deriveEsimStatus({ status: "active", dataRemainingMb: 501, dataTotalMb: 5000 }).key).toBe("active");
  });

  it("status=expired → expired（残量に関係なく最優先）", () => {
    expect(deriveEsimStatus({ status: "expired", dataRemainingMb: 4000, dataTotalMb: 5000 }).key).toBe("expired");
  });

  it("expiryDate 経過 → expired", () => {
    expect(deriveEsimStatus({ status: "active", expiryDate: "2000-01-01T00:00:00Z" }).key).toBe("expired");
  });

  it("lastActiveAt があれば status 未設定でも有効化扱い", () => {
    expect(deriveEsimStatus({ status: null, lastActiveAt: 1_700_000_000_000, dataRemainingMb: 4000, dataTotalMb: 5000 }).key).toBe("active");
  });
});

describe("isLowData", () => {
  it("null は low ではない", () => expect(isLowData(null, 5000)).toBe(false));
  it("0以下は low", () => expect(isLowData(0, 5000)).toBe(true));
  it("10%境界", () => {
    expect(isLowData(500, 5000)).toBe(true);
    expect(isLowData(501, 5000)).toBe(false);
  });
});

describe("esimExpiryLines", () => {
  it("未有効化＋expiryDate有り（実データ相当）→ Valid for … + Install by …（Expires は出さない）", () => {
    // eSIMAccess は発行時に expiryDate（インストール期限・約6ヶ月）を返す。未有効化で確定日を Expires 表示しない。
    const lines = esimExpiryLines(
      { status: "active", lastActiveAt: null, dataRemainingMb: 1024, dataTotalMb: 1024, expiryDate: "2027-01-04T06:27:43Z" },
      7,
    );
    expect(lines[0]).toBe("Valid for 7 days · from activation");
    expect(lines[1]).toMatch(/^Install by /);
    expect(lines.some((l) => l.startsWith("Expires "))).toBe(false);
  });

  it("有効化済み＋expiryDate有り → Expires <日時>", () => {
    const lines = esimExpiryLines(
      { lastActiveAt: 1_700_000_000_000, dataRemainingMb: 4000, dataTotalMb: 5000, expiryDate: "2026-08-05T00:30:00Z" },
      7,
    );
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(/^Expires /);
  });

  it("未有効化＋validityDays のみ → Valid for N days · from activation の1行", () => {
    expect(esimExpiryLines({ lastActiveAt: null, expiryDate: null }, 7)).toEqual([
      "Valid for 7 days · from activation",
    ]);
  });

  it("情報が無ければ空配列", () => {
    expect(esimExpiryLines({ lastActiveAt: null, expiryDate: null }, null)).toEqual([]);
    expect(esimExpiryLines({ lastActiveAt: null, expiryDate: null }, undefined)).toEqual([]);
  });
});
