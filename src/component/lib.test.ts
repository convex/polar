/// <reference types="vite/client" />
import { describe, it, expect, beforeEach } from "vitest";
import { convexTest } from "convex-test";
import type { TestConvex } from "convex-test";
import type { Infer } from "convex/values";
import schema from "./schema.js";
import { api } from "./_generated/api.js";
import {
  convertToDatabaseProduct,
  convertToDatabaseSubscription,
} from "./util.js";
import type { models } from "@polar-sh/sdk/2026-10";

type Product = models.Product;
type Subscription = models.Subscription;

const modules = import.meta.glob("./**/*.ts");

// Types derived from schema validators
type DbSubscription = Infer<typeof schema.tables.subscriptions.validator>;
type DbProduct = Infer<typeof schema.tables.products.validator>;
type DbCustomer = Infer<typeof schema.tables.customers.validator>;

// Helper to create a minimal valid subscription for testing
function createTestSubscription(
  overrides: Partial<DbSubscription> = {},
): DbSubscription {
  return {
    id: "sub_123",
    customerId: "cust_456",
    productId: "prod_789",
    checkoutId: "checkout_abc",
    createdAt: "2025-01-15T10:00:00.000Z",
    modifiedAt: "2025-01-16T12:00:00.000Z",
    amount: 1000,
    currency: "usd",
    recurringInterval: "month",
    status: "active",
    currentPeriodStart: "2025-01-15T10:00:00.000Z",
    currentPeriodEnd: "2025-02-15T10:00:00.000Z",
    cancelAtPeriodEnd: false,
    startedAt: "2025-01-15T10:00:00.000Z",
    endedAt: null,
    metadata: {},
    ...overrides,
  };
}

// Helper to create a minimal valid product for testing
function createTestProduct(overrides: Partial<DbProduct> = {}): DbProduct {
  return {
    id: "prod_123",
    organizationId: "org_456",
    name: "Test Product",
    description: "A test product",
    isRecurring: true,
    isArchived: false,
    createdAt: "2025-01-10T08:00:00.000Z",
    modifiedAt: "2025-01-12T09:00:00.000Z",
    recurringInterval: "month",
    metadata: {},
    prices: [],
    medias: [],
    benefits: [],
    ...overrides,
  };
}

// Helper to create a minimal valid customer for testing
function createTestCustomer(overrides: Partial<DbCustomer> = {}): DbCustomer {
  return {
    id: "cust_123",
    userId: "user_456",
    ...overrides,
  };
}

// Helper to create SDK-shaped Product objects (snake_case fields, ISO string timestamps)
function createSdkProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: "prod_123",
    organization_id: "org_456",
    name: "Test Product",
    description: "A test product",
    is_recurring: true,
    is_archived: false,
    created_at: "2025-01-10T08:00:00.000Z",
    modified_at: "2025-01-12T09:00:00.000Z",
    recurring_interval: "month",
    recurring_interval_count: 1,
    trial_interval: null,
    trial_interval_count: null,
    metadata: {},
    prices: [],
    benefits: [],
    medias: [],
    attached_custom_fields: [],
    ...overrides,
  } as Product;
}

describe("createSubscription mutation", () => {
  let t: TestConvex<typeof schema>;

  beforeEach(() => {
    t = convexTest(schema, modules);
  });

  it("inserts when no existing record", async () => {
    const subscription = createTestSubscription();

    await t.mutation(api.lib.createSubscription, { subscription });

    const result = await t.query(api.lib.getSubscription, { id: "sub_123" });
    expect(result).not.toBeNull();
    expect(result?.id).toBe("sub_123");
    expect(result?.status).toBe("active");
  });

  it("patches when existing record has older modifiedAt", async () => {
    const oldSubscription = createTestSubscription({
      modifiedAt: "2025-01-15T10:00:00.000Z",
      status: "active",
    });
    await t.mutation(api.lib.createSubscription, {
      subscription: oldSubscription,
    });

    const newSubscription = createTestSubscription({
      modifiedAt: "2025-01-16T12:00:00.000Z",
      status: "canceled",
    });
    await t.mutation(api.lib.createSubscription, {
      subscription: newSubscription,
    });

    const result = await t.query(api.lib.getSubscription, { id: "sub_123" });
    expect(result?.status).toBe("canceled");
    expect(result?.modifiedAt).toBe("2025-01-16T12:00:00.000Z");
  });

  it("skips when existing record has newer modifiedAt (stale webhook)", async () => {
    const newSubscription = createTestSubscription({
      modifiedAt: "2025-01-20T10:00:00.000Z",
      status: "active",
    });
    await t.mutation(api.lib.createSubscription, {
      subscription: newSubscription,
    });

    const staleSubscription = createTestSubscription({
      modifiedAt: "2025-01-15T10:00:00.000Z",
      status: "canceled",
    });
    await t.mutation(api.lib.createSubscription, {
      subscription: staleSubscription,
    });

    const result = await t.query(api.lib.getSubscription, { id: "sub_123" });
    expect(result?.status).toBe("active");
    expect(result?.modifiedAt).toBe("2025-01-20T10:00:00.000Z");
  });

  it("patches when modifiedAt values are equal", async () => {
    const subscription1 = createTestSubscription({
      modifiedAt: "2025-01-15T10:00:00.000Z",
      status: "active",
    });
    await t.mutation(api.lib.createSubscription, {
      subscription: subscription1,
    });

    const subscription2 = createTestSubscription({
      modifiedAt: "2025-01-15T10:00:00.000Z",
      status: "canceled",
    });
    await t.mutation(api.lib.createSubscription, {
      subscription: subscription2,
    });

    const result = await t.query(api.lib.getSubscription, { id: "sub_123" });
    expect(result?.status).toBe("canceled");
  });

  it("treats null modifiedAt as oldest", async () => {
    const subscription1 = createTestSubscription({
      modifiedAt: null,
      status: "active",
    });
    await t.mutation(api.lib.createSubscription, {
      subscription: subscription1,
    });

    const subscription2 = createTestSubscription({
      modifiedAt: "2025-01-15T10:00:00.000Z",
      status: "canceled",
    });
    await t.mutation(api.lib.createSubscription, {
      subscription: subscription2,
    });

    const result = await t.query(api.lib.getSubscription, { id: "sub_123" });
    expect(result?.status).toBe("canceled");
  });
});

