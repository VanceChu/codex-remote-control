export const PRODUCT_CODEX_REQUESTS = [
  "thread/list",
  "thread/read",
  "thread/turns/list",
  "thread/start",
  "thread/resume",
  "turn/start",
  "turn/interrupt"
] as const;

export type ProductCodexRequest = (typeof PRODUCT_CODEX_REQUESTS)[number];

export const BRIDGE_INTERNAL_CODEX_REQUESTS = ["initialize", "thread/unsubscribe"] as const;

const productRequestSet = new Set<string>(PRODUCT_CODEX_REQUESTS);
const bridgeInternalSet = new Set<string>(BRIDGE_INTERNAL_CODEX_REQUESTS);

export function assertAllowedCodexRequest(method: string): asserts method is ProductCodexRequest {
  if (bridgeInternalSet.has(method)) {
    throw new Error(`Codex method ${method} is bridge-internal and not exposed to PWA`);
  }
  if (!productRequestSet.has(method)) {
    throw new Error(`Codex method ${method} is not exposed by the remote-control whitelist`);
  }
}

export type SupportedServerRequest =
  | { support: "supported"; kind: "command_approval" }
  | { support: "supported"; kind: "file_approval" };

export type UnsupportedStrategy = "interrupt_then_jsonrpc_error" | "jsonrpc_error" | "cancel";

export interface UnsupportedServerRequest {
  readonly support: "unsupported";
  readonly strategy: UnsupportedStrategy;
  readonly reason: string;
}

export const UNSUPPORTED_SERVER_REQUESTS = {
  "item/permissions/requestApproval": {
    support: "unsupported",
    strategy: "interrupt_then_jsonrpc_error",
    reason:
      "Permissions approval deny semantics are not supported until the real app-server spike passes."
  },
  "item/tool/requestUserInput": {
    support: "unsupported",
    strategy: "jsonrpc_error",
    reason: "Remote request_user_input is not part of the MVP."
  },
  "mcpServer/elicitation/request": {
    support: "unsupported",
    strategy: "cancel",
    reason: "MCP elicitation must be handled locally in the MVP."
  },
  "item/tool/call": {
    support: "unsupported",
    strategy: "jsonrpc_error",
    reason: "Dynamic client-side tool calls are not exposed remotely."
  },
  "account/chatgptAuthTokens/refresh": {
    support: "unsupported",
    strategy: "jsonrpc_error",
    reason: "Account token refresh must stay local to the bridge host."
  },
  applyPatchApproval: {
    support: "unsupported",
    strategy: "jsonrpc_error",
    reason: "Legacy apply-patch approval is not supported by the remote MVP."
  },
  execCommandApproval: {
    support: "unsupported",
    strategy: "jsonrpc_error",
    reason: "Legacy exec approval is not supported by the remote MVP."
  }
} as const satisfies Record<string, UnsupportedServerRequest>;

export type ServerRequestClassification = SupportedServerRequest | UnsupportedServerRequest;

export function classifyServerRequest(method: string): ServerRequestClassification {
  if (method === "item/commandExecution/requestApproval") {
    return { support: "supported", kind: "command_approval" };
  }
  if (method === "item/fileChange/requestApproval") {
    return { support: "supported", kind: "file_approval" };
  }
  return (
    UNSUPPORTED_SERVER_REQUESTS[method as keyof typeof UNSUPPORTED_SERVER_REQUESTS] ?? {
      support: "unsupported",
      strategy: "jsonrpc_error",
      reason: "Unknown server request is not supported by the remote MVP."
    }
  );
}
