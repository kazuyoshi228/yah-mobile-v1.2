/**
 * app/FaqSection.tsx — トップの FAQ アコーディオン
 * （P4-4・AppPage.tsx から無編集移動。openFaq 状態はセクション内に閉じる）
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import { FadeIn, serif } from "@/components/app";

export default function FaqSection() {
  const { t } = useTranslation();
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const faqItems = t("faq.items", { returnObjects: true }) as Array<{ q: string; a: string | React.ReactNode }>;

  return (
    <section id="faq" className="py-24 lg:py-36 bg-white">
      <div className="container max-w-3xl">
        <FadeIn>
          <p className="text-black/35 mb-3">{t("faq.sectionLabel")}</p>
          <h2 className="text-black" style={serif("clamp(2rem, 4vw, 3.25rem)")}>{t("faq.title")}</h2>
        </FadeIn>
        <div className="mt-12 border-t border-[#D7D7D7]">
          {faqItems.map((faq, i) => (
            <FadeIn key={i} delay={i * 0.04}>
              <div className="border-b border-[#D7D7D7]">
                <button
                  className="w-full flex items-center justify-between py-6 text-left group"
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                >
                  <span className="text-black group-hover:opacity-50 transition-opacity pr-8" style={{ fontSize: "0.9375rem" }}>
                    {faq.q}
                  </span>
                  <span
                    className="text-black/35 shrink-0 text-xl transition-transform duration-200"
                    style={{ transform: openFaq === i ? "rotate(45deg)" : "rotate(0deg)", display: "inline-block" }}
                  >
                    +
                  </span>
                </button>
                <motion.div
                  initial={false}
                  animate={{ height: openFaq === i ? "auto" : 0, opacity: openFaq === i ? 1 : 0 }}
                  transition={{ duration: 0.3, ease: [0.23, 1, 0.32, 1] }}
                  className="overflow-hidden"
                >
                  <p className="pb-6 text-black/55" style={{ fontSize: "0.9rem", lineHeight: 1.8 }}>
                    {faq.a}
                  </p>
                </motion.div>
              </div>
            </FadeIn>
          ))}
        </div>
      </div>
    </section>
  );
}