describe("updateSubscription mutation", () => {
  let t: TestConvex<typeof schema>;

  beforeEach(() => {
    t = convexTest(schema, modules);
  });

  it("inserts when no existing record (upsert behavior)", async () => {
    const subscription = createTestSubscription();

    await t.mutation(api.lib.updateSubscription, { subscription });

    const result = await t.query(api.lib.getSubscription, { id: "sub_123" });
    expect(result).not.toBeNull();
    expect(result?.id).toBe("sub_123");
  });

  it("patches when existing record has older modifiedAt", async () => {
    const oldSubscription = createTestSubscription({
      modifiedAt: "2025-01-15T10:00:00.000Z",
      status: "active",
    });
    await t.mutation(api.lib.createSubscription, {
      subscription: oldSubscription,
    });

    const newSubscription = createTestSubscription({
      modifiedAt: "2025-01-16T12:00:00.000Z",
      status: "canceled",
    });
    await t.mutation(api.lib.updateSubscription, {
      subscription: newSubscription,
    });

    const result = await t.query(api.lib.getSubscription, { id: "sub_123" });
    expect(result?.status).toBe("canceled");
  });

  it("skips when existing record has newer modifiedAt (stale webhook)", async () => {
    const newSubscription = createTestSubscription({
      modifiedAt: "2025-01-20T10:00:00.000Z",
      status: "active",
    });
    await t.mutation(api.lib.createSubscription, {
      subscription: newSubscription,
    });

    const staleSubscription = createTestSubscription({
      modifiedAt: "2025-01-15T10:00:00.000Z",
      status: "canceled",
    });
    await t.mutation(api.lib.updateSubscription, {
      subscription: staleSubscription,
    });

    const result = await t.query(api.lib.getSubscription, { id: "sub_123" });
    expect(result?.status).toBe("active");
  });
});

describe("createProduct mutation", () => {
  let t: TestConvex<typeof schema>;

  beforeEach(() => {
    t = convexTest(schema, modules);
  });

  it("inserts when no existing record", async () => {
    const product = createTestProduct();

    await t.mutation(api.lib.createProduct, { product });

    const result = await t.query(api.lib.getProduct, { id: "prod_123" });
    expect(result).not.toBeNull();
    expect(result?.id).toBe("prod_123");
    expect(result?.name).toBe("Test Product");
  });

  it("patches when existing record has older modifiedAt", async () => {
    const oldProduct = createTestProduct({
      modifiedAt: "2025-01-10T10:00:00.000Z",
      name: "Old Name",
    });
    await t.mutation(api.lib.createProduct, { product: oldProduct });

    const newProduct = createTestProduct({
      modifiedAt: "2025-01-15T10:00:00.000Z",
      name: "New Name",
    });
    await t.mutation(api.lib.createProduct, { product: newProduct });

    const result = await t.query(api.lib.getProduct, { id: "prod_123" });
    expect(result?.name).toBe("New Name");
  });

  it("skips when existing record has newer modifiedAt (stale webhook)", async () => {
    const newProduct = createTestProduct({
      modifiedAt: "2025-01-20T10:00:00.000Z",
      name: "Current Name",
    });
    await t.mutation(api.lib.createProduct, { product: newProduct });

    const staleProduct = createTestProduct({
      modifiedAt: "2025-01-10T10:00:00.000Z",
      name: "Stale Name",
    });
    await t.mutation(api.lib.createProduct, { product: staleProduct });

    const result = await t.query(api.lib.getProduct, { id: "prod_123" });
    expect(result?.name).toBe("Current Name");
  });

  it("treats null modifiedAt as oldest", async () => {
    const product1 = createTestProduct({
      modifiedAt: null,
      name: "Original Name",
    });
    await t.mutation(api.lib.createProduct, { product: product1 });

    const product2 = createTestProduct({
      modifiedAt: "2025-01-15T10:00:00.000Z",
      name: "Updated Name",
    });
    await t.mutation(api.lib.createProduct, { product: product2 });

    const result = await t.query(api.lib.getProduct, { id: "prod_123" });
    expect(result?.name).toBe("Updated Name");
  });
});

describe("updateProduct mutation", () => {
  let t: TestConvex<typeof schema>;

  beforeEach(() => {
    t = convexTest(schema, modules);
  });

  it("inserts when no existing record (upsert behavior)", async () => {
    const product = createTestProduct();

    await t.mutation(api.lib.updateProduct, { product });

    const result = await t.query(api.lib.getProduct, { id: "prod_123" });
    expect(result).not.toBeNull();
    expect(result?.id).toBe("prod_123");
  });

  it("patches when existing record has older modifiedAt", async () => {
    const oldProduct = createTestProduct({
      modifiedAt: "2025-01-10T10:00:00.000Z",
      name: "Old Name",
    });
    await t.mutation(api.lib.createProduct, { product: oldProduct });

    const newProduct = createTestProduct({
      modifiedAt: "2025-01-15T10:00:00.000Z",
      name: "New Name",
    });
    await t.mutation(api.lib.updateProduct, { product: newProduct });

    const result = await t.query(api.lib.getProduct, { id: "prod_123" });
    expect(result?.name).toBe("New Name");
  });

  it("skips when existing record has newer modifiedAt (stale webhook)", async () => {
    const newProduct = createTestProduct({
      modifiedAt: "2025-01-20T10:00:00.000Z",
      name: "Current Name",
    });
    await t.mutation(api.lib.createProduct, { product: newProduct });

    const staleProduct = createTestProduct({
      modifiedAt: "2025-01-10T10:00:00.000Z",
      name: "Stale Name",
    });
    await t.mutation(api.lib.updateProduct, { product: staleProduct });

    const result = await t.query(api.lib.getProduct, { id: "prod_123" });
    expect(result?.name).toBe("Current Name");
  });
});

