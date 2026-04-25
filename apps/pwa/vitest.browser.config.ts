import { playwright } from "@vitest/browser-playwright";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@crc/protocol": fileURLToPath(
        new URL("../../packages/protocol/src/index.ts", import.meta.url)
      )
    }
  },
  test: {
    browser: {
      enabled: true,
      headless: true,
      provider: playwright(),
      instances: [{ browser: "chromium" }]
    },
    include: ["src/**/*.browser.ts"]
  }
});
