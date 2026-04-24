import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const root = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@crc/protocol": `${root}packages/protocol/src/index.ts`,
      "@crc/codex-client": `${root}packages/codex-client/src/index.ts`
    }
  },
  test: {
    environment: "node",
    include: ["**/*.test.ts"],
    coverage: {
      reporter: ["text", "lcov"]
    }
  }
});