describe("product price types (SDK → converter → DB round-trip)", () => {
  let t: TestConvex<typeof schema>;

  beforeEach(() => {
    t = convexTest(schema, modules);
  });

  it("converts and stores fixed price from SDK format", async () => {
    const sdkProduct = createSdkProduct({
      prices: [
        {
          id: "price_fixed",
          product_id: "prod_123",
          created_at: "2025-01-10T08:00:00.000Z",
          modified_at: null,
          source: "catalog",
          amount_type: "fixed",
          is_archived: false,
          type: "recurring",
          recurring_interval: "month",
          price_currency: "usd",
          price_amount: 1000,
        },
      ] as unknown as Product["prices"],
    });

    const dbProduct = convertToDatabaseProduct(sdkProduct);
    await t.mutation(api.lib.createProduct, { product: dbProduct });
    const result = await t.query(api.lib.getProduct, { id: "prod_123" });

    expect(result?.prices).toHaveLength(1);
    expect(result?.prices[0].amountType).toBe("fixed");
    expect(result?.prices[0].priceAmount).toBe(1000);
    expect(result?.prices[0].priceCurrency).toBe("usd");
    expect(result?.prices[0].source).toBe("catalog");
    expect(result?.prices[0].createdAt).toBe("2025-01-10T08:00:00.000Z");
  });

  it("converts and stores custom price from SDK format", async () => {
    const sdkProduct = createSdkProduct({
      is_recurring: false,
      recurring_interval: null,
      prices: [
        {
          id: "price_custom",
          product_id: "prod_123",
          created_at: "2025-01-10T08:00:00.000Z",
          modified_at: null,
          source: "catalog",
          amount_type: "custom",
          is_archived: false,
          price_currency: "usd",
          minimum_amount: 500,
          maximum_amount: 10000,
          preset_amount: 2000,
        },
      ] as unknown as Product["prices"],
    });

    const dbProduct = convertToDatabaseProduct(sdkProduct);
    await t.mutation(api.lib.createProduct, { product: dbProduct });
    const result = await t.query(api.lib.getProduct, { id: "prod_123" });

    expect(result?.prices).toHaveLength(1);
    expect(result?.prices[0].amountType).toBe("custom");
    expect(result?.prices[0].priceCurrency).toBe("usd");
    expect(result?.prices[0].minimumAmount).toBe(500);
    expect(result?.prices[0].maximumAmount).toBe(10000);
    expect(result?.prices[0].presetAmount).toBe(2000);
  });

  it("converts and stores free price from SDK format", async () => {
    const sdkProduct = createSdkProduct({
      prices: [
        {
          id: "price_free",
          product_id: "prod_123",
          created_at: "2025-01-10T08:00:00.000Z",
          modified_at: null,
          source: "catalog",
          amount_type: "free",
          is_archived: false,
          type: "recurring",
          recurring_interval: "month",
        },
      ] as unknown as Product["prices"],
    });

    const dbProduct = convertToDatabaseProduct(sdkProduct);
    await t.mutation(api.lib.createProduct, { product: dbProduct });
    const result = await t.query(api.lib.getProduct, { id: "prod_123" });

    expect(result?.prices).toHaveLength(1);
    expect(result?.prices[0].amountType).toBe("free");
  });

  it("converts and stores seat-based price from SDK format", async () => {
    const sdkProduct = createSdkProduct({
      prices: [
        {
          id: "price_seat",
          product_id: "prod_123",
          created_at: "2025-01-10T08:00:00.000Z",
          modified_at: null,
          source: "catalog",
          amount_type: "seat_based",
          is_archived: false,
          price_currency: "usd",
          seat_tiers: {
            tiers: [
              { min_seats: 1, max_seats: 5, price_per_seat: 1000 },
              { min_seats: 6, max_seats: null, price_per_seat: 800 },
            ],
            minimum_seats: 1,
            maximum_seats: null,
          },
        },
      ] as unknown as Product["prices"],
    });

    const dbProduct = convertToDatabaseProduct(sdkProduct);
    await t.mutation(api.lib.createProduct, { product: dbProduct });
    const result = await t.query(api.lib.getProduct, { id: "prod_123" });

    expect(result?.prices).toHaveLength(1);
    expect(result?.prices[0].amountType).toBe("seat_based");
    expect(result?.prices[0].seatTiers).toHaveLength(2);
    expect(result?.prices[0].seatTiers?.[0].minSeats).toBe(1);
    expect(result?.prices[0].seatTiers?.[0].maxSeats).toBe(5);
    expect(result?.prices[0].seatTiers?.[0].pricePerSeat).toBe(1000);
    expect(result?.prices[0].seatTiers?.[1].maxSeats).toBeNull();
  });

  it("converts and stores metered unit price from SDK format", async () => {
    const sdkProduct = createSdkProduct({
      prices: [
        {
          id: "price_metered",
          product_id: "prod_123",
          created_at: "2025-01-10T08:00:00.000Z",
          modified_at: null,
          source: "catalog",
          amount_type: "metered_unit",
          is_archived: false,
          price_currency: "usd",
          unit_amount: "0.01",
          cap_amount: 5000,
          meter_id: "meter_123",
          meter: { id: "meter_123", name: "API Calls" },
        },
      ] as unknown as Product["prices"],
    });

    const dbProduct = convertToDatabaseProduct(sdkProduct);
    await t.mutation(api.lib.createProduct, { product: dbProduct });
    const result = await t.query(api.lib.getProduct, { id: "prod_123" });

    expect(result?.prices).toHaveLength(1);
    expect(result?.prices[0].amountType).toBe("metered_unit");
    expect(result?.prices[0].unitAmount).toBe("0.01");
    expect(result?.prices[0].capAmount).toBe(5000);
    expect(result?.prices[0].meterId).toBe("meter_123");
    expect(result?.prices[0].meter).toEqual({
      id: "meter_123",
      name: "API Calls",
    });
  });

  it("converts and stores benefits from SDK format", async () => {
    const sdkProduct = createSdkProduct({
      benefits: [
        {
          id: "benefit_123",
          created_at: "2025-01-10T08:00:00.000Z",
          modified_at: null,
          type: "custom",
          description: "Priority support",
          selectable: true,
          deletable: false,
          organization_id: "org_456",
          metadata: {},
          properties: { note: null },
        },
      ] as unknown as Product["benefits"],
    });

    const dbProduct = convertToDatabaseProduct(sdkProduct);
    await t.mutation(api.lib.createProduct, { product: dbProduct });
    const result = await t.query(api.lib.getProduct, { id: "prod_123" });

    expect(result?.benefits).toHaveLength(1);
    expect(result?.benefits?.[0].id).toBe("benefit_123");
    expect(result?.benefits?.[0].description).toBe("Priority support");
    expect(result?.benefits?.[0].selectable).toBe(true);
    expect(result?.benefits?.[0].deletable).toBe(false);
    expect(result?.benefits?.[0].createdAt).toBe("2025-01-10T08:00:00.000Z");
  });
});

