import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useRoute } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { onSnapshot, doc, collection, query, where, orderBy } from "firebase/firestore";
import { getFirebaseDb } from "@/lib/firebase";
import { activeTopupPlansQuery } from "@/lib/queries";
import { useAuth } from "@/_core/hooks/useAuth";
import Nav from "@/components/Nav";
import Footer from "@/components/Footer";
import { Spinner } from "@/components/ui/spinner";
import { callFunction } from "@/lib/callable";
import { CALLABLE } from "@/lib/callable";
import type { FsEsimLink, FsPlan } from "../../../shared/types";


export default function TopupPage({ params }: { params: { esimLinkId: string } }) {
  const { t, i18n } = useTranslation();
  const { esimLinkId } = params;
  const { user, isAuthenticated, loading } = useAuth();
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [isPurchasing, setIsPurchasing] = useState(false);
  const [purchasingPlanId, setPurchasingPlanId] = useState<string | null>(null);

  const [esimLink, setEsimLink] = useState<FsEsimLink | null>(null);
  const [esimLoading, setEsimLoading] = useState(true);

  // eSIM取得
  useEffect(() => {
    if (!isAuthenticated) return;
    const unsub = onSnapshot(doc(getFirebaseDb(), "esim_links", esimLinkId), (snap) => {
      setEsimLink(snap.exists() ? ({ id: snap.id, ...snap.data() } as FsEsimLink) : null);
      setEsimLoading(false);
    });
    return unsub;
  }, [esimLinkId, isAuthenticated]);

  // トップアッププラン取得 (Firestoreから直接)
  const [plans, setPlans] = useState<FsPlan[] | null>(null);
  const [plansLoading, setPlansLoading] = useState(true);

  useEffect(() => {
    const q = query(
      collection(getFirebaseDb(), "plans"),
      where("planType", "==", "topup"),
      where("isActive", "==", true),
      orderBy("sortOrder", "asc") // Needs index? Will handle if index error
    );
    const unsub = onSnapshot(q, (snap) => {
      setPlans(snap.docs.map(doc => ({ id: doc.id, ...doc.data() }) as FsPlan));
      setPlansLoading(false);
    }, (error) => {
      console.error("Failed to fetch topup plans", error);
      // Fallback without sortOrder if index is missing（クエリ本体は lib/queries.ts に集約・P4-1）
      const qFallback = activeTopupPlansQuery();
      onSnapshot(qFallback, (snapFb) => {
        setPlans(snapFb.docs.map(doc => ({ id: doc.id, ...doc.data() }) as FsPlan));
        setPlansLoading(false);
      });
    });
    return unsub;
  }, []);

  const handleBuy = useCallback(async (plan: FsPlan) => {
    if (!esimLink) return;
    setCheckoutError(null);
    setIsPurchasing(true);
    setPurchasingPlanId(plan.id); // this is firestore plan doc id
    
    // In db.ts, bappyPlanId is required. The plan document in Firestore has bappyPlanId.
    const bappyPlanId = plan.bappyPlanId;

    try {
      const result = await callFunction<{ esimLinkUuid: string; bappyPlanId: string; origin: string; timezone: string; language: string }, { checkoutUrl: string; orderId: string }>(
        CALLABLE.ordersInitTopupCheckout,
        {
          esimLinkUuid: esimLink.bappyLinkUuid,
          bappyPlanId: bappyPlanId, // The cloud function queries plans where bappyPlanId matches
          origin: window.location.origin,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          language: i18n.language,
        }
      );

      if (result.checkoutUrl) {
        window.location.href = result.checkoutUrl;
      } else {
        throw new Error("Invalid checkout URL returned.");
      }
    } catch {
      setCheckoutError(t("common.paymentFailed"));
      setIsPurchasing(false);
      setPurchasingPlanId(null);
    }
  }, [esimLink]);

  if (loading || esimLoading) {
    return (
      <div className="min-h-screen bg-white flex flex-col">
        <Nav />
        <main className="flex-1 flex justify-center items-center">
          <Spinner />
        </main>
        <Footer />
      </div>
    );
  }

  if (!isAuthenticated || !esimLink) {
    return (
      <div className="min-h-screen bg-white flex flex-col">
        <Nav />
        <main className="flex-1 flex justify-center items-center">
          <div className="text-center py-24">
            <p className="font-sans text-black/20 mb-4 text-[4rem] font-light leading-none">?</p>
            <p className="font-sans text-black/40 mb-8 text-base">eSIM not found.</p>
            <Link href="/mypage">
              <span className="text-label inline-block bg-black text-white px-8 py-3.5 text-[0.75rem] hover:bg-black/80 transition-colors duration-200 active:scale-[0.97] cursor-pointer">
                Back to My Page
              </span>
            </Link>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white flex flex-col">
      <Nav />

      <main className="flex-1 pt-24 pb-24">
        <div className="container max-w-2xl">
          <motion.div
            initial={{ opacity: 0, x: 16 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -16 }}
            transition={{ duration: 0.2 }}
          >
            <Link href={`/mypage/orders/${esimLink.orderId}`}>
              <span className="cursor-pointer font-sans flex items-center gap-2 text-black/40 hover:text-black transition-colors duration-200 mb-8 text-[0.8125rem]">
                ← Back to Order #{esimLink.orderId}
              </span>
            </Link>

            <h2 className="font-sans font-light text-black mb-1 text-[clamp(1.5rem,3vw,2rem)] tracking-[-0.02em]">
              Top-up Data
            </h2>
            <p className="font-sans text-black/40 mb-8 text-sm">Add more data to your active eSIM.</p>

            <div className="pt-4">
              {plansLoading ? (
                <div className="flex justify-center py-4"><Spinner /></div>
              ) : !plans || plans.length === 0 ? (
                <p className="font-sans text-black/30 text-sm">No top-up plans available.</p>
              ) : (
                <div className="grid grid-cols-1 gap-4">
                  {plans.map((plan) => {
                    const isProcessing = isPurchasing && purchasingPlanId === plan.id;
                    return (
                      <div
                        key={plan.id}
                        className="border border-black/10 p-5 hover:border-black/30 transition-colors duration-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                      >
                        <div>
                          <p className="font-sans font-medium text-black text-sm mb-1">{plan.name}</p>
                          <p className="font-sans text-black/40 text-xs">
                            {plan.dataGb} GB · {plan.validityDays} days
                          </p>
                        </div>
                        <div className="flex items-center gap-4">
                          <p className="font-sans text-black font-medium text-sm">
                            ¥{plan.priceJpy?.toLocaleString()}
                          </p>
                          <button
                            onClick={() => handleBuy(plan)}
                            disabled={isPurchasing}
                            className="text-label text-[0.6rem] bg-black text-white px-5 py-2.5 hover:bg-black/80 transition-colors duration-200 active:scale-[0.97] disabled:opacity-40 flex items-center gap-1.5 shrink-0"
                          >
                            {isProcessing ? <Spinner className="size-3" /> : null}
                            {isProcessing ? "Loading…" : "Buy"}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              {checkoutError && (
                <p className="font-sans text-red-500 text-xs mt-4">{checkoutError}</p>
              )}
            </div>

          </motion.div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
