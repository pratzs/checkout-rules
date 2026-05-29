import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
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


// ─── Helpers ─────────────────────────────────────────────────────────────────

function calcNextDueDate() {
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

// ─── Loader ──────────────────────────────────────────────────────────────────

export async function loader({ request }) {
  const { admin } = await authenticate.admin(request);
  const locations = await fetchAllCompanyLocations(admin);
  const dueDate = calcNextDueDate();
  return json({ locations, dueDate });
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function B2BPaymentTermsPage() {
  const { locations, dueDate } = useLoaderData();

  return (
    <Page
      title="B2B Payment Terms — Status"
      subtitle="Overview of how B2B payment due dates work in this app"
      backAction={{ content: "Checkout Rules", url: "/app" }}
    >
      <Layout>

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
