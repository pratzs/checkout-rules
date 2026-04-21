import { json } from "@remix-run/node";
import { useLoaderData, useFetcher } from "@remix-run/react";
import {
  Page, Card, Text, BlockStack, Badge, Box, Divider, InlineStack,
  TextField, Button, Banner,
} from "@shopify/polaris";
import { useState } from "react";
import { authenticate } from "../shopify.server";
import { syncSingleCustomer } from "../utils/sync.server";

const FUNCTIONS_QUERY = `
  query Diagnose {
    shopifyFunctions(first: 25) {
      nodes { id title apiType }
    }
    paymentCustomizations(first: 25) {
      nodes {
        id title enabled functionId
        metafield(namespace: "$app:b2b-payment-rules", key: "function-configuration") {
          value jsonValue
        }
      }
    }
  }
`;

const CUSTOMER_LOOKUP = `
  query LookupCustomer($email: String!) {
    customers(first: 1, query: $email) {
      nodes {
        id
        email
        tags
        groupsMetafield: metafield(namespace: "$app:checkout-rules", key: "groups") {
          id value jsonValue
        }
      }
    }
  }
`;

const CLEAR_METAFIELD = `
  mutation ClearGroups($metafields: [MetafieldsSetInput!]!) {
    metafieldsSet(metafields: $metafields) {
      metafields { id }
      userErrors { field message }
    }
  }
`;

export async function loader({ request }) {
  const { admin } = await authenticate.admin(request);
  const res = await admin.graphql(FUNCTIONS_QUERY);
  const { data } = await res.json();
  return json({ data });
}

export async function action({ request }) {
  const { admin } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "lookup") {
    const email = formData.get("email");
    const res = await admin.graphql(CUSTOMER_LOOKUP, {
      variables: { email: `email:"${email}"` },
    });
    const { data } = await res.json();
    const customer = data?.customers?.nodes?.[0] ?? null;
    return json({ intent: "lookup", customer });
  }

  if (intent === "clear") {
    const customerId = formData.get("customerId");
    await admin.graphql(CLEAR_METAFIELD, {
      variables: {
        metafields: [{
          ownerId: customerId,
          namespace: "$app:checkout-rules",
          key: "groups",
          type: "json",
          value: "[]",
        }],
      },
    });
    return json({ intent: "clear", ok: true });
  }

  if (intent === "sync") {
    // Write all of the customer's current Shopify tags to the groups metafield.
    // The function computes the intersection with rule tags at checkout — no pre-filtering needed.
    const customerId = formData.get("customerId");
    const rawTags = formData.get("customerTags"); // comma-separated from hidden input
    const customerTags = rawTags ? rawTags.split(",").map((t) => t.trim()).filter(Boolean) : [];
    const errors = await syncSingleCustomer(admin, customerId.replace("gid://shopify/Customer/", ""), customerTags);
    if (errors.length > 0) {
      return json({ intent: "syncError", errors, customerId });
    }
    return json({ intent: "synced", customerId, synced: true, writtenTags: customerTags });
  }

  return json({ ok: false });
}

