// @ts-nocheck

export function cartPaymentMethodsTransformRun(input) {
  const config = input.paymentCustomization?.metafield?.jsonValue;
  const operations = [];

  // No config or Companies mode → B2B purchasingCompany logic
  if (!config || config.mode === "companies") {
    const isB2B = input.cart.buyerIdentity?.purchasingCompany != null;

    for (const method of input.paymentMethods) {
      const name = method.name?.toLowerCase() ?? "";

      // A method is considered "deferred / B2B net-terms" if its name contains
      // any of these keywords. Shopify's own B2B payment options include phrases
      // like "Net Payment Terms", "Choose payment method later", "Pay by invoice".
      // We do NOT rely on exact card-brand name matching because Shopify exposes
      // different names to the Function vs the admin API (e.g. "Shopify Payments"
      // at runtime vs "Visa"/"Credit Card" in the gateway list).
      const isDeferred =
        name.includes("deferred") ||
        name.includes("net")      ||
        name.includes("invoice")  ||
        name.includes("terms")    ||
        name.includes("later");

      if (isB2B && !isDeferred) {
        // B2B: show ONLY deferred/net-terms methods — hide everything else
        operations.push({ paymentMethodHide: { paymentMethodId: method.id } });
      } else if (!isB2B && isDeferred) {
        // B2C: hide deferred/net-terms methods — show credit card etc.
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