// Helper to build a minimal SDK Subscription, cast to the full type
function createSdkSubscription(
  overrides: Partial<Record<string, unknown>> = {},
): Subscription {
  return {
    id: "sub_sdk_123",
    customer_id: "cust_456",
    product_id: "prod_789",
    checkout_id: "checkout_abc",
    created_at: "2025-01-15T10:00:00.000Z",
    modified_at: "2025-01-16T12:00:00.000Z",
    amount: 1000,
    currency: "usd",
    recurring_interval: "month",
    recurring_interval_count: 1,
    status: "active",
    current_period_start: "2025-01-15T10:00:00.000Z",
    current_period_end: "2025-02-15T10:00:00.000Z",
    trial_start: null,
    trial_end: null,
    cancel_at_period_end: false,
    canceled_at: null,
    started_at: "2025-01-15T10:00:00.000Z",
    ends_at: null,
    ended_at: null,
    discount_id: null,
    seats: null,
    customer_cancellation_reason: null,
    customer_cancellation_comment: null,
    metadata: {},
    custom_field_data: undefined,
    ...overrides,
  } as unknown as Subscription;
}

describe("new-style prices (type/recurringInterval derived from product)", () => {
  let t: TestConvex<typeof schema>;

  beforeEach(() => {
    t = convexTest(schema, modules);
  });

  it("new-style ProductPriceFixed on recurring yearly product derives type:recurring and recurringInterval:year from product", async () => {
    // SDK 0.45.0: ProductPriceFixed no longer carries type/recurringInterval.
    // The converter must derive both from the product fields.
    const sdkProduct = createSdkProduct({
      is_recurring: true,
      recurring_interval: "year",
      recurring_interval_count: 1,
      prices: [
        {
          id: "price_fixed_yr",
          product_id: "prod_123",
          created_at: "2025-01-10T08:00:00.000Z",
          modified_at: null,
          source: "catalog",
          amount_type: "fixed",
          is_archived: false,
          price_currency: "usd",
          price_amount: 9900,
        },
      ] as unknown as Product["prices"],
    });

    const dbProduct = convertToDatabaseProduct(sdkProduct);
    await t.mutation(api.lib.createProduct, { product: dbProduct });
    const result = await t.query(api.lib.getProduct, { id: "prod_123" });

    expect(result?.prices[0].amountType).toBe("fixed");
    expect(result?.prices[0].priceAmount).toBe(9900);
    expect(result?.prices[0].type).toBe("recurring");
    expect(result?.prices[0].recurringInterval).toBe("year");
  });

  it("new-style ProductPriceFixed on one-time product derives type:one_time and null recurringInterval", async () => {
    const sdkProduct = createSdkProduct({
      is_recurring: false,
      recurring_interval: null,
      prices: [
        {
          id: "price_fixed_ot",
          product_id: "prod_123",
          created_at: "2025-01-10T08:00:00.000Z",
          modified_at: null,
          source: "catalog",
          amount_type: "fixed",
          is_archived: false,
          price_currency: "eur",
          price_amount: 4999,
        },
      ] as unknown as Product["prices"],
    });

    const dbProduct = convertToDatabaseProduct(sdkProduct);
    await t.mutation(api.lib.createProduct, { product: dbProduct });
    const result = await t.query(api.lib.getProduct, { id: "prod_123" });

    expect(result?.prices[0].type).toBe("one_time");
    expect(result?.prices[0].recurringInterval).toBeNull();
    expect(result?.prices[0].priceCurrency).toBe("eur");
    expect(result?.prices[0].priceAmount).toBe(4999);
  });

  it("new-style ProductPriceFree on recurring product (no type/recurringInterval on price object)", async () => {
    // SDK 0.45.0: ProductPriceFree no longer has type/recurringInterval.
    // The existing free test uses the legacy form; this tests the new form.
    const sdkProduct = createSdkProduct({
      is_recurring: true,
      recurring_interval: "month",
      prices: [
        {
          id: "price_free_new",
          product_id: "prod_123",
          created_at: "2025-01-10T08:00:00.000Z",
          modified_at: null,
          source: "catalog",
          amount_type: "free",
          is_archived: false,
          price_currency: "usd",
        },
      ] as unknown as Product["prices"],
    });

    const dbProduct = convertToDatabaseProduct(sdkProduct);
    await t.mutation(api.lib.createProduct, { product: dbProduct });
    const result = await t.query(api.lib.getProduct, { id: "prod_123" });

    expect(result?.prices[0].amountType).toBe("free");
    expect(result?.prices[0].type).toBe("recurring");
    expect(result?.prices[0].recurringInterval).toBe("month");
  });

  it("new-style ProductPriceCustom with null maximumAmount and null presetAmount", async () => {
    const sdkProduct = createSdkProduct({
      is_recurring: false,
      recurring_interval: null,
      prices: [
        {
          id: "price_custom_null",
          product_id: "prod_123",
          created_at: "2025-01-10T08:00:00.000Z",
          modified_at: null,
          source: "catalog",
          amount_type: "custom",
          is_archived: false,
          price_currency: "usd",
          minimum_amount: 0,
          maximum_amount: null,
          preset_amount: null,
        },
      ] as unknown as Product["prices"],
    });

    const dbProduct = convertToDatabaseProduct(sdkProduct);
    await t.mutation(api.lib.createProduct, { product: dbProduct });
    const result = await t.query(api.lib.getProduct, { id: "prod_123" });

    expect(result?.prices[0].amountType).toBe("custom");
    expect(result?.prices[0].type).toBe("one_time");
    expect(result?.prices[0].recurringInterval).toBeNull();
    expect(result?.prices[0].minimumAmount).toBe(0);
    expect(result?.prices[0].maximumAmount).toBeNull();
    expect(result?.prices[0].presetAmount).toBeNull();
  });
});

