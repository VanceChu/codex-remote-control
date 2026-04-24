export interface JsonlTransport {
  send(line: string): void;
  onLine(handler: (line: string) => void): void;
}

export interface JsonRpcRequest {
  id: string | number;
  method: string;
  params?: unknown;
}

export interface JsonRpcNotification {
  method: string;
  params?: unknown;
}

export type ServerRequestHandler = (request: JsonRpcRequest) => Promise<unknown> | unknown;
export type NotificationHandler = (notification: JsonRpcNotification) => void;

interface PendingRequest {
  resolve(value: unknown): void;
  reject(error: Error): void;
}

export class JsonRpcPeer {
  private readonly pending = new Map<string | number, PendingRequest>();
  private serverRequestHandler?: ServerRequestHandler;
  private notificationHandler?: NotificationHandler;
  private requestId = 0;

  constructor(private readonly transport: JsonlTransport) {
    this.transport.onLine((line) => {
      void this.handleLine(line);
    });
  }

  request(method: string, params: unknown): Promise<unknown> {
    const id = this.nextRequestId();
    const message = { id, method, params };
    const promise = new Promise<unknown>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
    });
    this.transport.send(JSON.stringify(message));
    return promise;
  }

  onServerRequest(handler: ServerRequestHandler): void {
    this.serverRequestHandler = handler;
  }

  onNotification(handler: NotificationHandler): void {
    this.notificationHandler = handler;
  }

  private async handleLine(line: string): Promise<void> {
    const message = JSON.parse(line) as unknown;
    if (!isRecord(message)) {
      return;
    }
    if ("id" in message && ("result" in message || "error" in message)) {
      this.handleResponse(message);
      return;
    }
    if (isJsonRpcRequest(message)) {
      await this.handleServerRequest(message);
      return;
    }
    if (isJsonRpcNotification(message)) {
      this.notificationHandler?.(message);
    }
  }

  private handleResponse(message: Record<string, unknown>): void {
    const id = message.id;
    if (typeof id !== "string" && typeof id !== "number") {
      return;
    }
    const pending = this.pending.get(id);
    if (!pending) {
      return;
    }
    this.pending.delete(id);
    if ("error" in message && message.error !== undefined) {
      pending.reject(jsonRpcErrorToError(message.error));
      return;
    }
    pending.resolve(message.result);
  }

  private async handleServerRequest(request: JsonRpcRequest): Promise<void> {
    if (!this.serverRequestHandler) {
      this.sendError(request.id, -32601, "No server request handler registered");
      return;
    }
    try {
      const result = await this.serverRequestHandler(request);
      this.transport.send(JSON.stringify({ id: request.id, result }));
    } catch (error) {
      this.sendError(
        request.id,
        -32000,
        error instanceof Error ? error.message : "Server request failed"
      );
    }
  }

  private sendError(id: string | number, code: number, message: string): void {
    this.transport.send(JSON.stringify({ id, error: { code, message } }));
  }

  private nextRequestId(): number {
    this.requestId += 1;
    return this.requestId;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isJsonRpcRequest(value: unknown): value is JsonRpcRequest {
  if (!isRecord(value)) {
    return false;
  }
  return (
    (typeof value.id === "string" || typeof value.id === "number") &&
    typeof value.method === "string"
  );
}

function isJsonRpcNotification(value: unknown): value is JsonRpcNotification {
  if (!isRecord(value)) {
    return false;
  }
  return !("id" in value) && typeof value.method === "string";
}

function jsonRpcErrorToError(value: unknown): Error {
  if (isRecord(value) && typeof value.message === "string") {
    return new Error(value.message);
  }
  return new Error("JSON-RPC request failed");
}
