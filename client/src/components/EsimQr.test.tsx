import { render } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { EsimQr } from "./EsimQr";

describe("EsimQr", () => {
  it("LPA文字列から SVG の QR を描画する（Storage画像に依存しない）", () => {
    const { container } = render(<EsimQr value="LPA:1$smdp.example.com$ABC123XYZ" size={220} />);
    const svg = container.querySelector("svg");
    expect(svg).toBeTruthy();
    // QR モジュールが実際に描画されている（path または rect）
    expect(svg?.querySelector("path, rect")).toBeTruthy();
  });

  it("value が変われば描画内容も変わる", () => {
    const a = render(<EsimQr value="LPA:1$a$AAA" />).container.querySelector("svg")?.innerHTML;
    const b = render(<EsimQr value="LPA:1$b$BBB" />).container.querySelector("svg")?.innerHTML;
    expect(a).toBeTruthy();
    expect(a).not.toEqual(b);
  });
});
