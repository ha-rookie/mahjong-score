export interface AuditEvent {
  readonly event: string;
  readonly requestId: string;
  readonly method: string;
  readonly path: string;
  readonly outcome: "success" | "failure";
  readonly userId?: string | null;
  readonly groupId?: string | null;
  readonly resourceType?: string;
  readonly resourceId?: string | null;
  readonly reason?: string;
}

export const requestCorrelationId = (request: Request) =>
  request.headers.get("cf-ray") ??
  request.headers.get("x-request-id") ??
  crypto.randomUUID();

export const writeAuditLog = (event: AuditEvent) => {
  console.info(JSON.stringify({
    kind: "audit",
    timestamp: new Date().toISOString(),
    ...event,
  }));
};
