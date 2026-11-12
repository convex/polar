import { Buffer } from "buffer";
import { Webhook } from "standardwebhooks";
import {
  WebhookVerificationError,
  validateEvent,
} from "@polar-sh/sdk/webhooks";

const STANDARD_WEBHOOKS_SECRET_PREFIX = "whsec_";

/**
 * Verifies a Polar webhook delivery and parses its event.
 *
 * Polar signs with one of two keys, depending on when the endpoint secret was
 * generated (https://polar.sh/docs/integrate/webhooks/delivery):
 *
 * - Before 2026-09-08: the UTF-8 bytes of the whole secret. This is the only
 *   key `validateEvent` from `@polar-sh/sdk` 0.x knows.
 * - On or after 2026-09-08: Standard Webhooks, where the key is the base64
 *   part of the `whsec_` secret.
 *
 * Secrets of both kinds can start with `whsec_`, so the legacy key is tried
 * first and the Standard Webhooks key second.
 */
export function validatePolarEvent(
  body: string,
  headers: Record<string, string>,
  secret: string,
): ReturnType<typeof validateEvent> {
  try {
    return validateEvent(body, headers, secret);
  } catch (error) {
    if (
      !(error instanceof WebhookVerificationError) ||
      !secret.startsWith(STANDARD_WEBHOOKS_SECRET_PREFIX)
    ) {
      throw error;
    }
    if (!hasStandardWebhooksSignature(body, headers, secret)) {
      throw error;
    }
    // validateEvent is the SDK's only public event parser, and it only knows
    // the legacy key. The body is verified at this point, so sign it with the
    // legacy key for the parser.
    const legacySignature = new Webhook(legacyKey(secret)).sign(
      headers["webhook-id"],
      new Date(Number(headers["webhook-timestamp"]) * 1000),
      body,
    );
    return validateEvent(
      body,
      { ...headers, "webhook-signature": legacySignature },
      secret,
    );
  }
}

function hasStandardWebhooksSignature(
  body: string,
  headers: Record<string, string>,
  secret: string,
): boolean {
  try {
    // The constructor throws when the part after whsec_ is not base64, which
    // means this is a legacy secret.
    new Webhook(secret).verify(body, headers);
    return true;
  } catch {
    return false;
  }
}

function legacyKey(secret: string): string {
  return Buffer.from(secret, "utf-8").toString("base64");
}
