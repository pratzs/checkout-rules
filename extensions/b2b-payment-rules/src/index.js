// @ts-nocheck

export function cartPaymentMethodsTransformRun(input) {
  const config = input.paymentCustomization?.metafield?.jsonValue;
  const operations = [];

  // No config or Companies mode → original B2B purchasingCompany logic
  if (!config || config.mode === "companies") {
    const isB2B = input.cart.buyerIdentity?.purchasingCompany != null;

    for (const method of input.paymentMethods) {
      const name = method.name?.toLowerCase() ?? "";
      const isCreditCard = name.includes("credit") || name.includes("card");
      const isDeferred =
        name.includes("deferred") || name.includes("net") || name.includes("invoice");

      if (isB2B && isCreditCard) {
        operations.push({ paymentMethodHide: { paymentMethodId: method.id } });
      } else if (!isB2B && isDeferred) {
        operations.push({ paymentMethodHide: { paymentMethodId: method.id } });
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

  const shouldApply = config.negate ? !matches : matches;
  if (!shouldApply) return { operations };

  const methodRules = config.paymentMethods ?? [];

  // Pass 1 — hide methods marked visible: false
  for (const method of input.paymentMethods) {
    const methodName = method.name ?? "";
    for (const rule of methodRules) {
      if (rule.visible !== false) continue;
      if (matchesTitle(methodName, rule.title)) {
        operations.push({ paymentMethodHide: { paymentMethodId: method.id } });
        break;
      }
    }
  }

  // Pass 2 — reorder visible methods that have an explicit order index
  const orderedRules = methodRules
    .filter((r) => r.visible !== false && typeof r.order === "number")
    .sort((a, b) => a.order - b.order);

  for (const rule of orderedRules) {
    for (const method of input.paymentMethods) {
      if (matchesTitle(method.name ?? "", rule.title)) {
        operations.push({ paymentMethodMove: { paymentMethodId: method.id, index: rule.order } });
        break;
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
