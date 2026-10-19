import type {
  GenericMutationCtx,
  GenericActionCtx,
  GenericQueryCtx,
  GenericDataModel,
} from "convex/server";
import type { models } from "@polar-sh/sdk/2026-10";
import type { Infer } from "convex/values";
import type schema from "./schema.js";

export type QueryCtx = Pick<GenericQueryCtx<GenericDataModel>, "runQuery">;
export type MutationCtx = Pick<
  GenericMutationCtx<GenericDataModel>,
  "runQuery" | "runMutation"
>;
export type ActionCtx = Pick<
  GenericActionCtx<GenericDataModel>,
  "runQuery" | "runMutation" | "runAction"
>;

export const convertToDatabaseSubscription = (
  subscription: models.Subscription,
): Infer<typeof schema.tables.subscriptions.validator> => {
  return {
    id: subscription.id,
    customerId: subscription.customer_id,
    createdAt: subscription.created_at,
    modifiedAt: subscription.modified_at,
    productId: subscription.product_id,
    checkoutId: subscription.checkout_id,
    amount: subscription.amount,
    currency: subscription.currency,
    recurringInterval: subscription.recurring_interval,
    status: subscription.status,
    currentPeriodStart: subscription.current_period_start,
    currentPeriodEnd: subscription.current_period_end,
    cancelAtPeriodEnd: subscription.cancel_at_period_end,
    customerCancellationReason: subscription.customer_cancellation_reason,
    customerCancellationComment: subscription.customer_cancellation_comment,
    startedAt: subscription.started_at,
    endedAt: subscription.ended_at,
    metadata: subscription.metadata,
    discountId: subscription.discount_id,
    canceledAt: subscription.canceled_at,
    endsAt: subscription.ends_at,
    recurringIntervalCount: subscription.recurring_interval_count,
    trialStart: subscription.trial_start,
    trialEnd: subscription.trial_end,
    seats: subscription.seats ?? null,
    customFieldData: subscription.custom_field_data,
  };
};

export const convertToDatabaseProduct = (
  product: models.Product,
): Infer<typeof schema.tables.products.validator> => {
  return {
    id: product.id,
    organizationId: product.organization_id,
    name: product.name,
    description: product.description,
    isRecurring: product.is_recurring,
    isArchived: product.is_archived,
    createdAt: product.created_at,
    modifiedAt: product.modified_at,
    recurringInterval: product.recurring_interval,
    metadata: product.metadata,
    trialInterval: product.trial_interval,
    trialIntervalCount: product.trial_interval_count,
    recurringIntervalCount: product.recurring_interval_count,
    prices: product.prices.map((price) => {
      const basePrice = {
        id: price.id,
        productId: price.product_id,
        amountType: price.amount_type,
        isArchived: price.is_archived,
        createdAt: price.created_at,
        modifiedAt: price.modified_at,
        recurringInterval: product.recurring_interval,
        type: product.is_recurring ? "recurring" : "one_time",
        source: price.source,
      };

      if (price.amount_type === "fixed") {
        return {
          ...basePrice,
          priceAmount: price.price_amount,
          priceCurrency: price.price_currency,
        };
      }

      if (price.amount_type === "custom") {
        return {
          ...basePrice,
          priceCurrency: price.price_currency,
          minimumAmount: price.minimum_amount,
          maximumAmount: price.maximum_amount,
          presetAmount: price.preset_amount,
        };
      }

      if (price.amount_type === "seat_based") {
        return {
          ...basePrice,
          priceCurrency: price.price_currency,
          seatTiers: price.seat_tiers.tiers.map((tier) => ({
            minSeats: tier.min_seats,
            maxSeats: tier.max_seats ?? null,
            pricePerSeat: tier.price_per_seat,
          })),
        };
      }

      if (price.amount_type === "metered_unit") {
        return {
          ...basePrice,
          priceCurrency: price.price_currency,
          unitAmount: price.unit_amount,
          capAmount: price.cap_amount,
          meterId: price.meter_id,
          meter: { id: price.meter.id, name: price.meter.name },
        };
      }

      return basePrice;
    }),
    benefits: product.benefits?.map((benefit) => ({
      id: benefit.id,
      createdAt: benefit.created_at,
      modifiedAt: benefit.modified_at,
      type: benefit.type,
      description: benefit.description,
      selectable: benefit.selectable,
      deletable: benefit.deletable,
      organizationId: benefit.organization_id,
      metadata: benefit.metadata,
      properties: benefit.properties,
    })),
    medias: product.medias.map((media) => ({
      id: media.id,
      organizationId: media.organization_id,
      name: media.name,
      path: media.path,
      mimeType: media.mime_type,
      size: media.size,
      storageVersion: media.storage_version,
      checksumEtag: media.checksum_etag,
      checksumSha256Base64: media.checksum_sha256_base64,
      checksumSha256Hex: media.checksum_sha256_hex,
      createdAt: media.created_at,
      lastModifiedAt: media.last_modified_at,
      version: media.version,
      isUploaded: media.is_uploaded,
      sizeReadable: media.size_readable,
      publicUrl: media.public_url,
    })),
  };
};
