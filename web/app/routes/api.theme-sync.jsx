import { json } from "@remix-run/node";
import { sessionStorage } from "../shopify.server";
import { DUTCH_RUSK_SHOP, pushSnippetToLiveTheme } from "../utils/theme-sync.server";

/**
 * POST /api/theme-sync
 *
 * Manually pushes the Dutch Rusk shipping-bar snippet into the current live
 * theme.  Protected by a bearer token — set THEME_SYNC_SECRET on Render and
 * call:
 *
 *   curl -X POST https://checkout-rules-aoxi.onrender.com/api/theme-sync \
 *        -H "Authorization: Bearer <THEME_SYNC_SECRET>"
 *
 * Returns { ok: true, themeId } on success.
 */
export async function action({ request }) {
  // Verify the bearer token.
  const secret = process.env.THEME_SYNC_SECRET || process.env.SHOPIFY_API_SECRET;
  const auth = request.headers.get("Authorization") ?? "";
  const provided = auth.replace(/^Bearer\s+/i, "").trim();

  if (!secret || provided !== secret) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  // Retrieve the stored offline session for Dutch Rusk.
  let session;
  try {
    const sessions = await sessionStorage.findSessionsByShop(DUTCH_RUSK_SHOP);
    session = sessions.find((s) => s.accessToken);
  } catch (e) {
    return json({ error: `Session lookup failed: ${e.message}` }, { status: 500 });
  }

  if (!session) {
    return json(
      { error: `No session found for ${DUTCH_RUSK_SHOP}. Make sure the app is installed there and the store owner has authenticated.` },
      { status: 400 }
    );
  }

  try {
    const themeId = await pushSnippetToLiveTheme(DUTCH_RUSK_SHOP, session.accessToken);
    return json({ ok: true, themeId, shop: DUTCH_RUSK_SHOP });
  } catch (e) {
    return json({ error: e.message }, { status: 500 });
  }
}

// Allow GET as well for browser-based testing (same auth check).
export async function loader({ request }) {
  return action({ request });
}
