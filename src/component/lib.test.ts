/// <reference types="vite/client" />
import { describe, it, expect, beforeEach } from "vitest";
import { convexTest } from "convex-test";
import type { TestConvex } from "convex-test";
import type { Infer } from "convex/values";
import schema from "./schema.js";
import { api } from "./_generated/api.js";
import { convertToDatabaseProduct, convertToDatabaseSubscription } from "./util.js";
import type { Product } from "@polar-sh/sdk/models/components/product.js";
import type { Subscription } from "@polar-sh/sdk/models/components/subscription.js";

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
function createTestProduct(
  overrides: Partial<DbProduct> = {},
): DbProduct {
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
function createTestCustomer(
  overrides: Partial<DbCustomer> = {},
): DbCustomer {
  return {
    id: "cust_123",
    userId: "user_456",
    ...overrides,
  };
}

// Helper to create SDK-shaped Product objects (uses Date objects, nested structures)
function createSdkProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: "prod_123",
    organizationId: "org_456",
    name: "Test Product",
    description: "A test product",
    isRecurring: true,
    isArchived: false,
    createdAt: new Date("2025-01-10T08:00:00.000Z"),
    modifiedAt: new Date("2025-01-12T09:00:00.000Z"),
    recurringInterval: "month",
    recurringIntervalCount: 1,
    trialInterval: null,
    trialIntervalCount: null,
    metadata: {},
    prices: [],
    benefits: [],
    medias: [],
    attachedCustomFields: [],
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
          productId: "prod_123",
          createdAt: new Date("2025-01-10T08:00:00.000Z"),
          modifiedAt: null,
          source: "catalog",
          amountType: "fixed",
          isArchived: false,
          type: "recurring",
          recurringInterval: "month",
          priceCurrency: "usd",
          priceAmount: 1000,
        },
      ] as Product["prices"],
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
      isRecurring: false,
      recurringInterval: null,
      prices: [
        {
          id: "price_custom",
          productId: "prod_123",
          createdAt: new Date("2025-01-10T08:00:00.000Z"),
          modifiedAt: null,
          source: "catalog",
          amountType: "custom",
          isArchived: false,
          priceCurrency: "usd",
          minimumAmount: 500,
          maximumAmount: 10000,
          presetAmount: 2000,
        },
      ] as Product["prices"],
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
          productId: "prod_123",
          createdAt: new Date("2025-01-10T08:00:00.000Z"),
          modifiedAt: null,
          source: "catalog",
          amountType: "free",
          isArchived: false,
          type: "recurring",
          recurringInterval: "month",
        },
      ] as Product["prices"],
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
          productId: "prod_123",
          createdAt: new Date("2025-01-10T08:00:00.000Z"),
          modifiedAt: null,
          source: "catalog",
          amountType: "seat_based",
          isArchived: false,
          priceCurrency: "usd",
          seatTiers: {
            tiers: [
              { minSeats: 1, maxSeats: 5, pricePerSeat: 1000 },
              { minSeats: 6, maxSeats: null, pricePerSeat: 800 },
            ],
            minimumSeats: 1,
            maximumSeats: null,
          },
        },
      ] as Product["prices"],
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
          productId: "prod_123",
          createdAt: new Date("2025-01-10T08:00:00.000Z"),
          modifiedAt: null,
          source: "catalog",
          amountType: "metered_unit",
          isArchived: false,
          priceCurrency: "usd",
          unitAmount: "0.01",
          capAmount: 5000,
          meterId: "meter_123",
          meter: { id: "meter_123", name: "API Calls" },
        },
      ] as Product["prices"],
    });

    const dbProduct = convertToDatabaseProduct(sdkProduct);
    await t.mutation(api.lib.createProduct, { product: dbProduct });
    const result = await t.query(api.lib.getProduct, { id: "prod_123" });

    expect(result?.prices).toHaveLength(1);
    expect(result?.prices[0].amountType).toBe("metered_unit");
    expect(result?.prices[0].unitAmount).toBe("0.01");
    expect(result?.prices[0].capAmount).toBe(5000);
    expect(result?.prices[0].meterId).toBe("meter_123");
    expect(result?.prices[0].meter).toEqual({ id: "meter_123", name: "API Calls" });
  });

  it("converts and stores benefits from SDK format", async () => {
    const sdkProduct = createSdkProduct({
      benefits: [
        {
          id: "benefit_123",
          createdAt: new Date("2025-01-10T08:00:00.000Z"),
          modifiedAt: null,
          type: "custom",
          description: "Priority support",
          selectable: true,
          deletable: false,
          organizationId: "org_456",
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

// Helper to build a minimal SDK Subscription with Date objects, cast to the full type
function createSdkSubscription(
  overrides: Partial<Record<string, unknown>> = {},
): Subscription {
  return {
    id: "sub_sdk_123",
    customerId: "cust_456",
    productId: "prod_789",
    checkoutId: "checkout_abc",
    createdAt: new Date("2025-01-15T10:00:00.000Z"),
    modifiedAt: new Date("2025-01-16T12:00:00.000Z"),
    amount: 1000,
    currency: "usd",
    recurringInterval: "month",
    recurringIntervalCount: 1,
    status: "active",
    currentPeriodStart: new Date("2025-01-15T10:00:00.000Z"),
    currentPeriodEnd: new Date("2025-02-15T10:00:00.000Z"),
    trialStart: null,
    trialEnd: null,
    cancelAtPeriodEnd: false,
    canceledAt: null,
    startedAt: new Date("2025-01-15T10:00:00.000Z"),
    endsAt: null,
    endedAt: null,
    discountId: null,
    seats: null,
    customerCancellationReason: null,
    customerCancellationComment: null,
    metadata: {},
    customFieldData: undefined,
    ...overrides,
  } as unknown as Subscription;
}

describe("SDK 0.45.0 — new-style prices (type/recurringInterval derived from product)", () => {
  let t: TestConvex<typeof schema>;

  beforeEach(() => {
    t = convexTest(schema, modules);
  });

  it("new-style ProductPriceFixed on recurring yearly product derives type:recurring and recurringInterval:year from product", async () => {
    // SDK 0.45.0: ProductPriceFixed no longer carries type/recurringInterval.
    // The converter must derive both from the product fields.
    const sdkProduct = createSdkProduct({
      isRecurring: true,
      recurringInterval: "year",
      recurringIntervalCount: 1,
      prices: [
        {
          id: "price_fixed_yr",
          productId: "prod_123",
          createdAt: new Date("2025-01-10T08:00:00.000Z"),
          modifiedAt: null,
          source: "catalog",
          amountType: "fixed",
          isArchived: false,
          priceCurrency: "usd",
          priceAmount: 9900,
        },
      ] as Product["prices"],
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
      isRecurring: false,
      recurringInterval: null,
      prices: [
        {
          id: "price_fixed_ot",
          productId: "prod_123",
          createdAt: new Date("2025-01-10T08:00:00.000Z"),
          modifiedAt: null,
          source: "catalog",
          amountType: "fixed",
          isArchived: false,
          priceCurrency: "eur",
          priceAmount: 4999,
        },
      ] as Product["prices"],
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
      isRecurring: true,
      recurringInterval: "month",
      prices: [
        {
          id: "price_free_new",
          productId: "prod_123",
          createdAt: new Date("2025-01-10T08:00:00.000Z"),
          modifiedAt: null,
          source: "catalog",
          amountType: "free",
          isArchived: false,
          priceCurrency: "usd",
        },
      ] as Product["prices"],
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
      isRecurring: false,
      recurringInterval: null,
      prices: [
        {
          id: "price_custom_null",
          productId: "prod_123",
          createdAt: new Date("2025-01-10T08:00:00.000Z"),
          modifiedAt: null,
          source: "catalog",
          amountType: "custom",
          isArchived: false,
          priceCurrency: "usd",
          minimumAmount: 0,
          maximumAmount: null,
          presetAmount: null,
        },
      ] as Product["prices"],
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

describe("SDK 0.45.0 — legacy recurring prices (LegacyRecurringProductPrice, backwards compat)", () => {
  let t: TestConvex<typeof schema>;

  beforeEach(() => {
    t = convexTest(schema, modules);
  });

  it("LegacyRecurringProductPriceFixed with type/recurringInterval/legacy:true round-trips correctly", async () => {
    // Legacy recurring prices (pre-0.45 format) have type, recurringInterval,
    // and legacy:true on the price object itself. These still appear in API
    // responses for older products and must continue to work.
    const sdkProduct = createSdkProduct({
      isRecurring: true,
      recurringInterval: "month",
      prices: [
        {
          id: "price_legacy_fixed",
          productId: "prod_123",
          createdAt: new Date("2025-01-10T08:00:00.000Z"),
          modifiedAt: null,
          source: "catalog",
          amountType: "fixed",
          isArchived: false,
          type: "recurring",
          recurringInterval: "month",
          priceCurrency: "usd",
          priceAmount: 1500,
          legacy: true,
        },
      ] as Product["prices"],
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
      isRecurring: true,
      recurringInterval: "month",
      prices: [
        {
          id: "price_legacy_custom",
          productId: "prod_123",
          createdAt: new Date("2025-01-10T08:00:00.000Z"),
          modifiedAt: null,
          source: "catalog",
          amountType: "custom",
          isArchived: false,
          type: "recurring",
          recurringInterval: "month",
          priceCurrency: "usd",
          minimumAmount: 500,
          maximumAmount: 10000,
          presetAmount: 1000,
          legacy: true,
        },
      ] as Product["prices"],
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
      isRecurring: true,
      recurringInterval: "month",
      prices: [
        {
          id: "price_legacy_free",
          productId: "prod_123",
          createdAt: new Date("2025-01-10T08:00:00.000Z"),
          modifiedAt: null,
          source: "catalog",
          amountType: "free",
          isArchived: false,
          type: "recurring",
          recurringInterval: "month",
          priceCurrency: "usd",
          legacy: true,
        },
      ] as Product["prices"],
    });

    const dbProduct = convertToDatabaseProduct(sdkProduct);
    await t.mutation(api.lib.createProduct, { product: dbProduct });
    const result = await t.query(api.lib.getProduct, { id: "prod_123" });

    expect(result?.prices[0].amountType).toBe("free");
    expect(result?.prices[0].type).toBe("recurring");
    expect(result?.prices[0].recurringInterval).toBe("month");
  });
});

describe("SDK 0.45.0 — ProductPriceSeatTiersOutput with minimumSeats/maximumSeats", () => {
  let t: TestConvex<typeof schema>;

  beforeEach(() => {
    t = convexTest(schema, modules);
  });

  it("seat-based price with 3-tier ProductPriceSeatTiersOutput stores all tiers", async () => {
    // SDK 0.45.0: ProductPriceSeatBased.seatTiers is now ProductPriceSeatTiersOutput
    // which adds minimumSeats/maximumSeats at the top level. The converter only
    // stores the tiers array; the derived min/max fields are intentionally dropped.
    const sdkProduct = createSdkProduct({
      isRecurring: true,
      recurringInterval: "month",
      prices: [
        {
          id: "price_seat_3tier",
          productId: "prod_123",
          createdAt: new Date("2025-01-10T08:00:00.000Z"),
          modifiedAt: null,
          source: "catalog",
          amountType: "seat_based",
          isArchived: false,
          priceCurrency: "usd",
          seatTiers: {
            tiers: [
              { minSeats: 3, maxSeats: 10, pricePerSeat: 2000 },
              { minSeats: 11, maxSeats: 50, pricePerSeat: 1500 },
              { minSeats: 51, maxSeats: null, pricePerSeat: 1000 },
            ],
            minimumSeats: 3,
            maximumSeats: null,
          },
        },
      ] as Product["prices"],
    });

    const dbProduct = convertToDatabaseProduct(sdkProduct);
    await t.mutation(api.lib.createProduct, { product: dbProduct });
    const result = await t.query(api.lib.getProduct, { id: "prod_123" });

    expect(result?.prices[0].seatTiers).toHaveLength(3);
    expect(result?.prices[0].seatTiers?.[0]).toEqual({ minSeats: 3, maxSeats: 10, pricePerSeat: 2000 });
    expect(result?.prices[0].seatTiers?.[1]).toEqual({ minSeats: 11, maxSeats: 50, pricePerSeat: 1500 });
    expect(result?.prices[0].seatTiers?.[2]).toEqual({ minSeats: 51, maxSeats: null, pricePerSeat: 1000 });
  });

  it("seat-based price with bounded maximumSeats stores the capped tier correctly", async () => {
    const sdkProduct = createSdkProduct({
      isRecurring: true,
      recurringInterval: "month",
      prices: [
        {
          id: "price_seat_bounded",
          productId: "prod_123",
          createdAt: new Date("2025-01-10T08:00:00.000Z"),
          modifiedAt: null,
          source: "catalog",
          amountType: "seat_based",
          isArchived: false,
          priceCurrency: "usd",
          seatTiers: {
            tiers: [{ minSeats: 1, maxSeats: 25, pricePerSeat: 1200 }],
            minimumSeats: 1,
            maximumSeats: 25,
          },
        },
      ] as Product["prices"],
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
      isRecurring: true,
      recurringInterval: "month",
      prices: [
        {
          id: "price_metered_unbounded",
          productId: "prod_123",
          createdAt: new Date("2025-01-10T08:00:00.000Z"),
          modifiedAt: null,
          source: "catalog",
          amountType: "metered_unit",
          isArchived: false,
          priceCurrency: "usd",
          unitAmount: "0.001",
          capAmount: null,
          meterId: "meter_456",
          meter: { id: "meter_456", name: "Events" },
        },
      ] as Product["prices"],
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

describe("SDK 0.45.0 — convertToDatabaseSubscription date conversion", () => {
  it("converts all Date objects to ISO strings", () => {
    const sdk = createSdkSubscription({
      createdAt: new Date("2025-03-01T00:00:00.000Z"),
      modifiedAt: new Date("2025-03-02T00:00:00.000Z"),
      currentPeriodStart: new Date("2025-03-01T00:00:00.000Z"),
      currentPeriodEnd: new Date("2025-04-01T00:00:00.000Z"),
      startedAt: new Date("2025-03-01T00:00:00.000Z"),
      canceledAt: new Date("2025-03-15T00:00:00.000Z"),
      endsAt: new Date("2025-04-01T00:00:00.000Z"),
      trialStart: new Date("2025-03-01T00:00:00.000Z"),
      trialEnd: new Date("2025-03-08T00:00:00.000Z"),
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
      modifiedAt: null,
      currentPeriodEnd: null,
      trialStart: null,
      trialEnd: null,
      canceledAt: null,
      startedAt: null,
      endsAt: null,
      endedAt: null,
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
    const sdk = createSdkSubscription({ recurringIntervalCount: 3 });
    const result = convertToDatabaseSubscription(sdk);
    expect(result.recurringIntervalCount).toBe(3);
  });

  it("stores endedAt date when subscription has ended", () => {
    const sdk = createSdkSubscription({
      endedAt: new Date("2025-05-01T00:00:00.000Z"),
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
      customerCancellationReason: "too_expensive",
      customerCancellationComment: "pricing was too high",
    });
    const result = convertToDatabaseSubscription(sdk);
    expect(result.customerCancellationReason).toBe("too_expensive");
    expect(result.customerCancellationComment).toBe("pricing was too high");
  });

  it("stores customFieldData with mixed value types", () => {
    const sdk = createSdkSubscription({
      customFieldData: {
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

describe("deleteCustomer mutation", () => {
  let t: TestConvex<typeof schema>;

  beforeEach(() => {
    t = convexTest(schema, modules);
  });

  it("deletes the customer and every local subscription", async () => {
    await t.mutation(api.lib.insertCustomer, createTestCustomer());
    await t.mutation(api.lib.createSubscription, {
      subscription: createTestSubscription({
        id: "sub_active",
        customerId: "cust_123",
      }),
    });
    await t.mutation(api.lib.createSubscription, {
      subscription: createTestSubscription({
        id: "sub_ended",
        customerId: "cust_123",
        status: "canceled",
        endedAt: "2025-01-16T12:00:00.000Z",
      }),
    });

    const result = await t.mutation(api.lib.deleteCustomer, {
      userId: "user_456",
      customerId: "cust_123",
    });

    expect(result).toEqual({
      status: "deleted",
      deletedSubscriptions: 2,
    });
    await expect(
      t.query(api.lib.getCustomerByUserId, { userId: "user_456" }),
    ).resolves.toBeNull();
    await expect(
      t.query(api.lib.listCustomerSubscriptions, {
        customerId: "cust_123",
      }),
    ).resolves.toEqual([]);
  });

  it("blocks late customer and subscription webhooks with a hashed tombstone", async () => {
    await t.mutation(api.lib.insertCustomer, createTestCustomer());
    await t.mutation(api.lib.deleteCustomer, {
      userId: "user_456",
      customerId: "cust_123",
    });

    const lateCustomer = await t.mutation(
      api.lib.insertCustomer,
      createTestCustomer(),
    );
    await t.mutation(api.lib.createSubscription, {
      subscription: createTestSubscription({ customerId: "cust_123" }),
    });
    await t.mutation(api.lib.updateSubscription, {
      subscription: createTestSubscription({
        customerId: "cust_123",
        status: "canceled",
      }),
    });

    expect(lateCustomer).toBeNull();
    await expect(
      t.query(api.lib.getCustomerByUserId, { userId: "user_456" }),
    ).resolves.toBeNull();
    await expect(
      t.query(api.lib.listCustomerSubscriptions, {
        customerId: "cust_123",
      }),
    ).resolves.toEqual([]);
    const tombstones = await t.run(async (ctx) =>
      ctx.db.query("deletedCustomers").collect(),
    );
    expect(tombstones).toHaveLength(1);
    expect(tombstones[0]?.customerHash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(tombstones[0])).not.toContain("cust_123");
  });

  it("does not delete another customer's data", async () => {
    await t.mutation(
      api.lib.insertCustomer,
      createTestCustomer({ id: "cust_other", userId: "user_other" }),
    );
    await t.mutation(api.lib.createSubscription, {
      subscription: createTestSubscription({
        id: "sub_other",
        customerId: "cust_other",
      }),
    });

    const result = await t.mutation(api.lib.deleteCustomer, {
      userId: "user_missing",
      customerId: "cust_missing",
    });

    expect(result).toEqual({
      status: "not_found",
      deletedSubscriptions: 0,
    });
    await expect(
      t.query(api.lib.getCustomerByUserId, { userId: "user_other" }),
    ).resolves.toMatchObject({ id: "cust_other" });
    await expect(
      t.query(api.lib.listCustomerSubscriptions, {
        customerId: "cust_other",
      }),
    ).resolves.toHaveLength(1);
  });

  it("refuses a mismatched customer id", async () => {
    await t.mutation(api.lib.insertCustomer, createTestCustomer());

    await expect(
      t.mutation(api.lib.deleteCustomer, {
        userId: "user_456",
        customerId: "cust_wrong",
      }),
    ).resolves.toEqual({
      status: "customer_mismatch",
      deletedSubscriptions: 0,
    });
    await expect(
      t.query(api.lib.getCustomerByUserId, { userId: "user_456" }),
    ).resolves.toMatchObject({ id: "cust_123" });
  });

  it("refuses a customer id mapped to another user", async () => {
    await t.mutation(api.lib.insertCustomer, createTestCustomer());
    await t.mutation(
      api.lib.insertCustomer,
      createTestCustomer({ userId: "user_re_registered" }),
    );

    await expect(
      t.mutation(api.lib.deleteCustomer, {
        userId: "user_456",
        customerId: "cust_123",
      }),
    ).resolves.toEqual({
      status: "shared_customer",
      deletedSubscriptions: 0,
    });
    await expect(
      t.query(api.lib.getCustomerByUserId, { userId: "user_456" }),
    ).resolves.toMatchObject({ id: "cust_123" });
    await expect(
      t.query(api.lib.getCustomerByUserId, { userId: "user_re_registered" }),
    ).resolves.toMatchObject({ id: "cust_123" });
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
