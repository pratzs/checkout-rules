import { LATEST_API_VERSION, shopifyApp } from "@shopify/shopify-app-remix/server";
import { SQLiteSessionStorage } from "@shopify/shopify-app-session-storage-sqlite";
import path from "path";
import { fileURLToPath } from "url";

// Store sessions in a SQLite file next to the server entry point.
// This survives Render sleep/wake cycles so webhooks always have a valid
// admin token after the initial app-install authentication.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, "..", "sessions.db");

const shopify = shopifyApp({
  apiKey: process.env.SHOPIFY_API_KEY,
  apiSecretKey: process.env.SHOPIFY_API_SECRET || "",
  apiVersion: LATEST_API_VERSION,
  scopes: process.env.SCOPES?.split(","),
  appUrl: process.env.SHOPIFY_APP_URL || "",
  authPathPrefix: "/auth",
  sessionStorage: new SQLiteSessionStorage(DB_PATH),
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

export const DELIVERY_METAFIELD_NS = "$app:b2b-delivery-rules";
export const PAYMENT_METAFIELD_NS = "$app:b2b-payment-rules";
export const METAFIELD_KEY = "function-configuration";
