import {
  type PolarCore,
  type models,
  createPolarCore,
  webhooks,
} from "@polar-sh/sdk/2026-10";
import {
  createCustomers,
  listCustomers,
} from "@polar-sh/sdk/2026-10/services/customers";
import { createCheckouts } from "@polar-sh/sdk/2026-10/services/checkouts";
import { createCustomerSessions } from "@polar-sh/sdk/2026-10/services/customer_sessions";
import { updateSubscriptions } from "@polar-sh/sdk/2026-10/services/subscriptions";
import {
  type FunctionReference,
  type GenericActionCtx,
  type GenericDataModel,
  type HttpRouter,
  actionGeneric,
  httpActionGeneric,
  queryGeneric,
  type ApiFromModules,
} from "convex/server";
import { type Infer, v } from "convex/values";
import { mapValues } from "remeda";
import schema from "../component/schema.js";
import {
  type ActionCtx,
  type MutationCtx,
  type QueryCtx,
  convertToDatabaseProduct,
  convertToDatabaseSubscription,
} from "../component/util.js";
import type { ComponentApi } from "../component/_generated/component.js";

export const subscriptionValidator = schema.tables.subscriptions.validator;
export type Subscription = Infer<typeof subscriptionValidator>;

export type SubscriptionHandler = FunctionReference<
  "mutation",
  "internal",
  { subscription: Subscription }
>;

export type PolarComponentApi = ApiFromModules<{
  checkout: ReturnType<Polar["api"]>;
}>["checkout"];

/** Discriminated union of all Polar webhook event payloads. */
export type PolarWebhookEvent = webhooks.WebhookPayload;

/** Typesafe event handler map — keys are event type strings, values are typed handlers. */
export type WebhookEventHandlers = {
  [K in PolarWebhookEvent["type"]]?: (
    ctx: MutationCtx | ActionCtx,
    event: Extract<PolarWebhookEvent, { type: K }>,
  ) => Promise<void>;
};

export class Polar<
  DataModel extends GenericDataModel = GenericDataModel,
  Products extends Record<string, string> = Record<string, string>,
