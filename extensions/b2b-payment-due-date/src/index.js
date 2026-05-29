import { extension, Banner, Text } from "@shopify/ui-extensions/checkout";

export default extension(
  "purchase.checkout.actions.render-before",
  (root, api) => {
    // Keep a reference to the currently mounted banner so we can swap it out
    // if metafield data arrives after purchasingCompany resolves (rare but possible).
    let currentBanner = null;

    function renderBanner() {
      const company = api.purchasingCompany?.current;
      if (!company) return;

      // Read the customer's synced tag groups metafield to detect "overdue" status.
      // The metafield stores a JSON array of the customer's Shopify tags, kept in
      // sync by the app's customers/update webhook.
      const metafields = api.appMetafields?.current ?? [];
      const groupsMeta = metafields.find(
        (m) =>
          m.metafield.namespace === "$app:checkout-rules" &&
          m.metafield.key === "groups"
      );
      let groups = [];
      try {
        const raw = groupsMeta?.metafield?.value;
        if (raw) groups = JSON.parse(raw);
      } catch { /* malformed JSON — treat as no groups */ }

      const isOverdue = Array.isArray(groups) && groups.includes("overdue");

      // Remove previous banner before mounting the new one (handles the case
      // where metafields arrive after the first render).
      if (currentBanner) {
        root.removeChild(currentBanner);
        currentBanner = null;
      }

      if (isOverdue) {
        currentBanner = root.createComponent(
          Banner,
          { status: "critical", title: "Account overdue — action required" },
          root.createComponent(
            Text,
            null,
            "Your account has an outstanding overdue balance. Please contact our accounts team to resolve this before placing new orders."
          )
        );
      } else {
        const dueDate = getPaymentDueDate();
        currentBanner = root.createComponent(
          Banner,
          { status: "info", title: "Payment due date" },
          root.createComponent(
            Text,
            null,
            `Your invoice will be due on ${dueDate}. No payment is required to complete this order.`
          )
        );
      }

      root.appendChild(currentBanner);
    }

    // Render immediately if company data is already available.
    if (api.purchasingCompany?.current) {
      renderBanner();
    }

    // Subscribe to company changes (async load — fires when B2B company data arrives).
    api.purchasingCompany?.subscribe((company) => {
      if (company) renderBanner();
    });

    // Subscribe to metafield changes — re-render if overdue status arrives after
    // the initial company-based render (e.g. slow network).
    api.appMetafields?.subscribe(() => {
      if (api.purchasingCompany?.current) renderBanner();
    });
  }
);

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Returns a human-readable date string for the 20th of the calendar month
 * following today, including the full year.
 * Example: "20 June 2026"
 */
function getPaymentDueDate() {
  const now = new Date();
  const isDecember = now.getMonth() === 11;
  const year = isDecember ? now.getFullYear() + 1 : now.getFullYear();
  const month = isDecember ? 0 : now.getMonth() + 1;
  const due = new Date(year, month, 20);
  return due.toLocaleDateString("en-AU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}
