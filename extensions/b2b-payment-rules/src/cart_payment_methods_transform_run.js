// Entry point for shopify app function build.
// All logic lives in src/index.js — re-export it here so the build always
// picks up the real implementation regardless of which file it resolves first.
export { cartPaymentMethodsTransformRun } from "./index.js";