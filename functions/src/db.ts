/**
 * functions/src/db.ts — Unified Firestore Database collections, types, and helper functions
 */
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { getFirebaseDb, getFirebaseAuth } from "./firebase";
import { ENV } from "./env";

export const db = getFirebaseDb();

// ─── Core Utilities ────────────────────────────────────────────────────────────

export function toMs(val: unknown): number {
  if (val instanceof Timestamp) return val.toMillis();
  if (val instanceof Date) return val.getTime();
  if (typeof val === "number") return val;
  return Date.now();
}

export function docToObj<T>(snap: FirebaseFirestore.DocumentSnapshot): T | null {
  if (!snap.exists) return null;
  const data = snap.data()!;
  return { id: snap.id, ...data } as T;
}

export function queryToArr<T>(snap: FirebaseFirestore.QuerySnapshot): T[] {
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as T));
}

export const collections = {
  users: db.collection("users"),
  plans: db.collection("plans"),
  orders: db.collection("orders"),
  esimLinks: db.collection("esim_links"),
  esimActivations: db.collection("esim_activations"),
  bappyTokenCache: db.collection("bappy_token_cache"),
  stripeEvents: db.collection("stripe_events"),
  auditLogs: db.collection("audit_logs"),
  notifications: db.collection("notifications"),
  contactInquiries: db.collection("contact_inquiries"),
  analyticsEvents: db.collection("analytics_events"),
  aiReferrerLogs: db.collection("ai_referrer_logs"),
  recommendLogs: db.collection("recommend_logs"),
  allowedEmails: db.collection("allowed_emails"),
  esimRetryJobs: db.collection("esim_retry_jobs"),
  incidentLogs: db.collection("incident_logs"),
  userConsents: db.collection("user_consents"),
  exchangeRates: db.collection("exchange_rates"),
  promotions: db.collection("promotions"),
  systemStats: db.collection("system_stats"),
};

export { FieldValue };

// ─── Interfaces / Types ───────────────────────────────────────────────────────

import type {
  FsUser,
  FsPlan,
  FsOrder,
  FsEsimLink,
  FsEsimActivation,
  FsStripeEvent,
  FsNotification,
  FsContactInquiry,
  FsAllowedEmail,
  FsEsimRetryJob,
  FsIncidentLog,
  FsUserConsent,
  FsExchangeRate,
  FsPromotion,
  FsSystemStats,
  FsEsimUsageLog,
  FsAnalyticsEvent
} from "../../shared/types";

export type {
  FsUser,
  FsPlan,
  FsOrder,
  FsEsimLink,
  FsEsimActivation,
  FsStripeEvent,
  FsNotification,
  FsContactInquiry,
  FsAllowedEmail,
  FsEsimRetryJob,
  FsIncidentLog,
  FsUserConsent,
  FsExchangeRate,
  FsPromotion,
  FsSystemStats,
  FsEsimUsageLog,
  FsAnalyticsEvent
};

// ─── Users Helpers ────────────────────────────────────────────────────────────

export async function getUserByUid(uid: string): Promise<FsUser | null> {
  const snap = await collections.users.doc(uid).get();
  return docToObj<FsUser>(snap);
}



export async function getUserById(id: string): Promise<FsUser | null> {
  const snap = await collections.users.doc(id).get();
  return docToObj<FsUser>(snap);
}

export async function upsertUser(
  uidOrData: string | (Partial<FsUser> & { uid: string }),
  data?: Partial<FsUser>,
): Promise<FsUser> {
  const uid = typeof uidOrData === "string" ? uidOrData : uidOrData.uid;
  const userData = typeof uidOrData === "string" ? (data ?? {}) : uidOrData;
  const now = Date.now();
  const ref = collections.users.doc(uid);
  const snap = await ref.get();
  if (snap.exists) {
    await ref.update({ ...userData, updatedAt: now, lastSignedIn: now });
  } else {
    await ref.set({
      uid,
      role: "user",
      createdAt: now,
      updatedAt: now,
      lastSignedIn: now,
      ...userData,
    });
  }
  const updated = await ref.get();
  return docToObj<FsUser>(updated)!;
}

