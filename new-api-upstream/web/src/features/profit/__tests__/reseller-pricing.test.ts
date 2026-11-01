/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import { describe, expect, it } from 'vitest'

import {
  ALL_USER_GROUPS,
  calculateResellerGroupCosts,
  calculateResellerQuotes,
  resellerUserGroups,
  type ResellerChannel,
} from '../reseller-pricing'

const channels: ResellerChannel[] = [
  {
    id: 1,
    name: '基础供应商',
    status: 1,
    group: 'default,vip',
    models: 'model-a,model-b',
    setting: '{"upstream_cost_ratio":0.5}',
  },
  {
    id: 2,
    name: '高价线路',
    status: 1,
    group: 'default',
    models: 'model-b',
    setting: '{"upstream_cost_ratio":0.8}',
  },
  {
    id: 3,
    name: '未设置成本线路',
    status: 1,
    group: 'vip',
    models: 'model-a',
    setting: '{}',
  },
  {
    id: 4,
    name: '已停用线路',
    status: 0,
    group: 'default',
    models: 'model-a',
    setting: '{"upstream_cost_ratio":9}',
  },
]

function estimate(userGroup = 'default', groups: ResellerChannel[] = channels) {
  return calculateResellerGroupCosts({
    channels: groups,
    groupRatios: '{"default":1,"vip":0.5}',
    groupGroupRatios: '{"default":{"vip":0.25},"agent":{"vip":0.1}}',
    usableGroupDescriptions: '{"default":"默认","vip":"VIP"}',
    specialUsableGroups: '{}',
    groupDisplayOrder: '["vip","default"]',
    userGroup,
  })
}

describe('reseller redemption-code pricing', () => {
  it('uses the most expensive enabled supplier route and the selected user-group override', () => {
    const result = estimate().find((item) => item.group === 'default')
    expect(result).toMatchObject({
      group: 'default',
      saleRatio: 1,
      activeChannels: 2,
      models: ['model-a', 'model-b'],
      purchaseRatio: 0.8,
      costMultiplier: 0.8,
      worstChannel: '高价线路',
      status: 'estimated',
    })
  })

  it('marks missing purchase ratios as unknown instead of treating them as free', () => {
    const result = estimate().find((item) => item.group === 'vip')
    expect(result).toMatchObject({
      activeChannels: 2,
      saleRatio: 0.25,
      purchaseRatio: 0.5,
      costMultiplier: 2,
      missingChannels: ['未设置成本线路'],
      status: 'incomplete_cost',
    })
  })

  it('recalculates group costs when sale multipliers change and respects special groups', () => {
    const original = estimate().find((item) => item.group === 'default')
    const raised = calculateResellerGroupCosts({
      channels,
      groupRatios: { default: 0.4, vip: 0.5 },
      groupGroupRatios: { default: { vip: 0.25 }, agent: { vip: 0.1 } },
      usableGroupDescriptions: { default: '默认', vip: 'VIP' },
      specialUsableGroups: { agent: { '+:vip': 'VIP' } },
      groupDisplayOrder: ['vip', 'default'],
      userGroup: 'agent',
    }).find((item) => item.group === 'default')
    expect(original?.costMultiplier).toBe(0.8)
    expect(raised?.costMultiplier).toBe(2)
    expect(
      estimate('agent').find((item) => item.group === 'vip')?.saleRatio
    ).toBe(0.1)
  })

  it('takes the highest permitted user-group cost when the code can be redeemed by any group', () => {
    const result = estimate(ALL_USER_GROUPS).find(
      (item) => item.group === 'vip'
    )
    expect(result?.saleRatio).toBe(0.1)
    expect(result?.costMultiplier).toBe(5)
  })

  it('calculates the credit, reseller price, cost and gross profit for denominations', () => {
    const groups = [
      {
        group: 'default',
        saleRatio: 1,
        saleRatioFallback: false,
        activeChannels: 1,
        models: ['model-a'],
        purchaseRatio: 0.5,
        costMultiplier: 0.5,
        worstChannel: '基础供应商',
        missingChannels: [],
        status: 'estimated' as const,
      },
    ]
    const quotes = calculateResellerQuotes({
      groups,
      discountPercent: 80,
      exchangeRate: 7,
      quotaPerUnit: 500000,
    })
    expect(quotes).toHaveLength(8)
    expect(quotes[0]).toMatchObject({
      faceValue: 10,
      quota: 714286,
      cost: expect.closeTo(5),
      resellerPrice: expect.closeTo(8),
      grossProfit: expect.closeTo(3),
      breakEvenPrice: expect.closeTo(5),
      group: 'default',
    })
  })

  it('does not quote a guaranteed cost while any accessible route is incomplete', () => {
    const quotes = calculateResellerQuotes({
      groups: estimate(),
      discountPercent: 80,
      exchangeRate: 7,
      quotaPerUnit: 500000,
    })
    expect(quotes.every((quote) => quote.cost === null)).toBe(true)
  })

  it('recognizes free-sales groups as unbounded when the upstream has a cost', () => {
    const result = calculateResellerGroupCosts({
      channels: [channels[0]],
      groupRatios: { default: 0 },
      groupGroupRatios: {},
      usableGroupDescriptions: { default: '默认' },
      specialUsableGroups: {},
      groupDisplayOrder: [],
      userGroup: 'default',
    })
    expect(result[0].status).toBe('zero_sale_ratio')
    expect(
      calculateResellerQuotes({
        groups: result,
        discountPercent: 80,
        exchangeRate: 7,
        quotaPerUnit: 500000,
      })[0].cost
    ).toBeNull()
  })

  it('keeps user-group selectors ordered and tolerates malformed settings', () => {
    expect(resellerUserGroups('{bad json', '{"agent":{"vip":0.2}}')).toEqual([
      { value: 'agent', label: 'agent' },
    ])
    expect(estimate('none').every((item) => item.saleRatioFallback)).toBe(false)
  })
})
