import { extension, Banner, Text } from "@shopify/ui-extensions/checkout";

export default extension(
  "purchase.checkout.actions.render-before",
  (root, api) => {
    let rendered = false;

    function renderBanner() {
      if (rendered) return;
      rendered = true;

      // Read overdue status synchronously from appMetafields at render time.
      // The groups metafield holds all customer Shopify tags as a JSON array,
      // synced by the app's customers/update webhook.
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
      } catch { /* safe fallback — show due date banner */ }

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
        const dueDate = getPaymentDueDate();
        root.appendChild(
          root.createComponent(
            Banner,
            { status: "info", title: "Payment due date" },
            root.createComponent(
              Text,
              null,
              `Your invoice will be due on ${dueDate}. No payment is required to complete this order.`
            )
          )
        );
      }
    }

    // Render immediately if company data is already loaded synchronously.
    if (api.purchasingCompany?.current) {
      renderBanner();
      return;
    }

    // Subscribe for async load — fires when B2B company data arrives.
    api.purchasingCompany?.subscribe((company) => {
      if (company) renderBanner();
    });
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
