import { useRef, useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslation } from "react-i18next";
import { doc } from "firebase/firestore";
import { getFirebaseDb } from "@/lib/firebase";
import { useFirestoreDoc } from "@/hooks/useFirestoreCollection";

const FIXED_COL_KEY = "service";

/** DBが空 / 読み込み中のフォールバック（従来のハードコード値） */
const FALLBACK = {
  columns: [
    { colKey: "service", label: "Service" },
    { colKey: "plan", label: "Plan" },
    { colKey: "estPrice", label: "Est. Price" },
    { colKey: "pricePerGb", label: "Price/GB" },
    { colKey: "support", label: "Support" },
    { colKey: "network", label: "Network" },
  ],
  rows: [
    { service: "yah.mobile", plan: "7 days / 3GB", estPrice: "¥1,350", pricePerGb: "¥450/GB", support: "24/7 multilingual", network: "NTT docomo (4G LTE)", highlight: true },
    { service: "Airalo", plan: "7 days / 3GB", estPrice: "¥1,700", pricePerGb: "¥567/GB", support: "Email only", network: "IIJmio", highlight: false },
    { service: "Holafly", plan: "7 days / Unlimited", estPrice: "¥3,200", pricePerGb: "—", support: "Chat", network: "Softbank", highlight: false },
    { service: "Ubigi", plan: "30 days / 10GB", estPrice: "¥3,500", pricePerGb: "¥350/GB", support: "Email", network: "NTT Docomo", highlight: false },
    { service: "Mobal", plan: "30 days / 10GB", estPrice: "¥4,200", pricePerGb: "¥420/GB", support: "Email", network: "NTT Docomo", highlight: false },
  ] as Array<Record<string, string | boolean>>,
};

type DisplayTable = {
  columns: { colKey: string; label: string }[];
  rows: Array<Record<string, string | boolean>>;
};

type RawTableDoc = {
  id: string;
  columns: Array<{ id: string; label: string; isActive: string | boolean; sortOrder?: number }>;
  rows: Array<{
    serviceName: string;
    isActive: string | boolean;
    isHighlight: string | boolean;
    sortOrder?: number;
    cells?: Record<string, string>;
  }>;
  /** 管理タブでの保存時刻（＝他社価格に変動があって表を更新した時刻）。 */
  updatedAt?: number;
};

export default function ComparisonTable() {
  const { t, i18n } = useTranslation();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [showHint, setShowHint] = useState(true);

  // BaaSネイティブ: competitorPlans/main の単一ドキュメントをリアルタイム購読
  const { data: rawTable } = useFirestoreDoc<RawTableDoc>(
    () => doc(getFirebaseDb(), "competitorPlans", "main"),
    [],
  );

  const table: DisplayTable = useMemo(() => {
    // rawTable が存在しない（未作成）または不正な場合は FALLBACK を返す
    if (!rawTable || !rawTable.columns || !rawTable.rows) return FALLBACK;
    
    // アクティブな列のみ抽出し、sortOrderでソート
    const activeColumns = [...rawTable.columns]
      .filter(c => c.isActive === "true" || c.isActive === true)
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
      .map(c => ({ colKey: c.id, label: c.label }));
      
    // アクティブな行のみ抽出し、sortOrderでソート
    const activeRows = [...rawTable.rows]
      .filter(r => r.isActive === "true" || r.isActive === true)
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
      .map(r => {
        const rec: Record<string, string | boolean> = {
          service: r.serviceName,
          highlight: r.isHighlight === true || r.isHighlight === "true",
        };
        for (const col of activeColumns) {
          if (col.colKey === FIXED_COL_KEY) continue;
          rec[col.colKey] = r.cells?.[col.colKey] ?? "—";
        }
        return rec;
      });

    return { columns: activeColumns, rows: activeRows };
  }, [rawTable]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const handleScroll = () => {
      if (el.scrollLeft + el.clientWidth >= el.scrollWidth - 8) setShowHint(false);
    };
    const checkOverflow = () => setShowHint(el.scrollWidth > el.clientWidth);
    el.addEventListener("scroll", handleScroll, { passive: true });
    checkOverflow();
    window.addEventListener("resize", checkOverflow);
    return () => {
      el.removeEventListener("scroll", handleScroll);
      window.removeEventListener("resize", checkOverflow);
    };
  }, [table.rows.length, table.columns.length]);

  // 表の更新日。他社価格に変動が無い日は保存が走らないため、これは「最終確認日」ではなく
  // 「最後に価格が動いて表を更新した日」。文言（checkSchedule）側でその関係を明示している。
  // rawTable が無い間は FALLBACK 表示なので、日付は出さない。
  const lastUpdated = rawTable?.updatedAt
    ? new Date(rawTable.updatedAt).toLocaleDateString(i18n.language, {
        timeZone: "Asia/Tokyo",
        year: "numeric",
        month: "short",
        day: "numeric",
      })
    : null;

  return (
    <>
    <div className="mt-12 relative">
      <div ref={scrollRef} className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr>
              {table.columns.map((col) => (
                <th
                  key={col.colKey}
                  className="text-label bg-black text-white px-4 py-3 text-left font-normal whitespace-nowrap"
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.rows.map((row, i) => {
              const highlight = row.highlight === true;
              return (
                <tr key={i} className={highlight ? "bg-black text-white" : "bg-white/60"}>
                  {table.columns.map((col, ci) => {
                    const value = row[col.colKey];
                    const isService = col.colKey === FIXED_COL_KEY || ci === 0;
                    if (isService) {
                      return (
                        <td
                          key={col.colKey}
                          className={`font-sans px-4 py-3.5 border-b border-[#D7D7D7] whitespace-nowrap ${
                            highlight ? "font-medium text-white" : "font-normal"
                          }`}
                        >
                          {String(value ?? "")}
                        </td>
                      );
                    }
                    const isPrice = col.colKey === "pricePerGb";
                    return (
                      <td
                        key={col.colKey}
                        className={`font-sans px-4 py-3.5 border-b border-[#D7D7D7] text-[0.875rem] ${
                          highlight ? "text-white/85" : "text-black/60"
                        }`}
                      >
                        {isPrice && highlight ? (
                          <>
                            <div>{String(value ?? "")}</div>
                            <span className="inline-block mt-1 font-sans font-medium text-[9px] tracking-wider bg-white text-black px-1.5 py-0.5">
                              BEST VALUE
                            </span>
                          </>
                        ) : (
                          String(value ?? "")
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <AnimatePresence>
        {showHint && (
          <motion.div
            initial={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4 }}
            className="pointer-events-none absolute inset-y-0 right-0 w-20 flex items-center justify-end"
          >
            <div className="absolute inset-0 bg-gradient-to-r from-transparent to-[#F7F7F7]" />
            <div className="relative flex items-center gap-1 pr-2 font-sans font-medium text-[0.6rem] tracking-[0.15em] uppercase text-black/45">
              <span>Scroll</span>
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M2 6h8M7 3l3 3-3 3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
    {/* 毎日の価格確認と、表の更新日。景表法の打消し表示（AppPage の disclaimer）はこの下に続く。 */}
    <p className="font-sans text-black/45 mt-4 text-[0.75rem] leading-[1.6]">
      {t("priceComparison.checkSchedule")}
      {lastUpdated && <> {t("priceComparison.lastUpdated", { date: lastUpdated })}</>}
    </p>
    </>
  );
}
