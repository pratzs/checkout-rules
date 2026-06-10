import { extension, Banner, Text, BlockStack } from "@shopify/ui-extensions/checkout";

const VALID_SCHEDULES = ["weekly", "fortnightly", "monthly"];

export default extension(
  "purchase.checkout.actions.render-before",
  (root, api) => {
    // appMetafields is pre-loaded by Shopify at checkout init — no async query needed.
    const result = resolveSchedule(api);
    if (!result) return;
    root.appendChild(buildBanner(root, result));
  }
);

// ─── Banner builder ───────────────────────────────────────────────────────────

function buildBanner(root, { schedule, dueDate }) {
  const scheduleLabel = {
    weekly: "weekly",
    fortnightly: "fortnightly",
    monthly: "monthly",
  }[schedule];

  return root.createComponent(
    Banner,
    { status: "info", title: "Your payment schedule" },
    root.createComponent(
      BlockStack,
      null,
      root.createComponent(
        Text,
        null,
        `Your next direct debit is scheduled for ${dueDate}.`
      ),
      root.createComponent(
        Text,
        null,
        `This order will be added to your ${scheduleLabel} direct debit. No payment is required to complete this order.`
      )
    )
  );
}

// ─── Schedule resolution ──────────────────────────────────────────────────────

function resolveSchedule(api) {
  // appMetafields is pre-loaded by Shopify — declared in shopify.extension.toml.
  // No async query needed; works even for B2B buyers without a storefront session.
  const entry = (api.appMetafields.current ?? []).find(
    (m) =>
      m.metafield.namespace === "$app:dutch-rusk-checkout" &&
      m.metafield.key === "payment_schedule"
  );
  const schedule = entry?.metafield?.value;
  if (!schedule || !VALID_SCHEDULES.includes(schedule)) return null;
  return { schedule, dueDate: calcDueDate(schedule) };
}

// ─── Due date calculation ─────────────────────────────────────────────────────

function calcDueDate(schedule) {
  const now = new Date();
  let due;

  if (schedule === "weekly") {
    due = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  } else if (schedule === "fortnightly") {
    due = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
  } else {
    // monthly — 20th of the following calendar month
    const isDecember = now.getMonth() === 11;
    const year = isDecember ? now.getFullYear() + 1 : now.getFullYear();
    const month = isDecember ? 0 : now.getMonth() + 1;
    due = new Date(year, month, 20);
  }

  return due.toLocaleDateString("en-AU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}
