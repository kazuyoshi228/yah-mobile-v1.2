/**
 * callable.ts — Firebase Callable Functions クライアントヘルパー
 *
 * tRPC の代替として、Firebase Callable Functions を呼び出すための
 * React Query ベースのカスタムフックを提供する。
 *
 * 使い方:
 *   const { data, isLoading } = useCallableQuery(CALLABLE.plansList, undefined);
 *   const mutation = useCallableMutation(CALLABLE.ordersInitCheckout);
 */
import { useQuery, useMutation, useQueryClient, type UseQueryOptions } from "@tanstack/react-query";
import { getFunctions, httpsCallable } from "firebase/functions";
import { getFirebaseApp } from "./firebase";

export const CALLABLE = {

  analyticsGetAiInsights: "analyticsGetAiInsights",
  incidentRunRetryNow: "incidentRunRetryNow",
  orderRetryPayment: "orderRetryPayment",
  ordersInitCheckout: "ordersInitCheckout",
  ordersInitTopupCheckout: "ordersInitTopupCheckout",
  adminRefundOrder: "adminRefundOrder",
  // 一回限りの移行用（実行後に関数ごと削除してよい）
  adminMigrateIsActiveToBoolean: "adminMigrateIsActiveToBoolean",
} as const;

export type CallableName = (typeof CALLABLE)[keyof typeof CALLABLE];

/**
 * Callable Function を直接呼び出す低レベル関数。
 * React Query フックの外でも使える。
 */
export async function callFunction<TInput, TOutput>(
  name: CallableName,
  data?: TInput
): Promise<TOutput> {
  const functions = getFunctions(getFirebaseApp(), "asia-northeast1");
  const fn = httpsCallable<TInput, TOutput>(functions, name);
  const result = await fn(data);
  return result.data;
}

/**
 * Callable Function を React Query の useQuery でラップしたカスタムフック。
 * tRPC の useQuery の代替。
 */
export function useCallableQuery<TInput, TOutput>(
  name: CallableName,
  input: TInput,
  options?: Omit<UseQueryOptions<TOutput, Error>, "queryKey" | "queryFn">
) {
  return useQuery<TOutput, Error>({
    queryKey: [name, input],
    queryFn: () => callFunction<TInput, TOutput>(name, input),
    ...options,
  });
}

/**
 * Callable Function を React Query の useMutation でラップしたカスタムフック。
 * tRPC の useMutation の代替。
 */
export function useCallableMutation<TInput, TOutput>(
  name: CallableName,
  options?: {
    onSuccess?: (data: TOutput, variables: TInput) => void;
    onError?: (error: Error, variables: TInput) => void;
    onSettled?: () => void;
  }
) {
  return useMutation<TOutput, Error, TInput>({
    mutationFn: (data: TInput) => callFunction<TInput, TOutput>(name, data),
    onSuccess: options?.onSuccess,
    onError: options?.onError,
    onSettled: options?.onSettled,
  });
}

/**
 * React Query のキャッシュを無効化するヘルパー。
 * tRPC の utils.invalidate() の代替。
 */
export function useInvalidate() {
  const queryClient = useQueryClient();
  return (name: CallableName, input?: unknown) => {
    if (input !== undefined) {
      return queryClient.invalidateQueries({ queryKey: [name, input] });
    }
    return queryClient.invalidateQueries({ queryKey: [name] });
  };
}
