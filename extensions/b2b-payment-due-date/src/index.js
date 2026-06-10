import { extension, Banner, Text } from "@shopify/ui-extensions/checkout";

export default extension(
  "purchase.checkout.actions.render-before",
  (root, api) => {
    // Dutch Rusk uses its own payment schedule extension — skip this banner for them.
    if (api.shop.myshopifyDomain === "dutchrusk.myshopify.com") return;

    // Render the payment due date banner immediately — synchronous, always visible.
    let currentBanner = root.createComponent(
      Banner,
      { status: "info", title: "Payment due date" },
      root.createComponent(
        Text,
        null,
        `Your invoice will be due on ${getPaymentDueDate()}. No payment is required to complete this order.`
      )
    );
    root.appendChild(currentBanner);

    // Asynchronously check if the customer is overdue via Storefront API query.
    // api.query is built into checkout extensions — no external network access needed.
    checkOverdue(api).then((isOverdue) => {
      if (!isOverdue) return;
      root.removeChild(currentBanner);
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
    }).catch(() => { /* keep default banner on any error */ });
  }
);

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function checkOverdue(api) {
  // Only check if buyer is a logged-in customer.
  const customerId = api.buyerIdentity?.customer?.current?.id;
  if (!customerId) return false;

  // Query the customer's tags via Storefront API.
  // api.query uses the checkout session context — no external fetch or approval needed.
  const { data } = await api.query(`
    query CheckCustomerOverdue {
      customer {
        tags
      }
    }
  `);

  const tags = data?.customer?.tags ?? [];
  return tags.includes("overdue");
}

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
