import { extension, Banner, Text } from "@shopify/ui-extensions/checkout";

export default extension(
  "purchase.checkout.actions.render-before",
  (root, api) => {
    // Only show for B2B buyers (purchasing company present).
    const company = api.buyerIdentity?.purchasingCompany?.current;
    if (!company) return;

    root.appendChild(
      root.createComponent(
        Banner,
        { status: "info", title: "Net terms payment" },
        root.createComponent(
          Text,
          null,
          "You are on net terms. Your payment will be due on the date agreed with Dutch Rusk. No payment is required to complete this order."
        )
      )
    );
  }
);
