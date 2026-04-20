// @ts-nocheck

export function cartDeliveryOptionsTransformRun(input) {
  const config = input.deliveryCustomization?.metafield?.jsonValue;
  const operations = [];

  // No config or Companies mode → original B2B purchasingCompany logic
  if (!config || config.mode === "companies") {
    const isB2B = input.cart.buyerIdentity?.purchasingCompany != null;

    for (const group of input.cart.deliveryGroups) {
      for (const option of group.deliveryOptions) {
        const title = option.title?.toLowerCase() ?? "";
        const isFreeB2BRate = title.includes("free") || title.includes("b2b");

        if (isB2B && !isFreeB2BRate) {
          operations.push({ deliveryOptionHide: { deliveryOptionHandle: option.handle } });
        } else if (!isB2B && isFreeB2BRate) {
          operations.push({ deliveryOptionHide: { deliveryOptionHandle: option.handle } });
        }
      }
    }
    return { operations };
  }

  // Tags mode — customer groups are stored in a customer metafield (synced from Shopify tags by the app)
  const customerGroups = input.cart.buyerIdentity?.customer?.metafield?.jsonValue ?? [];
  const ruleTags = config.tags ?? [];
  const logic = config.conditionLogic ?? "any";

  if (ruleTags.length === 0) return { operations };

  const matches =
    logic === "all"
      ? ruleTags.every((tag) => customerGroups.includes(tag))
      : ruleTags.some((tag) => customerGroups.includes(tag));

  if (!matches) return { operations };

  const methodRules = config.shippingMethods ?? [];

  for (const group of input.cart.deliveryGroups) {
    for (const option of group.deliveryOptions) {
      const optionTitle = option.title ?? "";
      for (const rule of methodRules) {
        if (rule.visible !== false) continue;
        if (matchesTitle(optionTitle, rule.title)) {
          operations.push({ deliveryOptionHide: { deliveryOptionHandle: option.handle } });
          break;
        }
      }
    }
  }

  return { operations };
}

function matchesTitle(actual, pattern) {
  if (!pattern) return false;
  if (pattern.includes("*")) {
    const regex = new RegExp(
      "^" + pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*") + "$",
      "i"
    );
    return regex.test(actual);
  }
  return actual.toLowerCase() === pattern.toLowerCase();
}