export async function updateUser(id: string, data: Partial<FsUser>): Promise<void> {
  await collections.users.doc(id).update({ ...data, updatedAt: Date.now() });
}

export async function getAllUsers(): Promise<FsUser[]> {
  const snap = await collections.users.orderBy("createdAt", "desc").get();
  return queryToArr<FsUser>(snap);
}

export async function upsertUserWithRole(user: {
  uid: string;
  name?: string | null;
  email?: string | null;
  loginMethod?: string | null;
  lastSignedIn?: Date | number | null;
  role?: "user" | "admin";
}): Promise<void> {
  if (!user.uid) throw new Error("User uid is required for upsert");
  const isOwnerEmail = !!user.email && user.email.toLowerCase() === ENV.ownerEmail;
  const role = user.role ?? (isOwnerEmail ? "admin" : "user");
  const lastSignedIn =
    user.lastSignedIn instanceof Date
      ? user.lastSignedIn.getTime()
      : (user.lastSignedIn ?? Date.now());
  await upsertUser(user.uid, {
    name: user.name ?? undefined,
    email: user.email ?? undefined,
    loginMethod: user.loginMethod ?? undefined,
    lastLoginAt: lastSignedIn,
    role,
  });
  // Custom Claims を Firestore role と同期（一本化）
  // role: "admin" → { admin: true }、role: "user" → { admin: false }
  await getFirebaseAuth().setCustomUserClaims(user.uid, { admin: role === "admin" });
}



// ─── Orders Helpers ───────────────────────────────────────────────────────────

export async function createOrder(
  data: Omit<FsOrder, "id" | "createdAt" | "updatedAt" | "status" | "hiddenByUser"> & {
    status?: FsOrder["status"];
    hiddenByUser?: boolean;
  },
): Promise<FsOrder> {
  const now = Date.now();
  const ref = await collections.orders.add({
    status: "pending",
    hiddenByUser: false,
    ...data,
    createdAt: now,
    updatedAt: now,
  });
  const snap = await ref.get();
  return docToObj<FsOrder>(snap)!;
}

export async function getOrderById(id: string, userId?: string): Promise<FsOrder | null> {
  const snap = await collections.orders.doc(id).get();
  const order = docToObj<FsOrder>(snap);
  if (!order) return null;
  if (userId && order.userId !== userId) return null;
  return order;
}

export async function getOrderByStripeSessionId(sessionId: string): Promise<FsOrder | null> {
  const snap = await collections.orders.where("stripeSessionId", "==", sessionId).limit(1).get();
  if (snap.empty) return null;
  return { id: snap.docs[0].id, ...snap.docs[0].data() } as FsOrder;
}

export async function getOrderByStripePaymentIntentId(paymentIntentId: string): Promise<FsOrder | null> {
  const snap = await collections.orders.where("stripePaymentIntentId", "==", paymentIntentId).limit(1).get();
  if (snap.empty) return null;
  return { id: snap.docs[0].id, ...snap.docs[0].data() } as FsOrder;
}

export async function getOrdersByUserId(userId: string): Promise<FsOrder[]> {
  const snap = await collections.orders
    .where("userId", "==", userId)
    .where("hiddenByUser", "==", false)
    .orderBy("createdAt", "desc")
    .get();
  return queryToArr<FsOrder>(snap);
}

export async function getAllOrders(limit = 100): Promise<FsOrder[]> {
  const snap = await collections.orders.orderBy("createdAt", "desc").limit(limit).get();
  return queryToArr<FsOrder>(snap);
}

export async function updateOrder(id: string, data: Partial<FsOrder>): Promise<void> {
  await collections.orders.doc(id).update({ ...data, updatedAt: Date.now() });
}



// ─── eSIM Helpers ─────────────────────────────────────────────────────────────

