import type { WhatsAppConnectionConfig } from "./types.js";

export function normalizeWhatsAppConfig(rawConfig: unknown): WhatsAppConnectionConfig {
  const config = (rawConfig && typeof rawConfig === "object"
    ? rawConfig
    : {}) as Partial<WhatsAppConnectionConfig>;

  return {
    transportMode:
      config.transportMode === "openclaw_pairing" || config.transportMode === "meta_cloud_api"
        ? config.transportMode
        : "meta_cloud_api",
    phoneNumberId:
      typeof config.phoneNumberId === "string" ? config.phoneNumberId : "",
    accessToken:
      typeof config.accessToken === "string" ? config.accessToken : "",
    verifyToken:
      typeof config.verifyToken === "string" ? config.verifyToken : "",
    validatedDisplayName:
      typeof config.validatedDisplayName === "string"
        ? config.validatedDisplayName
        : null,
    pairingStatus:
      config.pairingStatus === "unpaired" || config.pairingStatus === "paired" || config.pairingStatus === "error"
        ? config.pairingStatus
        : null,
    pairedIdentityRef:
      typeof config.pairedIdentityRef === "string" ? config.pairedIdentityRef : null,
    lastProbeAt:
      typeof config.lastProbeAt === "string" ? config.lastProbeAt : null,
    lastProbeError:
      typeof config.lastProbeError === "string" ? config.lastProbeError : null,
  };
}
