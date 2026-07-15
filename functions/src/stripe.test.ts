import { describe, it, expect } from "vitest";
import { validateOrigin } from "./stripe";

describe("stripe", () => {
  describe("validateOrigin", () => {
    it("should return the original origin if it is in ALLOWED_ORIGINS", () => {
      expect(validateOrigin("https://yah.mobi")).toBe("https://yah.mobi");
      expect(validateOrigin("https://www.yah.mobi")).toBe("https://www.yah.mobi");
    });

    it("should strip paths and queries from valid origins", () => {
      expect(validateOrigin("https://yah.mobi/purchase?plan=1")).toBe("https://yah.mobi");
    });

    it("should fallback to primary domain for disallowed origins", () => {
      expect(validateOrigin("https://evil.com")).toBe("https://yah.mobi");
      expect(validateOrigin("http://localhost:3000")).toBe("https://yah.mobi");
      expect(validateOrigin("https://yah.mobi.evil.com")).toBe("https://yah.mobi");
    });

    it("should fallback to primary domain for invalid URLs", () => {
      expect(validateOrigin("not-a-url")).toBe("https://yah.mobi");
      expect(validateOrigin("")).toBe("https://yah.mobi");
    });
  });
});