export async function createEsimLink(
  data: Omit<FsEsimLink, "id" | "createdAt" | "updatedAt" | "status"> & {
    status?: FsEsimLink["status"];
  },
): Promise<FsEsimLink> {
  const now = Date.now();
  const ref = collections.esimLinks.doc(data.bappyLinkUuid);
  await ref.set({ status: "provisioning", ...data, createdAt: now, updatedAt: now });
  const snap = await ref.get();
  return docToObj<FsEsimLink>(snap)!;
}

export async function getEsimLinkByUuid(bappyLinkUuid: string): Promise<FsEsimLink | null> {
  const snap = await collections.esimLinks.doc(bappyLinkUuid).get();
  return docToObj<FsEsimLink>(snap);
}



export async function getEsimLinkByOrderId(orderId: string): Promise<FsEsimLink | null> {
  const snap = await collections.esimLinks.where("orderId", "==", orderId).limit(1).get();
  if (snap.empty) return null;
  return { id: snap.docs[0].id, ...snap.docs[0].data() } as FsEsimLink;
}

export async function getEsimLinksByUserId(userId: string): Promise<FsEsimLink[]> {
  const snap = await collections.esimLinks
    .where("userId", "==", userId)
    .orderBy("createdAt", "desc")
    .get();
  return queryToArr<FsEsimLink>(snap);
}

export async function updateEsimLink(bappyLinkUuid: string, data: Partial<FsEsimLink>): Promise<void> {
  await collections.esimLinks.doc(bappyLinkUuid).update({ ...data, updatedAt: Date.now() });
}



export async function createEsimActivation(data: {
  esimLinkId: string;
  bappyActivationUuid: string;
  bappyPlanId: string;
  activationType: "initial" | "topup";
  expiryDate?: number | null;
  dataRemainingMb?: number | null;
  planName?: string | null;
  totalDataGb?: number | null;
}): Promise<{ id: string; bappyActivationUuid: string }> {
  const now = Date.now();
  const ref = await collections.esimActivations.add({
    ...data,
    status: "active",
    createdAt: now,
    updatedAt: now,
  });
  return { id: ref.id, bappyActivationUuid: data.bappyActivationUuid };
}

export async function getActiveActivationByEsimLinkId(
  esimLinkId: string,
): Promise<{ id: string; bappyActivationUuid: string; bappyPlanId: string; status: string } | null> {
  const snap = await collections.esimActivations
    .where("esimLinkId", "==", esimLinkId)
    .where("status", "==", "active")
    .orderBy("createdAt", "desc")
    .limit(1)
    .get();
  if (snap.empty) return null;
  const d = snap.docs[0];
  return { id: d.id, ...d.data() } as { id: string; bappyActivationUuid: string; bappyPlanId: string; status: string };
}

export async function getBappyToken(): Promise<{ accessToken: string; expiresAt: number } | null> {
  const snap = await collections.bappyTokenCache.doc("singleton").get();
  if (!snap.exists) return null;
  const data = snap.data()!;
  return { accessToken: data.accessToken, expiresAt: data.expiresAt };
}

export async function setBappyToken(accessToken: string, expiresAt: number): Promise<void> {
  await collections.bappyTokenCache.doc("singleton").set({
    accessToken,
    expiresAt,
    updatedAt: Date.now(),
  });
}

export async function getBappyTokenCached(): Promise<string | null> {
  const result = await getBappyToken();
  if (!result) return null;
  if (Date.now() >= result.expiresAt) return null;
  return result.accessToken;
}

export async function setBappyTokenCached(accessToken: string, expiresInSeconds: number): Promise<void> {
  const expiresAt = Date.now() + expiresInSeconds * 1000;
  await setBappyToken(accessToken, expiresAt);
}

export async function createEsimRetryJob(data: Omit<FsEsimRetryJob, "id" | "createdAt" | "updatedAt">): Promise<FsEsimRetryJob> {
  const now = Date.now();
  const expiresAt = data.expiresAt ?? (now + 30 * 24 * 60 * 60 * 1000); // 30 days
  const ref = await collections.esimRetryJobs.add({ ...data, expiresAt, createdAt: now, updatedAt: now });
  const snap = await ref.get();
  return docToObj<FsEsimRetryJob>(snap)!;
}

