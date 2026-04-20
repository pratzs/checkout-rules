import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { Page, Card, Text, BlockStack, Badge, Box, Divider, InlineStack } from "@shopify/polaris";
import { authenticate } from "../shopify.server";

const QUERY = `
  query Diagnose {
    shopifyFunctions(first: 25) {
      nodes { id title apiType }
    }
    paymentCustomizations(first: 25) {
      nodes {
        id
        title
        enabled
        functionId
        metafield(namespace: "$app:b2b-payment-rules", key: "function-configuration") {
          id
          namespace
          key
          value
          jsonValue
        }
      }
    }
  }
`;

export async function loader({ request }) {
  const { admin } = await authenticate.admin(request);
  const res = await admin.graphql(QUERY);
  const { data, errors } = await res.json();
  return json({ data, errors });
}

export default function Diagnose() {
  const { data, errors } = useLoaderData();

  if (errors) {
    return (
      <Page title="Diagnose">
        <Card><Text tone="critical">GraphQL error: {JSON.stringify(errors)}</Text></Card>
      </Page>
    );
  }

  const functions = data?.shopifyFunctions?.nodes ?? [];
  const customizations = data?.paymentCustomizations?.nodes ?? [];

  const paymentFnIds = new Set(
    functions.filter((f) => f.apiType === "payment_customization").map((f) => f.id)
  );

  return (
    <Page title="Payment Function Diagnostics">
      <BlockStack gap="400">

        {/* Deployed functions */}
        <Card>
          <BlockStack gap="300">
            <Text variant="headingMd">Deployed Shopify Functions</Text>
            {functions.length === 0 && <Text tone="critical">⚠️ NO functions found — deploy may have failed</Text>}
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

        {/* Payment customizations */}
        <Card>
          <BlockStack gap="300">
            <Text variant="headingMd">Payment Customizations (ALL)</Text>
            {customizations.length === 0 && <Text tone="critical">⚠️ NO payment customizations found</Text>}
            {customizations.map((c) => {
              const fnMatch = paymentFnIds.has(c.functionId);
              const metaOk = c.metafield !== null;
              let configOk = false;
              let configNote = "";
              if (metaOk) {
                const cfg = c.metafield.jsonValue;
                configOk = cfg && cfg.mode === "tags" && Array.isArray(cfg.tags) && cfg.tags.length > 0;
                configNote = cfg ? `mode=${cfg.mode}, negate=${cfg.negate}, tags=[${(cfg.tags ?? []).join(", ")}], hidden=${(cfg.paymentMethods ?? []).filter(m => m.visible === false).map(m => m.title).join(", ")}` : "jsonValue is null";
              }
              return (
                <Box key={c.id} padding="300" borderRadius="200" background={c.enabled ? "bg-surface" : "bg-surface-secondary"}>
                  <BlockStack gap="200">
                    <InlineStack gap="200" blockAlign="center">
                      <Text fontWeight="bold">{c.title}</Text>
                      <Badge tone={c.enabled ? "success" : "critical"}>{c.enabled ? "Enabled" : "DISABLED"}</Badge>
                    </InlineStack>

                    <BlockStack gap="050">
                      <Text variant="bodySm" tone="subdued">ID: {c.id}</Text>
                      <InlineStack gap="100">
                        <Text variant="bodySm">Function ID:</Text>
                        <Text variant="bodySm" tone={fnMatch ? "success" : "critical"}>
                          {c.functionId} {fnMatch ? "✓ matches deployed function" : "✗ NO MATCH — wrong function!"}
                        </Text>
                      </InlineStack>
                    </BlockStack>

                    <Divider />

                    <BlockStack gap="050">
                      <InlineStack gap="100">
                        <Text variant="bodySm" fontWeight="semibold">Metafield:</Text>
                        <Badge tone={metaOk ? "success" : "critical"}>{metaOk ? "Present" : "MISSING"}</Badge>
                      </InlineStack>
                      {metaOk ? (
                        <>
                          <Text variant="bodySm" tone="subdued">{configNote}</Text>
                          <Text variant="bodySm">Raw value:</Text>
                          <Box padding="200" background="bg-surface-secondary" borderRadius="100">
                            <Text variant="bodyXs" as="p">
                              <pre style={{ margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-all", fontSize: "11px" }}>
                                {JSON.stringify(c.metafield.jsonValue, null, 2)}
                              </pre>
                            </Text>
                          </Box>
                        </>
                      ) : (
                        <Text tone="critical" variant="bodySm">
                          ⚠️ No metafield — function will get null config and fall into Companies mode. Resave this rule!
                        </Text>
                      )}
                    </BlockStack>
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
