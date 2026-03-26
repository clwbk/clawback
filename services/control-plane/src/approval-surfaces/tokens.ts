import crypto from "node:crypto";

import type { ApprovalSurfaceActionTokenPayload } from "./types.js";

function encode(value: string) {
  return Buffer.from(value, "utf8").toString("base64url");
}

function decode(value: string) {
  return Buffer.from(value, "base64url").toString("utf8");
}

export class ApprovalSurfaceTokenError extends Error {
  readonly code = "approval_surface_token_invalid";
  readonly statusCode = 401;

  constructor(message: string) {
    super(message);
  }
}

export class ApprovalSurfaceTokenSigner {
  constructor(
    private readonly secret: string,
    private readonly now: () => Date = () => new Date(),
  ) {
    if (!secret || secret.length < 16) {
      throw new Error("Approval surface token secret must be configured.");
    }
  }

  sign(payload: ApprovalSurfaceActionTokenPayload) {
    const body = encode(JSON.stringify(payload));
    const signature = crypto.createHmac("sha256", this.secret).update(body).digest("base64url");
    return `${body}.${signature}`;
  }

  verify(token: string): ApprovalSurfaceActionTokenPayload {
    const [body, providedSignature] = token.split(".");
    if (!body || !providedSignature) {
      throw new ApprovalSurfaceTokenError("Approval action token is malformed.");
    }

    const expectedSignature = crypto.createHmac("sha256", this.secret).update(body).digest("base64url");
    const providedBuffer = Buffer.from(providedSignature, "utf8");
    const expectedBuffer = Buffer.from(expectedSignature, "utf8");
    if (
      providedBuffer.length !== expectedBuffer.length
      || !crypto.timingSafeEqual(providedBuffer, expectedBuffer)
    ) {
      throw new ApprovalSurfaceTokenError("Approval action token is invalid.");
    }

    let payload: ApprovalSurfaceActionTokenPayload;
    try {
      payload = JSON.parse(decode(body)) as ApprovalSurfaceActionTokenPayload;
    } catch {
      throw new ApprovalSurfaceTokenError("Approval action token could not be decoded.");
    }

    if (payload.version !== 1) {
      throw new ApprovalSurfaceTokenError("Approval action token version is unsupported.");
    }
    const expiresAt = Date.parse(payload.expiresAt);
    if (Number.isNaN(expiresAt) || expiresAt <= this.now().getTime()) {
      throw new ApprovalSurfaceTokenError("Approval action token has expired.");
    }

    return payload;
  }
}
