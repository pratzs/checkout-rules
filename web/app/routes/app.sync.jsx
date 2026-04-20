import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";

const CUSTOMERS_QUERY = `
  query GetCustomers($query: String!, $after: String) {
    customers(first: 250, after: $after, query: $query) {
      nodes {
        id
        tags
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

const SET_METAFIELDS = `
  mutation SetMetafields($metafields: [MetafieldsSetInput!]!) {
    metafieldsSet(metafields: $metafields) {
      metafields { id }
      userErrors { field message }
    }
  }
`;

async function fetchAllCustomers(admin, tagQuery) {
  const customers = [];
  let cursor = null;
  let hasNextPage = true;

  while (hasNextPage) {
    const res = await admin.graphql(CUSTOMERS_QUERY, {
      variables: { query: tagQuery, after: cursor },
    });
    const { data } = await res.json();
    const page = data?.customers;
    if (!page) break;
    customers.push(...page.nodes);
    hasNextPage = page.pageInfo.hasNextPage;
    cursor = page.pageInfo.endCursor;
  }

  return customers;
}

export async function action({ request }) {
  const { admin } = await authenticate.admin(request);
  const body = await request.json();
  const { allRuleTags } = body;

  if (!Array.isArray(allRuleTags) || allRuleTags.length === 0) {
    return json({ synced: 0 });
  }

  // Build Shopify customer search query: tag:caltex OR tag:mobil ...
  const tagQuery = allRuleTags.map((t) => `tag:${t}`).join(" OR ");

  const customers = await fetchAllCustomers(admin, tagQuery);

  if (customers.length === 0) {
    return json({ synced: 0 });
  }

  // For each customer, compute their group memberships from their Shopify tags
  const metafieldsInput = customers.map((customer) => ({
    ownerId: customer.id,
    namespace: "$app:checkout-rules",
    key: "groups",
    type: "json",
    value: JSON.stringify(
      customer.tags.filter((tag) => allRuleTags.includes(tag))
    ),
  }));

  // Shopify metafieldsSet supports up to 25 at a time
  const CHUNK_SIZE = 25;
  let totalSynced = 0;
  for (let i = 0; i < metafieldsInput.length; i += CHUNK_SIZE) {
    const chunk = metafieldsInput.slice(i, i + CHUNK_SIZE);
    await admin.graphql(SET_METAFIELDS, { variables: { metafields: chunk } });
    totalSynced += chunk.length;
  }

  return json({ synced: totalSynced });
}
