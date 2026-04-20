import { authenticate } from "../shopify.server";

// Fetch all rule tags currently configured across all active customizations
const GET_ALL_RULE_TAGS = `
  query GetAllRuleTags {
    paymentCustomizations(first: 50) {
      nodes {
        metafield(namespace: "$app:b2b-payment-rules", key: "function-configuration") {
          jsonValue
        }
      }
    }
    deliveryCustomizations(first: 50) {
      nodes {
        metafield(namespace: "$app:b2b-delivery-rules", key: "function-configuration") {
          jsonValue
        }
      }
    }
  }
`;

const SET_GROUPS = `
  mutation SetGroups($metafields: [MetafieldsSetInput!]!) {
    metafieldsSet(metafields: $metafields) {
      metafields { id }
      userErrors { field message }
    }
  }
`;

export async function action({ request }) {
  const { topic, payload, admin } = await authenticate.webhook(request);

  // Only handle customer updates
  if (topic !== "CUSTOMERS_UPDATE") {
    return new Response("Not handled", { status: 200 });
  }

  // admin is available for non-GDPR webhooks
  if (!admin) {
    return new Response("No admin context", { status: 200 });
  }

  const customerTags = payload?.tags ?? [];
  const customerId = payload?.id;
  if (!customerId) return new Response("No customer id", { status: 200 });

  const customerGid = `gid://shopify/Customer/${customerId}`;

  // Get every rule tag that any active rule uses
  const rulesRes = await admin.graphql(GET_ALL_RULE_TAGS);
  const { data } = await rulesRes.json();

  const allRuleTags = new Set();
  for (const node of data?.paymentCustomizations?.nodes ?? []) {
    for (const tag of node.metafield?.jsonValue?.tags ?? []) {
      allRuleTags.add(tag);
    }
  }
  for (const node of data?.deliveryCustomizations?.nodes ?? []) {
    for (const tag of node.metafield?.jsonValue?.tags ?? []) {
      allRuleTags.add(tag);
    }
  }

  // Which of this customer's current tags are rule tags?
  // If none → groups = [] → B2C rule applies (Monthly Account Payment hidden)
  // If some → groups = [...] → B2B/corporate rules apply
  const matchingTags = customerTags.filter((t) => allRuleTags.has(t));

  await admin.graphql(SET_GROUPS, {
    variables: {
      metafields: [
        {
          ownerId: customerGid,
          namespace: "$app:checkout-rules",
          key: "groups",
          type: "json",
          value: JSON.stringify(matchingTags),
        },
      ],
    },
  });

  return new Response("OK", { status: 200 });
}
