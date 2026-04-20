import { authenticate } from "../shopify.server";
import { syncSingleCustomer, getAllRuleTags } from "../utils/sync.server";

export async function action({ request }) {
  const { topic, payload, admin } = await authenticate.webhook(request);

  // Handle both customer create and update — both may involve tag changes
  if (topic !== "CUSTOMERS_UPDATE" && topic !== "CUSTOMERS_CREATE") {
    return new Response("Not handled", { status: 200 });
  }

  if (!admin) return new Response("No admin context", { status: 200 });

  const customerId = payload?.id;
  const customerTags = payload?.tags ?? [];
  if (!customerId) return new Response("No customer id", { status: 200 });

  // Get every tag currently used across all active rules
  const allRuleTags = await getAllRuleTags(admin);
  if (allRuleTags.length === 0) return new Response("No rules", { status: 200 });

  // Update this customer's groups metafield immediately
  await syncSingleCustomer(admin, customerId, customerTags, allRuleTags);

  return new Response("OK", { status: 200 });
}
