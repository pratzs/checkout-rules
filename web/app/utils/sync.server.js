/**
 * Shared sync utility — updates the $app:checkout-rules / groups metafield
 * for a batch of customers based on the current rule tags.
 *
 * Used by:
 *  - webhooks.jsx   (real-time, single customer)
 *  - app.sync.jsx   (manual bulk sync)
 *  - app.rules.$id.jsx (auto-sync after rule save)
 */

// Fetch customers with their current groups metafield so we can skip writes
// for customers whose value already matches — avoids triggering unnecessary webhooks.
const CUSTOMERS_QUERY = `
  query GetCustomers($query: String!, $after: String) {
    customers(first: 250, after: $after, query: $query) {
      nodes {
        id
        tags
        groupsMeta: metafield(namespace: "$app:checkout-rules", key: "groups") {
          jsonValue
        }
      }
      pageInfo { hasNextPage endCursor }
    }
  }
`;

const CUSTOMERS_WITH_METAFIELD_QUERY = `
  query GetCustomersWithMetafield($after: String) {
    customers(first: 250, after: $after, query: "metafield:$app:checkout-rules.groups") {
      nodes {
        id
        tags
        groupsMeta: metafield(namespace: "$app:checkout-rules", key: "groups") {
          jsonValue
        }
      }
      pageInfo { hasNextPage endCursor }
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
  const results = [];
  let cursor = null;
  let hasNextPage = true;
  while (hasNextPage) {
    const res = await admin.graphql(query, { variables: { ...variables, after: cursor } });
    const { data } = await res.json();
    const page = data?.customers;
    if (!page) break;
    results.push(...page.nodes);
    hasNextPage = page.pageInfo.hasNextPage;
    cursor = page.pageInfo.endCursor;
  }
  return results;
}

/**
 * Sync a single customer's groups metafield immediately.
 * Writes ALL the customer's current Shopify tags — the function computes
 * the intersection with rule tags at checkout time, so no pre-filtering needed.
 * Called from the customers/create and customers/update webhooks.
 */
export async function syncSingleCustomer(admin, customerId, customerTags) {
  await admin.graphql(SET_METAFIELDS, {
    variables: {
      metafields: [{
        ownerId: `gid://shopify/Customer/${customerId}`,
        namespace: "$app:checkout-rules",
        key: "groups",
        type: "json",
        value: JSON.stringify(customerTags),
      }],
    },
  });
}

/**
 * Bulk sync all customers who currently have any of the given rule tags,
 * plus clear stale metafields for customers who no longer have any rule tags.
 * Called from the manual sync button and automatically after a rule is saved.
 */
export async function bulkSync(admin, allRuleTags) {
  if (!allRuleTags || allRuleTags.length === 0) return { synced: 0, cleared: 0 };

  const ruleTagSet = new Set(allRuleTags);
  const tagQuery = allRuleTags.map((t) => `tag:"${t}"`).join(" OR ");

  // Customers who currently have rule tags → update their groups
  const withTags = await fetchAllPages(admin, CUSTOMERS_QUERY, { query: tagQuery });
  const withTagIds = new Set(withTags.map((c) => c.id));

  // Customers who have the metafield but may no longer have rule tags → clear stale data
  let withMetafield = [];
  try {
    withMetafield = await fetchAllPages(admin, CUSTOMERS_WITH_METAFIELD_QUERY);
  } catch { /* metafield search not supported — skip */ }

  const stale = withMetafield.filter(
    (c) => !withTagIds.has(c.id) && !c.tags.some((t) => ruleTagSet.has(t))
  );

  const base = { namespace: "$app:checkout-rules", key: "groups", type: "json" };

  // Only write customers whose metafield doesn't already match their current tags.
  // Skipping unchanged customers avoids triggering unnecessary customers/update
  // webhooks, which was causing the server-flooding storm.
  function tagsKey(arr) {
    return [...arr].sort().join(",");
  }

  const updates = withTags
    .filter((c) => {
      const current = c.groupsMeta?.jsonValue;
      if (!Array.isArray(current)) return true; // no metafield yet → must write
      return tagsKey(current) !== tagsKey(c.tags);
    })
    .map((c) => ({ ...base, ownerId: c.id, value: JSON.stringify(c.tags) }));

  const clears = stale
    .filter((c) => {
      const current = c.groupsMeta?.jsonValue;
      if (!Array.isArray(current) || current.length === 0) return false; // already empty
      return true;
    })
    .map((c) => ({ ...base, ownerId: c.id, value: "[]" }));

  const all = [...updates, ...clears];
  if (all.length === 0) return { synced: 0, cleared: 0 };

  const CHUNK = 25;
  let synced = 0;
  let cleared = 0;
  for (let i = 0; i < all.length; i += CHUNK) {
    const chunk = all.slice(i, i + CHUNK);
    await admin.graphql(SET_METAFIELDS, { variables: { metafields: chunk } });
    synced += chunk.filter((m) => updates.some((u) => u.ownerId === m.ownerId)).length;
    cleared += chunk.filter((m) => clears.some((cl) => cl.ownerId === m.ownerId)).length;
    // Small pause between chunks to avoid a simultaneous burst of webhooks
    if (i + CHUNK < all.length) {
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
  }

  return { synced, cleared };
}

/**
 * Fetch all rule tags from every active payment and delivery customization.
 */
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

export async function getAllRuleTags(admin) {
  const res = await admin.graphql(GET_ALL_RULE_TAGS);
  const { data } = await res.json();
  const tags = new Set();
  for (const node of data?.paymentCustomizations?.nodes ?? []) {
    for (const t of node.metafield?.jsonValue?.tags ?? []) tags.add(t);
  }
  for (const node of data?.deliveryCustomizations?.nodes ?? []) {
    for (const t of node.metafield?.jsonValue?.tags ?? []) tags.add(t);
  }
  return [...tags];
}
