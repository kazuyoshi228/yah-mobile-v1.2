/**
 * esimaccess-ping.mjs — eSIMAccess 署名の疎通確認（読み取り専用・balance/query）
 *
 * 目的：HMAC署名が正しいか（RT-Timestamp が ms か 秒か、body が "{}" か "" か）を
 *       実APIで確定する。残高照会のみ＝課金なし・安全。
 *
 * シークレットは .env（gitignore済）から読む。値はコマンドにもチャットにも出さない。
 *   1) プロジェクト直下の .env に一時的に追記：
 *        ESIMACCESS_ACCESS_CODE=xxxxx
 *        ESIMACCESS_SECRET_KEY=yyyyy
 *   2) 実行：  node scripts/esimaccess-ping.mjs
 *   3) 確認後、.env からその2行を消してよい（本番は Secret Manager 管理）。
 */
import { readFileSync } from "node:fs";
import { createHmac, randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const BASE = "https://api.esimaccess.com/api/v1/open";

function loadEnv() {
  const env = { ...process.env };
  try {
    const raw = readFileSync(join(ROOT, ".env"), "utf8");
    for (const line of raw.split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m) env[m[1]] = m[2].replace(/^['"]|['"]$/g, "");
    }
  } catch { /* .env 無しでも process.env で可 */ }
  return env;
}

function sign({ accessCode, secretKey, body, timestamp, requestId }) {
  const signData = String(timestamp) + requestId + accessCode + body;
  return createHmac("sha256", secretKey).update(signData).digest("hex").toLowerCase();
}

async function tryOnce({ accessCode, secretKey, tsMode, bodyMode }) {
  const requestId = randomUUID();
  const timestamp = tsMode === "ms" ? Date.now() : Math.floor(Date.now() / 1000);
  const body = bodyMode === "empty" ? "" : "{}";
  const signature = sign({ accessCode, secretKey, body, timestamp, requestId });
  const res = await fetch(`${BASE}/balance/query`, {
    method: "POST",
    headers: {
      "RT-AccessCode": accessCode,
      "RT-RequestID": requestId,
      "RT-Timestamp": String(timestamp),
      "RT-Signature": signature,
      "Content-Type": "application/json",
    },
    body,
  });
  let json = null;
  try { json = await res.json(); } catch { /* non-json */ }
  return { httpStatus: res.status, json, tsMode, bodyMode };
}

async function main() {
  const env = loadEnv();
  const accessCode = env.ESIMACCESS_ACCESS_CODE;
  const secretKey = env.ESIMACCESS_SECRET_KEY;
  if (!accessCode || !secretKey) {
    console.error("✗ .env に ESIMACCESS_ACCESS_CODE / ESIMACCESS_SECRET_KEY を設定してください（値はチャットに貼らない）。");
    process.exit(1);
  }
  console.log(`AccessCode 末尾4桁: ...${accessCode.slice(-4)} / SecretKey 長さ: ${secretKey.length}（値は表示しない）`);

  const combos = [
    { tsMode: "ms", bodyMode: "obj" },
    { tsMode: "sec", bodyMode: "obj" },
    { tsMode: "ms", bodyMode: "empty" },
    { tsMode: "sec", bodyMode: "empty" },
  ];

  for (const c of combos) {
    try {
      const r = await tryOnce({ accessCode, secretKey, ...c });
      const ok = r.json?.success === true;
      const code = r.json?.errorCode;
      const label = `ts=${c.tsMode} body=${c.bodyMode === "empty" ? '""' : '"{}"'}`;
      if (ok) {
        const balUsd = (r.json.obj?.balance ?? 0) / 10000;
        console.log(`✅ 成功: ${label} → HTTP ${r.httpStatus} / balance = $${balUsd}`);
        console.log(`→ この組み合わせが正解。provider実装を ts=${c.tsMode} / body=${c.bodyMode === "empty" ? '""' : '"{}"'} に合わせる。`);
        return;
      }
      console.log(`✗ ${label} → HTTP ${r.httpStatus} / errorCode=${code} msg=${r.json?.errorMsg ?? ""}`);
    } catch (e) {
      console.log(`✗ ${c.tsMode}/${c.bodyMode}: ${e.message}`);
    }
  }
  console.log("いずれも失敗。AccessCode/SecretKey の値、または署名仕様を再確認してください。");
}

main().catch((e) => { console.error(e); process.exit(1); });
