import { describe, expect, it } from "vitest";
import {
  assertAllowedCodexRequest,
  classifyServerRequest,
  PRODUCT_CODEX_REQUESTS,
  UNSUPPORTED_SERVER_REQUESTS
} from "./methods.js";

describe("Codex method whitelist", () => {
  it("allows only product-level slash methods", () => {
    expect(PRODUCT_CODEX_REQUESTS).toEqual([
      "thread/list",
      "thread/read",
      "thread/turns/list",
      "thread/start",
      "thread/resume",
      "turn/start",
      "turn/interrupt"
    ]);

    expect(() => assertAllowedCodexRequest("turn/start")).not.toThrow();
    expect(() => assertAllowedCodexRequest("fs/readFile")).toThrow("not exposed");
    expect(() => assertAllowedCodexRequest("initialize")).toThrow("bridge-internal");
  });
});

describe("server request matrix", () => {
  it("supports command and file approvals", () => {
    expect(classifyServerRequest("item/commandExecution/requestApproval")).toEqual({
      support: "supported",
      kind: "command_approval"
    });
    expect(classifyServerRequest("item/fileChange/requestApproval")).toEqual({
      support: "supported",
      kind: "file_approval"
    });
  });

  it("fails closed for unsupported server requests with explicit strategies", () => {
    expect(UNSUPPORTED_SERVER_REQUESTS).toMatchObject({
      "item/permissions/requestApproval": { strategy: "interrupt_then_jsonrpc_error" },
      "item/tool/requestUserInput": { strategy: "jsonrpc_error" },
      "mcpServer/elicitation/request": { strategy: "cancel" },
      "item/tool/call": { strategy: "jsonrpc_error" },
      "account/chatgptAuthTokens/refresh": { strategy: "jsonrpc_error" },
      applyPatchApproval: { strategy: "jsonrpc_error" },
      execCommandApproval: { strategy: "jsonrpc_error" }
    });
  });
});
