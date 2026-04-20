import { authenticate } from "../shopify.server";
import { syncSingleCustomer } from "../utils/sync.server";

// Read the customer's current groups metafield so we can skip the write
// if nothing changed — this breaks the webhook→metafield→webhook feedback loop.
const GET_CUSTOMER_GROUPS = `
  query GetCustomerGroups($id: ID!) {
    customer(id: $id) {
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
  // Shopify sends tags as a comma-separated string in webhook payload
  const rawTags = payload?.tags ?? "";
  const customerTags = typeof rawTags === "string"
    ? rawTags.split(",").map((t) => t.trim()).filter(Boolean)
    : Array.isArray(rawTags) ? rawTags : [];
  if (!customerId) return new Response("No customer id", { status: 200 });

  // Read-before-write: if the groups metafield already contains exactly
  // these tags, skip the write entirely. This stops the feedback loop where
  // writing the metafield triggers another customers/update webhook.
  try {
    const res = await admin.graphql(GET_CUSTOMER_GROUPS, {
      variables: { id: `gid://shopify/Customer/${customerId}` },
    });
    const { data } = await res.json();
    const currentGroups = data?.customer?.metafield?.jsonValue;
    if (Array.isArray(currentGroups)) {
      const sortedCurrent = [...currentGroups].sort().join(",");
      const sortedNew = [...customerTags].sort().join(",");
      if (sortedCurrent === sortedNew) {
        return new Response("No change", { status: 200 });
      }
    }
  } catch {
    // If the read fails, proceed with the write anyway
  }

  // Tags changed — update the groups metafield
  await syncSingleCustomer(admin, customerId, customerTags);

  return new Response("OK", { status: 200 });
}
