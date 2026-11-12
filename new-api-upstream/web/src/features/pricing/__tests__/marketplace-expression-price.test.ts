import { describe, expect, test } from 'vitest'

import { parseMarketExpressionPricing } from '../../../../../../src/lib/model-marketplace-expression.js'
import { marketPriceDisplay } from '../../../../../../src/lib/model-marketplace.js'

describe('model marketplace expression pricing', () => {
  test('parses every context tier and multiplies its token prices by the selected group ratio', () => {
    const pricing = {
      billing_mode: 'tiered_expr',
      billing_expr:
        'len < 1000 ? tier("short", p * 2 + c * 8) : tier("long", p * 4 + c * 16)',
    }
    const summary = parseMarketExpressionPricing(pricing)
    const display = marketPriceDisplay({
      groups: ['all'],
      groupRatios: { basic: 0.5 },
      pricing,
    }, 'basic', {}, summary)

    expect(display.items).toEqual([
      ['输入 · short · 上下文长度 < 1000', '$2.00', '$1.00'],
      ['输出 · short · 上下文长度 < 1000', '$8.00', '$4.00'],
      ['输入 · long', '$4.00', '$2.00'],
      ['输出 · long', '$16.00', '$8.00'],
    ])
  })

  test('retains request rule notice and rejects incomplete provider variants', () => {
    const pricing = {
      billing_mode: 'tiered_expr',
      billing_expr:
        'tier("base", p * 2 + c * 8) * (header("x-tier") == "high" ? 2 : 1)',
    }
    expect(parseMarketExpressionPricing(pricing)?.hasRequestRules).toBe(true)
    expect(parseMarketExpressionPricing({
      billing_mode: 'tiered_expr',
      billing_plugin_variants: [
        { billing_mode: 'tiered_expr', billing_expr: 'tier("base", p * 2 + c * 8)' },
        { billing_mode: 'ratio' },
      ],
    })).toBeNull()
  })

  test('parses task usage rates without dividing them as token prices', () => {
    const pricing = {
      billing_mode: 'tiered_expr',
      billing_expr: 'tier("base", u("seconds") * 0.4)',
      billing_usage_schema: { seconds: { type: 'number', unit: 'second' } },
    }
    const summary = parseMarketExpressionPricing(pricing)
    const display = marketPriceDisplay({
      groups: ['all'],
      groupRatios: { basic: 0.5 },
      pricing,
    }, 'basic', {}, summary)

    expect(display.items).toEqual([['seconds（每秒） · base', '$0.40', '$0.20']])
  })
})
