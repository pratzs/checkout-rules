import { LATEST_API_VERSION, shopifyApp } from "@shopify/shopify-app-remix/server";
import { MemorySessionStorage } from "@shopify/shopify-app-session-storage-memory";

const shopify = shopifyApp({
  apiKey: process.env.SHOPIFY_API_KEY,
  apiSecretKey: process.env.SHOPIFY_API_SECRET || "",
  apiVersion: LATEST_API_VERSION,
  scopes: process.env.SCOPES?.split(","),
  appUrl: process.env.SHOPIFY_APP_URL || "",
  authPathPrefix: "/auth",
  sessionStorage: new MemorySessionStorage(),
  future: {
    v3_webhookAdminContext: true,
    v3_authenticatePublic: true,
  },
});

export default shopify;
export const apiVersion = LATEST_API_VERSION;
export const addDocumentResponseHeaders = shopify.addDocumentResponseHeaders;
export const authenticate = shopify.authenticate;
export const unauthenticated = shopify.unauthenticated;
export const login = shopify.login;
export const sessionStorage = shopify.sessionStorage;

export const DELIVERY_FUNCTION_UID =
  process.env.DELIVERY_FUNCTION_UID ||
  "019cd4c8-52c9-7d09-9afb-271a31ba13b7";
export const PAYMENT_FUNCTION_UID =
  process.env.PAYMENT_FUNCTION_UID ||
  "019cd4c8-52c9-745a-944e-33cd8e4050ff";

export const DELIVERY_FUNCTION_GID = `gid://shopify/ShopifyFunction/${DELIVERY_FUNCTION_UID}`;
export const PAYMENT_FUNCTION_GID = `gid://shopify/ShopifyFunction/${PAYMENT_FUNCTION_UID}`;

export const DELIVERY_METAFIELD_NS = "$app:b2b-delivery-rules";
export const PAYMENT_METAFIELD_NS = "$app:b2b-payment-rules";
export const METAFIELD_KEY = "function-configuration";
