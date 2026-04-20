import { redirect } from "@remix-run/node";

export async function loader({ request }) {
  const url = new URL(request.url);
  return redirect(`/app${url.search}`);
}
