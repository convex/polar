import { createPolarCore } from "@polar-sh/sdk/2026-10";
import { createBenefits } from "@polar-sh/sdk/2026-10/services/benefits";
import { createMeters } from "@polar-sh/sdk/2026-10/services/meters";
import {
  createProducts,
  iterListProducts,
  listProducts,
  updateBenefitsProducts,
  updateProducts,
} from "@polar-sh/sdk/2026-10/services/products";
import { internalAction, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";

const accessToken = process.env.POLAR_ORGANIZATION_TOKEN;

const polar = createPolarCore({
  accessToken: accessToken ?? "",
  environment: "sandbox",
});

export const PREMIUM_PLAN_NAME = "Premium Plan";
export const PREMIUM_PLUS_PLAN_NAME = "Premium Plus Plan";
export const COMMUNITY_PLAN_NAME = "Community Plan";
export const SUPPORTER_PLAN_NAME = "Supporter Plan";
export const TEAM_PLAN_NAME = "Team Plan";
export const API_PLAN_NAME = "API Plan";

export const insertFakeUser = internalMutation({
  args: {},
  handler: async (ctx) => {
    const existingUser = await ctx.db.query("users").first();
    if (existingUser) {
      console.log("User already exists");
      return;
    }
    await ctx.db.insert("users", { email: "user@example.com" });
  },
});

const seed = internalAction({
  handler: async (ctx) => {
    // Insert a fake user for test purposes since this example doesn't have
    // working authentication.
    await ctx.runMutation(internal.seed.insertFakeUser);

    const result = await listProducts(polar)({
      is_archived: false,
      limit: 1,
    });
    const hasProducts = result.items.length > 0;

    // Return early if the Polar organization already has products, ensures
    // this doesn't run more than once.
    if (hasProducts) {
      console.log("Products already exist");
      return;
    }

    // Create example products. In a real app you would likely create your
    // products in the Polar dashboard and reference them by id in your application.

    // Premium plans with trial support
    const premiumMonthly = await createProducts(polar)({
      name: PREMIUM_PLAN_NAME,
      description: "All the things for one low monthly price.",
      recurring_interval: "month",
      trial_interval: "day",
      trial_interval_count: 7,
      prices: [
        {
          amount_type: "fixed",
          price_amount: 1000,
        },
      ],
    });
    console.log("Created Premium Monthly:", premiumMonthly.id);

    const premiumYearly = await createProducts(polar)({
      name: PREMIUM_PLAN_NAME,
      description: "All the things for one low annual price.",
      recurring_interval: "year",
      prices: [
        {
          amount_type: "fixed",
          price_amount: 10000,
        },
      ],
    });

    const premiumPlusMonthly = await createProducts(polar)({
      name: PREMIUM_PLUS_PLAN_NAME,
      description: "All the things for one low monthly price.",
      recurring_interval: "month",
      prices: [
        {
          amount_type: "fixed",
          price_amount: 2000,
        },
      ],
    });

    const premiumPlusYearly = await createProducts(polar)({
      name: PREMIUM_PLUS_PLAN_NAME,
      description: "All the things for one low annual price.",
      recurring_interval: "year",
      prices: [
        {
          amount_type: "fixed",
          price_amount: 20000,
        },
      ],
    });

    // Community Plan — free tier
    await createProducts(polar)({
      name: COMMUNITY_PLAN_NAME,
      description: "Free access to the community. No credit card required.",
      recurring_interval: "month",
      prices: [
        {
          amount_type: "fixed",
          price_amount: 0,
        },
      ],
    });

    // Supporter Plan — pay what you want
    await createProducts(polar)({
      name: SUPPORTER_PLAN_NAME,
      description:
        "Support the project with a monthly contribution. Pay what you want.",
      recurring_interval: "month",
      prices: [
        {
          amount_type: "custom",
          minimum_amount: 500,
          maximum_amount: 10000,
          preset_amount: 1000,
        },
      ],
    });

    // Team Plan — seat-based pricing
    await createProducts(polar)({
      name: TEAM_PLAN_NAME,
      description: "Per-seat pricing for your team with volume discounts.",
      recurring_interval: "month",
      prices: [
        {
          amount_type: "seat_based",
          seat_tiers: {
            tiers: [
              { min_seats: 1, max_seats: 5, price_per_seat: 1000 },
              { min_seats: 6, max_seats: 20, price_per_seat: 900 },
              { min_seats: 21, max_seats: null, price_per_seat: 800 },
            ],
          },
        },
      ],
    });

    // API Plan — metered usage pricing
    const meter = await createMeters(polar)({
      name: "API Requests",
      filter: {
        conjunction: "and",
        clauses: [
          { property: "type", operator: "eq", value: "api_request" },
        ],
      },
      aggregation: { func: "count" },
    });
    await createProducts(polar)({
      name: API_PLAN_NAME,
      description:
        "Pay per API request with a monthly cap. Usage tracked automatically.",
      recurring_interval: "month",
      prices: [
        {
          amount_type: "metered_unit",
          meter_id: meter.id,
          unit_amount: 1,
          cap_amount: 5000,
        },
      ],
    });

    // Create benefits and attach to Premium products
    const prioritySupport = await createBenefits(polar)({
      type: "custom",
      description: "Priority support",
      properties: { note: "Get responses within 24 hours" },
    });
    const earlyAccess = await createBenefits(polar)({
      type: "custom",
      description: "Early access to new features",
      properties: { note: "Beta access to upcoming features" },
    });

    const benefitIds = [prioritySupport.id, earlyAccess.id];

    // Attach benefits to all Premium products
    for (const product of [
      premiumMonthly,
      premiumYearly,
      premiumPlusMonthly,
      premiumPlusYearly,
    ]) {
      await updateBenefitsProducts(polar)(product.id, {
        benefits: benefitIds,
      });
    }
    console.log("Benefits attached to Premium products");
  },
});

// Utility action to archive all products so we can re-seed
export const archiveAll = internalAction({
  args: {},
  handler: async () => {
    // Collect first: archiving while paginating would shift the pages.
    const products = [];
    for await (const product of iterListProducts(polar)({
      is_archived: false,
      limit: 50,
    })) {
      products.push(product);
    }
    for (const product of products) {
      console.log("Archiving:", product.name, product.id);
      await updateProducts(polar)(product.id, { is_archived: true });
    }
    console.log("All products archived");
  },
});

export default seed;
