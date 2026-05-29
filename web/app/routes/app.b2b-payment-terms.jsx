import { json } from "@remix-run/node";
import { useLoaderData, useFetcher } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  Text,
  Button,
  Banner,
  BlockStack,
  InlineStack,
  Badge,
  Box,
  Divider,
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

const GET_PAYMENT_TERMS_TEMPLATES = `
  query GetPaymentTermsTemplates {
    paymentTermsTemplates {
      id
      name
      paymentTermsType
      dueInDays
    }
  }
`;

const UPDATE_COMPANY_LOCATION_PAYMENT_TERMS = `
  mutation UpdateCompanyLocationPaymentTerms(
    $companyLocationId: ID!
    $input: CompanyLocationUpdateInput!
  ) {
    companyLocationUpdate(companyLocationId: $companyLocationId, input: $input) {
      companyLocation {
        id
        name
        buyerExperienceConfiguration {
          paymentTermsTemplate {
            id
            name
            paymentTermsType
          }
        }
      }
      userErrors {
        field
        message
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

// ─── Action ──────────────────────────────────────────────────────────────────

export async function action({ request }) {
  const { admin } = await authenticate.admin(request);

  // Get FIXED payment terms template
  const templatesRes = await admin.graphql(GET_PAYMENT_TERMS_TEMPLATES);
  const { data: templatesData } = await templatesRes.json();
  const templates = templatesData?.paymentTermsTemplates ?? [];
  const fixedTemplate = templates.find((t) => t.paymentTermsType === "FIXED");

  if (!fixedTemplate) {
    return json(
      { error: "No FIXED payment terms template found on this store." },
      { status: 400 }
    );
  }

  // Fetch all company locations
  const locations = await fetchAllCompanyLocations(admin);

  if (locations.length === 0) {
    return json({ updated: 0, total: 0, errors: [], dueDate: calcNextDueDate() });
  }

  // Update each location to FIXED payment terms
  let updated = 0;
  const errors = [];

  for (const location of locations) {
    const res = await admin.graphql(UPDATE_COMPANY_LOCATION_PAYMENT_TERMS, {
      variables: {
        companyLocationId: location.id,
        input: {
          buyerExperienceConfiguration: {
            paymentTermsTemplateId: fixedTemplate.id,
          },
        },
      },
    });
    const { data } = await res.json();
    const userErrors = data?.companyLocationUpdate?.userErrors ?? [];
    if (userErrors.length > 0) {
      errors.push(
        `${location.name}: ${userErrors.map((e) => e.message).join(", ")}`
      );
    } else {
      updated++;
    }
  }

  return json({
    updated,
    total: locations.length,
    errors,
    dueDate: calcNextDueDate(),
    fixedTemplateName: fixedTemplate.name,
  });
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function B2BPaymentTermsPage() {
  const { locations, dueDate } = useLoaderData();
  const fetcher = useFetcher();

  const isRunning = fetcher.state !== "idle";
  const result = fetcher.data;

  const handleUpdate = () => {
    fetcher.submit({}, { method: "post" });
  };

  return (
    <Page
      title="B2B Payment Terms"
      subtitle="Set all company locations to Fixed payment terms so the correct due date appears natively at checkout"
      backAction={{ content: "Checkout Rules", url: "/app" }}
    >
      <Layout>

        {/* How it works */}
        <Layout.Section>
          <Banner tone="info" title="How this works">
            <BlockStack gap="200">
              <Text as="p">
                Shopify B2B checkout displays payment terms text based on what is
                set on each company location (e.g. "You're on Net 30 terms. Your
                payment will be due on 28 June.").
              </Text>
              <Text as="p">
                Clicking <strong>Update All Locations</strong> switches every
                company location from Net 30/45 to <strong>Fixed</strong> payment
                terms. Combined with the checkout extension banner, B2B customers
                see the correct date at checkout.
              </Text>
              <Text as="p">
                <strong>Run this once a month</strong> (or set up Shopify Flow to
                call it automatically on the 1st of each month). New orders will
                also have their payment terms corrected automatically via the
                orders/create webhook.
              </Text>
            </BlockStack>
          </Banner>
        </Layout.Section>

        {/* Current due date + action */}
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <BlockStack gap="100">
                <Text variant="headingMd" as="h2">
                  Current payment due date
                </Text>
                <Text variant="headingLg" as="p" tone="success">
                  {dueDate}
                </Text>
                <Text as="p" tone="subdued">
                  (20th of the following calendar month — December wraps to
                  January of the next year)
                </Text>
              </BlockStack>

              <Divider />

              <InlineStack align="space-between" blockAlign="center">
                <BlockStack gap="100">
                  <Text variant="headingMd" as="h2">
                    Company locations
                  </Text>
                  <Text as="p" tone="subdued">
                    {locations.length} location{locations.length !== 1 ? "s" : ""} found
                  </Text>
                </BlockStack>
                <Button
                  variant="primary"
                  loading={isRunning}
                  disabled={isRunning || locations.length === 0}
                  onClick={handleUpdate}
                >
                  {isRunning ? "Updating…" : "Update All Locations Now"}
                </Button>
              </InlineStack>

              {/* Result banner */}
              {result && !result.error && (
                <Banner
                  tone={result.errors?.length > 0 ? "warning" : "success"}
                  title={
                    result.errors?.length > 0
                      ? `Updated ${result.updated} of ${result.total} locations (${result.errors.length} error${result.errors.length !== 1 ? "s" : ""})`
                      : `✓ All ${result.updated} location${result.updated !== 1 ? "s" : ""} updated to Fixed payment terms`
                  }
                >
                  {result.errors?.length > 0 && (
                    <BlockStack gap="100">
                      {result.errors.map((e, i) => (
                        <Text key={i} as="p" tone="critical">
                          {e}
                        </Text>
                      ))}
                    </BlockStack>
                  )}
                </Banner>
              )}

              {result?.error && (
                <Banner tone="critical" title="Error">
                  <Text as="p">{result.error}</Text>
                </Banner>
              )}
            </BlockStack>
          </Card>
        </Layout.Section>

        {/* Location list */}
        {locations.length > 0 && (
          <Layout.Section>
            <Card>
              <BlockStack gap="300">
                <Text variant="headingMd" as="h2">
                  All company locations
                </Text>
                {locations.map((loc) => {
                  const terms = loc.buyerExperienceConfiguration?.paymentTermsTemplate;
                  const isFixed = terms?.paymentTermsType === "FIXED";
                  return (
                    <Box
                      key={loc.id}
                      padding="300"
                      background="bg-surface-secondary"
                      borderRadius="200"
                    >
                      <InlineStack align="space-between" blockAlign="center">
                        <BlockStack gap="050">
                          <Text variant="headingSm" as="p">
                            {loc.name}
                          </Text>
                          <Text as="p" tone="subdued">
                            {loc.company?.name}
                          </Text>
                        </BlockStack>
                        <Badge tone={isFixed ? "success" : "warning"}>
                          {terms ? `${terms.name} (${terms.paymentTermsType})` : "No terms set"}
                        </Badge>
                      </InlineStack>
                    </Box>
                  );
                })}
              </BlockStack>
            </Card>
          </Layout.Section>
        )}

        {/* Monthly reminder */}
        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <Text variant="headingMd" as="h2">
                Automate with Shopify Flow (optional)
              </Text>
              <Text as="p" tone="subdued">
                To avoid running this manually every month, create a Shopify
                Flow with a <strong>Scheduled time</strong> trigger set to the
                1st of each month. Add a <strong>Send HTTP Request</strong>{" "}
                action pointing to your app URL with this path:
              </Text>
              <Box
                padding="300"
                background="bg-surface-secondary"
                borderRadius="200"
              >
                <Text as="p" fontWeight="bold">
                  POST {typeof window !== "undefined" ? window.location.origin : ""}/api/update-company-payment-terms
                </Text>
              </Box>
              <Text as="p" tone="subdued">
                Or simply bookmark this page and click <strong>Update All Locations Now</strong> on the 1st of each month.
              </Text>
            </BlockStack>
          </Card>
        </Layout.Section>

      </Layout>
    </Page>
  );
}
