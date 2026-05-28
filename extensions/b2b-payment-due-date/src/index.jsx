import {
  reactExtension,
  usePurchasingCompany,
  Banner,
  Text,
} from "@shopify/ui-extensions-react/checkout";

export default reactExtension(
  "purchase.checkout.payment-method-list.render-after",
  () => <PaymentDueDate />
);

function PaymentDueDate() {
  const purchasingCompany = usePurchasingCompany();

  if (!purchasingCompany) return null;

  const dueDate = getPaymentDueDate();

  return (
    <Banner status="info" title="Payment due date">
      <Text>
        Your invoice will be due on {dueDate}. No payment is required to
        complete this order.
      </Text>
    </Banner>
  );
}

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