export default function Debug() {
  const { data } = useLoaderData();
  const fetcher = useFetcher();
  const [email, setEmail] = useState("pratham@worthy.nz");

  const functions = data?.shopifyFunctions?.nodes ?? [];
  const customizations = data?.paymentCustomizations?.nodes ?? [];
  const paymentFnIds = new Set(
    functions.filter((f) => f.apiType === "payment_customization").map((f) => f.id)
  );

  const lookupResult = fetcher.data?.intent === "lookup" ? fetcher.data.customer : undefined;
  const cleared = fetcher.data?.intent === "clear";
  const synced = fetcher.data?.intent === "synced";
  const syncError = fetcher.data?.intent === "syncError" ? fetcher.data.errors : null;

  // True stale = metafield exists but its contents don't match the customer's current tags
  const isOutOfSync = lookupResult?.groupsMetafield
    ? (() => {
        const current = lookupResult.groupsMetafield.jsonValue;
        if (!Array.isArray(current)) return true;
        const a = [...current].sort().join(",");
        const b = [...lookupResult.tags].sort().join(",");
        return a !== b;
      })()
    : false;

  return (
    <Page title="Debug — Function &amp; Customer State">
      <BlockStack gap="400">

        {/* ── Customer metafield lookup ── */}
        <Card>
          <BlockStack gap="300">
            <Text variant="headingMd">Customer groups metafield lookup</Text>
            <Text variant="bodySm" tone="subdued">
              This shows what the Shopify Function reads for a specific customer at checkout.
              If "Groups metafield" contains corporate tags, the B2C rule will NOT apply to them.
            </Text>
            <InlineStack gap="200" blockAlign="end">
              <div style={{ flex: 1 }}>
                <TextField
                  label="Customer email"
                  value={email}
                  onChange={setEmail}
                  autoComplete="off"
                />
              </div>
              <fetcher.Form method="post">
                <input type="hidden" name="intent" value="lookup" />
                <input type="hidden" name="email" value={email} />
                <Button submit loading={fetcher.state !== "idle"}>Look up</Button>
              </fetcher.Form>
            </InlineStack>

            {cleared && (
              <Banner tone="success">Groups metafield cleared — customer now treated as B2C. Re-test checkout.</Banner>
            )}

            {synced && (
              <Banner tone="success">
                Groups metafield updated to: [{(fetcher.data?.writtenTags ?? []).join(", ")}].
                Click Look up to verify, then re-test checkout.
              </Banner>
            )}

            {syncError && (
              <Banner tone="critical" title="Metafield write failed">
                {syncError.map((e, i) => <p key={i}>{e.field}: {e.message}</p>)}
              </Banner>
            )}

            {lookupResult === null && (
              <Banner tone="warning">No customer found with that email.</Banner>
            )}

            {lookupResult && (
              <Box padding="300" background="bg-surface-secondary" borderRadius="200">
                <BlockStack gap="200">
                  <InlineStack gap="200">
                    <Text fontWeight="bold">{lookupResult.email}</Text>
                    <Text variant="bodySm" tone="subdued">{lookupResult.id}</Text>
                  </InlineStack>

                  <Text variant="bodySm">
                    Shopify tags: {lookupResult.tags.length > 0 ? lookupResult.tags.join(", ") : <em>none</em>}
                  </Text>

                  <Divider />

                  {lookupResult.groupsMetafield ? (
                    <BlockStack gap="100">
                      <InlineStack gap="100" blockAlign="center">
                        <Text variant="bodySm" fontWeight="semibold">Groups metafield:</Text>
                        <Badge tone={isOutOfSync ? "warning" : "success"}>
                          {isOutOfSync ? "Out of sync — click Sync" : "In sync ✓"}
                        </Badge>
                      </InlineStack>
                      <Text variant="bodySm" tone="subdued">
                        Stored: [{Array.isArray(lookupResult.groupsMetafield.jsonValue)
                          ? lookupResult.groupsMetafield.jsonValue.join(", ")
                          : lookupResult.groupsMetafield.value}]
                      </Text>
                      {isOutOfSync && (
                        <Text variant="bodySm" tone="caution">
                          Metafield doesn't match current Shopify tags — function may apply wrong rules at checkout.
                        </Text>
                      )}
                      <fetcher.Form method="post">
                        <input type="hidden" name="intent" value="sync" />
                        <input type="hidden" name="customerId" value={lookupResult.id} />
                        <input type="hidden" name="customerTags" value={lookupResult.tags.join(",")} />
                        <Button tone={isOutOfSync ? "critical" : "plain"} submit loading={fetcher.state !== "idle"}>
                          {isOutOfSync ? "Sync now → fix mismatch" : "Re-sync (force refresh)"}
                        </Button>
                      </fetcher.Form>
                    </BlockStack>
                  ) : (
                    <BlockStack gap="100">
                      <InlineStack gap="100" blockAlign="center">
                        <Text variant="bodySm" fontWeight="semibold">Groups metafield:</Text>
                        <Badge tone="attention">Not set yet</Badge>
                      </InlineStack>
                      <Text variant="bodySm" tone="subdued">
                        No metafield stored. The function will treat this customer as B2C (no corporate groups).
                        Click Sync to write their current tags.
                      </Text>
                      <fetcher.Form method="post">
                        <input type="hidden" name="intent" value="sync" />
                        <input type="hidden" name="customerId" value={lookupResult.id} />
                        <input type="hidden" name="customerTags" value={lookupResult.tags.join(",")} />
                        <Button tone="success" submit loading={fetcher.state !== "idle"}>
                          Sync metafield → current tags
                        </Button>
                      </fetcher.Form>
                    </BlockStack>
                  )}
                </BlockStack>
              </Box>
            )}
          </BlockStack>
        </Card>

        {/* ── Deployed functions ── */}
        <Card>
          <BlockStack gap="300">
            <Text variant="headingMd">Deployed Shopify Functions</Text>
            {functions.map((f) => (
              <Box key={f.id} padding="300" background="bg-surface-secondary" borderRadius="200">
                <BlockStack gap="100">
                  <InlineStack gap="200">
                    <Text fontWeight="bold">{f.title}</Text>
                    <Badge tone={f.apiType === "payment_customization" ? "success" : "info"}>{f.apiType}</Badge>
                  </InlineStack>
                  <Text variant="bodySm" tone="subdued">{f.id}</Text>
                </BlockStack>
              </Box>
            ))}
          </BlockStack>
        </Card>

        {/* ── Payment customizations ── */}
        <Card>
          <BlockStack gap="300">
            <Text variant="headingMd">All Payment Customizations</Text>
            {customizations.map((c) => {
              const fnMatch = paymentFnIds.has(c.functionId);
              const cfg = c.metafield?.jsonValue;
              const hiddenMethods = (cfg?.paymentMethods ?? [])
                .filter((m) => m.visible === false)
                .map((m) => m.title);

              return (
                <Box key={c.id} padding="300" borderRadius="200"
                  background={c.enabled ? "bg-surface" : "bg-surface-secondary"}>
                  <BlockStack gap="200">
                    <InlineStack gap="200" blockAlign="center">
                      <Text fontWeight="bold">{c.title}</Text>
                      <Badge tone={c.enabled ? "success" : "critical"}>
                        {c.enabled ? "Enabled" : "DISABLED"}
                      </Badge>
                      {cfg?.negate && <Badge tone="warning">negate=true (B2C)</Badge>}
                    </InlineStack>
                    <Text variant="bodySm" tone={fnMatch ? "success" : "critical"}>
                      Function: {c.functionId} {fnMatch ? "✓" : "✗ MISMATCH"}
                    </Text>
                    <Text variant="bodySm">
                      Hidden: {hiddenMethods.length > 0 ? hiddenMethods.join(", ") : "none"}
                    </Text>
                    <Text variant="bodySm">
                      Tags: [{(cfg?.tags ?? []).join(", ")}] | logic: {cfg?.conditionLogic} | negate: {String(cfg?.negate)}
                    </Text>
                  </BlockStack>
                </Box>
              );
            })}
          </BlockStack>
        </Card>

      </BlockStack>
    </Page>
  );
}
