import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";

const GET_CUSTOMER_TAGS = `#graphql
  query GetCustomerTags($id: ID!) {
    customer(id: $id) {
      tags
    }
  }
`;

/**
 * GET /api/overdue-check?customerId=<gid>
 *
 * Called by the B2B Payment Due Date checkout UI extension to check whether
 * the current customer is tagged "overdue". The request must include a valid
 * Shopify checkout session token in the Authorization header so the server can
 * verify it's a genuine checkout extension request and get an Admin API client
 * for the correct shop.
 *
 * Returns: { overdue: boolean }
 */
export async function loader({ request }) {
  // Validate the checkout extension session token.
  // authenticate.public.checkout verifies the JWT and returns an Admin API client
  // scoped to the shop that initiated the checkout.
  let admin;
  try {
    const result = await authenticate.public.checkout(request);
    admin = result.admin;
  } catch {
    // Invalid or missing token — return false rather than an error so the
    // extension degrades gracefully (keeps showing the due date banner).
    return json({ overdue: false });
  }

  const url = new URL(request.url);
  const customerId = url.searchParams.get("customerId");
  if (!customerId) return json({ overdue: false });

  try {
    const res = await admin.graphql(GET_CUSTOMER_TAGS, {
      variables: { id: customerId },
    });
    const { data } = await res.json();
    const tags = data?.customer?.tags ?? [];
    return json({ overdue: tags.includes("overdue") });
  } catch {
    return json({ overdue: false });
  }
}
