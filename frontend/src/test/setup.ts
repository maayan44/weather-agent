import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, beforeEach, vi } from "vitest";

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

// jsdom does not implement these browser features that the app (or its components) uses.
beforeEach(() => {
  vi.stubGlobal("ResizeObserver", ResizeObserverStub);
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      // A mouse and keyboard are present, as on a desktop.
      matches: query === "(pointer: fine)",
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }),
  });
  Element.prototype.scrollIntoView = () => {};
});

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
