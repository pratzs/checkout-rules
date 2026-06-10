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
  Divider,
  Box,
} from "@shopify/polaris";
import { authenticate, sessionStorage } from "../shopify.server";
import {
  DUTCH_RUSK_SHOP,
  pushSnippetToLiveTheme,
  getLiveThemeId,
} from "../utils/theme-sync.server";

// ─── Loader: check if snippet already exists in the live theme ────────────────

export async function loader({ request }) {
  await authenticate.admin(request);

  let snippetExists = null;
  let liveThemeId = null;
  let sessionFound = false;
  let error = null;

  try {
    const sessions = await sessionStorage.findSessionsByShop(DUTCH_RUSK_SHOP);
    const session = sessions.find((s) => s.accessToken);

    if (!session) {
      error = `No session found for ${DUTCH_RUSK_SHOP}. Make sure the app is installed on the Dutch Rusk store and the store owner has opened the app at least once.`;
    } else {
      sessionFound = true;
      const API_VERSION = "2025-07";

      // Get live theme
      const themesRes = await fetch(
        `https://${DUTCH_RUSK_SHOP}/admin/api/${API_VERSION}/themes.json`,
        { headers: { "X-Shopify-Access-Token": session.accessToken } }
      );
      const { themes } = await themesRes.json();
      const live = (themes ?? []).find((t) => t.role === "main");
      liveThemeId = live?.id ?? null;

      if (liveThemeId) {
        // Check if snippet exists
        const assetRes = await fetch(
          `https://${DUTCH_RUSK_SHOP}/admin/api/${API_VERSION}/themes/${liveThemeId}/assets.json?asset[key]=snippets/dutch-rusk-shipping-bar.liquid`,
          { headers: { "X-Shopify-Access-Token": session.accessToken } }
        );
        snippetExists = assetRes.ok;
      }
    }
  } catch (e) {
    error = e.message;
  }

  return json({ snippetExists, liveThemeId, sessionFound, error });
}

// ─── Action: push snippet to live theme ──────────────────────────────────────

export async function action({ request }) {
  await authenticate.admin(request);

  try {
    const sessions = await sessionStorage.findSessionsByShop(DUTCH_RUSK_SHOP);
    const session = sessions.find((s) => s.accessToken);
    if (!session) {
      return json({ ok: false, error: `No session for ${DUTCH_RUSK_SHOP}` }, { status: 400 });
    }

    const themeId = await pushSnippetToLiveTheme(DUTCH_RUSK_SHOP, session.accessToken);
    return json({ ok: true, themeId });
  } catch (e) {
    return json({ ok: false, error: e.message }, { status: 500 });
  }
}

// ─── UI ───────────────────────────────────────────────────────────────────────

export default function DutchRuskPage() {
  const { snippetExists, liveThemeId, sessionFound, error } = useLoaderData();
  const fetcher = useFetcher();

  const isPushing = fetcher.state !== "idle";
  const result = fetcher.data;

  const pushed = result?.ok === true;
  const pushError = result?.ok === false ? result.error : null;

  return (
    <Page
      title="Dutch Rusk"
      subtitle="Theme snippet management and customer tag reference"
    >
      <Layout>

        {/* Status / push card */}
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <BlockStack gap="200">
                <Text variant="headingMd" as="h2">Cart shipping bar snippet</Text>
                <Text as="p" tone="subdued">
                  The snippet <code>snippets/dutch-rusk-shipping-bar.liquid</code> powers
                  the $150 free-shipping bar on the cart page. Push it into the live theme
                  whenever the Dutch Rusk team switches themes.
                </Text>
              </BlockStack>

              <InlineStack gap="300" blockAlign="center">
                <Text as="p">Live theme ID:</Text>
                {liveThemeId ? (
                  <Badge tone="success">#{liveThemeId}</Badge>
                ) : (
                  <Badge tone="critical">Not found</Badge>
                )}
              </InlineStack>

              <InlineStack gap="300" blockAlign="center">
                <Text as="p">Snippet status:</Text>
                {snippetExists === null ? (
                  <Badge>Unknown</Badge>
                ) : snippetExists || pushed ? (
                  <Badge tone="success">Installed</Badge>
                ) : (
                  <Badge tone="critical">Missing</Badge>
                )}
              </InlineStack>

              {error && (
                <Banner tone="critical">
                  <Text as="p">{error}</Text>
                </Banner>
              )}

              {pushed && (
                <Banner tone="success">
                  <Text as="p">
                    Snippet pushed successfully to theme #{result.themeId}. The cart bar is live.
                  </Text>
                </Banner>
              )}

              {pushError && (
                <Banner tone="critical">
                  <Text as="p">Push failed: {pushError}</Text>
                </Banner>
              )}

              <fetcher.Form method="post">
                <Button
                  variant="primary"
                  loading={isPushing}
                  disabled={!sessionFound || isPushing}
                  submit
                >
                  {isPushing ? "Pushing…" : "Push snippet to live theme"}
                </Button>
              </fetcher.Form>

              <Text as="p" tone="subdued" variant="bodySm">
                This also happens automatically whenever a theme is published on dutchrusk.myshopify.com.
              </Text>
            </BlockStack>
          </Card>
        </Layout.Section>

        {/* Customer tag reference */}
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text variant="headingMd" as="h2">Payment schedule tags</Text>
              <Text as="p" tone="subdued">
                Add one of these tags to a customer in{" "}
                <strong>Shopify Admin → Customers → [customer] → Tags</strong> to set
                their direct debit schedule. The checkout will show them their next payment date.
              </Text>

              <BlockStack gap="300">
                <Box
                  padding="300"
                  background="bg-surface-secondary"
                  borderRadius="200"
                >
                  <InlineStack gap="300" blockAlign="center">
                    <Badge tone="info">dr-payment:weekly</Badge>
                    <Text as="p">Direct debit every <strong>7 days</strong></Text>
                  </InlineStack>
                </Box>

                <Box
                  padding="300"
                  background="bg-surface-secondary"
                  borderRadius="200"
                >
                  <InlineStack gap="300" blockAlign="center">
                    <Badge tone="info">dr-payment:fortnightly</Badge>
                    <Text as="p">Direct debit every <strong>14 days</strong></Text>
                  </InlineStack>
                </Box>

                <Box
                  padding="300"
                  background="bg-surface-secondary"
                  borderRadius="200"
                >
                  <InlineStack gap="300" blockAlign="center">
                    <Badge tone="info">dr-payment:monthly</Badge>
                    <Text as="p"><strong>20th of the following month</strong></Text>
                  </InlineStack>
                </Box>

                <Box
                  padding="300"
                  background="bg-surface-secondary"
                  borderRadius="200"
                >
                  <InlineStack gap="300" blockAlign="center">
                    <Badge>no tag</Badge>
                    <Text as="p" tone="subdued">Regular DTC customer — no payment banner shown</Text>
                  </InlineStack>
                </Box>
              </BlockStack>
            </BlockStack>
          </Card>
        </Layout.Section>

      </Layout>
    </Page>
  );
}
