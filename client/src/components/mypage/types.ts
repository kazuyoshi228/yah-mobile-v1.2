// MyPage 系コンポーネントで共有する型定義

export type EsimLink = {
  id: string;
  orderId: string;
  bappyLinkUuid: string | null;
  iccid: string | null;
  lpaProfile: string | null;
  appleActivationUrl: string | null;
  androidActivationUrl: string | null;
  dataRemainingMb: number | null;
  dataTotalMb: number | null;
  expiryDate: number | Date | string | null;
  status: string | null;
  lastActiveAt?: number | null;
};

export type OrderRow = {
  id: string;
  bappyPlanId: string;
  planName?: string | null;
  status: string;
  amountJpy: number | null;
  createdAt: number;
  refundStatus?: string | null;
  refundedAt?: number | null;
};

export type EsimPreview = {
  dataRemainingMb: number | null;
  dataTotalMb: number | null;
  expiryDate: number | Date | string | null;
} | null;

export type EsimPreviewMap = Map<string, EsimPreview>;
