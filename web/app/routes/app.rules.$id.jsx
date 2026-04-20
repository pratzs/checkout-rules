import { json, redirect } from "@remix-run/node";
import { useLoaderData, useSubmit, useNavigation, useNavigate, useActionData } from "@remix-run/react";
import { bulkSync } from "../utils/sync.server";
import {
  Page,
  Layout,
  Card,
  Text,
  TextField,
  Select,
  Button,
  InlineStack,
  BlockStack,
  Box,
  Divider,
  Badge,
  Tag,
  InlineGrid,
  Banner,
  RadioButton,
  ChoiceList,
  Icon,
  Tooltip,
  Spinner,
  PageActions,
  FormLayout,
} from "@shopify/polaris";
import { useState, useCallback, useRef } from "react";
import {
  authenticate,
  apiVersion,
  DELIVERY_METAFIELD_NS,
  PAYMENT_METAFIELD_NS,
  METAFIELD_KEY,
} from "../shopify.server";

// ── GraphQL ────────────────────────────────────────────────────────────────

const LOAD_DELIVERY = `
  query LoadDeliveryRule($id: ID!) {
    deliveryCustomization(id: $id) {
      id
      title
      enabled
      metafield(namespace: "${DELIVERY_METAFIELD_NS}", key: "${METAFIELD_KEY}") {
        id
        jsonValue
      }
    }
  }
`;

const LOAD_PAYMENT = `
  query LoadPaymentRule($id: ID!) {
    paymentCustomization(id: $id) {
      id
      title
      enabled
      metafield(namespace: "${PAYMENT_METAFIELD_NS}", key: "${METAFIELD_KEY}") {
        id
        jsonValue
      }
    }
  }
`;

const SHIPPING_METHODS_QUERY = `
  query ShippingMethods {
    deliveryProfiles(first: 10) {
      nodes {
        profileLocationGroups {
          locationGroupZones(first: 20) {
            nodes {
              methodDefinitions(first: 100) {
                nodes { name }
              }
            }
          }
        }
      }
    }
  }
`;

const PAYMENT_METHODS_QUERY = `
  query PaymentMethods {
    paymentCustomizations(first: 1) {
      nodes { id }
    }
  }
`;

const CREATE_DELIVERY = `
  mutation CreateDelivery($input: DeliveryCustomizationInput!) {
    deliveryCustomizationCreate(deliveryCustomization: $input) {
      deliveryCustomization { id }
      userErrors { field message }
    }
  }
`;

const UPDATE_DELIVERY = `
  mutation UpdateDelivery($id: ID!, $input: DeliveryCustomizationInput!) {
    deliveryCustomizationUpdate(id: $id, deliveryCustomization: $input) {
      deliveryCustomization { id }
      userErrors { field message }
    }
  }
`;

const CREATE_PAYMENT = `
  mutation CreatePayment($input: PaymentCustomizationInput!) {
    paymentCustomizationCreate(paymentCustomization: $input) {
      paymentCustomization { id }
      userErrors { field message }
    }
  }
`;

const UPDATE_PAYMENT = `
  mutation UpdatePayment($id: ID!, $input: PaymentCustomizationInput!) {
    paymentCustomizationUpdate(id: $id, paymentCustomization: $input) {
      paymentCustomization { id }
      userErrors { field message }
    }
  }
`;

const SET_METAFIELD = `
  mutation SetMetafield($metafields: [MetafieldsSetInput!]!) {
    metafieldsSet(metafields: $metafields) {
      userErrors { field message }
    }
  }
`;

// ── Loader ─────────────────────────────────────────────────────────────────

// Shopify Payments card brands shown at checkout — hardcoded since they're
// not returned by the payment_gateways REST endpoint.
const SHOPIFY_PAYMENTS_BRANDS = [
  "Visa", "Mastercard", "American Express", "eftpos New Zealand",
  "JCB", "Diners Club",
];