describe("legacy recurring prices (LegacyRecurringProductPrice, backwards compat)", () => {
  let t: TestConvex<typeof schema>;

  beforeEach(() => {
    t = convexTest(schema, modules);
  });

  it("LegacyRecurringProductPriceFixed with type/recurringInterval/legacy:true round-trips correctly", async () => {
    // Legacy recurring prices (pre-0.45 format) have type, recurringInterval,
    // and legacy:true on the price object itself. These still appear in API
    // responses for older products and must continue to work.
    const sdkProduct = createSdkProduct({
      is_recurring: true,
      recurring_interval: "month",
      prices: [
        {
          id: "price_legacy_fixed",
          product_id: "prod_123",
          created_at: "2025-01-10T08:00:00.000Z",
          modified_at: null,
          source: "catalog",
          amount_type: "fixed",
          is_archived: false,
          type: "recurring",
          recurring_interval: "month",
          price_currency: "usd",
          price_amount: 1500,
          legacy: true,
        },
      ] as unknown as Product["prices"],
    });

    const dbProduct = convertToDatabaseProduct(sdkProduct);
    await t.mutation(api.lib.createProduct, { product: dbProduct });
    const result = await t.query(api.lib.getProduct, { id: "prod_123" });

    expect(result?.prices[0].amountType).toBe("fixed");
    expect(result?.prices[0].priceAmount).toBe(1500);
    expect(result?.prices[0].type).toBe("recurring");
    expect(result?.prices[0].recurringInterval).toBe("month");
  });

  it("LegacyRecurringProductPriceCustom with type/recurringInterval/legacy:true round-trips correctly", async () => {
    const sdkProduct = createSdkProduct({
      is_recurring: true,
      recurring_interval: "month",
      prices: [
        {
          id: "price_legacy_custom",
          product_id: "prod_123",
          created_at: "2025-01-10T08:00:00.000Z",
          modified_at: null,
          source: "catalog",
          amount_type: "custom",
          is_archived: false,
          type: "recurring",
          recurring_interval: "month",
          price_currency: "usd",
          minimum_amount: 500,
          maximum_amount: 10000,
          preset_amount: 1000,
          legacy: true,
        },
      ] as unknown as Product["prices"],
    });

    const dbProduct = convertToDatabaseProduct(sdkProduct);
    await t.mutation(api.lib.createProduct, { product: dbProduct });
    const result = await t.query(api.lib.getProduct, { id: "prod_123" });

    expect(result?.prices[0].amountType).toBe("custom");
    expect(result?.prices[0].type).toBe("recurring");
    expect(result?.prices[0].recurringInterval).toBe("month");
    expect(result?.prices[0].minimumAmount).toBe(500);
    expect(result?.prices[0].maximumAmount).toBe(10000);
    expect(result?.prices[0].presetAmount).toBe(1000);
  });

  it("LegacyRecurringProductPriceFree with type/recurringInterval/legacy:true round-trips correctly", async () => {
    const sdkProduct = createSdkProduct({
      is_recurring: true,
      recurring_interval: "month",
      prices: [
        {
          id: "price_legacy_free",
          product_id: "prod_123",
          created_at: "2025-01-10T08:00:00.000Z",
          modified_at: null,
          source: "catalog",
          amount_type: "free",
          is_archived: false,
          type: "recurring",
          recurring_interval: "month",
          price_currency: "usd",
          legacy: true,
        },
      ] as unknown as Product["prices"],
    });

    const dbProduct = convertToDatabaseProduct(sdkProduct);
    await t.mutation(api.lib.createProduct, { product: dbProduct });
    const result = await t.query(api.lib.getProduct, { id: "prod_123" });

    expect(result?.prices[0].amountType).toBe("free");
    expect(result?.prices[0].type).toBe("recurring");
    expect(result?.prices[0].recurringInterval).toBe("month");
  });
});

describe("ProductPriceSeatTiersOutput with minimumSeats/maximumSeats", () => {
  let t: TestConvex<typeof schema>;

  beforeEach(() => {
    t = convexTest(schema, modules);
  });

  it("seat-based price with 3-tier ProductPriceSeatTiersOutput stores all tiers", async () => {
    // SDK 0.45.0: ProductPriceSeatBased.seatTiers is now ProductPriceSeatTiersOutput
    // which adds minimumSeats/maximumSeats at the top level. The converter only
    // stores the tiers array; the derived min/max fields are intentionally dropped.
    const sdkProduct = createSdkProduct({
      is_recurring: true,
      recurring_interval: "month",
      prices: [
        {
          id: "price_seat_3tier",
          product_id: "prod_123",
          created_at: "2025-01-10T08:00:00.000Z",
          modified_at: null,
          source: "catalog",
          amount_type: "seat_based",
          is_archived: false,
          price_currency: "usd",
          seat_tiers: {
            tiers: [
              { min_seats: 3, max_seats: 10, price_per_seat: 2000 },
              { min_seats: 11, max_seats: 50, price_per_seat: 1500 },
              { min_seats: 51, max_seats: null, price_per_seat: 1000 },
            ],
            minimum_seats: 3,
            maximum_seats: null,
          },
        },
      ] as unknown as Product["prices"],
    });

    const dbProduct = convertToDatabaseProduct(sdkProduct);
    await t.mutation(api.lib.createProduct, { product: dbProduct });
    const result = await t.query(api.lib.getProduct, { id: "prod_123" });

    expect(result?.prices[0].seatTiers).toHaveLength(3);
    expect(result?.prices[0].seatTiers?.[0]).toEqual({
      minSeats: 3,
      maxSeats: 10,
      pricePerSeat: 2000,
    });
    expect(result?.prices[0].seatTiers?.[1]).toEqual({
      minSeats: 11,
      maxSeats: 50,
      pricePerSeat: 1500,
    });
    expect(result?.prices[0].seatTiers?.[2]).toEqual({
      minSeats: 51,
      maxSeats: null,
      pricePerSeat: 1000,
    });
  });

  it("seat-based price with bounded maximumSeats stores the capped tier correctly", async () => {
    const sdkProduct = createSdkProduct({
      is_recurring: true,
      recurring_interval: "month",
      prices: [
        {
          id: "price_seat_bounded",
          product_id: "prod_123",
          created_at: "2025-01-10T08:00:00.000Z",
          modified_at: null,
          source: "catalog",
          amount_type: "seat_based",
          is_archived: false,
          price_currency: "usd",
          seat_tiers: {
            tiers: [{ min_seats: 1, max_seats: 25, price_per_seat: 1200 }],
            minimum_seats: 1,
            maximum_seats: 25,
          },
        },
      ] as unknown as Product["prices"],
    });

    const dbProduct = convertToDatabaseProduct(sdkProduct);
    await t.mutation(api.lib.createProduct, { product: dbProduct });
    const result = await t.query(api.lib.getProduct, { id: "prod_123" });

    expect(result?.prices[0].seatTiers).toHaveLength(1);
    expect(result?.prices[0].seatTiers?.[0].minSeats).toBe(1);
    expect(result?.prices[0].seatTiers?.[0].maxSeats).toBe(25);
    expect(result?.prices[0].seatTiers?.[0].pricePerSeat).toBe(1200);
  });

  it("metered_unit price with null capAmount (unbounded usage) stores capAmount as null", async () => {
    const sdkProduct = createSdkProduct({
      is_recurring: true,
      recurring_interval: "month",
      prices: [
        {
          id: "price_metered_unbounded",
          product_id: "prod_123",
          created_at: "2025-01-10T08:00:00.000Z",
          modified_at: null,
          source: "catalog",
          amount_type: "metered_unit",
          is_archived: false,
          price_currency: "usd",
          unit_amount: "0.001",
          cap_amount: null,
          meter_id: "meter_456",
          meter: { id: "meter_456", name: "Events" },
        },
      ] as unknown as Product["prices"],
    });

    const dbProduct = convertToDatabaseProduct(sdkProduct);
    await t.mutation(api.lib.createProduct, { product: dbProduct });
    const result = await t.query(api.lib.getProduct, { id: "prod_123" });

    expect(result?.prices[0].amountType).toBe("metered_unit");
    expect(result?.prices[0].unitAmount).toBe("0.001");
    expect(result?.prices[0].capAmount).toBeNull();
    expect(result?.prices[0].meterId).toBe("meter_456");
  });
});

