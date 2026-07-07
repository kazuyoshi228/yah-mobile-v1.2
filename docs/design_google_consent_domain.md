# 設計書：Googleログイン同意画面のドメイン表示（firebaseapp.com → yah.mobi）

対象ブランチ: `dev` ／ 作成: 2026-07-07 ／ ステータス: **設計（要承認→実装。方式A/Bの選択待ち）**
関連: v0.51計画（ver.1 §8で「別テーマ」として保留 → 本書で着手）

## 背景・目的
`signInWithPopup` の Google 同意/アカウント選択画面に「**yah-mobile-v1-3ed24.firebaseapp.com に移動**」と表示され、ブランド・信頼感を損なう。表示を **yah.mobile / yah.mobi** に改善する。

## 現状（実コードで確認）
- `client/src/lib/firebase.ts` L28：`authDomain: "yah-mobile-v1-3ed24.firebaseapp.com"`（**ハードコード**、env化されていない）。
- サインイン：`signInWithPopup`（Redirect は不使用）。L112 `signInWithGoogle()`。
- yah.mobi は本プロジェクトの Hosting カスタムドメイン（本番サイト）＝ `/__/auth/handler` 等の予約パスを自動配信可能。
- `firebase.json` の CSP `frame-src` に `https://yah-mobile-v1-3ed24.firebaseapp.com` はあるが **`'self'` / `https://yah.mobi` は無い**（方式Bで関係）。

---

## 方式は2つ（安全度・効果が異なる）

### 方式A：OAuth同意画面の「アプリ名」を設定（コンソールのみ・ゼロコード・低リスク）★推奨の第一歩
Google の同意画面は「**続行するには {アプリ名} …**」を表示する。アプリ名が未設定/既定だとプロジェクトドメイン（firebaseapp.com）が出る。
- **Google Cloud Console → APIs & Services → OAuth consent screen** で **アプリ名 = 「yah.mobile」**、承認済みドメインに `yah.mobi`、サポートメール等を設定。
- 効果：「…firebaseapp.com に移動」→「**yah.mobile に移動**」。**コード変更・authDomain変更・CSP変更なし＝サインインを壊すリスクなし**。
- 限界：表示は「yah.mobile（アプリ名）」であって、URLドメインそのものを yah.mobi に変えるわけではない。多くの場合これで十分。

### 方式B：`authDomain` を yah.mobi に切り替え（ドメイン自体を変更・要注意）
同意フロー自体を yah.mobi 上で走らせ、ドメイン表示を literally `yah.mobi` にする。
- **コード**：`firebase.ts` の `authDomain` を `"yah.mobi"` に（推奨：`VITE_FIREBASE_AUTH_DOMAIN` でenv化し、devは既定 firebaseapp.com のままにできるように）。
- **CSP**：`firebase.json` の `frame-src` に **`'self'`（または `https://yah.mobi`）を追加**（Firebase Auth が authDomain 上に iframe を生成するため。無いと同意フローが CSP でブロックされうる）。
- **コンソール設定（ユーザー操作・慎重に／既存は残す＝ロールバック安全）**：
  1. **Firebase Auth 承認済みドメイン**に `yah.mobi`（Authentication → Settings → Authorized domains。※既に有る可能性大）。
  2. **OAuth 2.0 クライアント**（Credentials → Web client）に **承認済みリダイレクトURI** `https://yah.mobi/__/auth/handler`、**承認済みJavaScript生成元** `https://yah.mobi` を**追加**（既存 firebaseapp.com は残す）。
  3. 方式Aのアプリ名設定も併せて推奨。
- 効果：「**yah.mobi に移動**」表示。
- **最大リスク**：設定漏れで **Google サインインが壊れる**（popup 失敗）。→ 既存URIを残したまま追加し、**dev チャンネルで先に検証**してから本番。

---

## 推奨
1. **まず方式A**（コンソールのみ・無リスク）で「yah.mobile 表示」にして体感を確認。
2. それでも「URLドメインを yah.mobi にしたい」なら **方式B** を追加実施（CSP＋authDomain＋OAuth URI、dev検証必須）。

## 影響範囲
- 方式A：**コード変更なし**（コンソール設定のみ）。
- 方式B：`firebase.ts`（authDomain・任意でenv化）＋`firebase.json`（CSP frame-src 1項目）＋OAuthコンソール設定。**functions/rules 変更なし**。

## テスト／検証計画（方式B）
1. `firebase.json` CSP・`firebase.ts` 変更を dev チャンネルへ（`hosting:channel:deploy dev`）。
2. dev チャンネル（本番backend共有）で **Google サインイン成功**＋同意画面が **yah.mobi 表示**を確認。
3. App Check/reCAPTCHA・既存セッション・ログイン後遷移に回帰が無いこと。
4. OK後に本番 hosting デプロイ（ユーザー指示）。ロールバックは authDomain を戻す（URIは残置）。

## 未確定・確認事項
- 現在の OAuth 同意画面の「アプリ名」設定状況（未設定なら方式Aだけで大きく改善）。
- yah.mobi が Firebase Auth 承認済みドメインに既登録か（本番稼働中なので入っている可能性大）。

---

## 【確定実装】方式B（2026-07-07・dev）

方式A（アプリ名=yah.mobile）はコンソールで設定済み（進行中）。加えて、モバイルUX改善のため方式Bを実装：

### コード変更（実施済み・dev）
- `client/src/lib/firebase.ts`：
  - `authDomain` を **`import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "yah.mobi"`** に（同一オリジン化）。ロールバックは env で firebaseapp.com に戻せる。
  - **PC=Popup / モバイル=Redirect** に分岐（`isMobileBrowser()`。WebView含む）。同一オリジンなので Safari ITP でも Redirect が安定。
  - 起動時に `getRedirectResult()` を呼び Redirect 復帰を処理（成功は onAuthStateChanged が拾う）。
- `firebase.json` CSP：`frame-src` と `form-action` に **`'self' https://yah.mobi` を追加**（同一オリジン auth iframe 用）。firebaseapp.com は残置＝ロールバック安全。
- 検証：client tsc 0エラー／プレビューで /login 正常描画・コンソールエラーなし（ただし実サインインは localhost では検証不可）。

### 🚨 本番反映の必須手順（順序厳守）
1. **先にコンソール**（サインインを壊さないため必ずデプロイ前に）：
   - **Google Cloud → Credentials → OAuth 2.0 Web client** に
     - 承認済みリダイレクトURI：**`https://yah.mobi/__/auth/handler`** を追加
     - 承認済みJavaScript生成元：**`https://yah.mobi`** を追加
     - （既存 firebaseapp.com はそのまま残す）
   - **Firebase Auth → Settings → 承認済みドメイン**に `yah.mobi` があるか確認（無ければ追加）。
2. **次にデプロイ**：`firebase deploy --only hosting`（フロント＋CSP反映）。
3. **本番 yah.mobi で検証**（※dev チャンネル `...web.app` は origin が yah.mobi でないため同一オリジン検証にならない）：
   - PC：Googleサインインが成功・同意画面が **yah.mobi** 表示。
   - **実機モバイル（iOS Safari／アプリ内ブラウザ）**：Redirect でサインイン往復が成立。
   - App Check/reCAPTCHA・既存セッションに回帰なし。
4. **ロールバック**（万一サインインが壊れたら）：`VITE_FIREBASE_AUTH_DOMAIN=yah-mobile-v1-3ed24.firebaseapp.com` を設定して再ビルド/デプロイ（or authDomain既定を戻す）。OAuth URI/CSP の firebaseapp.com は残してあるため即復旧可。
