import { Buffer } from "buffer";
import { WebhookVerificationError } from "@polar-sh/sdk/webhooks";
import { Webhook } from "standardwebhooks";
import { describe, expect, test } from "vitest";
import { validatePolarEvent } from "./webhooks.js";

const body = JSON.stringify({
  type: "customer.deleted",
  timestamp: new Date().toISOString(),
  data: {
    id: crypto.randomUUID(),
    created_at: new Date().toISOString(),
    modified_at: null,
    metadata: {},
    email: "customer@example.com",
    email_verified: true,
    type: "individual",
    name: null,
    billing_address: null,
    tax_id: null,
    organization_id: crypto.randomUUID(),
    deleted_at: new Date().toISOString(),
    avatar_url: "https://example.com/avatar.png",
  },
});

/** A secret generated on or after 2026-09-08: whsec_ and a base64 key. */
function standardSecret() {
  return `whsec_${Buffer.from(
    crypto.getRandomValues(new Uint8Array(32)),
  ).toString("base64")}`;
}

/** Signs the way Polar does for secrets generated before 2026-09-08. */
function signWithLegacyKey(secret: string) {
  return sign(new Webhook(Buffer.from(secret, "utf-8").toString("base64")));
}

/** Signs the way Polar does for secrets generated on or after 2026-09-08. */
function signWithStandardKey(secret: string) {
  return sign(new Webhook(secret));
}

function sign(webhook: Webhook) {
  const timestamp = new Date();
  return {
    "webhook-id": "msg_test",
    "webhook-timestamp": Math.floor(timestamp.getTime() / 1000).toString(),
    "webhook-signature": webhook.sign("msg_test", timestamp, body),
  };
}

describe("validatePolarEvent", () => {
  test("parses an event signed with a legacy secret", () => {
    const secret = "polar_whs_legacy";
    const event = validatePolarEvent(body, signWithLegacyKey(secret), secret);
    expect(event.type).toBe("customer.deleted");
  });

  test("parses an event signed with a legacy whsec_ secret", () => {
    const secret = "whsec_legacy-secret!";
    const event = validatePolarEvent(body, signWithLegacyKey(secret), secret);
    expect(event.type).toBe("customer.deleted");
  });

  test("parses an event signed with a Standard Webhooks secret", () => {
    const secret = standardSecret();
    const event = validatePolarEvent(body, signWithStandardKey(secret), secret);
    expect(event.type).toBe("customer.deleted");
  });

  test("rejects a signature made with another Standard Webhooks secret", () => {
    const headers = signWithStandardKey(standardSecret());
    expect(() => validatePolarEvent(body, headers, standardSecret())).toThrow(
      WebhookVerificationError,
    );
  });

  test("rejects a signature made with another legacy whsec_ secret", () => {
    const headers = signWithLegacyKey("whsec_legacy-secret!");
    expect(() =>
      validatePolarEvent(body, headers, "whsec_other-secret!"),
    ).toThrow(WebhookVerificationError);
  });

  test("rejects a body that differs from the signed one", () => {
    const secret = standardSecret();
    const headers = signWithStandardKey(secret);
    const tamperedBody = body.replace("customer@example.com", "x@example.com");
    expect(() => validatePolarEvent(tamperedBody, headers, secret)).toThrow(
      WebhookVerificationError,
    );
  });
});
