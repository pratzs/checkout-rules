import { json } from "@remix-run/node";
import { useLoaderData, useFetcher } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  Text,
  Banner,
  BlockStack,
  InlineStack,
  Badge,
  Box,
  Button,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";

// ─── GraphQL ────────────────────────────────────────────────────────────────

const GET_COMPANY_LOCATIONS = `
  query GetCompanyLocations($after: String) {
    companyLocations(first: 50, after: $after) {
      nodes {
        id
        name
        company {
          id
          name
        }
        buyerExperienceConfiguration {
          paymentTermsTemplate {
            id
            name
            paymentTermsType
          }
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

const GET_PAYMENT_CUSTOMIZATIONS = `
  query GetPaymentCustomizations($after: String) {
    paymentCustomizations(first: 50, after: $after) {
      nodes {
        id
        title
        metafield(namespace: "$app:b2b-payment-rules", key: "function-configuration") {
          id
          jsonValue
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
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

// ─── Helpers ─────────────────────────────────────────────────────────────────

function calcNextDueDateISO() {
  const now = new Date();
  const isDecember = now.getMonth() === 11;
  const year = isDecember ? now.getFullYear() + 1 : now.getFullYear();
  const month = isDecember ? 0 : now.getMonth() + 1;
  return new Date(Date.UTC(year, month, 20, 0, 0, 0)).toISOString();
}

function calcNextDueDateDisplay() {
  const now = new Date();
  const isDecember = now.getMonth() === 11;
  const year = isDecember ? now.getFullYear() + 1 : now.getFullYear();
  const month = isDecember ? 0 : now.getMonth() + 1;
  return new Date(year, month, 20).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

async function fetchAllCompanyLocations(admin) {
  let locations = [];
  let cursor = null;
  do {
    const res = await admin.graphql(GET_COMPANY_LOCATIONS, {
      variables: { after: cursor },
    });
    const { data } = await res.json();
    const page = data?.companyLocations;
    locations.push(...(page?.nodes ?? []));
    cursor = page?.pageInfo?.hasNextPage ? page?.pageInfo?.endCursor : null;
  } while (cursor);
  return locations;
}

async function fetchAllPaymentCustomizations(admin) {
  let customizations = [];
  let cursor = null;
  do {
    const res = await admin.graphql(GET_PAYMENT_CUSTOMIZATIONS, {
      variables: { after: cursor },
    });
    const { data } = await res.json();
    const page = data?.paymentCustomizations;
    customizations.push(...(page?.nodes ?? []));
    cursor = page?.pageInfo?.hasNextPage ? page?.pageInfo?.endCursor : null;
  } while (cursor);
  return customizations;
}

// ─── Loader ──────────────────────────────────────────────────────────────────

export async function loader({ request }) {
  const { admin } = await authenticate.admin(request);
  const locations = await fetchAllCompanyLocations(admin);
  const dueDate = calcNextDueDateDisplay();
  return json({ locations, dueDate });
}

// ─── Action ──────────────────────────────────────────────────────────────────

export async function action({ request }) {
  const { admin } = await authenticate.admin(request);
  const dueAt = calcNextDueDateISO();

  // Fetch all payment customizations that have our metafield set
  const customizations = await fetchAllPaymentCustomizations(admin);
  const withMetafield = customizations.filter((c) => c.metafield?.jsonValue != null);

  let updated = 0;
  let errors = [];

  for (const c of withMetafield) {
    const existingConfig = c.metafield.jsonValue;
    const newConfig = { ...existingConfig, dueAt };

    const res = await admin.graphql(SET_METAFIELD, {
      variables: {
        metafields: [
          {
            ownerId: c.id,
            namespace: "$app:b2b-payment-rules",
            key: "function-configuration",
            type: "json",
            value: JSON.stringify(newConfig),
          },
        ],
      },
    });
    const { data } = await res.json();
    const userErrors = data?.metafieldsSet?.userErrors ?? [];
    if (userErrors.length === 0) {
      updated++;
    } else {
      errors.push(...userErrors.map((e) => `${c.title}: ${e.message}`));
    }
  }

  return json({
    refreshed: true,
    updated,
    total: withMetafield.length,
    dueAt,
    errors,
  });
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function B2BPaymentTermsPage() {
  const { locations, dueDate } = useLoaderData();
  const fetcher = useFetcher();
  const isRefreshing = fetcher.state === "submitting";
  const result = fetcher.data;

  return (
    <Page
      title="B2B Payment Terms — Status"
      subtitle="Overview of how B2B payment due dates work in this app"
      backAction={{ content: "Checkout Rules", url: "/app" }}
    >
      <Layout>

        {/* Refresh action */}
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <BlockStack gap="100">
                <Text variant="headingMd" as="h2">Refresh Payment Due Date</Text>
                <Text as="p" tone="subdued">
                  Updates all existing payment customisation metafields with the correct 20th-of-next-month date.
                  Run this once now to fix the date shown at checkout. It re-runs automatically every time you save a payment rule.
                </Text>
              </BlockStack>

              {result?.refreshed && (
                <Banner
                  tone={result.errors?.length > 0 ? "warning" : "success"}
                  title={
                    result.errors?.length > 0
                      ? `Updated ${result.updated} of ${result.total} customisations (${result.errors.length} errors)`
                      : `Done — updated ${result.updated} of ${result.total} customisations with due date: ${result.dueAt}`
                  }
                >
                  {result.errors?.length > 0 && (
                    <BlockStack gap="100">
                      {result.errors.map((e, i) => <Text key={i} as="p">{e}</Text>)}
                    </BlockStack>
                  )}
                </Banner>
              )}

              <fetcher.Form method="post">
                <Button
                  variant="primary"
                  loading={isRefreshing}
                  submit
                >
                  Refresh Payment Due Date Now
                </Button>
              </fetcher.Form>
            </BlockStack>
          </Card>
        </Layout.Section>

        {/* Platform limitation explained clearly */}
        <Layout.Section>
          <Banner tone="warning" title="Shopify platform limitation — what can and can't be done">
            <BlockStack gap="200">
              <Text as="p">
                <strong>Cannot be changed:</strong> The native Shopify text "You're on Net 30 terms. Your payment will be due on 28 June." is rendered by Shopify internally and cannot be hidden, removed, or replaced — not via CSS, not via extensions, not via any API. Shopify confirmed this is unsupported in checkout extensibility.
              </Text>
              <Text as="p">
                <strong>Cannot be set on company locations:</strong> Shopify only allows NET-type payment terms (Net 30, Net 45, etc.) on company locations. Fixed/date-specific terms are order-level only.
              </Text>
              <Text as="p">
                <strong>What IS active and working:</strong> Every B2B order created on this store automatically gets its payment terms corrected to the 20th of the following month via the orders/create webhook. The checkout extension banner also shows the correct date above the Confirm button.
              </Text>
            </BlockStack>
          </Banner>
        </Layout.Section>

        {/* What's active */}
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text variant="headingMd" as="h2">What is active right now</Text>

              <Box padding="300" background="bg-surface-secondary" borderRadius="200">
                <BlockStack gap="100">
                  <InlineStack gap="200" blockAlign="center">
                    <Badge tone="success">Active</Badge>
                    <Text variant="headingSm" as="p">Checkout banner (UI extension)</Text>
                  </InlineStack>
                  <Text as="p" tone="subdued">
                    B2B company buyers see a blue info banner at checkout: "Your invoice will be due on {dueDate}. No payment is required to complete this order."
                  </Text>
                </BlockStack>
              </Box>

              <Box padding="300" background="bg-surface-secondary" borderRadius="200">
                <BlockStack gap="100">
                  <InlineStack gap="200" blockAlign="center">
                    <Badge tone="success">Active</Badge>
                    <Text variant="headingSm" as="p">Order payment terms correction (webhook)</Text>
                  </InlineStack>
                  <Text as="p" tone="subdued">
                    When a B2B order is created, the orders/create webhook automatically sets Fixed payment terms with due date = 20th of the following month on the order record. This is what your accounts team sees on the order.
                  </Text>
                </BlockStack>
              </Box>

              <Box padding="300" background="bg-surface-secondary" borderRadius="200">
                <BlockStack gap="100">
                  <InlineStack gap="200" blockAlign="center">
                    <Badge tone="attention">Cannot be removed</Badge>
                    <Text variant="headingSm" as="p">Native Shopify payment terms text</Text>
                  </InlineStack>
                  <Text as="p" tone="subdued">
                    Shopify automatically shows "You're on Net 30 terms. Your payment will be due on [Net 30 date]" for company locations with Net 30 set. This cannot be hidden via any supported Shopify developer mechanism. The correct date is shown via the banner above.
                  </Text>
                </BlockStack>
              </Box>
            </BlockStack>
          </Card>
        </Layout.Section>

        {/* Current due date */}
        <Layout.Section>
          <Card>
            <BlockStack gap="200">
              <Text variant="headingMd" as="h2">Current month's payment due date</Text>
              <Text variant="headingXl" as="p" tone="success">{dueDate}</Text>
              <Text as="p" tone="subdued">
                20th of the following calendar month. December orders wrap to 20th January of the next year. This date is shown in the checkout banner and set automatically on created orders.
              </Text>
            </BlockStack>
          </Card>
        </Layout.Section>

        {/* Location list - read only */}
        {locations.length > 0 && (
          <Layout.Section>
            <Card>
              <BlockStack gap="300">
                <BlockStack gap="050">
                  <Text variant="headingMd" as="h2">
                    Company locations ({locations.length})
                  </Text>
                  <Text as="p" tone="subdued">
                    Read-only view. Payment terms shown here are what Shopify displays natively at checkout.
                    The checkout banner and order webhook apply the correct 20th-of-month date regardless of what is shown here.
                  </Text>
                </BlockStack>
                {locations.slice(0, 20).map((loc) => {
                  const terms = loc.buyerExperienceConfiguration?.paymentTermsTemplate;
                  return (
                    <Box
                      key={loc.id}
                      padding="300"
                      background="bg-surface-secondary"
                      borderRadius="200"
                    >
                      <InlineStack align="space-between" blockAlign="center">
                        <BlockStack gap="050">
                          <Text variant="headingSm" as="p">{loc.name}</Text>
                          <Text as="p" tone="subdued">{loc.company?.name}</Text>
                        </BlockStack>
                        <Badge>
                          {terms ? `${terms.name}` : "No terms set"}
                        </Badge>
                      </InlineStack>
                    </Box>
                  );
                })}
                {locations.length > 20 && (
                  <Text as="p" tone="subdued">
                    … and {locations.length - 20} more locations
                  </Text>
                )}
              </BlockStack>
            </Card>
          </Layout.Section>
        )}

      </Layout>
    </Page>
  );
}
