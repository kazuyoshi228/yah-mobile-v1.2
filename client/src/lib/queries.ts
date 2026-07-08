/**
 * lib/queries.ts — Firestore クエリのファクトリ（P4-1）
 *
 * 複数箇所で直書きされていた同一クエリを集約する。**クエリ内容は移設元と完全同一**
 * （where句・orderBy・limit を変えない＝インデックス影響なし）。
 * 単一箇所でしか使わないクエリは無理に集約しない（呼び出し元に残す）。
 */
import { collection, query, where, orderBy, limit } from "firebase/firestore";
import { getFirebaseDb } from "@/lib/firebase";

/** 店頭に並ぶ初期購入プラン（AppPage / PurchaseDrawer / PlansSection で共用） */
export function activeInitialPlansQuery() {
  return query(
    collection(getFirebaseDb(), "plans"),
    where("isActive", "==", true),
    where("planType", "==", "initial"),
  );
}

/** アクティブな全プラン（MyPage の validityDays/planName join 用） */
export function activePlansQuery() {
  return query(collection(getFirebaseDb(), "plans"), where("isActive", "==", true));
}

/** トップアッププラン（TopupPage のフォールバック検索） */
export function activeTopupPlansQuery() {
  return query(
    collection(getFirebaseDb(), "plans"),
    where("planType", "==", "topup"),
    where("isActive", "==", true),
  );
}

/** 最新の為替レート1件（useCurrency / PlansSection / admin PlansTab のマージン計算で共用） */
export function latestCurrencyRatesQuery() {
  return query(collection(getFirebaseDb(), "currency_rates"), orderBy("updatedAt", "desc"), limit(1));
}
