import { QRCodeSVG } from "qrcode.react";

/**
 * eSIM の LPA プロファイル文字列（例: "LPA:1$smdp...$activation"）から
 * QR コードを SVG でクライアント生成する。
 *
 * Firestore の `esim_link.lpaProfile` をそのまま渡すだけ。
 * Storage の QR 画像（qrCodeUrl）には依存しない＝ネットワーク要求ゼロ・壊れない。
 */
export function EsimQr({
  value,
  size = 220,
  className,
}: {
  value: string;
  size?: number;
  className?: string;
}) {
  return (
    <QRCodeSVG
      value={value}
      size={size}
      level="M"
      marginSize={2}
      bgColor="#ffffff"
      fgColor="#000000"
      className={className}
    />
  );
}
