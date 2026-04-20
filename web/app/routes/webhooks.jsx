import { authenticate } from "../shopify.server";
import { syncSingleCustomer } from "../utils/sync.server";

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

  // Write all customer tags directly — function computes intersection at checkout
  await syncSingleCustomer(admin, customerId, customerTags);

  return new Response("OK", { status: 200 });
}
