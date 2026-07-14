/**
 * prerender.mjs — ビルド後プリレンダ（Tier3-1 / design_prerendering.md）
 *
 * `vite build`（dist/public 生成）後に実行。各公開ルートを headless Chrome で描画し、
 * 言語別の title/description/OG/HowTo/本文が焼き込まれた静的HTMLを dist/public/<route>/index.html に出力する。
 * Firebase Hosting は静的ファイルを優先配信するため、置くだけで各言語HTMLが配信される。
 *
 * 使い方: node scripts/prerender.mjs   （事前に npm run build 済みであること）
 */
import { createServer } from "node:http";
import { readFile, mkdir, writeFile, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, extname, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DIST = join(ROOT, "dist", "public");
const PORT = 5051;

// プリレンダ対象ルート（design §3）。/app=en 既定、/{lang}/app=各言語、法務は英語1版。
const ROUTES = [
  "/app",
  "/ko/app",
  "/zh-CN/app",
  "/zh-TW/app",
  "/th/app",
  "/terms",
  "/privacy",
  "/cookie-policy",
  // 共有用購入リンク（design_share_links.md）。プラン改廃時は client/src/components/app/buyLinks.ts と同期。
  "/buy/1gb",
  "/buy/3gb",
  "/buy/5gb",
  "/buy/10gb",
  "/buy/20gb",
  "/buy/50gb",
];

const MIME = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css",
  ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png",
  ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".ico": "image/x-icon",
  ".woff": "font/woff", ".woff2": "font/woff2", ".otf": "font/otf", ".ttf": "font/ttf",
  ".xml": "application/xml", ".txt": "text/plain; charset=utf-8", ".webmanifest": "application/manifest+json",
};

// 静的サーバ：実ファイルがあれば配信、無ければ SPA フォールバックで root index.html を返す。
// （プリレンダ出力より前に必ず fresh な root index.html を配るため、/ko/app 等は SPA が描画される）
function startServer() {
  const rootIndex = join(DIST, "index.html");
  return new Promise((resolve) => {
    const server = createServer(async (req, res) => {
      try {
        const urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
        const filePath = join(DIST, urlPath);
        // ディレクトリトラバーサル防止
        if (!filePath.startsWith(DIST)) { res.writeHead(403); return res.end(); }
        if (extname(urlPath) && existsSync(filePath) && (await stat(filePath)).isFile()) {
          const body = await readFile(filePath);
          res.writeHead(200, { "Content-Type": MIME[extname(urlPath)] || "application/octet-stream" });
          return res.end(body);
        }
        // SPA フォールバック
        const html = await readFile(rootIndex);
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        return res.end(html);
      } catch (e) {
        res.writeHead(500); res.end(String(e));
      }
    });
    server.listen(PORT, () => resolve(server));
  });
}

async function main() {
  if (!existsSync(join(DIST, "index.html"))) {
    console.error("✗ dist/public/index.html が無い。先に `npm run build` を実行してください。");
    process.exit(1);
  }
  const server = await startServer();
  // ヒーロー価格アンカー用: 本番llms.txt（Firestoreから動的生成）から実際の最安値を取得して
  // プリレンダHTMLに焼き込む（プリレンダ中はApp CheckでFirestoreを読めないため）。失敗時はnull=クライアント側定数にフォールバック。
  let minPrice = null;
  try {
    const res = await fetch("https://yah.mobi/llms.txt");
    const m = (await res.text()).match(/Minimum Price: ¥([0-9,]+)/);
    if (m) minPrice = parseInt(m[1].replace(/,/g, ""), 10);
    console.log(`[prerender] min price from llms.txt: ${minPrice ?? "(取得失敗→フォールバック)"}`);
  } catch { console.log("[prerender] llms.txt fetch failed — フォールバック価格を使用"); }

  const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox", "--disable-setuid-sandbox"] });
  console.log(`[prerender] serving dist/public on :${PORT} / routes=${ROUTES.length}`);

  let ok = 0;
  for (const route of ROUTES) {
    const page = await browser.newPage();
    // console/pageerror はノイズなので握りつぶし（App Check/Firestore の headless 失敗は許容）
    page.on("pageerror", () => {});
    page.on("console", () => {});
    const wantLang = route.match(/^\/(ko|zh-CN|zh-TW|th)\//)?.[1] ?? "en";
    try {
      // chat widget (chat.yah.mobi) はプリレンダ中はロードしない。
      // 焼き込むと死んだ #yah-chat-btn ＋ origin=localhost の iframe が本番HTMLに残り、
      // 実行時の widget.js 再注入と二重化するため（QA修正一式 design_qa_fixes.md §D）。
      if (minPrice) await page.evaluateOnNewDocument(`window.__HERO_MIN_PRICE__ = ${minPrice};`);
      await page.setRequestInterception(true);
      page.on("request", (req) => {
        if (req.url().includes("chat.yah.mobi")) return void req.abort();
        return void req.continue();
      });
      // networkidle は Firestore のリアルタイム接続で発火しないため使わない。DOM構築後に描画完了を待つ。
      await page.goto(`http://localhost:${PORT}${route}`, { waitUntil: "domcontentloaded", timeout: 30000 });
      // #root に本文が入り、かつ html[lang] が目的言語になる（SEO useEffect 実行）まで待つ
      await page
        .waitForFunction(
          (lang) => {
            const root = document.getElementById("root");
            const hasBody = !!root && (root.textContent || "").trim().length > 200;
            const langOk = document.documentElement.getAttribute("lang") === lang;
            return hasBody && langOk;
          },
          { timeout: 20000 },
          wantLang,
        )
        .catch(() => {});
      // 追加の安定化（i18n/lazyセクションの遅延描画）
      await new Promise((r) => setTimeout(r, 1200));

      // reCAPTCHA / App Check がランタイム注入したDOMを除去（クライアント再初期化との衝突＝
      // "reCAPTCHA placeholder element must be empty" を防ぐ）。アプリ本体JSは残す。
      await page.evaluate(() => {
        document
          .querySelectorAll(
            '.grecaptcha-badge, [id^="fire_app_check"], iframe[src*="recaptcha"], iframe[title*="recaptcha"], script[src*="recaptcha"], script[src*="gstatic.com/recaptcha"]',
          )
          .forEach((el) => el.remove());
        // chat widget の残骸（万一 interception をすり抜けた場合の保険）
        document
          .querySelectorAll('#yah-chat-btn, iframe[src*="chat.yah.mobi"]')
          .forEach((el) => el.remove());
        document.querySelectorAll("style").forEach((s) => {
          if ((s.textContent || "").includes("#yah-chat-btn")) s.remove();
        });
      });

      const html = await page.content();
      const outDir = route === "/" ? DIST : join(DIST, route);
      await mkdir(outDir, { recursive: true });
      await writeFile(join(outDir, "index.html"), html, "utf-8");

      const title = await page.title();
      console.log(`  ✓ ${route.padEnd(16)} → ${route === "/" ? "" : route + "/"}index.html  title="${title.slice(0, 48)}"`);
      ok++;
    } catch (e) {
      console.error(`  ✗ ${route}: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      await page.close();
    }
  }

  await browser.close();
  server.close();
  console.log(`[prerender] done: ${ok}/${ROUTES.length}`);
  if (ok < ROUTES.length) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
