# 設計書：プリレンダリング（Tier3-1 / Naver・繁体字・非JSクローラ対応）

対象ブランチ: `dev` ／ 作成: 2026-07-08 ／ ステータス: **設計（要承認→実装）**
関連: [seo_plan.md](./seo_plan.md) §Tier3-1・§8 ／ [roadmap_to_v1.md](./roadmap_to_v1.md)

## 1. 背景・目的

**診断（実測）**：`/app`・`/ko/app`・`/zh-TW/app` の生HTML（JS未実行＝クローラ初見）は**3つとも同一の英語静的HTML**。title/description/本文/Product JSON-LD はすべて**JS実行後にしか出ない**（CSR）。
- Google はレンダリングするので概ね拾える。
- **Naver(Yeti)・一部AIクローラ・SNSスクレイパはJSを実行しない/弱い** → **韓国語・繁体字が届いていない**。

**目的**：主要な公開ページを**言語別に静的HTML化**し、その言語の `title`/`description`/`本文`/`JSON-LD`/`OG` を**初期HTMLに焼き込む**。Naver・Baidu・SNS・非JSクローラ全てに各言語コンテンツを届ける。

## 2. 方針（確定案）

**ビルド後プリレンダ（SSG-lite）を採用**。SPA/ルーティング構造は変えず、`vite build` の後に **Puppeteer で各ルートを描画→静的HTMLとして dist に出力**する。Firebase Hosting は静的ファイルを優先配信するため、置くだけで各言語HTMLが配信される。

**なぜこの方式か（代替との比較）**
| 方式 | 採否 | 理由 |
|---|---|---|
| **Puppeteerビルド後プリレンダ（本案）** | ✅ | wouter/i18n構造を変えない・実行時サーバ不要・全訪問者＆全クローラに配信・i18nがパス優先なので言語別が自然に出る |
| vike/vite-react-ssg（SSGフレームワーク） | ✕ | ルーター(wouter)/エントリの作り直しが必要＝大改修 |
| 動的レンダリング（bot判定→Cloud FunctionでPuppeteer） | △次善 | ハイドレーション懸念ゼロだが**実行時Puppeteer**が重く保守増。Googleは非推奨（Naver/Baiduには有効）。本案が問題化したら退避先 |
| react-snap | ✕ | 保守停滞・Chromiumピン留め問題 |

## 3. 対象ルート（プリレンダするもの）

**公開・コンテンツ型のみ**（動的/認証ページはSPAのまま）：
- `/app`（en 既定）
- `/ko/app` / `/zh-CN/app` / `/zh-TW/app` / `/th/app`（各言語）
- `/terms` / `/privacy` / `/cookie-policy`（法務・英語ハードコードのため各1）

**除外（SPAフォールバックのまま）**：`/mypage*`・`/admin*`・`/login`・`/contact`(要動的)・`/404` 等。`/` は `/app` へリダイレクトのため `/app` を代表とする。

## 4. 実装詳細

### 4.1 `scripts/prerender.mjs`（新規）
1. `dist/public` を軽量static serverでローカル配信（例 `sirv`/`http-server` or Nodeビルトイン）。
2. `puppeteer` で headless Chrome 起動。
3. 各ルートを順に `page.goto(url, { waitUntil: "networkidle0", timeout })`。
4. **待機条件**：`#root` に主要見出し（例 hero）が出るまで／`document.title` が既定値から変化するまで（＝AppPageのSEO useEffectが走った）。
5. `page.content()` で完成HTMLを取得し、`dist/public/<route>/index.html` に書き出す（例 `/ko/app` → `dist/public/ko/app/index.html`）。
6. 生成後 puppeteer/サーバを閉じる。

