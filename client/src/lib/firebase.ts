/**
 * firebase.ts — クライアント側 Firebase Auth
 *
 * 設計:
 *   authDomain はアプリと同一オリジン（yah.mobi）にする（Google同意画面のドメイン表示を yah.mobi に、
 *   かつ Safari ITP/3rd-party cookie 制約を回避）。
 *   ログインは PC=Popup / モバイル=Redirect（モバイルは popup がブロック/WebViewで不安定なため）。
 *   同一オリジン authDomain なら Redirect が ITP 問題なく動く。
 *   Firebase が保持する ID Token を Callable 呼び出しの認証に載せる。
 */
import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from "firebase/app-check";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signOut,
  onAuthStateChanged,
  setPersistence,
  browserLocalPersistence,
  type Auth,
  type User,
} from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";
import { getStorage, type FirebaseStorage } from "firebase/storage";

function buildFirebaseConfig() {
  return {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyDlX00FbPP_Ij709LN0Xtrc26VjFh-57Js",
    // 同一オリジン化で同意画面ドメイン=yah.mobi＋Redirect安定化。ロールバックは env で firebaseapp.com に戻せる。
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "yah.mobi",
    projectId: "yah-mobile-v1-3ed24",
    storageBucket: "yah-mobile-v1-3ed24.firebasestorage.app",
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "904818392772",
    appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:904818392772:web:db8ebf07f4552712801391",
  };
}

let app: FirebaseApp;
let auth: Auth;
let firestoreDb: Firestore;
let storageInstance: FirebaseStorage;

let appCheckInitialized = false;
/**
 * App Check を一度だけ初期化する（reCAPTCHA Enterprise）。
 * VITE_RECAPTCHA_ENTERPRISE_SITE_KEY が未設定の場合は初期化しない
 * （キー未配布の環境で画面を壊さないため。サーバー強制前は無害）。
 */
function initAppCheckOnce(app: FirebaseApp): void {
  if (appCheckInitialized) return;
  appCheckInitialized = true;
  const siteKey = import.meta.env.VITE_RECAPTCHA_ENTERPRISE_SITE_KEY as string | undefined;
  if (!siteKey) return;
  // ローカル開発ではデバッグトークンを使う（Console で登録して許可する）
  if (import.meta.env.DEV) {
    (self as unknown as Record<string, unknown>).FIREBASE_APPCHECK_DEBUG_TOKEN = true;
  }
  try {
    initializeAppCheck(app, {
      provider: new ReCaptchaEnterpriseProvider(siteKey),
      isTokenAutoRefreshEnabled: true,
    });
  } catch (e) {
    // 二重初期化など。動作は継続する。
    console.warn("[AppCheck] init skipped:", e);
  }
}

export function getFirebaseApp(): FirebaseApp {
  const existing = getApps();
  const app = existing.length > 0 ? existing[0] : initializeApp(buildFirebaseConfig());
  initAppCheckOnce(app);
  return app;
}

export function getFirebaseAuth(): Auth {
  if (!auth) {
    app = getFirebaseApp();
    auth = getAuth(app);
    void setPersistence(auth, browserLocalPersistence).catch(() => {});
    // モバイル Redirect ログインの復帰結果を処理する（成功時は onAuthStateChanged が拾う。
    // ここでは主にエラー捕捉。未ログイン/非redirectでは null が返るだけで無害）。
    void getRedirectResult(auth).catch((e) => console.warn("[Auth] getRedirectResult:", e));
  }
  return auth;
}

export function getFirebaseDb(): Firestore {
  if (!firestoreDb) {
    firestoreDb = getFirestore(getFirebaseApp());
  }
  return firestoreDb;
}

export const db = { get current(): Firestore { return getFirebaseDb(); } };

/**
 * Firebase Storage インスタンスを取得する（シングルトン）。
 * ユーザーアップロード機能を実装する際はこの関数を使用する。
 */
export function getFirebaseStorage(): FirebaseStorage {
  if (!storageInstance) {
    storageInstance = getStorage(getFirebaseApp());
  }
  return storageInstance;
}

const googleProvider = new GoogleAuthProvider();
googleProvider.addScope("email");
googleProvider.addScope("profile");
googleProvider.setCustomParameters({ prompt: "select_account" });

/** モバイル端末/WebView 判定（popup が不安定なため Redirect に切り替える）。 */
function isMobileBrowser(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Android|iPhone|iPad|iPod|Mobile|FBAN|FBAV|Line|Instagram/i.test(navigator.userAgent);
}

/**
 * Google サインイン。
 * - PC：Popup（ページ遷移しない）。
 * - モバイル/WebView：Redirect（popup ブロック/WebView 不安定を回避）。同一オリジン authDomain のため
 *   Safari ITP でも安定。Redirect はページ遷移するため戻り値なし＝復帰後 onAuthStateChanged で確定。
 */
export async function signInWithGoogle(): Promise<User | void> {
  const auth = getFirebaseAuth();
  if (isMobileBrowser()) {
    await signInWithRedirect(auth, googleProvider);
    return; // ページ遷移する
  }
  const result = await signInWithPopup(auth, googleProvider);
  return result.user;
}

/** サインアウト。 */
export async function signOutFirebase(): Promise<void> {
  await signOut(getFirebaseAuth());
}

/**
 * 現在のユーザーの Firebase ID Token を取得する（未ログインなら null）。
 */
export async function getIdToken(forceRefresh = false): Promise<string | null> {
  const user = getFirebaseAuth().currentUser;
  if (!user) return null;
  return user.getIdToken(forceRefresh);
}

/** 認証状態の購読。useAuth から利用する。 */
export function subscribeAuthState(
  callback: (user: User | null) => void
): () => void {
  return onAuthStateChanged(getFirebaseAuth(), callback);
}

export type { User as FirebaseUser };
