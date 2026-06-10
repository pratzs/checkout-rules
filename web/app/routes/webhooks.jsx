import { authenticate, sessionStorage } from "../shopify.server";
import { syncSingleCustomer } from "../utils/sync.server";
import { SHIPPING_BAR_SNIPPET_KEY, SHIPPING_BAR_SNIPPET } from "../utils/snippets";

// ─── Customer webhook queries ────────────────────────────────────────────────

// Fetch live tags + current metafield together to avoid stale-payload races.
// (Shopify fires customers/update when WE write the metafield, so the payload
// tags can be empty/stale — querying live state breaks the feedback loop.)
const GET_CUSTOMER_TAGS_AND_GROUPS = `
  query GetCustomerTagsAndGroups($id: ID!) {
    customer(id: $id) {
      tags
      metafield(namespace: "$app:checkout-rules", key: "groups") {
        jsonValue
      }
    }
  }
`;

// ─── Payment customisation dueAt refresh ────────────────────────────────────

const GET_PAYMENT_CUSTOMIZATIONS_FOR_REFRESH = `
  query GetPaymentCustomizationsForRefresh($after: String) {
    paymentCustomizations(first: 50, after: $after) {
      nodes {
        id
        metafield(namespace: "$app:b2b-payment-rules", key: "function-configuration") {
          jsonValue
        }
      }
      pageInfo { hasNextPage endCursor }
    }
  }
`;

const SET_METAFIELD_DUE_AT = `
  mutation SetMetafieldDueAt($metafields: [MetafieldsSetInput!]!) {
    metafieldsSet(metafields: $metafields) {
      userErrors { field message }
    }
  }
`;

/**
 * Refreshes the `dueAt` field inside every payment customisation metafield.
 * Called automatically on every B2B orders/create webhook so the date shown
 * at checkout is always the current 20th-of-next-month without manual action.
 */
async function refreshPaymentCustomizationDueDates(admin) {
  const now = new Date();
  const isDecember = now.getMonth() === 11;
  const year = isDecember ? now.getFullYear() + 1 : now.getFullYear();
  const month = isDecember ? 0 : now.getMonth() + 1;
  const dueAt = new Date(Date.UTC(year, month, 20, 0, 0, 0)).toISOString();

  let cursor = null;
  do {
    const res = await admin.graphql(GET_PAYMENT_CUSTOMIZATIONS_FOR_REFRESH, {
      variables: { after: cursor },
    });
    const { data } = await res.json();
    const page = data?.paymentCustomizations;
    const nodes = page?.nodes ?? [];
    cursor = page?.pageInfo?.hasNextPage ? page?.pageInfo?.endCursor : null;

    for (const c of nodes) {
      if (!c.metafield?.jsonValue) continue;
      const newConfig = { ...c.metafield.jsonValue, dueAt };
      await admin.graphql(SET_METAFIELD_DUE_AT, {
        variables: {
          metafields: [
            {
              ownerId: c.id,
              namespace: "$app:b2b-payment-rules",
              key: "function-configuration",
              type: "json",
              value: JSON.stringify(newConfig),
            },
          ],
        },
      });
    }
  } while (cursor);
}

// ─── Order webhook queries ───────────────────────────────────────────────────

const GET_ORDER_PURCHASING_ENTITY = `
  query GetOrderPurchasingEntity($id: ID!) {
    order(id: $id) {
      id
      createdAt
      purchasingEntity {
        __typename
        ... on PurchasingCompany {
          company { id name }
        }
      }
    }
  }
`;

const GET_PAYMENT_TERMS_TEMPLATES = `
  query GetPaymentTermsTemplates {
    paymentTermsTemplates {
      id
      name
      paymentTermsType
      dueInDays
    }
  }
`;

const SET_ORDER_PAYMENT_TERMS = `
  mutation SetOrderPaymentTerms($orderId: ID!, $input: OrderPaymentTermsInput!) {
    orderPaymentTermsSet(orderId: $orderId, input: $input) {
      order {
        id
        paymentTerms {
          paymentTermsName
          nextPaymentDueDate
        }
      }
      userErrors {
        field
        message
      }
    }
  }
`;

// ─── Dutch Rusk payment schedule metafield sync ──────────────────────────────

const DUTCH_RUSK_SHOP = "dutchrusk.myshopify.com";
const DR_PAYMENT_TAGS = ["dr-payment:weekly", "dr-payment:fortnightly", "dr-payment:monthly"];

const SET_DR_PAYMENT_SCHEDULE = `
  mutation SetDRPaymentSchedule($metafields: [MetafieldsSetInput!]!) {
    metafieldsSet(metafields: $metafields) {
      userErrors { field message }
    }
  }
`;

// ─── Router ─────────────────────────────────────────────────────────────────

export async function action({ request }) {
  const { topic, payload, admin, shop } = await authenticate.webhook(request);

  if (topic === "CUSTOMERS_UPDATE" || topic === "CUSTOMERS_CREATE") {
    return handleCustomerWebhook(admin, payload, shop);
  }

  if (topic === "ORDERS_CREATE") {
    return handleOrderCreate(admin, payload);
  }

  if (topic === "THEMES_PUBLISH") {
    if (shop !== "dutchrusk.myshopify.com") return new Response("Not Dutch Rusk, skipping", { status: 200 });
    const themeId = payload?.id;
    if (!themeId) return new Response("No theme id in payload", { status: 200 });
    try {
      const sessions = await sessionStorage.findSessionsByShop(shop);
      const session = sessions.find((s) => s.accessToken);
      if (!session) return new Response("No session", { status: 200 });
      await fetch(`https://${shop}/admin/api/2025-07/themes/${themeId}/assets.json`, {
        method: "PUT",
        headers: { "X-Shopify-Access-Token": session.accessToken, "Content-Type": "application/json" },
        body: JSON.stringify({ asset: { key: SHIPPING_BAR_SNIPPET_KEY, value: SHIPPING_BAR_SNIPPET } }),
      });
      console.log(`[themes/publish] Snippet pushed to theme ${themeId} on ${shop}`);
    } catch (e) {
      console.error("[themes/publish] Push failed:", e);
    }
    return new Response("OK", { status: 200 });
  }

  return new Response("Not handled", { status: 200 });
}