### 4.2 App Check / Firebase の扱い（プリレンダ時）
- App Check初期化は**キーがあれば試行**するが、`try/catch`＋トークン自動更新で**描画は継続**（reCAPTCHAが取れなくても静的コンテンツは出る）。
- **Firestore依存（プラン一覧・比較表）**：headlessでは読めない可能性がある。その場合**プリレンダHTMLにプランは含まれない**が、
  - hero/features/FAQ/**title/description/OG/HowTo** は i18n静的なので**焼き込まれる**（SEO/GEOの主目的は達成）。
  - プランはハイドレーション後にクライアントで表示され、AI向けは `llms.txt`（ライブ）が別途カバー。
  - 望むなら将来「プランを prerender用に静的注入」も可（本設計の範囲外）。

### 4.3 ハイドレーション
- クライアントは既存どおり `createRoot(...).render(...)`。react-snap系の `hydrateRoot` に切替えるか要検証。
- 動的差分（プラン・時刻・A/B）で**ハイドレーション警告**が出る可能性 → 検証で確認し、必要なら
  - (a) 差分の出る箇所を `suppressHydrationWarning` / クライアント専用化、
  - (b) それでも不安定なら `hydrateRoot` をやめ**プリレンダHTMLの上で通常render**（初期表示はプリレンダ内容→即クライアント再描画。SEOは初期HTMLで達成済み）。

### 4.4 Firebase Hosting / ビルド連携
- `firebase.json` の rewrites（`** → /index.html`）は**静的ファイルが無い時のみ**適用されるため、`/ko/app/index.html` 等を置けばそれが優先配信される。**設定変更は原則不要**（要検証：ディレクトリindexの自動配信）。
- `package.json` の `build` を `vite build && node scripts/prerender.mjs` に変更（or 別スクリプト `build:prerender`）。
- 依存追加：`puppeteer`（Chromium同梱・devDependency）。**CIの `pnpm install` でChromium取得（+約200MB・+1〜2分）**。
  - CI影響を避けるなら「プリレンダはローカルデプロイ時のみ」も選択可（現状デプロイは手動運用）。→ §7で選択。

## 5. 影響範囲・リスク

| リスク | 対策 |
|---|---|
| ハイドレーション不整合 | §4.3。まず警告の有無を検証、最悪 render 方式に退避（SEO効果は維持） |
| Firestoreプランがプリレンダに出ない | 許容（主目的はmeta/本文/HowTo）。llms.txtが補完。将来静的注入で改善可 |
| App Check/reCAPTCHA の headless失敗ログ | 描画は継続（ガード済）。プリレンダ時はログ無視 |
| CIのChromium追加コスト | build:prerender を分離 or ローカル限定（§7） |
| PWA(sw.js)と複数HTMLの整合 | precache globに注意。検証でSWのフォールバック確認 |
| ルート追加漏れ | prerenderルートリストを一元管理（sitemapと同期） |

## 6. テスト・検証計画
1. `npm run build`（＝vite build＋prerender）が成功。`dist/public/{ko,zh-CN,zh-TW,th}/app/index.html` 生成。
2. **各生HTMLで言語別 title/description/hreflang/OG が正しいこと**（`grep`／`curl` 後述）。
3. ローカルで各プリレンダHTMLを開き、**ハイドレーション警告・描画崩れが無い**こと（Console確認）。
4. 既存 client 27+ tests / functions tests / tsc / build 全green。
5. dev チャンネルへデプロイ → `curl https://<dev>/ko/app` の**生HTML**が韓国語 title/description になっていることを確認（＝Naver/非JSクローラ視点）。
6. 本番反映後、`curl https://yah.mobi/ko/app`・`/zh-TW/app` の生HTMLで各言語確認。Rich Results Test / Naver は登録後に。

## 7. 実施オプション（承認時に選択）
- **A. build に統合**（`vite build && prerender`）：CI自動デプロイでも常にプリレンダ。CIにChromiumコスト。**推奨**（一貫性）。
- **B. 分離スクリプト**（`build:prerender`）：手動デプロイ時のみ実行。CI軽いが、CI自動デプロイ経路ではプリレンダ無しHTMLが出る恐れ。

## 8. 段階
1. `scripts/prerender.mjs` 実装＋`puppeteer` 追加＋ルートリスト。
2. ローカルでハイドレーション/描画検証（§6-3）。問題あれば §4.3 退避。
3. dev チャンネルで生HTML検証（§6-5）。
4. 承認済みなら本番反映（別途デプロイ指示）。
5. 後続（別タスク）：Naver Search Advisor / 百度站长 登録・専用OG画像。

---
※本設計はSPA/ルーティング/機能の**挙動は不変**（配信されるHTMLに初期コンテンツが増えるだけ）。決済・認証・購入フローには触れない。
