import { json } from "@remix-run/node";
import { useLoaderData, useNavigate, useSubmit, useFetcher } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  Text,
  Button,
  Badge,
  InlineStack,
  BlockStack,
  Divider,
  EmptyState,
  Tabs,
  Box,
  ResourceList,
  ResourceItem,
  Thumbnail,
  Icon,
  Banner,
} from "@shopify/polaris";
import { DeliveryIcon, PaymentIcon } from "@shopify/polaris-icons";
import { useState, useCallback } from "react";
import {
  authenticate,
  DELIVERY_METAFIELD_NS,
  PAYMENT_METAFIELD_NS,
  METAFIELD_KEY,
} from "../shopify.server";

const QUERY = `
  query GetCustomizations {
    deliveryCustomizations(first: 50) {
      nodes {
        id
        title
        enabled
        functionId
        metafield(namespace: "${DELIVERY_METAFIELD_NS}", key: "${METAFIELD_KEY}") {
          jsonValue
        }
      }
    }
    paymentCustomizations(first: 50) {
      nodes {
        id
        title
        enabled
        functionId
        metafield(namespace: "${PAYMENT_METAFIELD_NS}", key: "${METAFIELD_KEY}") {
          jsonValue
        }
      }
    }
  }
`;

const TOGGLE_DELIVERY = `
  mutation ToggleDelivery($id: ID!, $enabled: Boolean!) {
    deliveryCustomizationUpdate(id: $id, deliveryCustomization: { enabled: $enabled }) {
      userErrors { field message }
    }
  }
`;

const TOGGLE_PAYMENT = `
  mutation TogglePayment($id: ID!, $enabled: Boolean!) {
    paymentCustomizationUpdate(id: $id, paymentCustomization: { enabled: $enabled }) {
      userErrors { field message }
    }
  }
`;

const DELETE_DELIVERY = `
  mutation DeleteDelivery($id: ID!) {
    deliveryCustomizationDelete(id: $id) {
      userErrors { field message }
    }
  }
`;

const DELETE_PAYMENT = `
  mutation DeletePayment($id: ID!) {
    paymentCustomizationDelete(id: $id) {
      userErrors { field message }
    }
  }
`;

const FUNCTIONS_QUERY = `
  query {
    shopifyFunctions(first: 25) {
      nodes {
        id
        title
        apiType
        app { id title }
      }
    }
    currentAppInstallation { id app { id title } }
  }
`;

export async function loader({ request }) {
  const { admin } = await authenticate.admin(request);
  const res = await admin.graphql(QUERY);
  const { data } = await res.json();

  const fnRes = await admin.graphql(FUNCTIONS_QUERY);
  const { data: fnData } = await fnRes.json();
  console.log("[checkout-rules] Functions:", JSON.stringify(fnData?.shopifyFunctions?.nodes));
  console.log("[checkout-rules] Current app:", JSON.stringify(fnData?.currentAppInstallation));
  console.log("[checkout-rules] ALL delivery customizations:", JSON.stringify(data?.deliveryCustomizations?.nodes?.map(n => ({ id: n.id, title: n.title, functionId: n.functionId }))));

  const deliveryRules = (data?.deliveryCustomizations?.nodes ?? []).filter(
    (n) => n.metafield !== null
  );
  const paymentRules = (data?.paymentCustomizations?.nodes ?? []).filter(
    (n) => n.metafield !== null
  );

  return json({ deliveryRules, paymentRules });
}

export async function action({ request }) {
  const { admin } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent");
  const id = formData.get("id");
  const type = formData.get("type");

  if (intent === "toggle") {
    const enabled = formData.get("enabled") === "true";
    const mutation = type === "delivery" ? TOGGLE_DELIVERY : TOGGLE_PAYMENT;
    await admin.graphql(mutation, { variables: { id, enabled: !enabled } });
  }

  if (intent === "delete") {
    const mutation = type === "delivery" ? DELETE_DELIVERY : DELETE_PAYMENT;
    await admin.graphql(mutation, { variables: { id } });
  }

  return json({ ok: true });
}

function RuleCard({ rule, type, onEdit, onDelete, onToggle }) {
  const config = rule.metafield?.jsonValue ?? {};
  const mode = config.mode ?? "companies";
  const tags = config.tags ?? [];

  return (
    <Box padding="400" background="bg-surface" borderRadius="200">
      <InlineStack align="space-between" blockAlign="start" wrap={false}>
        <BlockStack gap="100">
          <InlineStack gap="200" blockAlign="center">
            <Text variant="headingSm" as="h3">
              {rule.title}
            </Text>
            <Badge tone={rule.enabled ? "success" : "critical"}>
              {rule.enabled ? "Active" : "Inactive"}
            </Badge>
            <Badge tone={mode === "tags" ? "info" : "attention"}>
              {mode === "companies" ? "Companies mode" : "Tags mode"}
            </Badge>
          </InlineStack>

          {mode === "tags" && tags.length > 0 && (
            <InlineStack gap="100" wrap>
              <Text variant="bodySm" tone="subdued">
                Tags:
              </Text>
              {tags.map((tag) => (
                <Badge key={tag}>{tag}</Badge>
              ))}
            </InlineStack>
          )}

          {mode === "tags" && (
            <Text variant="bodySm" tone="subdued">
              {(config.shippingMethods ?? config.paymentMethods ?? []).filter(
                (m) => m.visible === false
              ).length}{" "}
              method(s) hidden when condition matches
            </Text>
          )}
        </BlockStack>

        <InlineStack gap="200">
          <Button size="slim" onClick={() => onEdit(rule.id)}>
            Edit
          </Button>
          <Button
            size="slim"
            tone={rule.enabled ? "critical" : undefined}
            onClick={() => onToggle(rule.id, rule.enabled, type)}
          >
            {rule.enabled ? "Disable" : "Enable"}
          </Button>
          <Button
            size="slim"
            tone="critical"
            variant="plain"
            onClick={() => onDelete(rule.id, type)}
          >
            Delete
          </Button>
        </InlineStack>
      </InlineStack>
    </Box>
  );
}

