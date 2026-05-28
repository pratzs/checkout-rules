import { extension, Banner, Text } from "@shopify/ui-extensions/checkout";

export default extension(
  "purchase.checkout.actions.render-before",
  (root, api) => {
    // Only render for B2B purchasing company buyers
    const company = api.purchasingCompany?.current;
    if (!company) return;

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
);

// Always returns the 20th of the calendar month after today.
// December wraps to January of the following year.
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
