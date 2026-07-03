import "@testing-library/jest-dom";

// jsdom に無い API を補う（Vaul/Radix/framer-motion などが参照するため）
if (typeof window !== "undefined") {
  // matchMedia
  if (!window.matchMedia) {
    window.matchMedia = (query: string) =>
      ({
        matches: false,
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      }) as unknown as MediaQueryList;
  }

  // ResizeObserver / IntersectionObserver
  class MockObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() {
      return [];
    }
  }
  window.ResizeObserver = window.ResizeObserver || (MockObserver as unknown as typeof ResizeObserver);
  window.IntersectionObserver =
    window.IntersectionObserver || (MockObserver as unknown as typeof IntersectionObserver);

  // Pointer capture / scrollIntoView（Radix/Vaul が使用）
  if (!Element.prototype.hasPointerCapture) Element.prototype.hasPointerCapture = () => false;
  if (!Element.prototype.setPointerCapture) Element.prototype.setPointerCapture = () => {};
  if (!Element.prototype.releasePointerCapture) Element.prototype.releasePointerCapture = () => {};
  if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};
}
