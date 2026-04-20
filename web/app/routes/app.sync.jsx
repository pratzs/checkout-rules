import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";

// Fetch customers who currently have at least one rule tag (to update their groups)
const CUSTOMERS_WITH_TAGS_QUERY = `
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

// Fetch customers who have the app groups metafield set (to clear stale ones)
const CUSTOMERS_WITH_METAFIELD_QUERY = `
  query GetCustomersWithMetafield($after: String) {
    customers(first: 250, after: $after, query: "metafield:$app:checkout-rules.groups") {
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

async function fetchAllPages(admin, query, variables = {}) {
  const customers = [];
  let cursor = null;
  let hasNextPage = true;

  while (hasNextPage) {
    const res = await admin.graphql(query, {
      variables: { ...variables, after: cursor },
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

  // ── Step 1: fetch customers who currently have rule tags ──────────────────
  const tagQuery = allRuleTags.map((t) => `tag:"${t}"`).join(" OR ");
  const customersWithTags = await fetchAllPages(admin, CUSTOMERS_WITH_TAGS_QUERY, {
    query: tagQuery,
  });

  // ── Step 2: fetch customers who have the metafield (may be stale) ─────────
  // We'll clear the metafield for any of these who no longer have rule tags.
  let customersWithMetafield = [];
  try {
    customersWithMetafield = await fetchAllPages(admin, CUSTOMERS_WITH_METAFIELD_QUERY);
  } catch {
    // metafield search may not be supported on all plans — skip silently
  }

  // Build a set of IDs that currently have tags (will be updated in step 3)
  const idsWithTags = new Set(customersWithTags.map((c) => c.id));

  // Customers who have the metafield but NO longer have any rule tag → clear them
  const staleCustomers = customersWithMetafield.filter(
    (c) => !idsWithTags.has(c.id) && !c.tags.some((t) => allRuleTags.includes(t))
  );

  // ── Step 3: build metafield payloads ─────────────────────────────────────
  const metafieldBase = {
    namespace: "$app:checkout-rules",
    key: "groups",
    type: "json",
  };

  const updates = customersWithTags.map((customer) => ({
    ...metafieldBase,
    ownerId: customer.id,
    value: JSON.stringify(customer.tags.filter((tag) => allRuleTags.includes(tag))),
  }));

  const clears = staleCustomers.map((customer) => ({
    ...metafieldBase,
    ownerId: customer.id,
    value: JSON.stringify([]),   // empty array — no corporate tags
  }));

  const all = [...updates, ...clears];

  if (all.length === 0) {
    return json({ synced: 0, cleared: 0 });
  }

  // Shopify metafieldsSet supports up to 25 at a time
  const CHUNK_SIZE = 25;
  let totalSynced = 0;
  let totalCleared = 0;

  for (let i = 0; i < all.length; i += CHUNK_SIZE) {
    const chunk = all.slice(i, i + CHUNK_SIZE);
    await admin.graphql(SET_METAFIELDS, { variables: { metafields: chunk } });
    const updateCount = chunk.filter((m) =>
      updates.some((u) => u.ownerId === m.ownerId)
    ).length;
    totalSynced += updateCount;
    totalCleared += chunk.length - updateCount;
  }

  return json({ synced: totalSynced, cleared: totalCleared });
}
