import { parseTaskTiersFromExpr, parseTiersFromExpr, splitBillingExprAndRequestRules } from '../../new-api-upstream/web/src/features/pricing/lib/billing-expr.ts';

const parsedPricingCache = new WeakMap();

export function parseMarketExpressionPricing(pricing) {
  if (!pricing || typeof pricing !== 'object') return null;
  if (parsedPricingCache.has(pricing)) return parsedPricingCache.get(pricing);

  try {
    const variants = Array.isArray(pricing.billing_plugin_variants) && pricing.billing_plugin_variants.length
      ? pricing.billing_plugin_variants
      : [pricing];
    const tiers = [];
    let hasRequestRules = false;
    let incomplete = false;

    for (const variant of variants) {
      if (variant.billing_mode !== 'tiered_expr' || !variant.billing_expr) {
        incomplete = true;
        continue;
      }
      const { billingExpr, requestRuleExpr } = splitBillingExprAndRequestRules(variant.billing_expr);
      const usageSchema = variant.billing_usage_schema || {};
      const isTaskPrice = Object.keys(usageSchema).length > 0;
      const parsed = isTaskPrice
        ? parseTaskTiersFromExpr(billingExpr, usageSchema, true)
        : parseTiersFromExpr(billingExpr);
      if (!parsed.length) {
        incomplete = true;
        continue;
      }
      hasRequestRules ||= Boolean(requestRuleExpr);
      const sourceLabel = variants.length > 1 ? variant.plugin_name || variant.plugin_key || '' : '';
      for (const tier of parsed) tiers.push({ tier, kind: isTaskPrice ? 'task' : 'token', usageSchema, sourceLabel });
    }

    const result = incomplete || !tiers.length ? null : { tiers, hasRequestRules };
    parsedPricingCache.set(pricing, result);
    return result;
  } catch {
    parsedPricingCache.set(pricing, null);
    return null;
  }
}
