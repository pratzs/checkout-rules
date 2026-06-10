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
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";

// ─── Constants (plain values — safe for both server and client bundle) ────────

const DUTCH_RUSK_SHOP = "dutchrusk.myshopify.com";
const API_VERSION = "2025-07";
const SNIPPET_KEY = "snippets/dutch-rusk-shipping-bar.liquid";

// Snippet content inlined in the action so it never ends up in the client bundle
// (tree-shaken away with the rest of the action code by Remix).
function getSnippetContent() {
  return `{% comment %}
  Dutch Rusk free-shipping threshold bar.
  Include in your cart section: {% render 'dutch-rusk-shipping-bar' %}
  Place it just above the cart totals / checkout button.
{% endcomment %}

{% assign free_shipping_cents = 15000 %}
{% assign remaining_cents = free_shipping_cents | minus: cart.total_price %}

<div
  id="dr-shipping-bar"
  class="dr-shipping-bar"
  data-threshold="{{ free_shipping_cents }}"
  data-cart-total="{{ cart.total_price }}"
  {% if cart.total_price >= free_shipping_cents %}style="display:none"{% endif %}
>
  <div class="dr-shipping-bar__icon">&#9432;</div>
  <div class="dr-shipping-bar__content">
    <p class="dr-shipping-bar__headline">
      {% if cart.total_price < free_shipping_cents %}
        Add
        <strong>
          {% assign remaining_dollars = remaining_cents | divided_by: 100.0 %}
          \${{ remaining_dollars | round: 2 }}
        </strong>
        more to your order for <strong>free shipping</strong>.
      {% endif %}
    </p>
    <p class="dr-shipping-bar__note">
      Orders under $150 will have shipping charges applied.
      The cost is calculated based on the weight of your order and delivery location,
      and will be included on your invoice.
    </p>
  </div>
</div>

<style>
  .dr-shipping-bar {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    background-color: #181344;
    color: #FEFEFE;
    border-left: 4px solid #F58220;
    border-radius: 4px;
    padding: 14px 16px;
    margin-bottom: 16px;
    font-size: 14px;
    line-height: 1.5;
  }
  .dr-shipping-bar__icon { font-size: 20px; line-height: 1; flex-shrink: 0; margin-top: 1px; color: #F58220; }
  .dr-shipping-bar__content { flex: 1; }
  .dr-shipping-bar__headline { margin: 0 0 6px; font-size: 15px; }
  .dr-shipping-bar__headline strong { color: #F58220; }
  .dr-shipping-bar__note { margin: 0; opacity: 0.85; font-size: 13px; }
</style>

<script>
  (function () {
    var bar = document.getElementById('dr-shipping-bar');
    if (!bar) return;
    var THRESHOLD = parseInt(bar.dataset.threshold, 10);
    function updateBar(totalCents) {
      if (totalCents >= THRESHOLD) { bar.style.display = 'none'; return; }
      var remaining = ((THRESHOLD - totalCents) / 100).toFixed(2);
      var headline = bar.querySelector('.dr-shipping-bar__headline');
      if (headline) {
        headline.innerHTML = 'Add <strong>$' + remaining + '</strong> more to your order for <strong>free shipping</strong>.';
      }
      bar.style.display = 'flex';
    }
    document.addEventListener('cart:updated', function (e) {
      var total = e.detail && e.detail.cart && e.detail.cart.total_price;
      if (typeof total === 'number') updateBar(total);
    });
    document.addEventListener('shopify:section:load', function () {
      fetch('/cart.js').then(function (r) { return r.json(); }).then(function (cart) { updateBar(cart.total_price); });
    });
  })();
</script>`;
}

// ─── REST helpers (server-side only — inside loader/action) ──────────────────

async function shopifyGet(shop, token, path) {
  const res = await fetch(`https://${shop}/admin/api/${API_VERSION}/${path}`, {
    headers: { "X-Shopify-Access-Token": token },
  });
  if (!res.ok) throw new Error(`GET ${path} → ${res.status}`);
  return res.json();
}

