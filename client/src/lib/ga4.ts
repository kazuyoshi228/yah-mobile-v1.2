/**
 * ga4.ts — Google Analytics 4 の薄いラッパー（design_ga4_analytics.md）
 *
 * gtag.js は index.html で常時ロードし、Consent Mode v2 の既定を denied にしている。
 * - GA4イベントは Cookie 同意の有無に関わらず送る（denied 時は gtag が自動で
 *   Cookieなし・匿名の集計ping に切り替える＝訪問者全体のファネルを計測できる）。
 * - Cookie「承諾」時に consent update で granted に上げる（フル計測）。
 * 測定ID は公開値。SSR/未ロード安全（window.gtag が無ければ黙って no-op）。
 */

const MEASUREMENT_ID = "G-DVVQ3D5M6Z";

type Gtag = (...args: unknown[]) => void;
function gtag(): Gtag | null {
  if (typeof window === "undefined") return null;
  return (window as unknown as { gtag?: Gtag }).gtag ?? null;
}

/** GA4 イベント送信（e コマース含む）。未ロード時は no-op。 */
export function ga4Event(name: string, params?: Record<string, unknown>): void {
  gtag()?.("event", name, params ?? {});
}

/** Cookie 同意時に呼ぶ：analytics_storage を granted に更新（Cookieベースの計測を許可）。 */
export function ga4GrantConsent(): void {
  gtag()?.("consent", "update", { analytics_storage: "granted" });
}

/**
 * GA4 の client_id を取得（注文へ添付し、サーバー purchase をセッションへ縫合するため）。
 * denied（Cookieなし）や未ロード時は null を返す。
 */
export function getGaClientId(): Promise<string | null> {
  const g = gtag();
  if (!g) return Promise.resolve(null);
  return new Promise((resolve) => {
    let done = false;
    const finish = (v: string | null) => { if (!done) { done = true; resolve(v); } };
    try {
      g("get", MEASUREMENT_ID, "client_id", (id: unknown) => finish(typeof id === "string" ? id : null));
    } catch { finish(null); }
    // gtag get のコールバックが来ない環境（denied等）のための保険
    setTimeout(() => finish(null), 800);
  });
}

/** 通貨は JPY 固定（価格の真実値）。プラン→GA4 item 変換の共通ヘルパー。 */
export function ga4Item(opt: { gb: string; priceJpy: number; bappyPlanId?: string; planId?: string }) {
  return {
    item_id: opt.bappyPlanId || opt.planId || opt.gb,
    item_name: `Japan eSIM ${opt.gb}`,
    price: opt.priceJpy,
    quantity: 1,
  };
}
