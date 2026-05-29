// @ts-nocheck

export function cartPaymentMethodsTransformRun(input) {
  const config = input.paymentCustomization?.metafield?.jsonValue;
  const operations = [];

  // No config or Companies mode → B2B purchasingCompany logic
  if (!config || config.mode === "companies") {
    const isB2B = input.cart.buyerIdentity?.purchasingCompany != null;

    // When the admin has explicitly toggled individual methods in the config
    // (visible: false), use those as the authoritative hide list for B2B.
    // This handles stores where Shopify exposes individual card-brand names
    // (Visa, American Express, eftpos NZ, etc.) that would never match the
    // "credit"/"card" pattern fallback.
    // Falls back to pattern matching when no explicit hides are configured,
    // preserving the existing behaviour for stores that rely on it.
    const configMethods = config?.paymentMethods ?? [];
    const hasExplicitHides = configMethods.some((m) => m.visible === false);

    for (const method of input.paymentMethods) {
      const name = method.name?.toLowerCase() ?? "";
      const isCreditCard = name.includes("credit") || name.includes("card");
      const isDeferred =
        name.includes("deferred") || name.includes("net") || name.includes("invoice");

      if (isB2B) {
        if (hasExplicitHides) {
          // Respect the per-method UI toggles: hide anything marked visible: false
          const rule = configMethods.find((r) => matchesTitle(method.name ?? "", r.title));
          if (rule && rule.visible === false) {
            operations.push({ paymentMethodHide: { paymentMethodId: method.id } });
          }
        } else if (isCreditCard) {
          // No explicit config — fall back to pattern matching (original behaviour)
          operations.push({ paymentMethodHide: { paymentMethodId: method.id } });
        }
      } else if (isDeferred) {
        // B2C: always hide deferred / net-terms methods (unchanged)
        operations.push({ paymentMethodHide: { paymentMethodId: method.id } });
      }
    }

    // For B2B company buyers: override the native payment terms display
    // by setting Fixed payment terms with due date = 20th of the following month.
    // This replaces the "You're on Net 30 terms. Your payment will be due on 28 June."
    // text with the correct date shown natively in Shopify checkout.
    if (isB2B) {
      operations.push({
        paymentTermsSet: {
          paymentTerms: {
            fixed: {
              dueAt: getNextDueDateISO(),
            },
          },
        },
      });
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

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Returns an ISO 8601 DateTime string for the 20th of the calendar month
 * following today. December wraps to January of the following year.
 * Example output: "2026-06-20T00:00:00.000Z"
 */
function getNextDueDateISO() {
  const now = new Date();
  const isDecember = now.getMonth() === 11;
  const year = isDecember ? now.getFullYear() + 1 : now.getFullYear();
  const month = isDecember ? 0 : now.getMonth() + 1;
  return new Date(Date.UTC(year, month, 20, 0, 0, 0)).toISOString();
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
