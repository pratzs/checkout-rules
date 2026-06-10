import { extension, Banner, Text, BlockStack } from "@shopify/ui-extensions/checkout";

const SCHEDULE_TAGS = ["dr-payment:weekly", "dr-payment:fortnightly", "dr-payment:monthly"];

export default extension(
  "purchase.checkout.actions.render-before",
  (root, api) => {
    // Async only — we don't know the schedule until we read the customer's tag.
    // Untagged (regular DTC) customers see nothing.
    resolveSchedule(api)
      .then((result) => {
        if (!result) return;
        root.appendChild(buildBanner(root, result));
      })
      .catch(() => {});
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

async function resolveSchedule(api) {
  const customerId = api.buyerIdentity?.customer?.current?.id;
  if (!customerId) return null;

  const { data } = await api.query(`
    query GetCustomerPaymentSchedule {
      customer {
        tags
      }
    }
  `);

  const tags = data?.customer?.tags ?? [];
  const scheduleTag = tags.find((t) => SCHEDULE_TAGS.includes(t));
  if (!scheduleTag) return null;

  const schedule = scheduleTag.replace("dr-payment:", "");
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
