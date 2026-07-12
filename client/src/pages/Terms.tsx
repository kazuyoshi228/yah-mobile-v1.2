import { useTranslation } from "react-i18next";
import { Link } from "wouter";
import Nav from "@/components/Nav";
import Footer from "@/components/Footer";

export default function Terms() {
  const { t } = useTranslation();

  const sections = [
    {
      title: "1. Scope of Service",
      body: "yah.mobile operates as a reseller of a licensed eSIM platform, handling eSIM sales and delivery. Network quality and connectivity depend on the underlying carrier network conditions. By purchasing an eSIM from yah.mobile, you agree to these Terms of Service.",
    },
    {
      title: "2. Telecommunications Service Provider / 通信役務の提供者",
      body: "The mobile data service associated with eSIMs sold on this site (the \"Service\") is provided by our partner telecommunications carriers (eSIMAccess and its partner carriers; the \"Provider\"). yah.mobile (Bonfire Inc.) is a retailer that sells activation codes for the Service and provides customer support; we are not the provider of the telecommunications service itself. The quality, coverage, interruption or failure of the Service are matters within the Provider's responsibility. We act as a contact point and escalate such inquiries to the Provider. Data balance, validity and similar information shown in your account is retrieved from the Provider's systems and displayed for your convenience.",
      ja: "本サービスで販売する eSIM に係るデータ通信役務（以下「通信役務」）は、当社の提携先である通信事業者（eSIMAccess およびその接続先の通信事業者。以下「提供者」）が提供します。当社（ボンファイア株式会社）は通信役務の提供主体ではなく、そのアクティベーションコード（利用権）の販売および購入者サポートを行う販売店です。通信役務の品質、通信可能区域、通信の中断・障害その他通信役務の提供に関する事項は提供者の責任に属します。当社はこれらに関するお問い合わせについて、提供者への取次ぎを行います。マイページ等に表示されるデータ残量・有効期限等の情報は、提供者のシステムから取得した情報を購入者の便宜のために表示するものです。",
    },
    {
      title: "3. Eligibility / 利用資格",
      body: "You must be 18 years of age or older to purchase an eSIM. By using our service, you represent that you are 18 years of age or older. If you are under 18, you may not use this service. yah.mobile reserves the right to terminate accounts found to be registered by minors.",
      ja: "未成年者（18歳未満）は本サービスを利用することができません。本サービスを利用することで、お客様は18歳以上であることを表明したものとみなします。未成年者による登録が判明した場合、yah.mobileは当該アカウントを停止または削除する権利を有します。",
    },
    {
      title: "4. eSIM Delivery",
      body: "After successful payment, your eSIM QR code will be delivered to your registered email address and made available in your account. Delivery is typically immediate but may take up to 30 minutes in exceptional cases.",
    },
    {
      title: "5. Refund Policy",
      body: "eSIM is a digital product. Once your QR code has been issued, cancellations and refunds are not available. Exception: if we are unable to deliver your eSIM or data top-up due to a technical problem on our side (for example, a system error or a failure of our upstream provider), we will refund your payment in full. In such cases the refund is issued automatically to your original payment method once the failure is confirmed, and no action is required on your part. If your eSIM was delivered but you experience technical issues preventing activation, please contact our support team within 24 hours of purchase. Any refund we make is a refund of the purchase price by us as the seller where we were unable to deliver the product (activation code); it is not a warranty or compensation relating to the quality of the telecommunications service.",
      ja: "当社が行う返金は、当社が商品（アクティベーションコード）を納品できなかった場合における売主としての商品代金の返金であり、通信役務の品質に関する保証または補償ではありません。",
    },
    {
      title: "6. Prohibited Activities",
      body: "Unauthorized use, resale, spam transmission, sending or receiving illegal content, and unauthorized access to the service are strictly prohibited. Violation may result in immediate termination of service without refund.",
    },
    {
      title: "7. Disclaimer",
      body: "yah.mobile is not liable for damages arising from network outages, network quality issues, or device incompatibility. We do not guarantee uninterrupted service. Our liability is limited to the amount paid for the eSIM plan.",
    },
    {
      title: "8. Privacy",
      body: "Your use of yah.mobile is also governed by our Privacy Policy, which is incorporated into these Terms by reference.",
    },
    {
      title: "9. Changes to Terms",
      body: "We reserve the right to modify these Terms at any time. Changes will be posted on this page with an updated date. Continued use of the service after changes constitutes acceptance.",
    },
    {
      title: "10. Governing Law & Jurisdiction",
      body: "These Terms are governed by the laws of Japan. The Fukuoka District Court shall have exclusive jurisdiction as the court of first instance for any disputes arising from these Terms.",
    },
    {
      title: "11. Specified Commercial Transactions Act (特定商取引法)",
      rows: [
        "Seller (販売業者): ボンファイア株式会社 (Bonfire Inc.)",
        "Operations Manager (運営統括責任者): 山田一慶",
        "Address (所在地): Disclosed without delay upon request / 請求により遅滞なく開示します",
        "Phone (電話番号): Disclosed without delay upon request / 請求により遅滞なく開示します",
        "Contact (連絡先): chat.yah.mobi or contact@mail.yah.mobi",
        "Price (販売価格): As displayed at time of purchase (JPY, tax included)",
        "Additional fees (追加手数料): None",
        "Payment (支払方法): Credit/debit card via Stripe",
        "Delivery (引渡時期): Immediate upon payment (QR code delivered to registered email)",
        "Returns/Cancellations (返品・キャンセル): Not accepted after QR code issuance (digital product). Exception: if we cannot deliver the eSIM or top-up due to a technical issue on our side (a system error or an upstream provider failure), the payment is refunded in full — issued automatically to the original payment method once the failure is confirmed. For activation issues after delivery, contact support within 24 hours of purchase.",
      ],
    },
  ];

  return (
    <div className="min-h-screen bg-white flex flex-col">
      <Nav />
      <main className="flex-1 pt-24 pb-24">
        <div className="container max-w-3xl">
          {/* Breadcrumb */}
          <div className="flex items-center gap-2 mb-10 text-[0.75rem] font-sans text-black/35 tracking-[0.04em] uppercase">
            <Link href="/app" className="hover:text-black transition-colors">{t("nav.home")}</Link>
            <span>/</span>
            <span className="text-black/60">{t("footer.terms")}</span>
          </div>

          <p className="text-label text-black/35 mb-3 uppercase tracking-[0.08em]">Legal</p>
          <h1 className="font-sans font-light text-black mb-3" style={{ fontSize: "clamp(2rem, 4vw, 3rem)", lineHeight: 1.1, letterSpacing: "-0.02em" }}>
            Terms of Service
          </h1>
          <p className="font-sans text-black/40 text-[0.8125rem] mb-12">Last updated: July 13, 2026</p>

          {/* Sections */}
          <div className="space-y-0">
            {sections.map((section) => (
              <div key={section.title} className="flex flex-col sm:flex-row gap-6 py-6 border-b border-[#D7D7D7]">
                <p className="font-sans font-medium text-black/40 text-[0.75rem] tracking-[0.04em] sm:w-52 shrink-0">{section.title}</p>
                <div className="flex-1 min-w-0">
                  {section.rows ? (
                    // 特商法：項目ごとに1行（長い1行の塊を解消）
                    <div className="space-y-2">
                      {section.rows.map((row, i) => (
                        <p key={i} className="font-sans text-black/70 text-[0.875rem] leading-[1.7]">{row}</p>
                      ))}
                    </div>
                  ) : (
                    <>
                      <p className="font-sans text-black/70 text-[0.875rem] leading-[1.75]">{section.body}</p>
                      {section.ja && (
                        // 日本語は区切り線＋淡色で分離（英語との塊化を解消）
                        <p className="font-sans text-black/45 text-[0.8125rem] leading-[1.9] mt-4 pt-4 border-t border-black/[0.07]">{section.ja}</p>
                      )}
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Contact */}
          <div className="mt-12 mb-12">
            <p className="font-sans text-black/50 text-[0.875rem] leading-[1.75]">
              For questions about these Terms, please contact us via{" "}
              <a href="https://chat.yah.mobi" target="_blank" rel="noopener noreferrer" className="underline hover:text-black transition-colors">chat.yah.mobi</a>{" "}
              or by email at{" "}
              <a href="mailto:contact@mail.yah.mobi" className="underline hover:text-black transition-colors">contact@mail.yah.mobi</a>.
            </p>
          </div>

          {/* Back */}
          <Link href="/app" className="inline-flex items-center gap-2 font-sans text-black/40 text-[0.8125rem] hover:text-black transition-colors">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="15 18 9 12 15 6" />
            </svg>
            Back to home
          </Link>
        </div>
      </main>
      <Footer />
    </div>
  );
}
