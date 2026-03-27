import "@testing-library/jest-dom";
import { vi } from "vitest";

// Mock ResizeObserver which is often needed for Recharts in jsdom
global.ResizeObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}));
