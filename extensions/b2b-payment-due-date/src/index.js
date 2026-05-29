import { extension, Banner, Text } from "@shopify/ui-extensions/checkout";

export default extension(
  "purchase.checkout.actions.render-before",
  (root, api) => {
    // Check overdue status from the customer's synced groups metafield.
    // This metafield contains all the customer's Shopify tags as a JSON array,
    // kept current by the app's customers/update webhook.
    let isOverdue = false;
    try {
      const metafields = api.appMetafields?.current ?? [];
      const groupsMeta = metafields.find(
        (m) =>
          m.metafield.namespace === "$app:checkout-rules" &&
          m.metafield.key === "groups"
      );
      if (groupsMeta?.metafield?.value) {
        const groups = JSON.parse(groupsMeta.metafield.value);
        isOverdue = Array.isArray(groups) && groups.includes("overdue");
      }
    } catch { /* safe fallback — treat as not overdue */ }

    if (isOverdue) {
      root.appendChild(
        root.createComponent(
          Banner,
          { status: "critical", title: "Account overdue — action required" },
          root.createComponent(
            Text,
            null,
            "Your account has an outstanding overdue balance. Please contact our accounts team to resolve this before placing new orders."
          )
        )
      );
    } else {
      root.appendChild(
        root.createComponent(
          Banner,
          { status: "info", title: "Payment due date" },
          root.createComponent(
            Text,
            null,
            `Your invoice will be due on ${getPaymentDueDate()}. No payment is required to complete this order.`
          )
        )
      );
    }
  }
);

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Returns the 20th of the calendar month following today, with full year.
 * Example: "20 June 2026"
 */
function getPaymentDueDate() {
  const now = new Date();
  const isDecember = now.getMonth() === 11;
  const year = isDecember ? now.getFullYear() + 1 : now.getFullYear();
  const month = isDecember ? 0 : now.getMonth() + 1;
  return new Date(year, month, 20).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}