> {
  public polar: PolarCore;
  public products: Products;
  private organizationToken: string;
  private webhookSecret: string;
  private server: "sandbox" | "production";

  constructor(
    public component: ComponentApi,
    private config: {
      products?: Products;
      getUserInfo: (ctx: QueryCtx | MutationCtx | ActionCtx) => Promise<{
        userId: string;
        email: string;
      }>;
      organizationToken?: string;
      webhookSecret?: string;
      server?: "sandbox" | "production";
    },
  ) {
    this.products = config.products ?? ({} as Products);
    this.organizationToken =
      config.organizationToken ?? process.env["POLAR_ORGANIZATION_TOKEN"] ?? "";
    this.webhookSecret =
      config.webhookSecret ?? process.env["POLAR_WEBHOOK_SECRET"] ?? "";
    this.server =
      config.server ??
      (process.env["POLAR_SERVER"] as "sandbox" | "production") ??
      "sandbox";

    this.polar = createPolarCore({
      accessToken: this.organizationToken,
      environment: this.server,
    });
  }
  getCustomerByUserId(ctx: QueryCtx | MutationCtx | ActionCtx, userId: string) {
    return ctx.runQuery(this.component.lib.getCustomerByUserId, { userId });
  }
  async syncProducts(ctx: ActionCtx) {
    await ctx.runAction(this.component.lib.syncProducts, {
      polarAccessToken: this.organizationToken,
      server: this.server,
    });
  }
  /** Create a Polar checkout session, optionally with a free trial period. */
  async createCheckoutSession(
    ctx: MutationCtx | ActionCtx,
    {
      productIds,
      userId,
      email,
      origin,
      successUrl,
      subscriptionId,
      metadata,
      trialInterval,
      trialIntervalCount,
    }: {
      productIds: string[];
      userId: string;
      email: string;
      origin: string;
      successUrl: string;
      subscriptionId?: string;
      metadata?: Record<string, string>;
      trialInterval?: "day" | "week" | "month" | "year" | null;
      trialIntervalCount?: number | null;
    },
  ): Promise<models.Checkout> {
    const dbCustomer = await ctx.runQuery(
      this.component.lib.getCustomerByUserId,
      {
        userId,
      },
    );
    const getOrCreateCustomer = async () => {
      // Check if a customer with this email already exists in Polar
      const existing = await listCustomers(this.polar)({ email, limit: 1 });
      const existingCustomer = existing.items[0];
      if (existingCustomer) {
        return existingCustomer;
      }
      return await createCustomers(this.polar)({
        email,
        metadata: {
          userId,
        },
      });
    };
    const customerId = dbCustomer?.id || (await getOrCreateCustomer()).id;
    if (!dbCustomer) {
      await ctx.runMutation(this.component.lib.insertCustomer, {
        id: customerId,
        userId,
      });
    }
    return await createCheckouts(this.polar)({
      allow_discount_codes: true,
      customer_id: customerId,
      subscription_id: subscriptionId,
      embed_origin: origin,
      success_url: successUrl,
      metadata,
      trial_interval: trialInterval,
      trial_interval_count: trialIntervalCount,
      products: productIds,
    });
  }
  async createCustomerPortalSession(
    ctx: GenericActionCtx<DataModel>,
    { userId, returnUrl }: { userId: string; returnUrl?: string },
  ) {
    const customer = await ctx.runQuery(
      this.component.lib.getCustomerByUserId,
      { userId },
    );

    if (!customer) {
      throw new Error("Customer not found");
    }

    const session = await createCustomerSessions(this.polar)({
      customer_id: customer.id,
      return_url: returnUrl,
    });

    return { url: session.customer_portal_url };
  }
  listProducts(
    ctx: QueryCtx | MutationCtx | ActionCtx,
    { includeArchived }: { includeArchived?: boolean } = {},
  ) {
    return ctx.runQuery(this.component.lib.listProducts, {
      includeArchived,
    });
  }
  async getCurrentSubscription(
    ctx: QueryCtx | MutationCtx | ActionCtx,
    { userId }: { userId: string },
  ) {
    const subscription = await ctx.runQuery(
      this.component.lib.getCurrentSubscription,
      {
        userId,
      },
    );
    if (!subscription) {
      return null;
    }
    const product = await ctx.runQuery(this.component.lib.getProduct, {
      id: subscription.productId,
    });
    if (!product) {
      throw new Error("Product not found");
    }
    const productKey = (
      Object.keys(this.products) as Array<keyof Products>
    ).find((key) => this.products[key] === subscription.productId);
    return {
      ...subscription,
      productKey,
      product,
    };
  }
  /** Return all subscriptions for a user, including ended and expired trials. */
  listAllUserSubscriptions(
    ctx: QueryCtx | MutationCtx | ActionCtx,
    { userId }: { userId: string },
  ) {
    return ctx.runQuery(this.component.lib.listAllUserSubscriptions, {
      userId,
    });
  }
  getProduct(
    ctx: QueryCtx | MutationCtx | ActionCtx,
    { productId }: { productId: string },
  ) {
    return ctx.runQuery(this.component.lib.getProduct, { id: productId });
  }
  async changeSubscription(
    ctx: GenericActionCtx<DataModel>,
    { productId }: { productId: string },
  ) {
    const { userId } = await this.config.getUserInfo(ctx);
    const subscription = await this.getCurrentSubscription(ctx, { userId });
    if (!subscription) {
      throw new Error("Subscription not found");
    }
    if (subscription.productId === productId) {
      throw new Error("Subscription already on this product");
    }
    return await updateSubscriptions(this.polar)(subscription.id, {
      product_id: productId,
    });
  }
  /** Cancel an active or trialing subscription, optionally revoking immediately. */
  async cancelSubscription(
    ctx: ActionCtx,
    { revokeImmediately }: { revokeImmediately?: boolean } = {},
  ) {
    const { userId } = await this.config.getUserInfo(ctx);
    const subscription = await this.getCurrentSubscription(ctx, { userId });
    if (!subscription) {
      throw new Error("Subscription not found");
    }
    if (
      subscription.status !== "active" &&
      subscription.status !== "trialing"
    ) {
      throw new Error("Subscription is not active");
    }
    return await updateSubscriptions(this.polar)(
      subscription.id,
      revokeImmediately ? { revoke: true } : { cancel_at_period_end: true },
    );
  }
  api() {
    return {
      changeCurrentSubscription: actionGeneric({
        args: {
          productId: v.string(),
        },
        handler: async (ctx, args) => {
          await this.changeSubscription(ctx, {
            productId: args.productId,
          });
        },
      }),
      cancelCurrentSubscription: actionGeneric({
        args: {
          revokeImmediately: v.optional(v.boolean()),
        },
        handler: async (ctx, args) => {
          await this.cancelSubscription(ctx, {
            revokeImmediately: args.revokeImmediately,
          });
        },
      }),
      getConfiguredProducts: queryGeneric({
        args: {},
        handler: async (ctx) => {
          const products = await this.listProducts(ctx);
          return mapValues(this.products, (productId) =>
            products.find((p) => p.id === productId),
          );
        },
      }),
      listAllProducts: queryGeneric({
        args: {},
        handler: async (ctx) => {
          return await this.listProducts(ctx);
        },
      }),
      /** Query all subscriptions for the current user, including ended and expired trials. */
      listAllSubscriptions: queryGeneric({
        args: {},
        returns: v.array(
          v.object({
            ...schema.tables.subscriptions.validator.fields,
            product: v.union(schema.tables.products.validator, v.null()),
          }),
        ),
        handler: async (ctx) => {
          const { userId } = await this.config.getUserInfo(ctx);
          return await this.listAllUserSubscriptions(ctx, { userId });
        },
      }),
      /** Generate a Polar checkout URL, with optional trial period configuration. */
      generateCheckoutLink: actionGeneric({
        args: {
          productIds: v.array(v.string()),
          origin: v.string(),
          successUrl: v.string(),
          subscriptionId: v.optional(v.string()),
          metadata: v.optional(v.record(v.string(), v.string())),
          trialInterval: v.optional(v.union(v.string(), v.null())),
          trialIntervalCount: v.optional(v.union(v.number(), v.null())),
          locale: v.optional(v.string()),
        },
        returns: v.object({
          url: v.string(),
        }),
        handler: async (ctx, args) => {
          const { userId, email } = await this.config.getUserInfo(ctx);
          const { url: baseUrl } = await this.createCheckoutSession(ctx, {
            productIds: args.productIds,
            userId,
            email,
            subscriptionId: args.subscriptionId,
            origin: args.origin,
            successUrl: args.successUrl,
            metadata: args.metadata,
            trialInterval: args.trialInterval as
              | "day"
              | "week"
              | "month"
              | "year"
              | null
              | undefined,
            trialIntervalCount: args.trialIntervalCount,
          });
          let url = baseUrl;
          if (args.locale) {
            // Append locale as query param, preserving existing params
            const u = new URL(url);
            u.searchParams.set("locale", args.locale);
            url = u.toString();
          }
          return { url };
        },
      }),
      generateCustomerPortalUrl: actionGeneric({
        args: {
          returnUrl: v.optional(v.string()),
        },
        returns: v.object({ url: v.string() }),
        handler: async (ctx, args) => {
          const { userId } = await this.config.getUserInfo(ctx);
          const { url } = await this.createCustomerPortalSession(ctx, {
            userId,
            returnUrl: args.returnUrl,
          });
          return { url };
        },
      }),
    };
  }
  /**
   * @deprecated: use api() instead
   */
  checkoutApi() {
    return this.api();
  }
  registerRoutes(
    http: HttpRouter,
    {
      path = "/polar/events",
      events,
      onSubscriptionCreated,
      onSubscriptionUpdated,
      onProductCreated,
      onProductUpdated,
    }: {
      path?: string;
      /** Typesafe event handlers for any Polar webhook event. */
      events?: WebhookEventHandlers;
      /** @deprecated Use `events` with `"subscription.created"` key instead. */
      onSubscriptionCreated?: (
        ctx: MutationCtx | ActionCtx,
        event: webhooks.WebhookSubscriptionCreatedPayload,
      ) => Promise<void>;
      /** @deprecated Use `events` with `"subscription.updated"` key instead. */
      onSubscriptionUpdated?: (
        ctx: MutationCtx | ActionCtx,
        event: webhooks.WebhookSubscriptionUpdatedPayload,
      ) => Promise<void>;
      /** @deprecated Use `events` with `"product.created"` key instead. */
      onProductCreated?: (
        ctx: MutationCtx | ActionCtx,
        event: webhooks.WebhookProductCreatedPayload,
      ) => Promise<void>;
      /** @deprecated Use `events` with `"product.updated"` key instead. */
      onProductUpdated?: (
        ctx: MutationCtx | ActionCtx,
        event: webhooks.WebhookProductUpdatedPayload,
      ) => Promise<void>;
    } = {},
  ) {
    // Merge deprecated callbacks into events map (events wins on conflict)
    const mergedEvents: WebhookEventHandlers = { ...events };
    if (onSubscriptionCreated && !mergedEvents["subscription.created"]) {
      mergedEvents["subscription.created"] = onSubscriptionCreated;
    }
    if (onSubscriptionUpdated && !mergedEvents["subscription.updated"]) {
      mergedEvents["subscription.updated"] = onSubscriptionUpdated;
    }
    if (onProductCreated && !mergedEvents["product.created"]) {
      mergedEvents["product.created"] = onProductCreated;
    }
    if (onProductUpdated && !mergedEvents["product.updated"]) {
      mergedEvents["product.updated"] = onProductUpdated;
    }

    http.route({
      path,
      method: "POST",
      handler: httpActionGeneric(async (ctx, request) => {
        if (!request.body) {
          throw new Error("No body");
        }
        const body = await request.text();
        const headers = Object.fromEntries(request.headers.entries());
        try {
          const event = await webhooks.validateEvent(
            body,
            headers,
            this.webhookSecret,
          );

          // Built-in handling: persist subscriptions and products
          switch (event.type) {
            case "subscription.created": {
              await ctx.runMutation(this.component.lib.createSubscription, {
                subscription: convertToDatabaseSubscription(event.data),
              });
              break;
            }
            case "subscription.updated": {
              await ctx.runMutation(this.component.lib.updateSubscription, {
                subscription: convertToDatabaseSubscription(event.data),
              });
              break;
            }
            case "product.created": {
              await ctx.runMutation(this.component.lib.createProduct, {
                product: convertToDatabaseProduct(event.data),
              });
              break;
            }
            case "product.updated": {
              await ctx.runMutation(this.component.lib.updateProduct, {
                product: convertToDatabaseProduct(event.data),
              });
              break;
            }
          }

          // User event handling
          const handler = mergedEvents[event.type] as
            | ((
                ctx: MutationCtx | ActionCtx,
                event: PolarWebhookEvent,
              ) => Promise<void>)
            | undefined;
          if (handler) {
            await handler(ctx, event);
          }

          return new Response("Accepted", { status: 202 });
        } catch (error) {
          if (error instanceof webhooks.PolarWebhookVerificationError) {
            console.error(error);
            return new Response("Forbidden", { status: 403 });
          }
          // Event types newer than the pinned API version: acknowledge so
          // Polar doesn't retry them or disable the endpoint.
          if (error instanceof webhooks.PolarWebhookUnknownTypeError) {
            return new Response("Ignored", { status: 202 });
          }
          throw error;
        }
      }),
    });
  }
}