// ─── Customer handler ─────────────────────────────────────────────────────────

async function handleCustomerWebhook(admin, payload, shop) {
  if (!admin) return new Response("No admin context", { status: 200 });

  const customerId = payload?.id;
  if (!customerId) return new Response("No customer id", { status: 200 });

  let currentTags;
  let currentGroups;
  try {
    const res = await admin.graphql(GET_CUSTOMER_TAGS_AND_GROUPS, {
      variables: { id: `gid://shopify/Customer/${customerId}` },
    });
    const { data } = await res.json();
    const customer = data?.customer;
    if (!customer) return new Response("Customer not found", { status: 200 });

    currentTags = customer.tags ?? [];
    currentGroups = customer.metafield?.jsonValue;
  } catch {
    return new Response("Read failed, skipping to avoid storm", { status: 200 });
  }

  // Read-before-write guard: skip if metafield already matches live tags.
  if (Array.isArray(currentGroups)) {
    const sortedStored = [...currentGroups].sort().join(",");
    const sortedLive = [...currentTags].sort().join(",");
    if (sortedStored === sortedLive) {
      return new Response("No change", { status: 200 });
    }
  }

  await syncSingleCustomer(admin, customerId, currentTags);

  // Dutch Rusk: mirror the dr-payment:* tag into an app-owned metafield so
  // the checkout extension can read it (Storefront API doesn't expose tags).
  if (shop === DUTCH_RUSK_SHOP) {
    const scheduleTag = currentTags.find((t) => DR_PAYMENT_TAGS.includes(t));
    const schedule = scheduleTag ? scheduleTag.replace("dr-payment:", "") : "";
    admin.graphql(SET_DR_PAYMENT_SCHEDULE, {
      variables: {
        metafields: [{
          ownerId: `gid://shopify/Customer/${customerId}`,
          namespace: "$app:dutch-rusk-checkout",
          key: "payment_schedule",
          type: "single_line_text_field",
          value: schedule,
        }],
      },
    }).catch((e) => console.error("[DR] payment_schedule metafield write failed:", e));
  }

  return new Response("OK", { status: 200 });
}

// ─── Order handler ───────────────────────────────────────────────────────────

async function handleOrderCreate(admin, payload) {
  if (!admin) return new Response("No admin context", { status: 200 });

  const orderId = `gid://shopify/Order/${payload?.id}`;
  if (!payload?.id) return new Response("No order id", { status: 200 });

  // Query the order to confirm it belongs to a B2B purchasing company.
  let order;
  try {
    const res = await admin.graphql(GET_ORDER_PURCHASING_ENTITY, {
      variables: { id: orderId },
    });
    const { data } = await res.json();
    order = data?.order;
  } catch {
    return new Response("Order query failed", { status: 200 });
  }

  if (!order) return new Response("Order not found", { status: 200 });

  const isB2B = order.purchasingEntity?.__typename === "PurchasingCompany";
  if (!isB2B) return new Response("Not B2B, skipping", { status: 200 });

  // Calculate 20th of the calendar month following the order date.
  const createdAt = new Date(order.createdAt);
  const isDecember = createdAt.getMonth() === 11;
  const dueYear = isDecember ? createdAt.getFullYear() + 1 : createdAt.getFullYear();
  const dueMonth = isDecember ? 0 : createdAt.getMonth() + 1;
  const dueDateStr = `${dueYear}-${String(dueMonth + 1).padStart(2, "0")}-20`;

  // Fetch payment terms templates and find the FIXED type.
  let fixedTemplate;
  try {
    const res = await admin.graphql(GET_PAYMENT_TERMS_TEMPLATES);
    const { data } = await res.json();
    const templates = data?.paymentTermsTemplates ?? [];
    fixedTemplate = templates.find((t) => t.paymentTermsType === "FIXED");
  } catch {
    return new Response("Templates query failed", { status: 200 });
  }

  if (!fixedTemplate) {
    console.error("[orders/create] No FIXED payment terms template found for shop");
    return new Response("No FIXED template", { status: 200 });
  }

  // Set the payment terms on the order.
  try {
    const res = await admin.graphql(SET_ORDER_PAYMENT_TERMS, {
      variables: {
        orderId,
        input: {
          paymentTermsTemplateId: fixedTemplate.id,
          paymentSchedules: [{ dueAt: dueDateStr }],
        },
      },
    });
    const { data } = await res.json();
    const errors = data?.orderPaymentTermsSet?.userErrors ?? [];
    if (errors.length > 0) {
      console.error("[orders/create] orderPaymentTermsSet errors:", errors);
    }
  } catch {
    return new Response("Set payment terms failed", { status: 200 });
  }

  // Non-blocking: refresh dueAt across all payment customisation metafields
  // so the checkout function always shows the correct 20th-of-next-month date.
  // This acts as an automatic "cron" — every B2B order keeps the date current.
  refreshPaymentCustomizationDueDates(admin).catch((e) =>
    console.error("[orders/create] dueAt refresh failed:", e)
  );

  return new Response("OK", { status: 200 });
}
