/**
 * app/FeaturesSection.tsx — トップの「Why yah.mobile」特徴グリッド
 * （P4-4・AppPage.tsx から無編集移動）
 */
import { useTranslation } from "react-i18next";
import { Plane, Signal, MessageCircle, Zap, BarChart2, UserCircle, Tag, type LucideIcon } from "lucide-react";
import { FadeIn, serif } from "@/components/app";

const FEATURE_ICONS: Record<string, LucideIcon> = {
  Plane, Signal, MessageCircle, Zap, BarChart2, UserCircle, Tag,
};

const FEATURE_KEYS = [
  { icon: "Tag", key: "bestPrice" },
  { icon: "Signal", key: "coverage" },
  { icon: "MessageCircle", key: "support" },
  { icon: "Zap", key: "activation" },
  { icon: "BarChart2", key: "tracking" },
  { icon: "UserCircle", key: "account" },
] as const;

export default function FeaturesSection() {
  const { t } = useTranslation();
  return (
    <section className="py-24 lg:py-36 bg-white">
      <div className="container">
        <FadeIn>
          <p className="text-black/35 mb-3">{t("features.sectionLabel")}</p>
          <h2 className="text-black" style={serif("clamp(2.25rem, 4.5vw, 3.75rem)")}>{t("features.title")}</h2>
        </FadeIn>
        <div className="mt-16 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-0 border-t border-l border-[#D7D7D7]">
          {FEATURE_KEYS.map((f, i) => {
            const Icon = FEATURE_ICONS[f.icon];
            return (
              <FadeIn key={i} delay={i * 0.07} className="contents">
                <div className="p-8 border-b border-r border-[#D7D7D7]">
                  <div className="mb-6">
                    {Icon && <Icon size={40} strokeWidth={1.25} className="text-black" />}
                  </div>
                  <h3 className="text-black mb-2" style={{ fontSize: "0.9375rem", fontWeight: 500 }}>
                    {t(`features.items.${f.key}.title`)}
                  </h3>
                  <p className="text-black/50" style={{ fontSize: "0.875rem", lineHeight: 1.75 }}>
                    {t(`features.items.${f.key}.desc`)}
                  </p>
                </div>
              </FadeIn>
            );
          })}
        </div>
      </div>
    </section>
  );
}
