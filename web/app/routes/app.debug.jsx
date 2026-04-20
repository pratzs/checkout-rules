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

export default function Debug() {
  const { data, errors } = useLoaderData();

  if (errors) {
    return (
      <Page title="Debug">
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
    <Page title="Debug — Function &amp; PaymentCustomization State">
      <BlockStack gap="400">

        {/* Deployed functions */}
        <Card>
          <BlockStack gap="300">
            <Text variant="headingMd">Deployed Shopify Functions</Text>
            {functions.length === 0 && (
              <Text tone="critical">⚠️ No functions found — app may not be deployed</Text>
            )}
            {functions.map((f) => (
              <Box key={f.id} padding="300" background="bg-surface-secondary" borderRadius="200">
                <BlockStack gap="100">
                  <InlineStack gap="200">
                    <Text fontWeight="bold">{f.title}</Text>
                    <Badge tone={f.apiType === "payment_customization" ? "success" : "info"}>
                      {f.apiType}
                    </Badge>
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
            <Text variant="headingMd">All Payment Customizations</Text>
            {customizations.length === 0 && (
              <Text tone="critical">⚠️ No payment customizations found</Text>
            )}
            {customizations.map((c) => {
              const fnMatch = paymentFnIds.has(c.functionId);
              const metaOk = c.metafield !== null;
              const cfg = metaOk ? c.metafield.jsonValue : null;
              const hiddenMethods = (cfg?.paymentMethods ?? [])
                .filter((m) => m.visible === false)
                .map((m) => m.title);

              return (
                <Box
                  key={c.id}
                  padding="300"
                  borderRadius="200"
                  background={c.enabled ? "bg-surface" : "bg-surface-secondary"}
                >
                  <BlockStack gap="200">
                    {/* Header */}
                    <InlineStack gap="200" blockAlign="center">
                      <Text fontWeight="bold">{c.title}</Text>
                      <Badge tone={c.enabled ? "success" : "critical"}>
                        {c.enabled ? "Enabled" : "DISABLED ← fix this"}
                      </Badge>
                      {metaOk && cfg?.mode && (
                        <Badge tone={cfg.mode === "tags" ? "info" : "attention"}>
                          {cfg.mode}
                        </Badge>
                      )}
                      {metaOk && cfg?.negate && (
                        <Badge tone="warning">negate=true (B2C)</Badge>
                      )}
                    </InlineStack>

                    {/* IDs */}
                    <BlockStack gap="050">
                      <Text variant="bodySm" tone="subdued">Customization ID: {c.id}</Text>
                      <Text
                        variant="bodySm"
                        tone={fnMatch ? "success" : "critical"}
                      >
                        Function ID: {c.functionId}
                        {fnMatch ? " ✓ matches deployed function" : " ✗ MISMATCH — wrong function linked!"}
                      </Text>
                    </BlockStack>

                    <Divider />

                    {/* Metafield */}
                    <BlockStack gap="100">
                      <InlineStack gap="100">
                        <Text variant="bodySm" fontWeight="semibold">Config metafield:</Text>
                        <Badge tone={metaOk ? "success" : "critical"}>
                          {metaOk ? "Present" : "MISSING ← function gets null config"}
                        </Badge>
                      </InlineStack>

                      {metaOk ? (
                        <BlockStack gap="100">
                          <Text variant="bodySm">
                            Tags: [{(cfg?.tags ?? []).join(", ")}] |{" "}
                            logic: {cfg?.conditionLogic} |{" "}
                            negate: {String(cfg?.negate)}
                          </Text>
                          <Text variant="bodySm">
                            Hidden methods:{" "}
                            {hiddenMethods.length > 0
                              ? hiddenMethods.join(", ")
                              : <span style={{ color: "red" }}>NONE hidden — check rule config!</span>
                            }
                          </Text>
                          <Box
                            padding="200"
                            background="bg-surface-secondary"
                            borderRadius="100"
                          >
                            <pre
                              style={{
                                margin: 0,
                                whiteSpace: "pre-wrap",
                                wordBreak: "break-all",
                                fontSize: "11px",
                                fontFamily: "monospace",
                              }}
                            >
                              {JSON.stringify(cfg, null, 2)}
                            </pre>
                          </Box>
                        </BlockStack>
                      ) : (
                        <Text tone="critical" variant="bodySm">
                          No metafield found. The function receives null config and falls back to
                          Companies mode — it will NOT hide Monthly Account Payment for B2C.
                          Open this rule in the app and Save it again.
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
