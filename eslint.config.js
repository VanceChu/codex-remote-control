import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    ignores: [
      "**/dist/**",
      "**/node_modules/**",
      "**/.wrangler/**",
      "packages/codex-client/generated/**",
      "apps/pwa/dist/**"
    ]
  },
  {
    files: ["**/*.ts", "**/*.tsx"],
    languageOptions: {
      globals: {
        ArrayBuffer: "readonly",
        Buffer: "readonly",
        DurableObjectNamespace: "readonly",
        DurableObjectState: "readonly",
        Error: "readonly",
        Promise: "readonly",
        Request: "readonly",
        Response: "readonly",
        Storage: "readonly",
        TextDecoder: "readonly",
        TextEncoder: "readonly",
        URL: "readonly",
        URLSearchParams: "readonly",
        WebSocket: "readonly",
        WebSocketPair: "readonly",
        console: "readonly",
        crypto: "readonly",
        document: "readonly",
        history: "readonly",
        process: "readonly",
        setTimeout: "readonly",
        window: "readonly"
      }
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/consistent-type-imports": "error"
    }
  }
);