async function fetchPaymentMethods(admin, session) {
  const walletMap = {
    APPLE_PAY: "Apple Pay", GOOGLE_PAY: "Google Pay",
    SHOPIFY_PAY: "Shop Pay", AMAZON_PAY: "Amazon Pay",
    FACEBOOK_PAY: "Facebook Pay",
  };

  // GraphQL: digital wallets (no extra scope needed)
  let wallets = [];
  try {
    const res = await admin.graphql(
      `query { shop { paymentSettings { supportedDigitalWallets } } }`
    );
    const { data } = await res.json();
    wallets = (data?.shop?.paymentSettings?.supportedDigitalWallets ?? [])
      .map((w) => walletMap[w] ?? w);
  } catch { /* ignore */ }

  // REST: payment_gateways — manual methods + third-party gateways
  // Requires read_payment_gateways scope; falls back silently if not yet granted.
  let gatewayNames = [];
  try {
    const res = await fetch(
      `https://${session.shop}/admin/api/${apiVersion}/payment_gateways.json`,
      { headers: { "X-Shopify-Access-Token": session.accessToken } }
    );
    if (res.ok) {
      const { payment_gateways } = await res.json();
      gatewayNames = (payment_gateways ?? [])
        .filter((g) => g.enabled !== false)
        .map((g) => g.name)
        .filter(Boolean);
    }
  } catch { /* scope not granted yet — use fallback list */ }

  return [...new Set([...SHOPIFY_PAYMENTS_BRANDS, ...wallets, ...gatewayNames])].sort();
}

export async function loader({ request, params }) {
  const { admin, session } = await authenticate.admin(request);
  const { id } = params;

  if (id === "new-delivery") {
    const methodsRes = await admin.graphql(SHIPPING_METHODS_QUERY);
    const { data: methodsData } = await methodsRes.json();
    const shippingMethods = extractShippingMethods(methodsData);
    return json({
      isNew: true,
      type: "delivery",
      customization: null,
      config: { mode: "tags", conditionLogic: "any", tags: [], shippingMethods: shippingMethods.map((m) => ({ title: m, visible: true })) },
      availableMethods: shippingMethods,
    });
  }

  if (id === "new-payment") {
    const paymentMethods = await fetchPaymentMethods(admin, session);
    return json({
      isNew: true,
      type: "payment",
      customization: null,
      config: { mode: "tags", conditionLogic: "any", tags: [], paymentMethods: paymentMethods.map((m) => ({ title: m, visible: true })) },
      availableMethods: paymentMethods,
    });
  }

  const realId = decodeURIComponent(id);
  const isDelivery = realId.includes("DeliveryCustomization");

  if (isDelivery) {
    const res = await admin.graphql(LOAD_DELIVERY, { variables: { id: realId } });
    const { data } = await res.json();
    const customization = data?.deliveryCustomization;
    const config = customization?.metafield?.jsonValue ?? { mode: "companies", conditionLogic: "any", tags: [], shippingMethods: [] };

    const methodsRes = await admin.graphql(SHIPPING_METHODS_QUERY);
    const { data: methodsData } = await methodsRes.json();
    const availableMethods = extractShippingMethods(methodsData);

    const existingTitles = new Set((config.shippingMethods ?? []).map((m) => m.title));
    availableMethods.forEach((m) => {
      if (!existingTitles.has(m)) {
        config.shippingMethods = [...(config.shippingMethods ?? []), { title: m, visible: true }];
      }
    });

    return json({ isNew: false, type: "delivery", customization, config, availableMethods });
  } else {
    const res = await admin.graphql(LOAD_PAYMENT, { variables: { id: realId } });
    const { data } = await res.json();
    const customization = data?.paymentCustomization;
    const config = customization?.metafield?.jsonValue ?? { mode: "companies", conditionLogic: "any", tags: [], paymentMethods: [] };

    const paymentMethods = await fetchPaymentMethods(admin, session);
    const existingTitles = new Set((config.paymentMethods ?? []).map((m) => m.title));
    paymentMethods.forEach((m) => {
      if (!existingTitles.has(m)) {
        config.paymentMethods = [...(config.paymentMethods ?? []), { title: m, visible: true }];
      }
    });

    return json({ isNew: false, type: "payment", customization, config, availableMethods: paymentMethods });
  }
}

function extractShippingMethods(data) {
  const names = new Set();
  for (const profile of data?.deliveryProfiles?.nodes ?? []) {
    for (const group of profile.profileLocationGroups ?? []) {
      for (const zone of group.locationGroupZones?.nodes ?? []) {
        for (const method of zone.methodDefinitions?.nodes ?? []) {
          if (method.name) names.add(method.name);
        }
      }
    }
  }
  return Array.from(names).sort();
}

const LOOKUP_FUNCTIONS = `
  query {
    shopifyFunctions(first: 25) {
      nodes { id title apiType }
    }
  }
`;

// ── Action ─────────────────────────────────────────────────────────────────