export async function getPendingEsimRetryJobs(): Promise<FsEsimRetryJob[]> {
  const snap = await collections.esimRetryJobs
    .where("status", "in", ["pending", "retrying"])
    .get();
  return queryToArr<FsEsimRetryJob>(snap);
}

export async function updateEsimRetryJob(id: string, data: Partial<FsEsimRetryJob>): Promise<void> {
  await collections.esimRetryJobs.doc(id).update({ ...data, updatedAt: Date.now() });
}

// ─── Admin Helpers ────────────────────────────────────────────────────────────

export async function getActivePlans(): Promise<FsPlan[]> {
  const snap = await collections.plans.get();
  const all = queryToArr<FsPlan>(snap);
  return all
    .filter((p) => p.isActive === true)
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
}

// NOTE: プランの作成・更新・削除は管理画面から Firestore へ直接書き込む（BaaS First）。
// バックエンドは読み取り専用の getActivePlans（llms.txt 用）のみを保持する。
// かつてドキュメントID == bappyPlanId を前提としたヘルパー群が存在したが、
// 管理画面は自動IDで作成するため規約が二重化していた。全て bappyPlanId フィールド
// クエリに統一し、doc-ID 前提のヘルパーは削除した。

export async function getStripeEvent(stripeEventId: string): Promise<FsStripeEvent | null> {
  const snap = await collections.stripeEvents.doc(stripeEventId).get();
  return docToObj<FsStripeEvent>(snap);
}

export async function isStripeEventProcessed(stripeEventId: string): Promise<boolean> {
  const event = await getStripeEvent(stripeEventId);
  return event?.processed === true;
}

export async function createNotification(
  data: Omit<FsNotification, "id" | "createdAt" | "isRead"> & { isRead?: FsNotification["isRead"] },
): Promise<FsNotification> {
  const now = Date.now();
  const ref = await collections.notifications.add({ isRead: "false", ...data, createdAt: now });
  const snap = await ref.get();
  return docToObj<FsNotification>(snap)!;
}

export async function getNotificationsByUserId(userId: string, limit = 20): Promise<FsNotification[]> {
  const snap = await collections.notifications
    .where("userId", "==", userId)
    .orderBy("createdAt", "desc")
    .limit(limit)
    .get();
  return queryToArr<FsNotification>(snap);
}

export async function markNotificationRead(id: string, _userId?: string): Promise<void> {
  await collections.notifications.doc(id).update({ isRead: "true" });
}

export async function markAllNotificationsRead(userId: string): Promise<void> {
  const snap = await collections.notifications
    .where("userId", "==", userId)
    .where("isRead", "==", "false")
    .get();
  const batch = db.batch();
  snap.docs.forEach((d) => batch.update(d.ref, { isRead: "true" }));
  await batch.commit();
}

export async function getUnreadNotifications(userId: string): Promise<FsNotification[]> {
  const all = await getNotificationsByUserId(userId, 50);
  return all.filter((n) => n.isRead === "false");
}

export async function createContactInquiry(
  data: Omit<FsContactInquiry, "id" | "createdAt" | "updatedAt" | "status"> & { status?: FsContactInquiry["status"] },
): Promise<FsContactInquiry> {
  const now = Date.now();
  const ref = await collections.contactInquiries.add({ ...data, createdAt: now, updatedAt: now });
  const snap = await ref.get();
  return docToObj<FsContactInquiry>(snap)!;
}

export async function getAllContactInquiries(): Promise<FsContactInquiry[]> {
  const snap = await collections.contactInquiries.orderBy("createdAt", "desc").get();
  return queryToArr<FsContactInquiry>(snap);
}

export async function updateContactInquiry(id: string, data: Partial<FsContactInquiry>): Promise<void> {
  await collections.contactInquiries.doc(id).update({ ...data, updatedAt: Date.now() });
}

