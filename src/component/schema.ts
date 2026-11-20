import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

const vRecurringInterval = v.union(v.string(), v.null());

export default defineSchema(
  {
    customers: defineTable({
      id: v.string(),
      userId: v.string(),
      metadata: v.optional(v.record(v.string(), v.any())),
    })
      .index("userId", ["userId"])
      .index("id", ["id"]),
    deletedCustomers: defineTable({
      customerHash: v.string(),
      deletedAt: v.number(),
    }).index("customerHash", ["customerHash"]),
    products: defineTable({
      id: v.string(),
      createdAt: v.string(),
      modifiedAt: v.union(v.string(), v.null()),
      name: v.string(),
      description: v.union(v.string(), v.null()),
      recurringInterval: v.optional(vRecurringInterval),
      isRecurring: v.boolean(),
      isArchived: v.boolean(),
      organizationId: v.string(),
      metadata: v.optional(v.record(v.string(), v.any())),
      prices: v.array(
        v.object({
          id: v.string(),
          createdAt: v.string(),
          modifiedAt: v.union(v.string(), v.null()),
          amountType: v.optional(v.string()),
          isArchived: v.boolean(),
          productId: v.string(),
          priceCurrency: v.optional(v.string()),
          priceAmount: v.optional(v.number()),
          type: v.optional(v.string()),
          recurringInterval: v.optional(vRecurringInterval),
          source: v.optional(v.string()),
          maximumAmount: v.optional(v.union(v.number(), v.null())),
          minimumAmount: v.optional(v.union(v.number(), v.null())),
          presetAmount: v.optional(v.union(v.number(), v.null())),
          seatTiers: v.optional(
            v.array(
              v.object({
                minSeats: v.number(),
                maxSeats: v.union(v.number(), v.null()),
                pricePerSeat: v.number(),
              }),
            ),
          ),
          unitAmount: v.optional(v.string()),
          capAmount: v.optional(v.union(v.number(), v.null())),
          meterId: v.optional(v.string()),
          meter: v.optional(
            v.object({
              id: v.string(),
              name: v.string(),
            }),
          ),
        }),
      ),
      benefits: v.optional(
        v.array(
          v.object({
            id: v.string(),
            createdAt: v.string(),
            modifiedAt: v.union(v.string(), v.null()),
            type: v.string(),
            description: v.string(),
            selectable: v.boolean(),
            deletable: v.boolean(),
            organizationId: v.string(),
            metadata: v.optional(v.record(v.string(), v.any())),
            properties: v.optional(v.any()),
          }),
        ),
      ),
      medias: v.array(
        v.object({
          id: v.string(),
          organizationId: v.string(),
          name: v.string(),
          path: v.string(),
          mimeType: v.string(),
          size: v.number(),
          storageVersion: v.union(v.string(), v.null()),
          checksumEtag: v.union(v.string(), v.null()),
          checksumSha256Base64: v.union(v.string(), v.null()),
          checksumSha256Hex: v.union(v.string(), v.null()),
          createdAt: v.string(),
          lastModifiedAt: v.union(v.string(), v.null()),
          version: v.union(v.string(), v.null()),
          service: v.optional(v.string()),
          isUploaded: v.boolean(),
          sizeReadable: v.string(),
          publicUrl: v.string(),
        }),
      ),
      trialInterval: v.optional(v.union(v.string(), v.null())),
      trialIntervalCount: v.optional(v.union(v.number(), v.null())),
      recurringIntervalCount: v.optional(v.union(v.number(), v.null())),
    })
      .index("id", ["id"])
      .index("isArchived", ["isArchived"]),
    subscriptions: defineTable({
      id: v.string(),
      customerId: v.string(),
      createdAt: v.string(),
      modifiedAt: v.union(v.string(), v.null()),
      amount: v.union(v.number(), v.null()),
      currency: v.union(v.string(), v.null()),
      recurringInterval: vRecurringInterval,
      status: v.string(),
      currentPeriodStart: v.string(),
      currentPeriodEnd: v.union(v.string(), v.null()),
      cancelAtPeriodEnd: v.boolean(),
      startedAt: v.union(v.string(), v.null()),
      endedAt: v.union(v.string(), v.null()),
      productId: v.string(),
      priceId: v.optional(v.string()),
      checkoutId: v.union(v.string(), v.null()),
      metadata: v.record(v.string(), v.any()),
      customerCancellationReason: v.optional(v.union(v.string(), v.null())),
      customerCancellationComment: v.optional(v.union(v.string(), v.null())),
      discountId: v.optional(v.union(v.string(), v.null())),
      canceledAt: v.optional(v.union(v.string(), v.null())),
      endsAt: v.optional(v.union(v.string(), v.null())),
      recurringIntervalCount: v.optional(v.number()),
      trialStart: v.optional(v.union(v.string(), v.null())),
      trialEnd: v.optional(v.union(v.string(), v.null())),
      seats: v.optional(v.union(v.number(), v.null())),
      customFieldData: v.optional(v.record(v.string(), v.any())),
    })
      .index("id", ["id"])
      .index("customerId", ["customerId"])
      .index("customerId_status", ["customerId", "status"])
      .index("customerId_endedAt", ["customerId", "endedAt"]),
  },
  {
    schemaValidation: true,
  },
);
