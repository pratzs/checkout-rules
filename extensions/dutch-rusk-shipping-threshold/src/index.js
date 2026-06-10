import { extension, Banner, Text, BlockStack } from "@shopify/ui-extensions/checkout";

const FREE_SHIPPING_THRESHOLD = 150;

export default extension(
  "purchase.checkout.actions.render-before",
  (root, api) => {
    let banner = null;

    function updateBanner(subtotal) {
      const amount = parseFloat(subtotal?.amount ?? "0");

      // Remove existing banner first
      if (banner) {
        root.removeChild(banner);
        banner = null;
      }

      // Don't show anything at or above threshold
      if (amount >= FREE_SHIPPING_THRESHOLD) return;

      const remaining = (FREE_SHIPPING_THRESHOLD - amount).toFixed(2);

      banner = root.createComponent(
        Banner,
        { status: "warning", title: `Add $${remaining} more for free shipping` },
        root.createComponent(
          BlockStack,
          null,
          root.createComponent(
            Text,
            null,
            `You're $${remaining} away from free shipping. Add a little more to your order and we'll ship it free!`
          ),
          root.createComponent(
            Text,
            null,
            `Orders under $${FREE_SHIPPING_THRESHOLD} will have shipping charges applied. The cost will be calculated based on the weight of your order and delivery location, and included on your invoice.`
          )
        )
      );

      root.appendChild(banner);
    }

    // Render on load
    updateBanner(api.cost.subtotalAmount.current);

    // Keep in sync as items are added/removed
    api.cost.subtotalAmount.subscribe((newSubtotal) => {
      updateBanner(newSubtotal);
    });
  }
);