export async function action({ request, params }) {
  const { admin } = await authenticate.admin(request);
  const formData = await request.formData();
  const { id } = params;

  const title = String(formData.get("title") || "");
  const enabled = formData.get("enabled") === "true";
  const configJson = String(formData.get("config") || "{}");
  const type = String(formData.get("type") || "delivery");
  const isDelivery = type === "delivery";

  const config = JSON.parse(configJson);
  const metafieldNamespace = isDelivery ? DELIVERY_METAFIELD_NS : PAYMENT_METAFIELD_NS;

  const metafieldInput = {
    namespace: metafieldNamespace,
    key: METAFIELD_KEY,
    type: "json",
    value: JSON.stringify(config),
  };

  const isNew = id === "new-delivery" || id === "new-payment";

  if (isNew) {
    // Look up live function ID directly from the API
    const fnRes = await admin.graphql(LOOKUP_FUNCTIONS);
    const { data: fnData } = await fnRes.json();
    const fnNodes = fnData?.shopifyFunctions?.nodes ?? [];

    const targetApiType = isDelivery ? "delivery_customization" : "payment_customization";
    let fn = fnNodes.find((n) => n.apiType === targetApiType);
    if (!fn) {
      fn = fnNodes.find((n) =>
        isDelivery
          ? n.title?.toLowerCase().includes("delivery")
          : n.title?.toLowerCase().includes("payment")
      );
    }

    if (!fn) {
      return json(
        { errors: [{ field: "functionId", message: `No ${type} function found. Available: ${fnNodes.map((n) => `${n.title} (${n.apiType})`).join(", ")}` }] },
        { status: 422 }
      );
    }

    const input = {
      functionId: fn.id,
      title,
      enabled,
      metafields: [metafieldInput],
    };

    if (isDelivery) {
      const res = await admin.graphql(CREATE_DELIVERY, { variables: { input } });
      const { data } = await res.json();
      if (data?.deliveryCustomizationCreate?.userErrors?.length) {
        return json({ errors: data.deliveryCustomizationCreate.userErrors }, { status: 422 });
      }
    } else {
      const res = await admin.graphql(CREATE_PAYMENT, { variables: { input } });
      const { data } = await res.json();
      if (data?.paymentCustomizationCreate?.userErrors?.length) {
        return json({ errors: data.paymentCustomizationCreate.userErrors }, { status: 422 });
      }
    }
  } else {
    const realId = decodeURIComponent(id);
    const input = { title, enabled, metafields: [metafieldInput] };

    if (isDelivery) {
      const res = await admin.graphql(UPDATE_DELIVERY, { variables: { id: realId, input } });
      const { data } = await res.json();
      if (data?.deliveryCustomizationUpdate?.userErrors?.length) {
        return json({ errors: data.deliveryCustomizationUpdate.userErrors }, { status: 422 });
      }
    } else {
      const res = await admin.graphql(UPDATE_PAYMENT, { variables: { id: realId, input } });
      const { data } = await res.json();
      if (data?.paymentCustomizationUpdate?.userErrors?.length) {
        return json({ errors: data.paymentCustomizationUpdate.userErrors }, { status: 422 });
      }
    }
  }

  // Auto-sync customers with this rule's tags so no manual sync is needed.
  // Runs in the background after save — fires and doesn't block the redirect.
  if (config.mode === "tags" && Array.isArray(config.tags) && config.tags.length > 0) {
    bulkSync(admin, config.tags).catch(() => {/* non-fatal */});
  }

  return redirect("/app");
}

// ── Tag input component ────────────────────────────────────────────────────

function TagInput({ tags, onChange }) {
  const [inputValue, setInputValue] = useState("");

  const addTag = useCallback(() => {
    const val = inputValue.trim();
    if (!val || tags.includes(val)) return;
    onChange([...tags, val]);
    setInputValue("");
  }, [inputValue, tags, onChange]);

  const removeTag = useCallback(
    (tag) => onChange(tags.filter((t) => t !== tag)),
    [tags, onChange]
  );

  const handleKeyDown = useCallback(
    (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        addTag();
      }
    },
    [addTag]
  );

  return (
    <BlockStack gap="200">
      <InlineStack gap="200" blockAlign="end">
        <div style={{ flex: 1 }}>
          <TextField
            label="Add customer tag"
            value={inputValue}
            onChange={setInputValue}
            onKeyDown={handleKeyDown}
            placeholder="e.g. caltex"
            autoComplete="off"
            helpText="Press Enter or click Add to add a tag"
          />
        </div>
        <div style={{ paddingBottom: "4px" }}>
          <Button onClick={addTag} disabled={!inputValue.trim()}>
            Add
          </Button>
        </div>
      </InlineStack>
      {tags.length > 0 && (
        <InlineStack gap="100" wrap>
          {tags.map((tag) => (
            <Tag key={tag} onRemove={() => removeTag(tag)}>
              {tag}
            </Tag>
          ))}
        </InlineStack>
      )}
      {tags.length === 0 && (
        <Text variant="bodySm" tone="subdued">
          No tags added yet. Add at least one tag.
        </Text>
      )}
    </BlockStack>
  );
}

