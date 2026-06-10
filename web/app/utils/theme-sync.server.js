import { SHIPPING_BAR_SNIPPET_KEY, SHIPPING_BAR_SNIPPET } from "./snippets";

export { SHIPPING_BAR_SNIPPET_KEY, SHIPPING_BAR_SNIPPET };

export const DUTCH_RUSK_SHOP = "dutchrusk.myshopify.com";

const API_VERSION = "2025-07";

// ─── REST helpers ─────────────────────────────────────────────────────────────

async function shopifyRest(method, shop, accessToken, path, body) {
  const url = `https://${shop}/admin/api/${API_VERSION}/${path}`;
  const res = await fetch(url, {
    method,
    headers: {
      "X-Shopify-Access-Token": accessToken,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Shopify REST ${method} /${path} → ${res.status}: ${text}`);
  }
  return res.json();
}

export async function getLiveThemeId(shop, accessToken) {
  const { themes } = await shopifyRest("GET", shop, accessToken, "themes.json");
  const live = (themes ?? []).find((t) => t.role === "main");
  return live?.id ?? null;
}

export async function pushSnippetToTheme(shop, accessToken, themeId) {
  await shopifyRest("PUT", shop, accessToken, `themes/${themeId}/assets.json`, {
    asset: { key: SHIPPING_BAR_SNIPPET_KEY, value: SHIPPING_BAR_SNIPPET },
  });
}

export async function pushSnippetToLiveTheme(shop, accessToken) {
  const themeId = await getLiveThemeId(shop, accessToken);
  if (!themeId) throw new Error(`No live theme found for ${shop}`);
  await pushSnippetToTheme(shop, accessToken, themeId);
  return themeId;
}