export async function listInquiries(params?: {
  status?: "pending" | "in_progress" | "resolved" | "closed";
  limit?: number;
  offset?: number;
}): Promise<{ rows: FsContactInquiry[]; total: number }> {
  const all = await getAllContactInquiries();
  const filtered = params?.status ? all.filter((i) => i.status === params.status) : all;
  const total = filtered.length;
  const offset = params?.offset ?? 0;
  const limit = params?.limit ?? 50;
  const rows = filtered.slice(offset, offset + limit);
  return { rows, total };
}

export async function updateInquiry(
  id: string,
  data: { status: "pending" | "in_progress" | "resolved" | "closed"; note?: string },
): Promise<void> {
  await updateContactInquiry(id, data);
}

export async function isEmailAllowed(email: string): Promise<boolean> {
  const snap = await collections.allowedEmails.doc(email.toLowerCase()).get();
  return snap.exists;
}

export async function getAllowedEmails(): Promise<FsAllowedEmail[]> {
  const snap = await collections.allowedEmails.orderBy("createdAt", "desc").get();
  return queryToArr<FsAllowedEmail>(snap);
}

export async function addAllowedEmail(
  emailOrData: string | { email: string; note?: string | null },
  note?: string,
): Promise<void> {
  const email = typeof emailOrData === "string" ? emailOrData : emailOrData.email;
  const noteVal = typeof emailOrData === "string" ? note : (emailOrData.note ?? undefined);
  const lower = email.toLowerCase();
  await collections.allowedEmails.doc(lower).set({
    email: lower,
    note: noteVal ?? null,
    createdAt: Date.now(),
  });
}

export async function removeAllowedEmail(email: string): Promise<void> {
  await collections.allowedEmails.doc(email.toLowerCase()).delete();
}

export async function deleteAllowedEmail(id: string): Promise<void> {
  await removeAllowedEmail(id);
}


export async function insertAuditLog(data: {
  actorId?: string | null;
  action: string;
  targetTable: string;
  targetId: string;
  diff?: Record<string, unknown> | null;
  ipAddress?: string | null;
}): Promise<void> {
  await collections.auditLogs.add({ ...data, createdAt: Date.now() });
}

export async function createIncidentLogDoc(data: Omit<FsIncidentLog, "id" | "createdAt" | "updatedAt">): Promise<FsIncidentLog> {
  const now = Date.now();
  const ref = await collections.incidentLogs.add({ ...data, createdAt: now, updatedAt: now });
  const snap = await ref.get();
  return docToObj<FsIncidentLog>(snap)!;
}

export async function createIncidentLog(data: {
  type: string;
  severity: "critical" | "warning" | "info";
  title: string;
  detail?: string | null;
  orderId?: string | null;
  userId?: string | null;
}): Promise<string> {
  const log = await createIncidentLogDoc({
    ...data,
    status: "open",
    notifiedOwner: false,
    notifiedOmax: false,
  });
  return log.id;
}

export async function getOpenIncidentLogs(): Promise<FsIncidentLog[]> {
  const snap = await collections.incidentLogs
    .where("status", "==", "open")
    .orderBy("createdAt", "desc")
    .get();
  return queryToArr<FsIncidentLog>(snap);
}

export async function getIncidentLogs(limit = 50): Promise<FsIncidentLog[]> {
  const snap = await getOpenIncidentLogs();
  return snap.slice(0, limit);
}

export async function getOpenIncidents(): Promise<FsIncidentLog[]> {
  return getOpenIncidentLogs();
}

export async function updateIncidentLog(id: string, data: Partial<FsIncidentLog>): Promise<void> {
  await collections.incidentLogs.doc(id).update({ ...data, updatedAt: Date.now() });
}

export async function resolveIncident(id: string, resolvedBy = "system"): Promise<void> {
  await updateIncidentLog(id, { status: "auto_resolved", resolvedAt: Date.now(), resolvedBy });
}

export async function markIncidentNotified(id: string, channel: "owner" | "omax"): Promise<void> {
  if (channel === "owner") {
    await updateIncidentLog(id, { notifiedOwner: true });
  } else {
    await updateIncidentLog(id, { notifiedOmax: true });
  }
}

