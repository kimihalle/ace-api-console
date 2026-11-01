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
export const RESELLER_DENOMINATIONS = [10, 20, 50, 100, 200, 300, 500, 1000]
export const ALL_USER_GROUPS = '__all__'

export type ResellerChannel = {
  id: number
  name: string
  status: number
  group: string
  models: string
  setting?: string | null
}

export type ResellerGroupEstimate = {
  group: string
  saleRatio: number
  saleRatioFallback: boolean
  activeChannels: number
  models: string[]
  purchaseRatio: number | null
  costMultiplier: number | null
  worstChannel: string | null
  missingChannels: string[]
  status: 'estimated' | 'incomplete_cost' | 'no_routes' | 'zero_sale_ratio'
}

export type ResellerQuote = {
  faceValue: number
  quota: number | null
  effectiveFaceValue: number | null
  retailPrice: number | null
  cost: number | null
  resellerPrice: number | null
  grossProfit: number | null
  breakEvenPrice: number | null
  minimumProfitablePrice: number | null
  meetsRetailPrice: boolean | null
  group: string | null
}

function parseRecord<T extends Record<string, unknown>>(value: unknown): T {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as T
  }
  if (typeof value !== 'string' || !value.trim()) return {} as T
  try {
    const parsed: unknown = JSON.parse(value)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as T)
      : ({} as T)
  } catch {
    return {} as T
  }
}

