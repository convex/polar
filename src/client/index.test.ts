import { describe, expect, test, vi } from "vitest";
import { Polar } from "./index.js";
import { createHmac } from "node:crypto";
import { defineSchema, httpRouter } from "convex/server";
import { defineTestApp } from "convex-test";
import componentTest from "../test.js";

const polarSdkMocks = vi.hoisted(() => ({
  createCheckouts: vi.fn(),
  listCustomers: vi.fn(),
  createCustomers: vi.fn(),
}));

vi.mock("@polar-sh/sdk/2026-10/services/checkouts", () => ({
  createCheckouts: () => polarSdkMocks.createCheckouts,
}));

vi.mock("@polar-sh/sdk/2026-10/services/customers", () => ({
  listCustomers: () => polarSdkMocks.listCustomers,
  createCustomers: () => polarSdkMocks.createCustomers,
}));

const app = defineTestApp({
  schema: defineSchema({}),
  components: {
    polar: componentTest,
  },
});

const webhookSecret = "polar_whs_test_secret";
const receivedEvents: unknown[] = [];

const polar = new Polar(app.components.polar, {
  getUserInfo: async () => ({
    userId: "user_123",
    email: "test@example.com",
  }),
  webhookSecret,
});

const http = httpRouter();
polar.registerRoutes(http, {
  events: {
    "subscription.created": async (_ctx, event) => {
      receivedEvents.push(event);
    },
  },
});

const { api, createTest } = app.defineModules({
  checkout: {
    generateCheckoutLink: polar.api().generateCheckoutLink,
  },
  http: { default: http },
});

function signedWebhook(body: string, secret = webhookSecret): RequestInit {
  const id = "msg_test_1";
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signature = createHmac("sha256", secret)
    .update(`${id}.${timestamp}.${body}`)
    .digest("base64");
  return {
    method: "POST",
    body,
    headers: {
      "webhook-id": id,
      "webhook-timestamp": timestamp,
      "webhook-signature": `v1,${signature}`,
    },
  };
}

describe("generateCheckoutLink", () => {
  test("appends locale as query param if provided", async () => {
    polarSdkMocks.listCustomers.mockResolvedValue({
      items: [{ id: "cust_123" }],
    });
    polarSdkMocks.createCheckouts.mockResolvedValue({
      url: "https://checkout.polar.sh/session?foo=bar",
    });

    const t = createTest();
    const result = await t.action(api.checkout.generateCheckoutLink, {
      productIds: ["prod_1"],
      origin: "https://example.com",
      successUrl: "https://example.com/success",
      locale: "fr",
    });

    expect(result.url).toContain("locale=fr");
    expect(result.url).toMatch(/^https:\/\//);
  });

  test("does not append locale if not provided", async () => {
    polarSdkMocks.listCustomers.mockResolvedValue({
      items: [{ id: "cust_123" }],
    });
    polarSdkMocks.createCheckouts.mockResolvedValue({
      url: "https://checkout.polar.sh/session?foo=bar",
    });

    const t = createTest();
    const result = await t.action(api.checkout.generateCheckoutLink, {
      productIds: ["prod_1"],
      origin: "https://example.com",
      successUrl: "https://example.com/success",
    });

    expect(result.url).not.toContain("locale=");
    expect(result.url).toMatch(/^https:\/\//);
  });
});

describe("webhook route", () => {
  const body = JSON.stringify({
    type: "subscription.created",
    timestamp: "2026-10-01T00:00:00Z",
    api_version: "2026-10",
    data: {
      id: "sub_wh_1",
      customer_id: "cust_1",
      product_id: "prod_1",
      checkout_id: null,
      created_at: "2026-10-01T00:00:00Z",
      modified_at: "2026-10-01T00:00:01Z",
      amount: 1000,
      currency: "usd",
      recurring_interval: "month",
      recurring_interval_count: 1,
      status: "active",
      current_period_start: "2026-10-01T00:00:00Z",
      current_period_end: "2026-11-01T00:00:00Z",
      trial_start: null,
      trial_end: null,
      cancel_at_period_end: false,
      canceled_at: null,
      started_at: "2026-10-01T00:00:00Z",
      ends_at: null,
      ended_at: null,
      discount_id: null,
      seats: null,
      customer_cancellation_reason: null,
      customer_cancellation_comment: null,
      metadata: {},
    },
  });

  test("stores a signed subscription.created event and calls the handler", async () => {
    receivedEvents.length = 0;
    const t = createTest();
    const response = await t.fetch("/polar/events", signedWebhook(body));
    expect(response.status).toBe(202);

    const stored = await t.query(app.components.polar.lib.getSubscription, {
      id: "sub_wh_1",
    });
    expect(stored).toMatchObject({
      id: "sub_wh_1",
      customerId: "cust_1",
      productId: "prod_1",
      currentPeriodEnd: "2026-11-01T00:00:00Z",
      modifiedAt: "2026-10-01T00:00:01Z",
    });
    expect(receivedEvents).toEqual([JSON.parse(body)]);
  });

  test("rejects a request signed with the wrong secret", async () => {
    const t = createTest();
    const response = await t.fetch(
      "/polar/events",
      signedWebhook(body, "wrong_secret"),
    );
    expect(response.status).toBe(403);

    const stored = await t.query(app.components.polar.lib.getSubscription, {
      id: "sub_wh_1",
    });
    expect(stored).toBeNull();
  });
});