export async function createUserConsent(data: Omit<FsUserConsent, "id">): Promise<FsUserConsent> {
  const ref = await collections.userConsents.add(data);
  const snap = await ref.get();
  return docToObj<FsUserConsent>(snap)!;
}

export async function getUserConsents(userId: string): Promise<FsUserConsent[]> {
  const snap = await collections.userConsents.where("userId", "==", userId).get();
  return queryToArr<FsUserConsent>(snap);
}

export async function recordConsents(data: {
  userId: string;
  termsGranted: boolean;
  privacyGranted: boolean;
  marketingGranted: boolean;
  version: string;
  ipAddress?: string;
  userAgent?: string;
}): Promise<void> {
  const now = Date.now();
  await Promise.all([
    createUserConsent({
      userId: data.userId,
      consentType: "terms",
      version: data.version,
      granted: data.termsGranted,
      ipAddress: data.ipAddress ?? null,
      userAgent: data.userAgent ?? null,
      consentedAt: now,
    }),
    createUserConsent({
      userId: data.userId,
      consentType: "privacy",
      version: data.version,
      granted: data.privacyGranted,
      ipAddress: data.ipAddress ?? null,
      userAgent: data.userAgent ?? null,
      consentedAt: now,
    }),
    createUserConsent({
      userId: data.userId,
      consentType: "marketing",
      version: data.version,
      granted: data.marketingGranted,
      ipAddress: data.ipAddress ?? null,
      userAgent: data.userAgent ?? null,
      consentedAt: now,
    }),
  ]);
}

export async function createAnalyticsEvent(
  data: Omit<FsAnalyticsEvent, "id" | "createdAt">,
): Promise<void> {
  await collections.analyticsEvents.add({ ...data, createdAt: Date.now() });
}

export async function createAiReferrerLog(data: {
  botName: string;
  path: string;
  userAgent?: string | null;
  ipHash?: string | null;
}): Promise<void> {
  await collections.aiReferrerLogs.add({ ...data, createdAt: Date.now() });
}

export async function createRecommendLog(data: {
  usage?: string | null;
  purpose?: string | null;
  recommendedPlanId?: string | null;
  sessionId?: string | null;
}): Promise<string> {
  const ref = await collections.recommendLogs.add({
    ...data,
    actualPlanId: null,
    matched: "pending",
    createdAt: Date.now(),
  });
  return ref.id;
}

export async function updateRecommendLog(id: string, data: { actualPlanId?: string; matched?: "true" | "false" | "pending" }): Promise<void> {
  await collections.recommendLogs.doc(id).update(data);
}

export async function createRetryJob(data: {
  orderId: string;
  userId: string;
  bappyPlanId: string;
  stripeSessionId: string;
  isTopup: boolean;
  parentOrderId?: string | null;
  esimLinkUuid?: string | null;
  maxRetries?: number;
}): Promise<string> {
  const job = await createEsimRetryJob({
    ...data,
    retryCount: 0,
    maxRetries: data.maxRetries ?? 5,
    status: "pending",
    lastError: null,
    nextRetryAt: null,
    resolvedAt: null,
  });
  return job.id;
}

export async function getPendingRetryJobs(): Promise<FsEsimRetryJob[]> {
  return getPendingEsimRetryJobs();
}

export async function getRetryJobs(limit = 50): Promise<FsEsimRetryJob[]> {
  const pending = await getPendingEsimRetryJobs();
  return pending.slice(0, limit);
}

export async function updateRetryJob(
  id: string,
  data: Partial<Pick<FsEsimRetryJob, "status" | "retryCount" | "lastError" | "nextRetryAt" | "resolvedAt" | "parentOrderId">>,
): Promise<void> {
  await updateEsimRetryJob(id, data);
}

// ─── System Stats Helpers ─────────────────────────────────────────────────────
export async function incrementSystemStats(amountJpy: number): Promise<void> {
  const ref = collections.systemStats.doc("global");
  await ref.set(
    {
      totalRevenueJpy: FieldValue.increment(amountJpy),
      totalOrders: FieldValue.increment(1),
      updatedAt: Date.now(),
    },
    { merge: true },
  );
}