async function shopifyPut(shop, token, path, body) {
  const res = await fetch(`https://${shop}/admin/api/${API_VERSION}/${path}`, {
    method: "PUT",
    headers: { "X-Shopify-Access-Token": token, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`PUT ${path} → ${res.status}: ${text}`);
  }
  return res.json();
}

// ─── Loader ───────────────────────────────────────────────────────────────────

export async function loader({ request }) {
  const { session } = await authenticate.admin(request);

  const isDutchRusk = session.shop === DUTCH_RUSK_SHOP;
  if (!isDutchRusk) {
    return json({ isDutchRusk: false, snippetExists: null, liveThemeId: null, error: null });
  }

  try {
    const { themes } = await shopifyGet(session.shop, session.accessToken, "themes.json");
    const live = (themes ?? []).find((t) => t.role === "main");
    const liveThemeId = live?.id ?? null;

    let snippetExists = null;
    if (liveThemeId) {
      const assetRes = await fetch(
        `https://${session.shop}/admin/api/${API_VERSION}/themes/${liveThemeId}/assets.json?asset[key]=${SNIPPET_KEY}`,
        { headers: { "X-Shopify-Access-Token": session.accessToken } }
      );
      snippetExists = assetRes.ok;
    }

    return json({ isDutchRusk: true, snippetExists, liveThemeId, error: null });
  } catch (e) {
    return json({ isDutchRusk: true, snippetExists: null, liveThemeId: null, error: e.message });
  }
}

// ─── GraphQL helpers (used in action only) ───────────────────────────────────

const FIND_DR_CUSTOMERS = `
  query FindDRCustomers($after: String) {
    customers(first: 250, after: $after, query: "tag:dr-payment:weekly OR tag:dr-payment:fortnightly OR tag:dr-payment:monthly") {
      nodes { id tags }
      pageInfo { hasNextPage endCursor }
    }
  }
`;

const SET_PAYMENT_SCHEDULE = `
  mutation SetPaymentSchedule($metafields: [MetafieldsSetInput!]!) {
    metafieldsSet(metafields: $metafields) {
      userErrors { field message }
    }
  }
`;

const DR_TAGS = ["dr-payment:weekly", "dr-payment:fortnightly", "dr-payment:monthly"];

// ─── Action ───────────────────────────────────────────────────────────────────

export async function action({ request }) {
  const { session, admin } = await authenticate.admin(request);

  if (session.shop !== DUTCH_RUSK_SHOP) {
    return json({ ok: false, error: "Open this page from the Dutch Rusk store admin." }, { status: 403 });
  }

  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "syncSchedules") {
    try {
      let cursor = null;
      let synced = 0;
      do {
        const res = await admin.graphql(FIND_DR_CUSTOMERS, { variables: { after: cursor } });
        const { data } = await res.json();
        const page = data?.customers;
        cursor = page?.pageInfo?.hasNextPage ? page.pageInfo.endCursor : null;

        const metafields = (page?.nodes ?? []).map((c) => {
          const tag = c.tags.find((t) => DR_TAGS.includes(t));
          const schedule = tag ? tag.replace("dr-payment:", "") : "";
          return {
            ownerId: c.id,
            namespace: "$app:dutch-rusk-checkout",
            key: "payment_schedule",
            type: "single_line_text_field",
            value: schedule,
          };
        });

        if (metafields.length > 0) {
          await admin.graphql(SET_PAYMENT_SCHEDULE, { variables: { metafields } });
          synced += metafields.length;
        }
      } while (cursor);

      return json({ ok: true, intent: "syncSchedules", synced });
    } catch (e) {
      return json({ ok: false, intent: "syncSchedules", error: e.message }, { status: 500 });
    }
  }

  // Default: push snippet
  try {
    const { themes } = await shopifyGet(session.shop, session.accessToken, "themes.json");
    const live = (themes ?? []).find((t) => t.role === "main");
    if (!live) throw new Error("No live theme found");

    await shopifyPut(session.shop, session.accessToken, `themes/${live.id}/assets.json`, {
      asset: { key: SNIPPET_KEY, value: getSnippetContent() },
    });

    return json({ ok: true, themeId: live.id });
  } catch (e) {
    return json({ ok: false, error: e.message }, { status: 500 });
  }
}

// ─── UI ───────────────────────────────────────────────────────────────────────