// ── Method toggle row ──────────────────────────────────────────────────────

function MethodRow({ method, onChange }) {
  return (
    <Box
      paddingBlock="300"
      paddingInline="400"
      background={method.visible ? "bg-surface" : "bg-surface-secondary"}
    >
      <InlineStack align="space-between" blockAlign="center">
        <Text variant="bodyMd" fontWeight={method.visible ? "medium" : "regular"} tone={method.visible ? undefined : "subdued"}>
          {method.title}
        </Text>
        <InlineStack gap="300" blockAlign="center">
          <Text variant="bodySm" tone={method.visible ? "success" : "critical"}>
            {method.visible ? "Show" : "Hide"}
          </Text>
          <button
            type="button"
            role="switch"
            aria-checked={method.visible}
            onClick={() => onChange({ ...method, visible: !method.visible })}
            style={{
              width: "40px",
              height: "24px",
              borderRadius: "12px",
              border: "none",
              cursor: "pointer",
              backgroundColor: method.visible ? "#008060" : "#d1d1d1",
              position: "relative",
              transition: "background-color 0.2s",
            }}
          >
            <span
              style={{
                position: "absolute",
                top: "2px",
                left: method.visible ? "18px" : "2px",
                width: "20px",
                height: "20px",
                borderRadius: "50%",
                backgroundColor: "#fff",
                transition: "left 0.2s",
              }}
            />
          </button>
        </InlineStack>
      </InlineStack>
    </Box>
  );
}

// ── Main page component ────────────────────────────────────────────────────

