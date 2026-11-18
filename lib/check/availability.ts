/**
 * Is "Check My Idea" for sale on this deploy? Env-only (no imports with side
 * effects) so landing sections can call it cheaply.
 *
 * Open when Stripe can charge for it (`STRIPE_SECRET_KEY` + `STRIPE_PRICE_CHECK`)
 * and a model is configured to produce it. Otherwise the site keeps showing
 * "launching soon" and nobody can pay for a report we can't deliver.
 */

function has(name: string): boolean {
  return Boolean(process.env[name]?.trim());
}

export const CHECK_PRICE_LABEL = "$9";
export const PRO_PRICE_LABEL = "$19";

export function isCheckSaleOpen(): boolean {
  const stripeReady = has("STRIPE_SECRET_KEY") && has("STRIPE_PRICE_CHECK");
  const llmReady = has("LLM_API_KEY") || has("DEEPSEEK_API_KEY");
  return stripeReady && llmReady;
}

/**
 * Is PainProof Pro (the $19/mo subscription) for sale? Needs the recurring
 * `STRIPE_PRICE_PRO`, the Stripe key, and a model to run checks.
 */
export function isProSaleOpen(): boolean {
  const stripeReady = has("STRIPE_SECRET_KEY") && has("STRIPE_PRICE_PRO");
  const llmReady = has("LLM_API_KEY") || has("DEEPSEEK_API_KEY");
  return stripeReady && llmReady;
}
