import { authenticate } from "../shopify.server";
import { syncSingleCustomer } from "../utils/sync.server";

// Fetch the customer's CURRENT tags AND their groups metafield in one call.
// We intentionally ignore the webhook payload's `tags` field because Shopify
// fires customers/update when ANY customer attribute changes — including when
// we write the metafield itself.  In that case the payload may carry an empty
// or stale tags value, causing the webhook to overwrite a just-written
// metafield back to [].  Querying live tags eliminates that race condition.
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

export async function action({ request }) {
  const { topic, payload, admin } = await authenticate.webhook(request);

  // Handle both customer create and update — both may involve tag changes
  if (topic !== "CUSTOMERS_UPDATE" && topic !== "CUSTOMERS_CREATE") {
    return new Response("Not handled", { status: 200 });
  }

  if (!admin) return new Response("No admin context", { status: 200 });

  const customerId = payload?.id;
  if (!customerId) return new Response("No customer id", { status: 200 });

  // Query the customer's LIVE tags + current metafield in one request.
  // If this call fails (e.g. rate-limited under load) we skip the write —
  // the manual Sync button or the next real tag change will catch up.
  let currentTags;
  let currentGroups;
  try {
    const res = await admin.graphql(GET_CUSTOMER_TAGS_AND_GROUPS, {
      variables: { id: `gid://shopify/Customer/${customerId}` },
    });
    const { data } = await res.json();
    const customer = data?.customer;
    if (!customer) return new Response("Customer not found", { status: 200 });

    currentTags = customer.tags ?? [];        // always an array from GraphQL
    currentGroups = customer.metafield?.jsonValue;
  } catch {
    return new Response("Read failed, skipping to avoid storm", { status: 200 });
  }

  // Read-before-write guard: skip if metafield already matches live tags.
  // This breaks the webhook → metafield-write → webhook feedback loop.
  if (Array.isArray(currentGroups)) {
    const sortedStored = [...currentGroups].sort().join(",");
    const sortedLive   = [...currentTags].sort().join(",");
    if (sortedStored === sortedLive) {
      return new Response("No change", { status: 200 });
    }
  }

  // Tags changed (or metafield missing) — update the groups metafield
  await syncSingleCustomer(admin, customerId, currentTags);

  return new Response("OK", { status: 200 });
}
