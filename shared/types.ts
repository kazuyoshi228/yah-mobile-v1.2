/**
 * FsUser — Firestore users コレクションのドキュメント型（サーバー/クライアント共通の唯一の定義）。
 * クライアント側は shared/userTypes.ts から再エクスポートを参照する。
 */
export interface FsUser {
  id: string; // Firestore doc ID = Firebase UID
  uid: string; // Firebase UID (same as id)
  email?: string | null;
  name?: string | null;
  role: "user" | "admin";
  status?: "active" | "suspended" | null;
  loginMethod?: string | null;
  // プロフィール
  fullName?: string | null;
  nationality?: string | null;
  age?: number | null;
  phoneNumber?: string | null;
  preferredLanguage?: string | null;
  marketing?: {
    utmSource?: string;
    utmMedium?: string;
    utmCampaign?: string;
    referralCode?: string;
  } | null;
  demographics?: {
    locale?: string;
    timezone?: string;
    country?: string;
  } | null;
  device?: {
    deviceModel?: string;
    osVersion?: string;
    appVersion?: string;
  } | null;
  preferences?: {
    emailMarketing?: boolean;
    pushNotifications?: boolean;
  } | null;
  metrics?: {
    ltvJpy?: number;
    orderCount?: number;
    lastPurchaseDate?: number;
  } | null;
  stripeCustomerId?: string | null;
  // Firestore Timestamp（クライアントが serverTimestamp() で書き込み、functions は .toMillis() で読む）
  sessionRevokedAt?: { toMillis(): number } | null;
  lastSignedIn?: number;
  lastLoginAt?: number | null;
  createdAt: number;
  updatedAt: number;
}

export interface FsPlan {
  id: string;
  bappyPlanId: string;
  planType?: string | null;
  name: string;
  dataGb: number;
  validityDays: number;
  priceJpy: number;
  coverageCountries?: string[] | null;
  sponsorProfile?: string | null;
  isActive: boolean;
  recommendedFor?: string | null;
  isPopular: boolean;
  sortOrder: number;
  description?: string | null;
  createdAt: number;
  updatedAt: number;
  // ── プロバイダ抽象化（柱2 / eSIMAccess）。既存Bappyプランでは未設定（=bappy扱い） ──
  provider?: "esimaccess" | "bappy" | null;
  providerPlanId?: string | null; // eSIMAccess packageCode（発注時に使用）
  slug?: string | null;
  wholesalePriceUsd?: number | null; // 卸価格（USD）。JPY小売は priceJpy に設定する
  network?: string | null; // 例: "NTT docomo"
  networkType?: string | null; // 例: "5G"/"4G"
  ipExport?: string | null; // 出口IP。例: "JP"/"HK"/"SG"
  speed?: string | null;
  supportTopUpType?: number | null;
  fupPolicy?: string | null;
  activeType?: number | null;
  topupForBase?: string[] | null; // planType==="topup" のとき、対応するベース packageCode 群
}

export interface FsOrder {
  id: string;
  userId: string;
  planId: string;
  bappyPlanId: string;
  status: "pending" | "paid" | "provisioning" | "pending_retry" | "fulfilled" | "failed" | "refunded" | "cancelled";
  amountJpy: number;
  discountAmount?: number | null;
  promoCode?: string | null;
  stripePaymentIntentId?: string | null;
  stripeSessionId?: string | null;
  checkoutUrl?: string | null;
  guestEmail?: string | null;
  guestToken?: string | null;
  hiddenByUser: boolean;
  purchaseCountry?: string | null;
  purchaseCity?: string | null;
  purchaseTimezone?: string | null;
  planName?: string | null;
  gaClientId?: string | null;
  esimLinkUuid?: string | null;
  orderType?: string | null;
  /** 発行プロバイダ（柱2）。未設定は "bappy" 互換。新規販売は "esimaccess"。 */
  provider?: "esimaccess" | "bappy" | null;
  userEmail?: string | null;
  userName?: string | null;
  discountPercentage?: number | null;
  /** 購入時のUI言語（i18n.language）。返金/通知メールの言語判定に使う。未設定は en 扱い。 */
  language?: string | null;
  /** 返金状態。返金の実行/確定は Stripe charge.refunded webhook を真実源とする。 */
  refundStatus?: "none" | "processing" | "refunded" | "failed" | null;
  stripeRefundId?: string | null;
  /** 返金理由。"system_failure"（Lane A自動）/ "manual"（Lane B）等。 */
  refundReason?: string | null;
  /** 返金確定時刻（epoch ms）。 */
  refundedAt?: number | null;
  createdAt: number;
  updatedAt: number;
}

export interface FsEsimLink {
  id: string;
  orderId: string;
  userId: string;
  bappyLinkUuid: string;
  /** 発行プロバイダ（柱2）。未設定は "bappy" 互換。 */
  provider?: "esimaccess" | "bappy" | null;
  /** プロバイダ非依存の安定参照（bappy=uuid／esimaccess=esimTranNo）。既存は bappyLinkUuid を継続利用。 */
  providerRef?: string | null;
  iccid: string;
  lpaProfile: string;
  appleActivationUrl?: string | null;
  androidActivationUrl?: string | null;
  dataRemainingMb?: number | null;
  dataTotalMb?: number | null;
  expiryDate?: number | null;   // epoch ms（Bappy の ISO は書込直前に変換）※旧データは string の場合あり（移行対象）
  status: "active" | "inactive" | "expired" | "provisioning" | "failed";
  qrCodeUrl?: string | null;
  lastActiveAt?: number | null;
  installedDeviceModel?: string | null;
  planId?: string | null;
  planName?: string | null;
  totalDataGb?: number | null;
  createdAt: number;
  updatedAt: number;
}

