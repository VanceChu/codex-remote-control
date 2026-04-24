export type ApprovalKind = "command_approval" | "file_approval";

export interface ApprovalRequestRecord {
  requestId: string;
  threadId: string;
  turnId: string;
  itemId: string;
  kind: ApprovalKind;
  expiresAt: number;
}

type ApprovalRecord = ApprovalRequestRecord & {
  resolvedBy?: string;
};

export type ApprovalResolveResult =
  | { status: "accepted"; resolvedBy: string }
  | { status: "already_resolved"; resolvedBy: string }
  | { status: "expired" }
  | { status: "not_found" };

export class ApprovalState {
  private readonly requests = new Map<string, ApprovalRecord>();

  open(request: ApprovalRequestRecord): void {
    this.requests.set(request.requestId, { ...request });
  }

  resolve(requestId: string, deviceId: string, now: number): ApprovalResolveResult {
    const request = this.requests.get(requestId);
    if (!request) {
      return { status: "not_found" };
    }
    if (request.resolvedBy) {
      return { status: "already_resolved", resolvedBy: request.resolvedBy };
    }
    if (now > request.expiresAt) {
      this.requests.delete(requestId);
      return { status: "expired" };
    }
    request.resolvedBy = deviceId;
    return { status: "accepted", resolvedBy: deviceId };
  }
}
