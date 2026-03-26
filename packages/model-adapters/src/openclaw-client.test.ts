import crypto from "node:crypto";
import os from "node:os";
import path from "node:path";
import { mkdtemp, rm } from "node:fs/promises";

import { afterEach, describe, expect, it } from "vitest";

import { loadOrCreateDeviceIdentity } from "./device-identity.js";
import { buildGatewayConnectRequestParams } from "./openclaw-client.js";

const ED25519_SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");

function base64UrlDecode(input: string) {
  const normalized = input.replaceAll("-", "+").replaceAll("_", "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  return Buffer.from(padded, "base64");
}

describe("buildGatewayConnectRequestParams", () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    await Promise.all(
      tempDirs.map(async (dir) => {
        await rm(dir, { recursive: true, force: true });
      }),
    );
    tempDirs.length = 0;
  });

  it("includes deviceFamily in the signed client metadata and produces a verifiable signature", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "clawback-openclaw-client-"));
    tempDirs.push(root);
    const identity = loadOrCreateDeviceIdentity(path.join(root, "gateway-client.json"));

    const params = buildGatewayConnectRequestParams({
      protocolVersion: 3,
      token: "clawback-local-token",
      clientId: "gateway-client",
      clientMode: "backend",
      clientDisplayName: "Clawback Control Plane",
      clientVersion: "0.1.0",
      platform: "darwin",
      deviceFamily: "darwin",
      scopes: ["operator.read", "operator.write", "operator.admin"],
      caps: ["tool-events"],
      nonce: "nonce-123",
      signedAtMs: 1_741_733_200_000,
      identity,
    });

    expect(params.client).toMatchObject({
      id: "gateway-client",
      mode: "backend",
      platform: "darwin",
      deviceFamily: "darwin",
    });
    expect(params.caps).toEqual(["tool-events"]);

    const payload = [
      "v3",
      params.device.id,
      params.client.id,
      params.client.mode,
      params.role,
      params.scopes.join(","),
      String(params.device.signedAt),
      params.auth?.token ?? "",
      params.device.nonce,
      params.client.platform,
      params.client.deviceFamily,
    ].join("|");

    const publicKey = crypto.createPublicKey({
      key: Buffer.concat([ED25519_SPKI_PREFIX, base64UrlDecode(params.device.publicKey)]),
      type: "spki",
      format: "der",
    });

    expect(
      crypto.verify(null, Buffer.from(payload, "utf8"), publicKey, base64UrlDecode(params.device.signature)),
    ).toBe(true);
  });
});