export default function DutchRuskPage() {
  const { isDutchRusk, snippetExists, liveThemeId, error } = useLoaderData();
  const fetcher = useFetcher();
  const syncFetcher = useFetcher();

  const isPushing = fetcher.state !== "idle";
  const result = fetcher.data;
  const pushed = result?.ok === true && result?.intent !== "syncSchedules";
  const pushError = result?.ok === false && result?.intent !== "syncSchedules" ? result.error : null;

  const isSyncing = syncFetcher.state !== "idle";
  const syncResult = syncFetcher.data;
  const syncDone = syncResult?.ok === true && syncResult?.intent === "syncSchedules";
  const syncError = syncResult?.ok === false ? syncResult.error : null;

  return (
    <Page
      title="Dutch Rusk"
      subtitle="Theme snippet management and customer tag reference"
    >
      <Layout>

        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <BlockStack gap="200">
                <Text variant="headingMd" as="h2">Cart shipping bar snippet</Text>
                <Text as="p" tone="subdued">
                  Pushes <code>snippets/dutch-rusk-shipping-bar.liquid</code> into the
                  live theme. Run this whenever the Dutch Rusk team switches to a new theme.
                  It also happens automatically when a theme is published.
                </Text>
              </BlockStack>

              {!isDutchRusk && (
                <Banner tone="warning">
                  <Text as="p">
                    This page must be opened from the <strong>Dutch Rusk</strong> store admin.
                    You are currently viewing another store.
                  </Text>
                </Banner>
              )}

              {isDutchRusk && (
                <>
                  <InlineStack gap="300" blockAlign="center">
                    <Text as="p">Live theme:</Text>
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
                    ) : (snippetExists || pushed) ? (
                      <Badge tone="success">Installed</Badge>
                    ) : (
                      <Badge tone="critical">Missing — push it</Badge>
                    )}
                  </InlineStack>
                </>
              )}

              {error && (
                <Banner tone="critical"><Text as="p">{error}</Text></Banner>
              )}

              {pushed && (
                <Banner tone="success">
                  <Text as="p">Snippet pushed to theme #{result.themeId}. The cart bar is live.</Text>
                </Banner>
              )}

              {pushError && (
                <Banner tone="critical"><Text as="p">Push failed: {pushError}</Text></Banner>
              )}

              <fetcher.Form method="post">
                <Button
                  variant="primary"
                  loading={isPushing}
                  disabled={!isDutchRusk || isPushing}
                  submit
                >
                  {isPushing ? "Pushing…" : "Push snippet to live theme"}
                </Button>
              </fetcher.Form>
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <BlockStack gap="200">
                <Text variant="headingMd" as="h2">Payment schedule tags</Text>
                <Text as="p" tone="subdued">
                  Add one tag per customer in <strong>Shopify Admin → Customers → [customer] → Tags</strong>.
                  After tagging, click <strong>Sync payment schedules</strong> to write the checkout metafield.
                </Text>
              </BlockStack>

              <BlockStack gap="300">
                {[
                  { tag: "dr-payment:weekly", label: "Direct debit every 7 days" },
                  { tag: "dr-payment:fortnightly", label: "Direct debit every 14 days" },
                  { tag: "dr-payment:monthly", label: "20th of the following month" },
                  { tag: "(no tag)", label: "Regular DTC customer — no banner shown", muted: true },
                ].map(({ tag, label, muted }) => (
                  <Box key={tag} padding="300" background="bg-surface-secondary" borderRadius="200">
                    <InlineStack gap="300" blockAlign="center">
                      <Badge tone={muted ? undefined : "info"}>{tag}</Badge>
                      <Text as="p" tone={muted ? "subdued" : undefined}>{label}</Text>
                    </InlineStack>
                  </Box>
                ))}
              </BlockStack>

              {syncDone && (
                <Banner tone="success">
                  <Text as="p">Synced {syncResult.synced} customer(s). Payment schedule banners are now active at checkout.</Text>
                </Banner>
              )}
              {syncError && (
                <Banner tone="critical"><Text as="p">Sync failed: {syncError}</Text></Banner>
              )}

              <syncFetcher.Form method="post">
                <input type="hidden" name="intent" value="syncSchedules" />
                <Button
                  loading={isSyncing}
                  disabled={!isDutchRusk || isSyncing}
                  submit
                >
                  {isSyncing ? "Syncing…" : "Sync payment schedules"}
                </Button>
              </syncFetcher.Form>
            </BlockStack>
          </Card>
        </Layout.Section>

      </Layout>
    </Page>
  );
}
