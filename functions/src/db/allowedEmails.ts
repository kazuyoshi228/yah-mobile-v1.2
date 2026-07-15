/**
 * db/allowedEmails.ts — allowed_emails（招待制ホワイトリスト）のリポジトリ（P2・db.ts から無編集移動）
 */
import { collections, queryToArr, db } from "./core";
import type { FsAllowedEmail } from "./core";

/**
 * 招待制ゲートのキルスイッチ（GA・1.0-1）。返金キルスイッチ(refund.ts)と同型。
 * system_config/access.inviteGateEnabled が明示 true のときだけ招待制を適用する。
 * - ドキュメント無し／フィールド無し／false → ゲート開放（一般公開・既定）
 * - 読取エラー → fail-closed（招待制ON）。障害時に無制限開放しない。
 * 緊急時は /admin 権限で system_config/access に { inviteGateEnabled: true } を
 * 書けば再デプロイなしで即・招待制へ戻る。
 */
export async function isInviteGateEnabled(): Promise<boolean> {
  try {
    const snap = await db.collection("system_config").doc("access").get();
    if (!snap.exists) return false; // 既定＝開放（GA）
    return snap.data()?.inviteGateEnabled === true;
  } catch (err) {
    console.error("[allowedEmails] isInviteGateEnabled read failed; failing closed (invite-only):", err);
    return true;
  }
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