export default function RuleEditor() {
  const { isNew, type, customization, config: initialConfig, availableMethods } =
    useLoaderData();
  const actionData = useActionData();
  const submit = useSubmit();
  const navigate = useNavigate();
  const navigation = useNavigation();
  const isSaving = navigation.state === "submitting";

  const isDelivery = type === "delivery";

  const [title, setTitle] = useState(customization?.title ?? "");
  const [enabled, setEnabled] = useState(customization?.enabled ?? true);
  const [mode, setMode] = useState(initialConfig?.mode ?? "tags");
  const [conditionLogic, setConditionLogic] = useState(initialConfig?.conditionLogic ?? "any");
  const [negate, setNegate] = useState(initialConfig?.negate ?? false);
  const [tags, setTags] = useState(initialConfig?.tags ?? []);
  const [methods, setMethods] = useState(
    isDelivery
      ? (initialConfig?.shippingMethods ?? availableMethods.map((m) => ({ title: m, visible: true })))
      : (initialConfig?.paymentMethods ?? [])
  );
  const [newMethodName, setNewMethodName] = useState("");

  const methodKey = isDelivery ? "shippingMethods" : "paymentMethods";

  const handleMethodChange = useCallback((updatedMethod) => {
    setMethods((prev) =>
      prev.map((m) => (m.title === updatedMethod.title ? updatedMethod : m))
    );
  }, []);

  const handleAddMethod = useCallback(() => {
    const name = newMethodName.trim();
    if (!name || methods.some((m) => m.title === name)) return;
    setMethods((prev) => [...prev, { title: name, visible: true }]);
    setNewMethodName("");
  }, [newMethodName, methods]);

  const handleRemoveMethod = useCallback((title) => {
    setMethods((prev) => prev.filter((m) => m.title !== title));
  }, []);

  const handleSave = useCallback(() => {
    const config = {
      mode,
      conditionLogic,
      negate: mode === "tags" ? negate : false,
      tags: mode === "tags" ? tags : [],
      [methodKey]: methods,
    };
    const formData = new FormData();
    formData.set("title", title);
    formData.set("enabled", String(enabled));
    formData.set("config", JSON.stringify(config));
    formData.set("type", type);
    submit(formData, { method: "post" });
  }, [title, enabled, mode, conditionLogic, tags, methods, type, methodKey, submit]);

  const pageTitle = isNew
    ? `New ${isDelivery ? "delivery" : "payment"} rule`
    : `Edit: ${customization?.title}`;

  const hiddenCount = methods.filter((m) => !m.visible).length;

  return (
    <Page
      title={pageTitle}
      backAction={{ content: "Rules", onAction: () => navigate("/app") }}
    >
      <Layout>
        <Layout.Section>
          {actionData?.errors?.length > 0 && (
            <Banner tone="critical" title="Save failed">
              {actionData.errors.map((e) => <p key={e.field}>{e.message}</p>)}
            </Banner>
          )}
          {/* Title */}
          <Card>
            <BlockStack gap="400">
              <BlockStack gap="100">
                <Text variant="headingSm" as="h2">Title</Text>
                <Text variant="bodySm" tone="subdued">This title is for internal use only.</Text>
              </BlockStack>
              <TextField
                label="Rule title"
                labelHidden
                value={title}
                onChange={setTitle}
                placeholder="e.g. Free Shipping Corporates"
                maxLength={64}
                showCharacterCount
                autoComplete="off"
              />
            </BlockStack>
          </Card>

          {/* Mode selection */}
          <Card>
            <BlockStack gap="400">
              <BlockStack gap="100">
                <Text variant="headingSm" as="h2">Mode</Text>
                <Text variant="bodySm" tone="subdued">
                  Choose how to determine which customers this rule applies to.
                </Text>
              </BlockStack>
              <BlockStack gap="200">
                <Box
                  padding="300"
                  background={mode === "tags" ? "bg-surface-selected" : "bg-surface-secondary"}
                  borderRadius="200"
                  borderWidth="025"
                  borderColor={mode === "tags" ? "border-brand" : "border"}
                >
                  <RadioButton
                    label="Customer Tags mode"
                    helpText="Show/hide methods when customer has specific tags. Supports unlimited tags."
                    checked={mode === "tags"}
                    id="mode-tags"
                    name="mode"
                    onChange={() => setMode("tags")}
                  />
                </Box>
                <Box
                  padding="300"
                  background={mode === "companies" ? "bg-surface-selected" : "bg-surface-secondary"}
                  borderRadius="200"
                  borderWidth="025"
                  borderColor={mode === "companies" ? "border-brand" : "border"}
                >
                  <RadioButton
                    label="Companies mode (B2B)"
                    helpText="Uses Shopify B2B purchasing company — shows net terms for B2B, credit card for B2C."
                    checked={mode === "companies"}
                    id="mode-companies"
                    name="mode"
                    onChange={() => setMode("companies")}
                  />
                </Box>
              </BlockStack>
            </BlockStack>
          </Card>

          {/* Conditions — only in tags mode */}
          {mode === "tags" && (
            <Card>
              <BlockStack gap="400">
                <BlockStack gap="100">
                  <Text variant="headingSm" as="h2">Set condition to run this rule</Text>
                  <Text variant="bodySm" tone="subdued">
                    The rule runs when a customer matches these tag conditions at checkout.
                  </Text>
                </BlockStack>

                <BlockStack gap="200">
                  <Text variant="bodySm" fontWeight="semibold">Match type</Text>
                  <InlineStack gap="400">
                    <RadioButton
                      label="Any (OR) — customer has at least one tag"
                      checked={conditionLogic === "any"}
                      id="logic-any"
                      name="logic"
                      onChange={() => setConditionLogic("any")}
                    />
                    <RadioButton
                      label="All (AND) — customer has all tags"
                      checked={conditionLogic === "all"}
                      id="logic-all"
                      name="logic"
                      onChange={() => setConditionLogic("all")}
                    />
                  </InlineStack>
                </BlockStack>

                <BlockStack gap="200">
                  <Text variant="bodySm" fontWeight="semibold">Apply rule to customers who</Text>
                  <InlineStack gap="400">
                    <RadioButton
                      label="Have these tags (e.g. corporate customers)"
                      checked={!negate}
                      id="negate-false"
                      name="negate"
                      onChange={() => setNegate(false)}
                    />
                    <RadioButton
                      label="Don't have these tags (e.g. B2C / retail customers)"
                      checked={negate}
                      id="negate-true"
                      name="negate"
                      onChange={() => setNegate(true)}
                    />
                  </InlineStack>
                </BlockStack>

                <Divider />

                <BlockStack gap="100">
                  <Text variant="bodySm" fontWeight="semibold">Customer tags</Text>
                  <Text variant="bodySm" tone="subdued">
                    Check if the customer has any of the tags provided. No limit on number of tags.
                  </Text>
                </BlockStack>

                <TagInput tags={tags} onChange={setTags} />
              </BlockStack>
            </Card>
          )}

          {/* Methods list */}
          <Card padding="0">
            <Box padding="400">
              <BlockStack gap="100">
                <Text variant="headingSm" as="h2">
                  {isDelivery ? "Hide, sort or rename shipping methods" : "Hide or rename payment methods"}
                </Text>
                <Text variant="bodySm" tone="subdued">
                  Toggle the switch to hide the method when the condition is matched.{" "}
                  {hiddenCount > 0 && (
                    <Badge tone="warning">{hiddenCount} hidden</Badge>
                  )}
                </Text>
              </BlockStack>
            </Box>
            <Divider />

            {methods.length === 0 && (
              <Box padding="400">
                <Text tone="subdued" variant="bodySm">
                  No methods added yet. Add methods below.
                </Text>
              </Box>
            )}

            <BlockStack gap="0">
              {methods.map((method, i) => (
                <div key={method.title}>
                  {i > 0 && <Divider />}
                  <Box paddingInlineEnd="400">
                    <InlineStack align="space-between" blockAlign="center">
                      <div style={{ flex: 1 }}>
                        <MethodRow method={method} onChange={handleMethodChange} />
                      </div>
                      <Button
                        variant="plain"
                        tone="critical"
                        size="slim"
                        onClick={() => handleRemoveMethod(method.title)}
                      >
                        ×
                      </Button>
                    </InlineStack>
                  </Box>
                </div>
              ))}
            </BlockStack>

            <Divider />
            <Box padding="400">
              <BlockStack gap="200">
                <Text variant="bodySm" fontWeight="semibold">
                  Insert missing {isDelivery ? "shipping" : "payment"} method
                </Text>
                <Text variant="bodySm" tone="subdued">
                  Insert the name exactly as it appears in Shopify. Use * for wildcard matching (e.g. *Free* targets all free shipping options).
                </Text>
                <InlineStack gap="200" blockAlign="end">
                  <div style={{ flex: 1 }}>
                    <TextField
                      label="Method name"
                      labelHidden
                      value={newMethodName}
                      onChange={setNewMethodName}
                      placeholder={isDelivery ? "e.g. Free Caltex Shipping" : "e.g. Net 30"}
                      autoComplete="off"
                      onKeyDown={(e) => e.key === "Enter" && handleAddMethod()}
                    />
                  </div>
                  <Button onClick={handleAddMethod} disabled={!newMethodName.trim()}>
                    Add method
                  </Button>
                </InlineStack>
              </BlockStack>
            </Box>
          </Card>
        </Layout.Section>

        {/* Summary sidebar */}
        <Layout.Section variant="oneThird">
          <Card>
            <BlockStack gap="400">
              <Text variant="headingSm" as="h2">Summary</Text>
              <Select
                label="Status"
                options={[
                  { label: "Active", value: "true" },
                  { label: "Inactive", value: "false" },
                ]}
                value={String(enabled)}
                onChange={(v) => setEnabled(v === "true")}
              />
              <Divider />
              <BlockStack gap="200">
                <Text variant="bodySm" fontWeight="semibold">Description</Text>
                <Text variant="bodySm" tone="subdued">
                  {mode === "companies"
                    ? "B2B customers (purchasing company) see net terms / invoice payment only. B2C customers see credit card only."
                    : tags.length > 0
                    ? `${negate ? "Customers WITHOUT" : "Customers with"} ${conditionLogic === "any" ? "any of" : "all of"}: ${tags.join(", ")}`
                    : "No tags set yet."}
                </Text>
              </BlockStack>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>

      <PageActions
        primaryAction={{
          content: "Save rule",
          loading: isSaving,
          onAction: handleSave,
          disabled: !title.trim() || (mode === "tags" && tags.length === 0),
        }}
        secondaryActions={[
          {
            content: "Discard",
            onAction: () => navigate("/app"),
          },
        ]}
      />
    </Page>
  );
}