function splitList(value: string | undefined): string[] {
  return (value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

function channelPurchaseRatio(channel: ResellerChannel): number | null {
  const value = parseRecord<{ upstream_cost_ratio?: unknown }>(
    channel.setting
  ).upstream_cost_ratio
  if (
    value === null ||
    value === undefined ||
    (typeof value === 'string' && !value.trim()) ||
    !Number.isFinite(Number(value)) ||
    Number(value) < 0
  ) {
    return null
  }
  return Number(value)
}

function usableGroupsForUser(
  userGroup: string,
  usableGroupDescriptions: Record<string, unknown>,
  specialUsableGroups: Record<string, Record<string, string>>
): Set<string> {
  const allowed = new Set(Object.keys(usableGroupDescriptions))
  if (userGroup) allowed.add(userGroup)
  for (const name of Object.keys(specialUsableGroups[userGroup] || {})) {
    if (name.startsWith('-:')) allowed.delete(name.slice(2))
    else if (name.startsWith('+:')) allowed.add(name.slice(2))
    else allowed.add(name)
  }
  return allowed
}

export function resellerUserGroups(
  usableGroupDescriptions: unknown,
  groupGroupRatios: unknown,
  specialUsableGroups: unknown = {},
  userGroupOptions: unknown = []
): { value: string; label: string }[] {
  const usable = parseRecord<Record<string, unknown>>(usableGroupDescriptions)
  const specialRatios = parseRecord<Record<string, unknown>>(groupGroupRatios)
  const specialUsable =
    parseRecord<Record<string, unknown>>(specialUsableGroups)
  const optionNames = Array.isArray(userGroupOptions)
    ? userGroupOptions.filter(
        (value): value is string => typeof value === 'string' && !!value.trim()
      )
    : Object.keys(parseRecord<Record<string, unknown>>(userGroupOptions))
  const names = new Set([
    ...Object.keys(usable),
    ...Object.keys(specialRatios),
    ...Object.keys(specialUsable),
    ...optionNames,
  ])
  if (names.size === 0) names.add('default')
  return [...names].sort().map((value) => {
    return {
      value,
      label: value,
    }
  })
}

export function calculateResellerGroupCosts(input: {
  channels: ResellerChannel[]
  groupRatios: unknown
  groupGroupRatios: unknown
  usableGroupDescriptions: unknown
  specialUsableGroups: unknown
  groupDisplayOrder: unknown
  userGroupOptions?: unknown
  userGroup: string
}): ResellerGroupEstimate[] {
  const groupRatios = parseRecord<Record<string, unknown>>(input.groupRatios)
  const groupGroupRatios = parseRecord<Record<string, unknown>>(
    input.groupGroupRatios
  )
  const usable = parseRecord<Record<string, unknown>>(
    input.usableGroupDescriptions
  )
  const special = parseRecord<Record<string, Record<string, string>>>(
    input.specialUsableGroups
  )
  const configuredUserGroups = resellerUserGroups(
    usable,
    groupGroupRatios,
    special,
    input.userGroupOptions
  ).map((item) => item.value)
  let userGroups: string[]
  if (input.userGroup === ALL_USER_GROUPS) {
    userGroups = configuredUserGroups.length
      ? configuredUserGroups
      : ['default']
  } else {
    userGroups = [input.userGroup || 'default']
  }
  const channels = input.channels.filter(
    (channel) => channel.status === 1 && splitList(channel.models).length > 0
  )
  const routeGroups = new Set<string>()
  const allowedByUserGroup = new Map<string, Set<string>>()

  for (const userGroup of userGroups) {
    const allowed = usableGroupsForUser(userGroup, usable, special)
    allowedByUserGroup.set(userGroup, allowed)
    for (const channel of channels) {
      for (const group of splitList(channel.group)) {
        if (allowed.has(group) && group !== 'auto') routeGroups.add(group)
      }
    }
  }

  const order = Array.isArray(input.groupDisplayOrder)
    ? input.groupDisplayOrder.filter(
        (name): name is string => typeof name === 'string'
      )
    : []
  const positions = new Map(order.map((name, index) => [name, index]))

  return [...routeGroups]
    .sort(
      (left, right) =>
        (positions.get(left) ?? positions.size) -
          (positions.get(right) ?? positions.size) || left.localeCompare(right)
    )
    .map((group) => {
      const applicableUserGroups = userGroups.filter((userGroup) =>
        allowedByUserGroup.get(userGroup)?.has(group)
      )
      const ratios = applicableUserGroups.map((userGroup) => {
        const specialRatio = parseRecord<Record<string, unknown>>(
          groupGroupRatios[userGroup]
        )[group]
        const ratio =
          specialRatio === undefined ? groupRatios[group] : specialRatio
        const parsed = Number(ratio)
        return {
          ratio:
            ratio !== undefined &&
            ratio !== null &&
            !(typeof ratio === 'string' && !ratio.trim()) &&
            Number.isFinite(parsed) &&
            parsed >= 0
              ? parsed
              : 1,
          fallback:
            ratio === undefined ||
            ratio === null ||
            (typeof ratio === 'string' && !ratio.trim()),
        }
      })
      const saleRatio = ratios.length
        ? Math.min(...ratios.map((item) => item.ratio))
        : 1
      const routeChannels = channels.filter((channel) =>
        splitList(channel.group).includes(group)
      )
      const modelNames = new Set<string>()
      for (const channel of routeChannels) {
        for (const model of splitList(channel.models)) {
          if (model !== 'all' && model !== '*') modelNames.add(model)
        }
      }
      const candidates = routeChannels.map((channel) => ({
        channel,
        ratio: channelPurchaseRatio(channel),
      }))
      const knownCandidates = candidates.filter(
        (item): item is { channel: ResellerChannel; ratio: number } =>
          item.ratio !== null
      )
      const worstCandidate = knownCandidates.reduce<
        (typeof knownCandidates)[number] | null
      >(
        (worst, item) => (!worst || item.ratio > worst.ratio ? item : worst),
        null
      )
      const missingChannels = candidates
        .filter((item) => item.ratio === null)
        .map((item) => item.channel.name || `#${item.channel.id}`)
      const saleRatioFallback = ratios.some((item) => item.fallback)
      let status: ResellerGroupEstimate['status'] = 'estimated'
      if (!routeChannels.length) status = 'no_routes'
      else if (missingChannels.length) status = 'incomplete_cost'
      else if (saleRatio === 0 && worstCandidate?.ratio) {
        status = 'zero_sale_ratio'
      }
      let costMultiplier: number | null = null
      if (worstCandidate && saleRatio > 0) {
        costMultiplier = worstCandidate.ratio / saleRatio
      } else if (worstCandidate?.ratio === 0) {
        costMultiplier = 0
      }
      return {
        group,
        saleRatio,
        saleRatioFallback,
        activeChannels: routeChannels.length,
        models: [...modelNames].sort(),
        purchaseRatio: worstCandidate?.ratio ?? null,
        costMultiplier,
        worstChannel: worstCandidate?.channel.name || null,
        missingChannels,
        status,
      }
    })
}

export function calculateResellerQuotes(input: {
  groups: ResellerGroupEstimate[]
  targetMarginPercent: number
  cashPerCredit: number
  upstreamCashPerUnit: number | null
  quotaPerUnit: number
}): ResellerQuote[] {
  const groups = input.groups.filter((group) => group.status !== 'no_routes')
  const incomplete = groups.some((group) => group.status !== 'estimated')
  const worstGroup = groups.reduce<ResellerGroupEstimate | null>(
    (worst, group) =>
      group.costMultiplier !== null &&
      (!worst ||
        worst.costMultiplier === null ||
        group.costMultiplier > worst.costMultiplier)
        ? group
        : worst,
    null
  )
  const canConvertQuota =
    input.quotaPerUnit > 0 && Number.isFinite(input.quotaPerUnit)
  const validMargin =
    Number.isFinite(input.targetMarginPercent) &&
    input.targetMarginPercent >= 0 &&
    input.targetMarginPercent < 100
  const validCostUnit =
    input.upstreamCashPerUnit !== null &&
    Number.isFinite(input.upstreamCashPerUnit) &&
    input.upstreamCashPerUnit >= 0
  const validRetailPrice =
    Number.isFinite(input.cashPerCredit) && input.cashPerCredit > 0

  return RESELLER_DENOMINATIONS.map((faceValue) => {
    // A denomination is dollar-denominated wallet credit, not CNY cash.
    // Display exchange rates must never reduce the credit delivered by a code.
    const rawQuota = canConvertQuota
      ? Math.round(faceValue * input.quotaPerUnit)
      : null
    const quota =
      rawQuota !== null && Number.isSafeInteger(rawQuota) ? rawQuota : null
    const effectiveFaceValue =
      quota !== null && canConvertQuota ? quota / input.quotaPerUnit : null
    const costMultiplier = worstGroup?.costMultiplier ?? null
    const rawCost =
      !incomplete &&
      effectiveFaceValue !== null &&
      costMultiplier !== null &&
      Number.isFinite(costMultiplier) &&
      costMultiplier >= 0 &&
      validCostUnit &&
      input.upstreamCashPerUnit !== null
        ? effectiveFaceValue * costMultiplier * input.upstreamCashPerUnit
        : null
    const cost =
      rawCost !== null && Number.isSafeInteger(Math.ceil(rawCost * 100))
        ? rawCost
        : null
    const retailPrice =
      effectiveFaceValue !== null && validRetailPrice
        ? effectiveFaceValue * input.cashPerCredit
        : null
    const minimumCents = cost !== null ? Math.floor(cost * 100) + 1 : null
    const minimumProfitablePrice =
      minimumCents !== null && Number.isSafeInteger(minimumCents)
        ? minimumCents / 100
        : null
    const targetPrice =
      cost !== null && validMargin
        ? cost / (1 - input.targetMarginPercent / 100)
        : null
    // Round cash prices up to cents; a displayed quote must preserve its margin.
    const resellerPrice =
      targetPrice !== null &&
      Number.isSafeInteger(Math.ceil(targetPrice * 100)) &&
      minimumProfitablePrice !== null
        ? Math.max(Math.ceil(targetPrice * 100) / 100, minimumProfitablePrice)
        : null
    return {
      faceValue,
      quota,
      effectiveFaceValue,
      retailPrice,
      cost,
      resellerPrice,
      grossProfit:
        cost !== null && resellerPrice !== null ? resellerPrice - cost : null,
      breakEvenPrice: cost,
      minimumProfitablePrice,
      meetsRetailPrice:
        resellerPrice !== null && retailPrice !== null
          ? resellerPrice <= retailPrice
          : null,
      group: worstGroup?.group ?? null,
    }
  })
}
