import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { LogIn, CheckCircle2 } from "lucide-react";
import { usePurchaseFlow, usePurchaseSession } from "../context";
import { useGoogleLogin } from "@/hooks/useGoogleLogin";
import { ga4Event } from "@/lib/ga4";

export function Step3Login() {
  const { t } = useTranslation();
  const { setStep, initialPlanId, currentOpt, drawerDays, drawerGb } = usePurchaseFlow();
  const { loading, isAuthenticated, user } = usePurchaseSession();

  // 最短動線v2(b): ログイン済み/ログイン成功時は自動で決済ステップへ前進（Continueタップを廃止）。
  // Payment の back は 0(プラン) に向くためループしない。
  useEffect(() => {
    if (!loading && isAuthenticated) { ga4Event("login", { method: "google" }); setStep(2); }
  }, [loading, isAuthenticated, setStep]);

  // ログイン往復で選択プランが失われないよう、plan/days/gb を redirect URL に含める
  // （ポップアップがブロックされた場合のフォールバック先。通常はページ遷移なしでログイン）
  const loginHref = (() => {
    const p = new URLSearchParams({ open: "true" });
    if (initialPlanId) p.set("plan", initialPlanId);
    if (drawerDays) p.set("days", String(drawerDays));
    if (drawerGb) p.set("gb", drawerGb);
    return `/login?redirect=${encodeURIComponent(`/app?${p.toString()}`)}`;
  })();

  // その場で Google ポップアップログイン。成功後は isAuthenticated が true になり、
  // ページ遷移なしでこの画面がログイン済み表示（→ 支払い）に切り替わる（＝プラン選択が保持される）。
  const { handleLogin, pending } = useGoogleLogin({ fallbackHref: loginHref });

  return (
    <div>
      <h2 className="font-sans font-light text-black mb-2 text-[1.375rem] leading-[1.15] tracking-[-0.02em]">{t("drawer.signInTitle")}</h2>
      <p className="font-sans text-black/50 mb-8 text-[0.875rem] leading-[1.7]">
        {t("drawer.signInDesc")}
      </p>
      {loading ? (
        <div className="flex items-center gap-3 py-8">
          <div className="w-4 h-4 border border-black/30 border-t-black rounded-full animate-spin" />
          <p className="font-sans text-black/40 text-[0.875rem]">{t("drawer.checkingLogin")}</p>
        </div>
      ) : isAuthenticated && user ? (
        <div>
          <div className="border border-[#D7D7D7] p-5 mb-6 flex items-center gap-4">
            <div className="font-sans font-semibold w-10 h-10 rounded-full bg-black flex items-center justify-center text-white text-[0.8125rem] shrink-0">
              {(user.name ?? user.email ?? "?").slice(0, 2).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-sans font-medium text-black text-[0.9rem] truncate">{user.name ?? "—"}</p>
              <p className="font-sans text-black/40 text-[0.8125rem] truncate">{user.email ?? "—"}</p>
            </div>
            <CheckCircle2 size={20} className="text-black shrink-0" strokeWidth={1.5} />
          </div>
          <div className="flex gap-3"><button onClick={() => setStep(0)} className="text-label px-5 py-3.5 border border-[#D7D7D7] text-black hover:border-black transition-colors">{t("drawer.back")}</button><button
            onClick={() => setStep(2)}
            className="text-label flex-1 py-3.5 bg-black text-white hover:bg-black/80 transition-colors duration-200 active:scale-[0.97]"
          >
            {t("drawer.continueBtn")}
          </button></div>
        </div>
      ) : (
        <div>
          {/* 選択中プランのサマリー（サインイン前に内容を明示・変更導線付き） */}
          {currentOpt && (
            <div className="border border-black p-4 mb-6 flex items-center justify-between gap-4">
              <div className="min-w-0">
                <p className="text-label text-black/35 mb-1">{t("drawer.yourSelection", "YOUR SELECTION")}</p>
                <p className="font-sans font-medium text-black text-[0.95rem]">
                  {drawerDays} {t("drawer.days")} · {currentOpt.gb} · ¥{currentOpt.priceJpy.toLocaleString()}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setStep(0)}
                className="text-label text-[0.7rem] text-black/50 hover:text-black underline underline-offset-2 shrink-0 transition-colors"
              >
                {t("drawer.changePlan", "Change")}
              </button>
            </div>
          )}
          <div className="border border-[#D7D7D7] p-7 mb-6 text-center">
            <div className="flex justify-center mb-4">
              <div className="w-12 h-12 border border-[#D7D7D7] rounded-full flex items-center justify-center">
                <LogIn size={22} strokeWidth={1.25} className="text-black/60" />
              </div>
            </div>
            <p className="font-sans font-medium text-black text-[0.9375rem] mb-1">{t("drawer.signInWithAccount")}</p>
            <p className="font-sans text-black/45 text-[0.875rem] leading-[1.7] mb-6">{t("drawer.secureLogin")}</p>
            <button
              type="button"
              onClick={handleLogin}
              disabled={pending}
              className="flex items-center justify-center gap-3 w-full py-3.5 bg-black text-white hover:bg-black/80 transition-colors duration-200 active:scale-[0.97] text-center cursor-pointer disabled:opacity-60"
            >
              <span className="font-sans text-[0.875rem] font-medium tracking-[0.1em]">{t("drawer.signInBtn")}</span>
            </button>
            {/* CVR: 「アカウント作成」への誤解を解く安心コピー */}
            <p className="font-sans text-black/45 text-[0.75rem] leading-[1.6] mt-3 text-center">{t("drawer.loginReassure")}</p>
            <p className="font-sans text-black/35 text-[0.6875rem] leading-[1.6] mt-3 text-center">
              {t("drawer.loginConsent")}{" "}
              <a href="/terms" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-black/60 transition-colors">{t("footer.terms")}</a>
              {" "}{t("drawer.loginConsentAnd")}{" "}
              <a href="/privacy" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-black/60 transition-colors">{t("footer.privacy")}</a>
              {t("drawer.loginConsentSuffix")}
            </p>
          </div>
          <div className="border-t border-[#D7D7D7] pt-5">
            {[t("drawer.benefit1"), t("drawer.benefit2"), t("drawer.benefit3")].map((b, i) => (
              <div key={i} className="flex items-start gap-3 py-3 border-b border-[#D7D7D7]">
                <span className="font-sans text-black/25 text-[0.6875rem] tracking-[0.1em] shrink-0">{String(i + 1).padStart(2, "0")}</span>
                <p className="font-sans text-black/60 text-[0.875rem] leading-[1.7]">{b}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