describe("convertToDatabaseSubscription timestamps", () => {
  it("maps snake_case timestamps to camelCase fields", () => {
    const sdk = createSdkSubscription({
      created_at: "2025-03-01T00:00:00.000Z",
      modified_at: "2025-03-02T00:00:00.000Z",
      current_period_start: "2025-03-01T00:00:00.000Z",
      current_period_end: "2025-04-01T00:00:00.000Z",
      started_at: "2025-03-01T00:00:00.000Z",
      canceled_at: "2025-03-15T00:00:00.000Z",
      ends_at: "2025-04-01T00:00:00.000Z",
      trial_start: "2025-03-01T00:00:00.000Z",
      trial_end: "2025-03-08T00:00:00.000Z",
    });

    const result = convertToDatabaseSubscription(sdk);

    expect(result.createdAt).toBe("2025-03-01T00:00:00.000Z");
    expect(result.modifiedAt).toBe("2025-03-02T00:00:00.000Z");
    expect(result.currentPeriodStart).toBe("2025-03-01T00:00:00.000Z");
    expect(result.currentPeriodEnd).toBe("2025-04-01T00:00:00.000Z");
    expect(result.startedAt).toBe("2025-03-01T00:00:00.000Z");
    expect(result.canceledAt).toBe("2025-03-15T00:00:00.000Z");
    expect(result.endsAt).toBe("2025-04-01T00:00:00.000Z");
    expect(result.trialStart).toBe("2025-03-01T00:00:00.000Z");
    expect(result.trialEnd).toBe("2025-03-08T00:00:00.000Z");
  });

  it("handles null optional date fields", () => {
    const sdk = createSdkSubscription({
      modified_at: null,
      current_period_end: null,
      trial_start: null,
      trial_end: null,
      canceled_at: null,
      started_at: null,
      ends_at: null,
      ended_at: null,
    });

    const result = convertToDatabaseSubscription(sdk);

    expect(result.modifiedAt).toBeNull();
    expect(result.currentPeriodEnd).toBeNull();
    expect(result.trialStart).toBeNull();
    expect(result.trialEnd).toBeNull();
    expect(result.canceledAt).toBeNull();
    expect(result.startedAt).toBeNull();
    expect(result.endsAt).toBeNull();
    expect(result.endedAt).toBeNull();
  });

  it("stores recurringIntervalCount on the subscription", () => {
    const sdk = createSdkSubscription({ recurring_interval_count: 3 });
    const result = convertToDatabaseSubscription(sdk);
    expect(result.recurringIntervalCount).toBe(3);
  });

  it("stores endedAt date when subscription has ended", () => {
    const sdk = createSdkSubscription({
      ended_at: "2025-05-01T00:00:00.000Z",
      status: "canceled",
    });
    const result = convertToDatabaseSubscription(sdk);
    expect(result.endedAt).toBe("2025-05-01T00:00:00.000Z");
    expect(result.status).toBe("canceled");
  });

  it("stores seat count for seat-based subscriptions", () => {
    const sdk = createSdkSubscription({ seats: 5 });
    const result = convertToDatabaseSubscription(sdk);
    expect(result.seats).toBe(5);
  });

  it("stores null seats for non-seat subscriptions", () => {
    const sdk = createSdkSubscription({ seats: null });
    const result = convertToDatabaseSubscription(sdk);
    expect(result.seats).toBeNull();
  });

  it("stores customerCancellationReason and comment", () => {
    const sdk = createSdkSubscription({
      customer_cancellation_reason: "too_expensive",
      customer_cancellation_comment: "pricing was too high",
    });
    const result = convertToDatabaseSubscription(sdk);
    expect(result.customerCancellationReason).toBe("too_expensive");
    expect(result.customerCancellationComment).toBe("pricing was too high");
  });

  it("stores customFieldData with mixed value types", () => {
    const sdk = createSdkSubscription({
      custom_field_data: {
        plan_tier: "enterprise",
        seat_count: 10,
        is_trial: false,
      },
    });
    const result = convertToDatabaseSubscription(sdk);
    expect(result.customFieldData).toEqual({
      plan_tier: "enterprise",
      seat_count: 10,
      is_trial: false,
    });
  });
});

describe("insertCustomer mutation", () => {
  let t: TestConvex<typeof schema>;

  beforeEach(() => {
    t = convexTest(schema, modules);
  });

  it("inserts new customer when none exists", async () => {
    const customer = createTestCustomer();

    const id = await t.mutation(api.lib.insertCustomer, customer);

    expect(id).toBeDefined();
    const result = await t.query(api.lib.getCustomerByUserId, {
      userId: "user_456",
    });
    expect(result).not.toBeNull();
    expect(result?.id).toBe("cust_123");
  });

  it("returns existing customer id when customer already exists for userId", async () => {
    const customer = createTestCustomer();

    const id1 = await t.mutation(api.lib.insertCustomer, customer);

    const customer2 = createTestCustomer({
      id: "cust_different",
    });
    const id2 = await t.mutation(api.lib.insertCustomer, customer2);

    expect(id1).toBe(id2);

    const result = await t.query(api.lib.getCustomerByUserId, {
      userId: "user_456",
    });
    expect(result?.id).toBe("cust_123");
  });

  it("allows different customers for different userIds", async () => {
    const customer1 = createTestCustomer({
      id: "cust_123",
      userId: "user_123",
    });
    const customer2 = createTestCustomer({
      id: "cust_456",
      userId: "user_456",
    });

    await t.mutation(api.lib.insertCustomer, customer1);
    await t.mutation(api.lib.insertCustomer, customer2);

    const result1 = await t.query(api.lib.getCustomerByUserId, {
      userId: "user_123",
    });
    const result2 = await t.query(api.lib.getCustomerByUserId, {
      userId: "user_456",
    });

    expect(result1?.id).toBe("cust_123");
    expect(result2?.id).toBe("cust_456");
  });
});

