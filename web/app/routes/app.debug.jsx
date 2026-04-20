import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { Page, Card, Text, BlockStack } from "@shopify/polaris";
import { authenticate } from "../shopify.server";

const QUERY = `
  query {
    shopifyFunctions(first: 25) {
      nodes {
        id
        title
        apiType
      }
    }
  }
`;

export async function loader({ request }) {
  const { admin } = await authenticate.admin(request);
  const res = await admin.graphql(QUERY);
  const { data } = await res.json();
  return json({ functions: data?.shopifyFunctions?.nodes ?? [] });
}

export default function Debug() {
  const { functions } = useLoaderData();
  return (
    <Page title="Function IDs (debug)">
      <Card>
        <BlockStack gap="200">
          {functions.map((f) => (
            <BlockStack key={f.id} gap="100">
              <Text variant="bodyMd" fontWeight="bold">{f.title}</Text>
              <Text variant="bodySm" tone="subdued">{f.apiType}</Text>
              <Text variant="bodySm">{f.id}</Text>
            </BlockStack>
          ))}
          {functions.length === 0 && <Text>No functions found.</Text>}
        </BlockStack>
      </Card>
    </Page>
  );
}
