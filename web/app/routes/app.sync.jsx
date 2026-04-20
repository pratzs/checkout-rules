import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { bulkSync } from "../utils/sync.server";

export async function action({ request }) {
  const { admin } = await authenticate.admin(request);
  const body = await request.json();
  const { allRuleTags } = body;

  if (!Array.isArray(allRuleTags) || allRuleTags.length === 0) {
    return json({ synced: 0, cleared: 0 });
  }

  const result = await bulkSync(admin, allRuleTags);
  return json(result);
}
