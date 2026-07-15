import * as logger from "firebase-functions/logger";
/**
 * functions/src/_helpers.ts — Unified Helper utilities for Firebase Cloud Functions
 */
import { HttpsError } from "firebase-functions/v2/https";
import type { CallableRequest } from "firebase-functions/v2/https";
import { getUserByUid, upsertUserWithRole, isEmailAllowed, isInviteGateEnabled } from "./db";
import type { FsUser } from "./db";
import { ENV } from "./env";

export interface AuthContext {
  uid: string;
  email: string | undefined;
  user: FsUser;
}

/**
 * 認証済みユーザーを取得する。未認証なら UNAUTHENTICATED を throw。
 * ドキュメントが存在しない場合は自動作成（オンザフライ・オンボーディング）する。
 */
export async function requireAuth(request: CallableRequest): Promise<AuthContext> {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "ログインが必要です。");
  }
  const uid = request.auth.uid;
  const email = request.auth.token.email;

  // 1. Email Whitelist Validation (Invite-Only)
  // Fail-closed: emailクレームを持たない認証方式（電話・匿名・カスタムトークン等）を
  // ホワイトリスト検証なしで通過させないため、email未設定は明示的に拒否する。
  // GA(1.0-1): 招待制はキルスイッチ化。通常時（system_config/access 無し/false）は
  // 全ユーザー通過。緊急時に inviteGateEnabled=true を書けば即・招待制へ戻る。
  const isOwner = !!email && email.toLowerCase() === ENV.ownerEmail;
  if (!isOwner) {
    if (!email) {
      throw new HttpsError("permission-denied", "email-required");
    }
    if (await isInviteGateEnabled()) {
      const isAllowed = await isEmailAllowed(email);
      if (!isAllowed) {
        throw new HttpsError("permission-denied", "email-not-allowed");
      }
    }
  }

  // 2. Fetch or Auto-Onboard User
  let user = await getUserByUid(uid);
  if (!user) {
    try {
      await upsertUserWithRole({
        uid,
        name: request.auth.token.name ?? request.auth.token.email ?? "User",
        email: request.auth.token.email ?? null,
        loginMethod: "google",
      });
      user = await getUserByUid(uid);
    } catch (err) {
      logger.error("[requireAuth] Auto-upsert failed:", err);
    }
    
    if (!user) {
      throw new HttpsError("not-found", "ユーザー情報が作成できませんでした。");
    }
  }

  // 3. Account Suspension Check
  if (user.status === "suspended") {
    throw new HttpsError("permission-denied", "account-suspended");
  }

  return { uid, email, user };
}

/**
 * 管理者権限を確認する。
 * Custom Claims の admin: true で判定（Firestore 読み取り不要・高速）。
 */
export async function requireAdmin(request: CallableRequest): Promise<AuthContext> {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "ログインが必要です。");
  }
  if (request.auth.token.admin !== true) {
    throw new HttpsError("permission-denied", "管理者権限が必要です。");
  }
  // admin 確認後に Firestore からユーザー情報を取得
  const ctx = await requireAuth(request);
  return ctx;
}

/**
 * Verifies that the login session is fresh (default max age: 15 minutes).
 * Used for critical administrative operations.
 */
export async function requireFreshAuth(request: CallableRequest, maxAgeSeconds = 900): Promise<AuthContext> {
  const ctx = await requireAuth(request);
  const authTime = request.auth?.token.auth_time;
  if (!authTime) {
    throw new HttpsError("failed-precondition", "Authentication timestamp missing.");
  }
  const age = (Date.now() / 1000) - authTime;
  if (age > maxAgeSeconds) {
    throw new HttpsError("failed-precondition", "reauthentication-required");
  }
  return ctx;
}

/**
 * リクエストヘッダーから国情報を取得する（GeoIP代替）。
 * Cloud Functions は Firebase Hosting 経由で cf-ipcountry ヘッダーを受け取れる。
 */
export function getCountryFromRequest(request: CallableRequest): string | null {
  const raw = request.rawRequest?.headers;
  if (!raw) return null;
  const cf = raw["cf-ipcountry"];
  if (cf) return (Array.isArray(cf) ? cf[0] : cf).toUpperCase();
  const vercel = raw["x-vercel-ip-country"];
  if (vercel) return (Array.isArray(vercel) ? vercel[0] : vercel).toUpperCase();
  return null;
}

/** Zod バリデーションエラーを HttpsError に変換 */
export function zodError(message: string): HttpsError {
  return new HttpsError("invalid-argument", message);
}