describe("getCurrentSubscription query", () => {
  let t: TestConvex<typeof schema>;

  beforeEach(() => {
    t = convexTest(schema, modules);
  });

  it("returns null when no customer exists", async () => {
    const result = await t.query(api.lib.getCurrentSubscription, {
      userId: "user_nonexistent",
    });

    expect(result).toBeNull();
  });

  it("returns null when customer has no subscriptions", async () => {
    await t.mutation(api.lib.insertCustomer, createTestCustomer());

    const result = await t.query(api.lib.getCurrentSubscription, {
      userId: "user_456",
    });

    expect(result).toBeNull();
  });

  it("returns null when customer only has ended subscriptions", async () => {
    const customer = createTestCustomer();
    await t.mutation(api.lib.insertCustomer, customer);
    await t.mutation(api.lib.createProduct, {
      product: createTestProduct({ id: "prod_789" }),
    });
    await t.mutation(api.lib.createSubscription, {
      subscription: createTestSubscription({
        customerId: "cust_123",
        endedAt: "2025-01-10T10:00:00.000Z",
      }),
    });

    const result = await t.query(api.lib.getCurrentSubscription, {
      userId: "user_456",
    });

    expect(result).toBeNull();
  });

  it("returns active subscription with product", async () => {
    const customer = createTestCustomer();
    await t.mutation(api.lib.insertCustomer, customer);
    await t.mutation(api.lib.createProduct, {
      product: createTestProduct({ id: "prod_789" }),
    });
    await t.mutation(api.lib.createSubscription, {
      subscription: createTestSubscription({
        customerId: "cust_123",
        endedAt: null,
      }),
    });

    const result = await t.query(api.lib.getCurrentSubscription, {
      userId: "user_456",
    });

    expect(result).not.toBeNull();
    expect(result?.id).toBe("sub_123");
    expect(result?.product.id).toBe("prod_789");
    expect(result?.product.name).toBe("Test Product");
  });

  it("returns null when trial has expired", async () => {
    await t.mutation(api.lib.insertCustomer, createTestCustomer());
    await t.mutation(api.lib.createProduct, {
      product: createTestProduct({ id: "prod_789" }),
    });
    await t.mutation(api.lib.createSubscription, {
      subscription: createTestSubscription({
        customerId: "cust_123",
        endedAt: null,
        status: "trialing",
        trialStart: "2025-01-01T00:00:00.000Z",
        trialEnd: "2025-01-08T00:00:00.000Z",
      }),
    });

    const result = await t.query(api.lib.getCurrentSubscription, {
      userId: "user_456",
    });

    expect(result).toBeNull();
  });

  it("returns subscription when trial is still active", async () => {
    await t.mutation(api.lib.insertCustomer, createTestCustomer());
    await t.mutation(api.lib.createProduct, {
      product: createTestProduct({ id: "prod_789" }),
    });
    await t.mutation(api.lib.createSubscription, {
      subscription: createTestSubscription({
        customerId: "cust_123",
        endedAt: null,
        status: "trialing",
        trialStart: "2025-01-01T00:00:00.000Z",
        trialEnd: "2099-01-01T00:00:00.000Z",
      }),
    });

    const result = await t.query(api.lib.getCurrentSubscription, {
      userId: "user_456",
    });

    expect(result).not.toBeNull();
    expect(result?.status).toBe("trialing");
  });
});

describe("listUserSubscriptions query", () => {
  let t: TestConvex<typeof schema>;

  beforeEach(() => {
    t = convexTest(schema, modules);
  });

  it("returns empty array when no customer exists", async () => {
    const result = await t.query(api.lib.listUserSubscriptions, {
      userId: "user_nonexistent",
    });

    expect(result).toEqual([]);
  });

  it("returns empty array when customer has no subscriptions", async () => {
    await t.mutation(api.lib.insertCustomer, createTestCustomer());

    const result = await t.query(api.lib.listUserSubscriptions, {
      userId: "user_456",
    });

    expect(result).toEqual([]);
  });

  it("excludes ended subscriptions", async () => {
    await t.mutation(api.lib.insertCustomer, createTestCustomer());
    await t.mutation(api.lib.createProduct, {
      product: createTestProduct({ id: "prod_789" }),
    });
    await t.mutation(api.lib.createSubscription, {
      subscription: createTestSubscription({
        id: "sub_ended",
        customerId: "cust_123",
        endedAt: "2020-01-01T00:00:00.000Z",
      }),
    });

    const result = await t.query(api.lib.listUserSubscriptions, {
      userId: "user_456",
    });

    expect(result).toHaveLength(0);
  });

  it("returns active subscriptions with products", async () => {
    await t.mutation(api.lib.insertCustomer, createTestCustomer());
    await t.mutation(api.lib.createProduct, {
      product: createTestProduct({ id: "prod_789" }),
    });
    await t.mutation(api.lib.createSubscription, {
      subscription: createTestSubscription({
        customerId: "cust_123",
        endedAt: null,
      }),
    });

    const result = await t.query(api.lib.listUserSubscriptions, {
      userId: "user_456",
    });

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("sub_123");
    expect(result[0].product?.id).toBe("prod_789");
  });

  it("excludes expired trials", async () => {
    await t.mutation(api.lib.insertCustomer, createTestCustomer());
    await t.mutation(api.lib.createProduct, {
      product: createTestProduct({ id: "prod_789" }),
    });
    await t.mutation(api.lib.createSubscription, {
      subscription: createTestSubscription({
        customerId: "cust_123",
        endedAt: null,
        status: "trialing",
        trialStart: "2025-01-01T00:00:00.000Z",
        trialEnd: "2025-01-08T00:00:00.000Z",
      }),
    });

    const result = await t.query(api.lib.listUserSubscriptions, {
      userId: "user_456",
    });

    expect(result).toHaveLength(0);
  });

  it("includes active trials", async () => {
    await t.mutation(api.lib.insertCustomer, createTestCustomer());
    await t.mutation(api.lib.createProduct, {
      product: createTestProduct({ id: "prod_789" }),
    });
    await t.mutation(api.lib.createSubscription, {
      subscription: createTestSubscription({
        customerId: "cust_123",
        endedAt: null,
        status: "trialing",
        trialStart: "2025-01-01T00:00:00.000Z",
        trialEnd: "2099-01-01T00:00:00.000Z",
      }),
    });

    const result = await t.query(api.lib.listUserSubscriptions, {
      userId: "user_456",
    });

    expect(result).toHaveLength(1);
    expect(result[0].status).toBe("trialing");
  });

  it("returns multiple subscriptions", async () => {
    await t.mutation(api.lib.insertCustomer, createTestCustomer());
    await t.mutation(api.lib.createProduct, {
      product: createTestProduct({ id: "prod_1" }),
    });
    await t.mutation(api.lib.createProduct, {
      product: createTestProduct({ id: "prod_2" }),
    });
    await t.mutation(api.lib.createSubscription, {
      subscription: createTestSubscription({
        id: "sub_1",
        customerId: "cust_123",
        productId: "prod_1",
        endedAt: null,
      }),
    });
    await t.mutation(api.lib.createSubscription, {
      subscription: createTestSubscription({
        id: "sub_2",
        customerId: "cust_123",
        productId: "prod_2",
        endedAt: null,
      }),
    });

    const result = await t.query(api.lib.listUserSubscriptions, {
      userId: "user_456",
    });

    expect(result).toHaveLength(2);
  });
});

