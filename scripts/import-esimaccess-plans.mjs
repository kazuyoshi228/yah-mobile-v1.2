/**
 * import-esimaccess-plans.mjs — eSIMAccess の日本(単国JP)プランを plans に取り込む
 *
 * 方針（design_provider_abstraction.md §6.2/6.3）:
 *  - /package/list（locationCode=JP, type=BASE/TOPUP）を取得し plans へ upsert。
 *  - 既定 isActive:false（ステージング）。/admin で活性化＋JPY価格を設定する。
 *  - 卸USD(wholesalePriceUsd)・network・ipExport 等のメタを保存。JPY小売(priceJpy)は入れない（/adminで設定）。
 *  - doc ID = packageCode（冪等 upsert）。provider="esimaccess"。bappyPlanId には packageCode を橋渡しで入れる
 *    （既存の bappyPlanId ルックアップ互換。発注元プロバイダの分岐は provider で行う）。
 *
 * シークレットは .env（gitignore済）から読む（値はコマンド/チャットに出さない）:
 *   ESIMACCESS_ACCESS_CODE=... / ESIMACCESS_SECRET_KEY=...
 * Firestore は ADC（gcloud auth application-default login 済み）で書く。
 *
 * 使い方:
 *   node scripts/import-esimaccess-plans.mjs            # ドライラン（表示のみ・既定）
 *   node scripts/import-esimaccess-plans.mjs --write    # 実書き込み（inactiveで投入）
 */
import { readFileSync } from "node:fs";
import { createHmac, randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const BASE = "https://api.esimaccess.com/api/v1/open";
const WRITE = process.argv.includes("--write");

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

const ENV = loadEnv();
const ACCESS_CODE = ENV.ESIMACCESS_ACCESS_CODE;
const SECRET_KEY = ENV.ESIMACCESS_SECRET_KEY;
if (!ACCESS_CODE || !SECRET_KEY) {
  console.error("✗ .env に ESIMACCESS_ACCESS_CODE / ESIMACCESS_SECRET_KEY を設定してください。");
  process.exit(1);
}

async function esimaccessPost(path, body) {
  const bodyStr = JSON.stringify(body ?? {});
  const ts = String(Date.now());
  const reqId = randomUUID();
  const signature = createHmac("sha256", SECRET_KEY).update(ts + reqId + ACCESS_CODE + bodyStr).digest("hex").toLowerCase();
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: {
      "RT-AccessCode": ACCESS_CODE,
      "RT-RequestID": reqId,
      "RT-Timestamp": ts,
      "RT-Signature": signature,
      "Content-Type": "application/json",
    },
    body: bodyStr,
  });
  const json = await res.json();
  if (!json.success) throw new Error(`[${path}] ${json.errorCode} ${json.errorMsg ?? ""}`);
  return json.obj;
}

async function fetchPackages(type) {
  const obj = await esimaccessPost("/package/list", { locationCode: "JP", type });
  return obj?.packageList ?? [];
}

function mapPackage(p, planType) {
  const op = Array.isArray(p.locationNetworkList) && p.locationNetworkList[0]?.operatorList?.[0];
  return {
    docId: String(p.packageCode),
    data: {
      provider: "esimaccess",
      providerPlanId: String(p.packageCode),
      bappyPlanId: String(p.packageCode), // 互換の橋渡し
      slug: p.slug ?? null,
      planType, // "initial" | "topup"
      name: p.name ?? String(p.packageCode),
      dataGb: p.volume != null ? +(p.volume / (1024 * 1024 * 1024)).toFixed(3) : null,
      validityDays: p.duration ?? null,
      wholesalePriceUsd: p.price != null ? +(p.price / 10000).toFixed(2) : null,
      // priceJpy はここでは入れない（/admin で自社マージンを設定）
      network: p.operatorList?.[0]?.operatorName ?? op?.operatorName ?? null,
      networkType: p.operatorList?.[0]?.networkType ?? op?.networkType ?? null,
      ipExport: p.ipExport ?? null,
      speed: p.speed ?? null,
      locationCode: p.location ?? "JP",
      supportTopUpType: p.supportTopUpType ?? null,
      fupPolicy: p.fupPolicy ?? null,
      activeType: p.activeType ?? null,
      isActive: false, // ステージング。/admin で活性化。
      isPopular: false,
      sortOrder: 999,
      updatedAt: Date.now(),
    },
  };
}

async function main() {
  console.log(`[import-esimaccess-plans] ${WRITE ? "WRITE" : "DRY-RUN"} / AccessCode 末尾4: ...${ACCESS_CODE.slice(-4)}`);

  const base = await fetchPackages("BASE");
  const topup = await fetchPackages("TOPUP");
  console.log(`取得: BASE=${base.length}件 / TOPUP=${topup.length}件（locationCode=JP）`);

  const mapped = [
    ...base.map((p) => mapPackage(p, "initial")),
    ...topup.map((p) => mapPackage(p, "topup")),
  ];

  for (const m of mapped) {
    const d = m.data;
    console.log(
      `  ${d.planType.padEnd(7)} ${m.docId.padEnd(14)} ${String(d.name).slice(0, 34).padEnd(34)} ` +
      `${d.dataGb}GB/${d.validityDays}d $${d.wholesalePriceUsd} net=${d.network ?? "?"} ip=${d.ipExport ?? "?"} topup=${d.supportTopUpType ?? "?"}`,
    );
  }

  if (!WRITE) {
    console.log(`\n(dry-run) ${mapped.length}件。書き込むには --write を付けてください。isActive:false で投入します。`);
    return;
  }

  initializeApp({ credential: applicationDefault() });
  const db = getFirestore();
  let created = 0, updated = 0;
  for (const m of mapped) {
    const ref = db.collection("plans").doc(m.docId);
    const snap = await ref.get();
    if (snap.exists) {
      // 既存は上書きしすぎない：卸/メタは更新、isActive/priceJpy/sortOrder/isPopular は既存を尊重
      const { isActive, isPopular, sortOrder, ...meta } = m.data;
      await ref.set(meta, { merge: true });
      updated++;
    } else {
      await ref.set({ ...m.data, createdAt: Date.now() });
      created++;
    }
  }
  console.log(`\n完了: 新規 ${created}件 / 更新 ${updated}件（全て isActive は既存尊重、新規は false）。/admin PlansTab で活性化＋JPY設定を。`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
