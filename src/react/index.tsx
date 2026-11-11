import { PolarEmbedCheckout } from "@polar-sh/checkout/embed";
import { useEffect, useState, type PropsWithChildren, type MouseEvent } from "react";
import { useAction } from "convex/react";
import type { PolarComponentApi } from "../client/index.js";
export const CustomerPortalLink = ({
  polarApi,
  children,
  className,
  returnUrl,
}: PropsWithChildren<{
  polarApi: Pick<PolarComponentApi, "generateCustomerPortalUrl">;
  className?: string;
  returnUrl?: string;
}>) => {
  const generateCustomerPortalUrl = useAction(
    polarApi.generateCustomerPortalUrl,
  );
  const [portalUrl, setPortalUrl] = useState<string>();

  useEffect(() => {
    void generateCustomerPortalUrl({ returnUrl }).then((result) => {
      if (result) {
        setPortalUrl(result.url);
      }
    });
  }, [generateCustomerPortalUrl, returnUrl]);

  if (!portalUrl) {
    return null;
  }

  return (
    <a className={className} href={portalUrl} target="_blank">
      {children}
    </a>
  );
};

/** Renders a checkout link. Supports embedded or redirect checkout, with optional lazy loading and trial configuration. */
export const CheckoutLink = ({
  polarApi,
  productIds,
  children,
  className,
  subscriptionId,
  metadata,
  theme = "dark",
  embed = true,
  lazy = false,
  trialInterval,
  trialIntervalCount,
  locale,
}: PropsWithChildren<{
  polarApi: Pick<PolarComponentApi, "generateCheckoutLink">;
  productIds: string[];
  subscriptionId?: string;
  metadata?: Record<string, string>;
  trialInterval?: "day" | "week" | "month" | "year" | null;
  trialIntervalCount?: number | null;
  locale?: string;
  className?: string;
  theme?: "dark" | "light";
  embed?: boolean;
  lazy?: boolean;
}>) => {
  const generateCheckoutLink = useAction(polarApi.generateCheckoutLink);
  const [checkoutLink, setCheckoutLink] = useState<string>();
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (lazy) return;
    if (embed) {
      PolarEmbedCheckout.init();
    }
    void generateCheckoutLink({
      productIds,
      subscriptionId,
      metadata,
      origin: window.location.origin,
      successUrl: window.location.href,
      trialInterval,
      trialIntervalCount,
      locale,
    }).then(({ url }) => setCheckoutLink(url));
  }, [lazy, productIds, subscriptionId, metadata, embed, generateCheckoutLink, trialInterval, trialIntervalCount, locale]);

  const handleClick = lazy
    ? async (e: MouseEvent) => {
        e.preventDefault();
        if (isLoading) return;
        setIsLoading(true);
        try {
          const { url } = await generateCheckoutLink({
            productIds,
            subscriptionId,
            metadata,
            origin: window.location.origin,
            successUrl: window.location.href,
            trialInterval,
            trialIntervalCount,
            locale,
          });
          if (embed) {
            await PolarEmbedCheckout.create(url, { theme });
          } else {
            window.open(url, "_blank", "noopener");
          }
        } finally {
          setIsLoading(false);
        }
      }
    : undefined;

  return (
    <a
      className={className}
      href={checkoutLink ?? (lazy ? "#" : undefined)}
      onClick={handleClick}
      data-polar-checkout-theme={theme}
      {...(!lazy && embed ? { "data-polar-checkout": true } : {})}
    >
      {children}
    </a>
  );
};
