import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: false,
    environment: "node",
    include: ["{apps,packages}/**/*.{test,spec}.{ts,tsx}"]
  }
});
