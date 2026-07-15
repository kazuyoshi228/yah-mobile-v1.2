import { describe, it, expect, vi, beforeEach } from "vitest";
import { requireAuth, requireAdmin, requireFreshAuth } from "./_helpers";
import { HttpsError } from "firebase-functions/v2/https";
import * as db from "./db";

// Mock ./db
vi.mock("./db", () => {
  return {
    getUserByUid: vi.fn(),
    upsertUserWithRole: vi.fn(),
    isEmailAllowed: vi.fn(),
    // 既存テストは招待制ONの挙動を検証しているため、既定はゲートON
    isInviteGateEnabled: vi.fn().mockResolvedValue(true),
  };
});

// Mock ./env
vi.mock("./env", () => ({
  ENV: {
    ownerEmail: "owner@example.com"
  }
}));

describe("_helpers authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("requireAuth", () => {
    it("should throw unauthenticated if request.auth is missing", async () => {
      await expect(requireAuth({} as any)).rejects.toThrowError(
        new HttpsError("unauthenticated", "ログインが必要です。")
      );
    });

    it("should throw permission-denied if email is not allowed", async () => {
      (db.isEmailAllowed as any).mockResolvedValue(false);
      const req = {
        auth: { uid: "user1", token: { email: "unauthorized@example.com" } }
      } as any;
      await expect(requireAuth(req)).rejects.toThrowError(
        new HttpsError("permission-denied", "email-not-allowed")
      );
    });

    it("招待制ゲート解放時（GA）は非招待メールでも通過する", async () => {
      (db.isInviteGateEnabled as any).mockResolvedValueOnce(false);
      (db.isEmailAllowed as any).mockResolvedValue(false); // 非招待でも
      (db.getUserByUid as any).mockResolvedValue({ uid: "u1", role: "user", status: "active" });
      const request = { auth: { uid: "u1", token: { email: "anyone@example.com" } } } as any;
      await expect(requireAuth(request)).resolves.toBeTruthy();
      expect(db.isEmailAllowed).not.toHaveBeenCalled(); // ホワイトリスト照会自体をスキップ
    });

    it("should throw permission-denied if the email claim is missing (fail-closed)", async () => {
      // 電話・匿名・カスタムトークン等でemailが無い場合、ホワイトリスト検証を
      // スキップして通過させてはならない。
      const req = {
        auth: { uid: "user1", token: {} }
      } as any;
      await expect(requireAuth(req)).rejects.toThrowError(
        new HttpsError("permission-denied", "email-required")
      );
      expect(db.isEmailAllowed).not.toHaveBeenCalled();
    });

    it("should allow owner email without DB check", async () => {
      (db.getUserByUid as any).mockResolvedValue({ uid: "user1", status: "active" });
      const req = {
        auth: { uid: "user1", token: { email: "owner@example.com" } }
      } as any;
      const result = await requireAuth(req);
      expect(result.uid).toBe("user1");
      expect(db.isEmailAllowed).not.toHaveBeenCalled();
    });

    it("should auto-onboard user if not found in DB", async () => {
      (db.isEmailAllowed as any).mockResolvedValue(true);
      (db.getUserByUid as any).mockResolvedValueOnce(null).mockResolvedValueOnce({ uid: "user1", status: "active" });
      
      const req = {
        auth: { uid: "user1", token: { email: "newuser@example.com", name: "New User" } }
      } as any;
      const result = await requireAuth(req);
      expect(db.upsertUserWithRole).toHaveBeenCalledWith({
        uid: "user1",
        name: "New User",
        email: "newuser@example.com",
        loginMethod: "google",
      });
      expect(result.user).toEqual({ uid: "user1", status: "active" });
    });

    it("should throw permission-denied if user is suspended", async () => {
      (db.isEmailAllowed as any).mockResolvedValue(true);
      (db.getUserByUid as any).mockResolvedValue({ uid: "user1", status: "suspended" });
      const req = {
        auth: { uid: "user1", token: { email: "user@example.com" } }
      } as any;
      await expect(requireAuth(req)).rejects.toThrowError(
        new HttpsError("permission-denied", "account-suspended")
      );
    });
  });

  describe("requireAdmin", () => {
    it("should throw permission-denied if admin claim is missing", async () => {
      const req = {
        auth: { uid: "user1", token: { email: "user@example.com", admin: false } }
      } as any;
      await expect(requireAdmin(req)).rejects.toThrowError(
        new HttpsError("permission-denied", "管理者権限が必要です。")
      );
    });

    it("should pass if admin claim is true", async () => {
      (db.getUserByUid as any).mockResolvedValue({ uid: "admin1", status: "active" });
      const req = {
        auth: { uid: "admin1", token: { email: "owner@example.com", admin: true } }
      } as any;
      const result = await requireAdmin(req);
      expect(result.uid).toBe("admin1");
    });
  });

  describe("requireFreshAuth", () => {
    it("should throw failed-precondition if auth_time is missing", async () => {
      (db.getUserByUid as any).mockResolvedValue({ uid: "user1", status: "active" });
      const req = {
        auth: { uid: "user1", token: { email: "owner@example.com" } }
      } as any;
      await expect(requireFreshAuth(req)).rejects.toThrowError(
        new HttpsError("failed-precondition", "Authentication timestamp missing.")
      );
    });

    it("should throw if auth_time is too old", async () => {
      (db.getUserByUid as any).mockResolvedValue({ uid: "user1", status: "active" });
      const authTime = Math.floor(Date.now() / 1000) - 2000; // 2000 seconds ago (older than 900)
      const req = {
        auth: { uid: "user1", token: { email: "owner@example.com", auth_time: authTime } }
      } as any;
      await expect(requireFreshAuth(req)).rejects.toThrowError(
        new HttpsError("failed-precondition", "reauthentication-required")
      );
    });

    it("should pass if auth_time is fresh", async () => {
      (db.getUserByUid as any).mockResolvedValue({ uid: "user1", status: "active" });
      const authTime = Math.floor(Date.now() / 1000) - 100; // 100 seconds ago
      const req = {
        auth: { uid: "user1", token: { email: "owner@example.com", auth_time: authTime } }
      } as any;
      const result = await requireFreshAuth(req);
      expect(result.uid).toBe("user1");
    });
  });
});