export default function Index() {
  const { deliveryRules, paymentRules } = useLoaderData();
  const navigate = useNavigate();
  const submit = useSubmit();
  const syncFetcher = useFetcher();
  const [selectedTab, setSelectedTab] = useState(0);
  const isSyncing = syncFetcher.state !== "idle";

  const allTags = [
    ...new Set([
      ...deliveryRules.flatMap((r) => r.metafield?.jsonValue?.tags ?? []),
      ...paymentRules.flatMap((r) => r.metafield?.jsonValue?.tags ?? []),
    ]),
  ];

  const handleSync = useCallback(() => {
    if (allTags.length === 0) return;
    syncFetcher.submit(
      JSON.stringify({ allRuleTags: allTags }),
      { method: "post", action: "/app/sync", encType: "application/json" }
    );
  }, [allTags, syncFetcher]);

  const handleEdit = useCallback(
    (id) => {
      const encoded = encodeURIComponent(id);
      navigate(`/app/rules/${encoded}`);
    },
    [navigate]
  );

  const handleDelete = useCallback(
    (id, type) => {
      if (!confirm("Delete this rule?")) return;
      submit(
        { intent: "delete", id, type },
        { method: "post", replace: true }
      );
    },
    [submit]
  );

  const handleToggle = useCallback(
    (id, enabled, type) => {
      submit(
        { intent: "toggle", id, enabled: String(enabled), type },
        { method: "post", replace: true }
      );
    },
    [submit]
  );

  const tabs = [
    {
      id: "delivery",
      content: `Delivery Rules (${deliveryRules.length})`,
      panelID: "delivery-panel",
    },
    {
      id: "payment",
      content: `Payment Rules (${paymentRules.length})`,
      panelID: "payment-panel",
    },
  ];

  const isDeliveryTab = selectedTab === 0;
  const rules = isDeliveryTab ? deliveryRules : paymentRules;
  const ruleType = isDeliveryTab ? "delivery" : "payment";
  const newRuleId = isDeliveryTab ? "new-delivery" : "new-payment";

  return (
    <Page
      title="Checkout Rules"
      subtitle="Hide, sort or rename shipping and payment methods based on customer conditions"
      primaryAction={{
        content: isDeliveryTab ? "New delivery rule" : "New payment rule",
        onAction: () => navigate(`/app/rules/${newRuleId}`),
      }}
    >
      <Layout>
        <Layout.Section>
          <Banner
            tone="info"
            action={
              allTags.length > 0
                ? {
                    content: isSyncing
                      ? "Syncing..."
                      : `Sync customers from tags (${allTags.length} tag${allTags.length !== 1 ? "s" : ""})`,
                    onAction: handleSync,
                    loading: isSyncing,
                  }
                : undefined
            }
          >
            <BlockStack gap="100">
              <Text as="p">
                <strong>Tags mode</strong> works by syncing your existing Shopify customer tags to an app metafield. Click <strong>Sync customers from tags</strong> after creating or editing rules to activate them. Re-sync whenever customer tags change.
              </Text>
              <Text as="p">
                <strong>Companies mode</strong> uses Shopify B2B purchasing company — no sync needed.
              </Text>
              {syncFetcher.data?.synced != null && (
                <Text as="p" tone="success">
                  ✓ Synced {syncFetcher.data.synced} customer{syncFetcher.data.synced !== 1 ? "s" : ""} successfully.
                </Text>
              )}
            </BlockStack>
          </Banner>
        </Layout.Section>

        <Layout.Section>
          <Card padding="0">
            <Tabs
              tabs={tabs}
              selected={selectedTab}
              onSelect={setSelectedTab}
            />
            <Box padding="400">
              {rules.length === 0 ? (
                <EmptyState
                  heading={`No ${ruleType} rules yet`}
                  action={{
                    content: `Create ${ruleType} rule`,
                    onAction: () => navigate(`/app/rules/${newRuleId}`),
                  }}
                  image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                >
                  <Text as="p" tone="subdued">
                    Create rules to show or hide{" "}
                    {isDeliveryTab ? "shipping" : "payment"} methods based on
                    customer tags or B2B company status.
                  </Text>
                </EmptyState>
              ) : (
                <BlockStack gap="300">
                  {rules.map((rule) => (
                    <RuleCard
                      key={rule.id}
                      rule={rule}
                      type={ruleType}
                      onEdit={handleEdit}
                      onDelete={handleDelete}
                      onToggle={handleToggle}
                    />
                  ))}
                </BlockStack>
              )}
            </Box>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
