import { httpRouter } from "convex/server";
import { polar } from "./example";

const http = httpRouter();

polar.registerRoutes(http, {
  // Optional custom path, default is "/polar/events"
  path: "/polar/events",
  // Typesafe event handlers for any Polar webhook event.
  events: {
    "subscription.updated": async (ctx, event) => {
      console.log("Subscription updated", event);
      if (event.data.customer_cancellation_reason) {
        console.log(
          "Customer cancellation reason",
          event.data.customer_cancellation_reason
        );
        console.log(
          "Customer cancellation comment",
          event.data.customer_cancellation_comment
        );
      }
    },
    "order.created": async (ctx, event) => {
      console.log("Order created", event.data.id);
    },
  },
});

export default http;