export interface FsEsimActivation {
  id: string;
  esimLinkId: string;
  bappyActivationUuid: string;
  bappyPlanId: string;
  status: "active" | "expired" | "cancelled";
  expiryDate?: number | null;
  dataRemainingMb?: number | null;
  activationType: "initial" | "topup";
  planName?: string | null;
  totalDataGb?: number | null;
  createdAt: number;
  updatedAt: number;
}

export interface FsStripeEvent {
  id: string;
  stripeEventId: string;
  eventType: string;
  processed: boolean;
  note?: string | null;
  createdAt: number;
  expiresAt?: number | null;
}

export interface FsNotification {
  id: string;
  userId: string;
  title: string;
  body: string;
  type: "order_delayed" | "order_fulfilled" | "order_failed" | "topup_success" | "data_threshold_80" | "data_threshold_100" | "refund_completed" | "system";
  isRead: "true" | "false";
  orderId?: string | null;
  createdAt: number;
}

export interface FsContactInquiry {
  id: string;
  name: string;
  email: string;
  location?: string | null;
  category?: string | null;
  detail?: string | null;
  message: string;
  status: "pending" | "in_progress" | "resolved" | "closed";
  note?: string | null;
  userId?: string | null;
  orderId?: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface FsAllowedEmail {
  id: string;
  email: string;
  note?: string | null;
  createdAt: number;
}

export interface FsEsimRetryJob {
  id: string;
  orderId: string;
  userId: string;
  bappyPlanId: string;
  provider?: "esimaccess" | "bappy" | null; // 柱2: 再試行を正しいプロバイダで実行するため
  stripeSessionId: string;
  isTopup: boolean;
  parentOrderId?: string | null;
  esimLinkUuid?: string | null;
  retryCount: number;
  maxRetries: number;
  status: string;
  lastError?: string | null;
  nextRetryAt?: number | null;
  expiresAt?: number | null;
  resolvedAt?: number | null;
  createdAt: number;
  updatedAt: number;
}

export interface FsIncidentLog {
  id: string;
  type?: string; // 正規フィールド（新規書き込みはこちらを使う）
  incidentType?: string; // 旧フィールド（過去ドキュメントの読み取り互換のため残置・新規では使わない）
  severity: string;
  title?: string;
  detail?: string | null;
  status: string;
  orderId?: string | null;
  userId?: string | null;
  errorMessage?: string;
  errorStack?: string | null;
  context?: Record<string, unknown> | null;
  resolvedAt?: number | null;
  resolutionNote?: string | null;
  resolvedBy?: string | null;
  notifiedOwner?: boolean | null;
  notifiedOmax?: boolean | null;
  createdAt: number;
  updatedAt: number;
}

export interface FsUserConsent {
  id: string;
  userId: string;
  consentType?: string | null;   // "terms" | "privacy" | "marketing" | "purchase"
  version?: string | null;
  granted?: boolean;
  ipAddress?: string | null;
  userAgent?: string | null;
  consentedAt?: number;
  createdAt?: number;
}

export interface FsExchangeRate {
  id: string;
  currency: string;
  rateToJpy: number;
  source: string;
  createdAt: number;
}

export interface FsPromotion {
  id: string;
  code: string;
  discountType: "percentage" | "fixed";
  discountValue: number;
  isActive: boolean;
  maxUses?: number | null;
  currentUses: number;
  expiresAt?: number | null;
  createdAt: number;
  updatedAt: number;
}

export interface FsSystemStats {
  id: string;
  totalRevenueJpy: number;
  totalOrders: number;
  totalUsers?: number;   // DB-10: 将来カウントアップ予定（未設定のことがある）
  activeEsims?: number;  // 同上
  updatedAt: number;     // incrementSystemStats が書き込む実体
}

export interface FsEsimUsageLog {
  id: string;
  timestamp: number;
  eventType: "data_threshold_80" | "data_depleted" | "esim_installed" | "activation_started" | "status_changed" | "other";
  dataRemainingMb?: number | null;
  detail?: string | null;
}

/** analytics_events に記録するイベント名（クライアント trackEvent 由来の想定値） */
export type AnalyticsEventName =
  | "page_view"
  | "plan_tab_click"
  | "plan_select"
  | "checkout_start"
  | "order_complete";

export interface FsAnalyticsEvent {
  id: string;
  eventName: string; // 実体はクライアント供給の文字列（想定値は AnalyticsEventName）
  properties?: Record<string, string | number | boolean | null>;
  sessionId: string;
  userId?: string | null;
  page?: string | null;
  referrer?: string | null;
  userAgent?: string | null;
  language?: string | null;
  createdAt: number;
}