describe("listProducts query", () => {
  let t: TestConvex<typeof schema>;

  beforeEach(() => {
    t = convexTest(schema, modules);
  });

  it("returns empty array when no products exist", async () => {
    const result = await t.query(api.lib.listProducts, {});

    expect(result).toEqual([]);
  });

  it("returns all non-archived products by default", async () => {
    await t.mutation(api.lib.createProduct, {
      product: createTestProduct({ id: "prod_1", isArchived: false }),
    });
    await t.mutation(api.lib.createProduct, {
      product: createTestProduct({ id: "prod_2", isArchived: false }),
    });
    await t.mutation(api.lib.createProduct, {
      product: createTestProduct({ id: "prod_archived", isArchived: true }),
    });

    const result = await t.query(api.lib.listProducts, {});

    expect(result).toHaveLength(2);
    expect(result.map((p) => p.id).sort()).toEqual(["prod_1", "prod_2"]);
  });

  it("includes archived products when includeArchived is true", async () => {
    await t.mutation(api.lib.createProduct, {
      product: createTestProduct({ id: "prod_1", isArchived: false }),
    });
    await t.mutation(api.lib.createProduct, {
      product: createTestProduct({ id: "prod_archived", isArchived: true }),
    });

    const result = await t.query(api.lib.listProducts, {
      includeArchived: true,
    });

    expect(result).toHaveLength(2);
    expect(result.map((p) => p.id).sort()).toEqual(["prod_1", "prod_archived"]);
  });
});

describe("listCustomerSubscriptions query", () => {
  let t: TestConvex<typeof schema>;

  beforeEach(() => {
    t = convexTest(schema, modules);
  });

  it("returns empty array when no subscriptions exist", async () => {
    const result = await t.query(api.lib.listCustomerSubscriptions, {
      customerId: "cust_nonexistent",
    });

    expect(result).toEqual([]);
  });

  it("returns all subscriptions for customer", async () => {
    await t.mutation(api.lib.createSubscription, {
      subscription: createTestSubscription({
        id: "sub_1",
        customerId: "cust_123",
      }),
    });
    await t.mutation(api.lib.createSubscription, {
      subscription: createTestSubscription({
        id: "sub_2",
        customerId: "cust_123",
      }),
    });
    await t.mutation(api.lib.createSubscription, {
      subscription: createTestSubscription({
        id: "sub_other",
        customerId: "cust_other",
      }),
    });

    const result = await t.query(api.lib.listCustomerSubscriptions, {
      customerId: "cust_123",
    });

    expect(result).toHaveLength(2);
    expect(result.map((s) => s.id).sort()).toEqual(["sub_1", "sub_2"]);
  });
});

describe("listAllUserSubscriptions query", () => {
  let t: TestConvex<typeof schema>;

  beforeEach(() => {
    t = convexTest(schema, modules);
  });

  it("returns empty array when no customer exists", async () => {
    const result = await t.query(api.lib.listAllUserSubscriptions, {
      userId: "user_nonexistent",
    });

    expect(result).toEqual([]);
  });

  it("includes ended subscriptions", async () => {
    await t.mutation(api.lib.insertCustomer, createTestCustomer());
    await t.mutation(api.lib.createProduct, {
      product: createTestProduct({ id: "prod_789" }),
    });
    await t.mutation(api.lib.createSubscription, {
      subscription: createTestSubscription({
        customerId: "cust_123",
        endedAt: "2020-01-01T00:00:00.000Z",
      }),
    });

    const result = await t.query(api.lib.listAllUserSubscriptions, {
      userId: "user_456",
    });

    expect(result).toHaveLength(1);
    expect(result[0].endedAt).toBe("2020-01-01T00:00:00.000Z");
  });

  it("includes expired trials", async () => {
    await t.mutation(api.lib.insertCustomer, createTestCustomer());
    await t.mutation(api.lib.createProduct, {
      product: createTestProduct({ id: "prod_789" }),
    });
    await t.mutation(api.lib.createSubscription, {
      subscription: createTestSubscription({
        customerId: "cust_123",
        endedAt: null,
        status: "trialing",
        trialStart: "2025-01-01T00:00:00.000Z",
        trialEnd: "2025-01-08T00:00:00.000Z",
      }),
    });

    const result = await t.query(api.lib.listAllUserSubscriptions, {
      userId: "user_456",
    });

    expect(result).toHaveLength(1);
    expect(result[0].status).toBe("trialing");
  });

  it("returns all subscriptions regardless of status", async () => {
    await t.mutation(api.lib.insertCustomer, createTestCustomer());
    await t.mutation(api.lib.createProduct, {
      product: createTestProduct({ id: "prod_789" }),
    });
    // Active subscription
    await t.mutation(api.lib.createSubscription, {
      subscription: createTestSubscription({
        id: "sub_active",
        customerId: "cust_123",
        endedAt: null,
        status: "active",
      }),
    });
    // Ended subscription
    await t.mutation(api.lib.createSubscription, {
      subscription: createTestSubscription({
        id: "sub_ended",
        customerId: "cust_123",
        endedAt: "2020-01-01T00:00:00.000Z",
        status: "canceled",
      }),
    });
    // Expired trial
    await t.mutation(api.lib.createSubscription, {
      subscription: createTestSubscription({
        id: "sub_expired_trial",
        customerId: "cust_123",
        endedAt: null,
        status: "trialing",
        trialStart: "2025-01-01T00:00:00.000Z",
        trialEnd: "2025-01-08T00:00:00.000Z",
      }),
    });

    const result = await t.query(api.lib.listAllUserSubscriptions, {
      userId: "user_456",
    });

    expect(result).toHaveLength(3);
    expect(result.map((s) => s.id).sort()).toEqual([
      "sub_active",
      "sub_ended",
      "sub_expired_trial",
    ]);
  });
});
