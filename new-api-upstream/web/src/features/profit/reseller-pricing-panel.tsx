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
import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, RefreshCw } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { ErrorState } from '@/components/error-state'
import { LoadingState } from '@/components/loading-state'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { getChannels } from '@/features/channels/api'
import { channelsQueryKeys } from '@/features/channels/lib'
import type { ResellerChannel } from '@/features/profit/reseller-pricing'
import {
  useSystemOptions,
  getOptionValue,
} from '@/features/system-settings/hooks/use-system-options'
import { toIntlLocale } from '@/i18n/languages'
import { formatNumber, formatQuota } from '@/lib/format'
import { requireServerSuccess } from '@/lib/server-error-message'

import {
  ALL_USER_GROUPS,
  calculateResellerGroupCosts,
  calculateResellerQuotes,
  resellerUserGroups,
} from './reseller-pricing'

const DEFAULT_PRICING_SETTINGS = {
  GroupRatio: '{}',
  GroupGroupRatio: '{}',
  UserUsableGroups: '{}',
  GroupDisplayOrder: '[]',
  'group_ratio_setting.group_special_usable_group': '{}',
  QuotaPerUnit: 500000,
  USDExchangeRate: 7,
}

async function getAllEnabledChannels(): Promise<ResellerChannel[]> {
  const pageSize = 100
  const first = requireServerSuccess(
    await getChannels({ p: 1, page_size: pageSize, status: 'enabled' })
  )
  const items = [...(first.data?.items || [])]
  const total = first.data?.total || items.length

  for (let page = 2; items.length < total; page += 1) {
    const response = requireServerSuccess(
      await getChannels({ p: page, page_size: pageSize, status: 'enabled' })
    )
    const next = response.data?.items || []
    if (next.length === 0) break
    items.push(...next)
  }

  return items
}

function parseGroupOrder(value: string): string[] {
  try {
    const parsed: unknown = JSON.parse(value)
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === 'string')
      : []
  } catch {
    return []
  }
}

function formatMoney(value: number | null, locale: string): string {
  if (value === null || !Number.isFinite(value)) return '-'
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: 'CNY',
    maximumFractionDigits: 2,
  }).format(value)
}

function formatRatio(value: number | null, locale: string): string {
  return value === null
    ? '-'
    : `${new Intl.NumberFormat(locale, { maximumFractionDigits: 4 }).format(value)}x`
}

export function ResellerPricingPanel() {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language) || 'en-US'
  const [userGroup, setUserGroup] = useState(ALL_USER_GROUPS)
  const [discountInput, setDiscountInput] = useState('80')
  const settingsQuery = useSystemOptions()
  const channelsQuery = useQuery({
    queryKey: [...channelsQueryKeys.lists(), 'reseller-pricing'],
    queryFn: getAllEnabledChannels,
  })
  const settings = useMemo(
    () => getOptionValue(settingsQuery.data?.data, DEFAULT_PRICING_SETTINGS),
    [settingsQuery.data?.data]
  )
  const specialUsableGroups =
    settings['group_ratio_setting.group_special_usable_group']
  const userGroups = useMemo(
    () =>
      resellerUserGroups(
        settings.UserUsableGroups,
        settings.GroupGroupRatio,
        specialUsableGroups,
        settings.GroupRatio
      ),
    [
      settings.GroupGroupRatio,
      settings.GroupRatio,
      settings.UserUsableGroups,
      specialUsableGroups,
    ]
  )
  const selectedUserGroup =
    userGroup === ALL_USER_GROUPS ||
    userGroups.some((item) => item.value === userGroup)
      ? userGroup
      : ALL_USER_GROUPS
  const groups = useMemo(
    () =>
      calculateResellerGroupCosts({
        channels: channelsQuery.data || [],
        groupRatios: settings.GroupRatio,
        groupGroupRatios: settings.GroupGroupRatio,
        usableGroupDescriptions: settings.UserUsableGroups,
        specialUsableGroups,
        groupDisplayOrder: parseGroupOrder(settings.GroupDisplayOrder),
        userGroupOptions: settings.GroupRatio,
        userGroup: selectedUserGroup,
      }),
    [
      channelsQuery.data,
      selectedUserGroup,
      settings.GroupDisplayOrder,
      settings.GroupGroupRatio,
      settings.GroupRatio,
      settings.UserUsableGroups,
      specialUsableGroups,
    ]
  )
  const discount = Number(discountInput)
  const discountIsValid =
    discountInput.trim() !== '' &&
    Number.isFinite(discount) &&
    discount >= 0 &&
    discount <= 100
  const quotes = calculateResellerQuotes({
    groups,
    discountPercent: discountIsValid ? discount : 80,
    exchangeRate: Number(settings.USDExchangeRate),
    quotaPerUnit: Number(settings.QuotaPerUnit),
  })
  const loading = settingsQuery.isPending || channelsQuery.isPending
  const error = settingsQuery.error || channelsQuery.error
  const refetch = () => {
    void Promise.all([settingsQuery.refetch(), channelsQuery.refetch()])
  }
  const getGroupStatusLabel = (status: string) => {
    if (status === 'incomplete_cost') return t('Missing purchase ratio')
    if (status === 'zero_sale_ratio') return t('Zero sales ratio')
    return t('No active routes')
  }

  return (
    <div className='space-y-5 pt-3'>
      <div className='flex flex-wrap items-end justify-between gap-3'>
        <div className='min-w-0 space-y-1'>
          <h2 className='text-base font-semibold'>
            {t('Reseller redemption-code quotes')}
          </h2>
          <p className='text-muted-foreground max-w-3xl text-xs leading-relaxed'>
            {t(
              'For each usable group, the estimate divides its highest enabled-channel purchase ratio by its effective sales ratio, then uses the highest result. This is a conservative estimate.'
            )}
          </p>
        </div>
        <Button
          type='button'
          variant='outline'
          size='icon'
          aria-label={t('Refresh reseller pricing')}
          title={t('Refresh reseller pricing')}
          disabled={loading || channelsQuery.isFetching}
          onClick={refetch}
        >
          <RefreshCw
            className={channelsQuery.isFetching ? 'animate-spin' : undefined}
          />
        </Button>
      </div>

      <div className='grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(220px,1fr)_220px]'>
        <div className='space-y-1.5'>
          <Label htmlFor='reseller-user-group'>{t('Agent user group')}</Label>
          <Select
            value={selectedUserGroup}
            onValueChange={(value) => {
              if (value) setUserGroup(value)
            }}
          >
            <SelectTrigger id='reseller-user-group' className='w-full'>
              <SelectValue>
                {selectedUserGroup === ALL_USER_GROUPS
                  ? t('All user groups (conservative)')
                  : userGroups.find(
                      (group) => group.value === selectedUserGroup
                    )?.label}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_USER_GROUPS}>
                {t('All user groups (conservative)')}
              </SelectItem>
              {userGroups.map((group) => (
                <SelectItem key={group.value} value={group.value}>
                  {group.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className='space-y-1.5'>
          <Label htmlFor='reseller-discount'>{t('Agent price discount')}</Label>
          <div className='relative'>
            <Input
              id='reseller-discount'
              aria-invalid={!discountIsValid}
              type='number'
              min={0}
              max={100}
              step={1}
              value={discountInput}
              onChange={(event) => setDiscountInput(event.target.value)}
              className='pr-8 tabular-nums'
            />
            <span className='text-muted-foreground pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm'>
              %
            </span>
          </div>
        </div>
      </div>

      {!discountIsValid && (
        <p className='text-destructive text-xs' role='alert'>
          {t('Enter an agent discount from 0 to 100 percent.')}
        </p>
      )}

      {loading && <LoadingState />}
      {error && (
        <ErrorState
          description={
            error instanceof Error
              ? error.message
              : t('Failed to load reseller pricing data')
          }
          onRetry={refetch}
        />
      )}
      {!loading && !error && (
        <>
          <div className='overflow-x-auto rounded-lg border'>
            <Table className='min-w-[760px]'>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('Code face value')}</TableHead>
                  <TableHead>{t('Credit after conversion')}</TableHead>
                  <TableHead className='text-right'>
                    {t('Estimated cost')}
                  </TableHead>
                  <TableHead className='text-right'>
                    {t('Suggested agent price')}
                  </TableHead>
                  <TableHead className='text-right'>
                    {t('Estimated gross profit')}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {quotes.map((quote) => (
                  <TableRow key={quote.faceValue}>
                    <TableCell className='font-semibold'>
                      {formatMoney(quote.faceValue, locale)}
                    </TableCell>
                    <TableCell>
                      <div>
                        {quote.quota === null ? '-' : formatQuota(quote.quota)}
                      </div>
                      {quote.effectiveFaceValue !== null && (
                        <div className='text-muted-foreground text-xs'>
                          {t('Effective value')}:{' '}
                          {formatMoney(quote.effectiveFaceValue, locale)}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className='text-right tabular-nums'>
                      {formatMoney(quote.cost, locale)}
                    </TableCell>
                    <TableCell className='text-right tabular-nums'>
                      {formatMoney(quote.resellerPrice, locale)}
                    </TableCell>
                    <TableCell
                      className={`text-right font-medium tabular-nums ${quote.grossProfit !== null && quote.grossProfit < 0 ? 'text-destructive' : 'text-emerald-600 dark:text-emerald-400'}`}
                    >
                      {formatMoney(quote.grossProfit, locale)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <Card className='rounded-lg shadow-none'>
            <CardContent className='space-y-3 pt-4'>
              <div className='flex items-center justify-between gap-3'>
                <div>
                  <h3 className='font-medium'>{t('Group cost basis')}</h3>
                  <p className='text-muted-foreground mt-1 text-xs'>
                    {t(
                      'Current active routes are recalculated from channel settings and group multipliers. Edit either setting and this table refreshes automatically.'
                    )}
                  </p>
                </div>
                <Badge variant='outline' className='shrink-0'>
                  {t('{{count}} groups', { count: groups.length })}
                </Badge>
              </div>
              {groups.length === 0 ? (
                <p className='text-muted-foreground py-4 text-center text-sm'>
                  {t(
                    'No enabled channel routes found for the selected agent group.'
                  )}
                </p>
              ) : (
                <div className='overflow-x-auto'>
                  <Table className='min-w-[820px]'>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t('Group')}</TableHead>
                        <TableHead>{t('Sales ratio')}</TableHead>
                        <TableHead>{t('Highest purchase ratio')}</TableHead>
                        <TableHead>{t('Cost multiplier')}</TableHead>
                        <TableHead>{t('Cost source')}</TableHead>
                        <TableHead>{t('Routes / models')}</TableHead>
                        <TableHead>{t('Status')}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {groups.map((group) => (
                        <TableRow key={group.group}>
                          <TableCell className='font-medium'>
                            {group.group}
                          </TableCell>
                          <TableCell>
                            {formatRatio(group.saleRatio, locale)}
                            {group.saleRatioFallback
                              ? ` · ${t('default ratio')}`
                              : ''}
                          </TableCell>
                          <TableCell>
                            {formatRatio(group.purchaseRatio, locale)}
                          </TableCell>
                          <TableCell>
                            {formatRatio(group.costMultiplier, locale)}
                          </TableCell>
                          <TableCell>{group.worstChannel || '-'}</TableCell>
                          <TableCell>
                            {t('{{routes}} routes · {{models}} models', {
                              routes: formatNumber(
                                group.activeChannels,
                                locale
                              ),
                              models: formatNumber(group.models.length, locale),
                            })}
                          </TableCell>
                          <TableCell>
                            {group.status === 'estimated' ? (
                              <Badge variant='secondary'>
                                {t('Estimated')}
                              </Badge>
                            ) : (
                              <Badge variant='warning' className='gap-1'>
                                <AlertTriangle aria-hidden='true' />
                                {getGroupStatusLabel(group.status)}
                              </Badge>
                            )}
                            {group.missingChannels.length > 0 && (
                              <div
                                className='text-muted-foreground mt-1 max-w-56 truncate text-xs'
                                title={group.missingChannels.join(', ')}
                              >
                                {group.missingChannels.join(', ')}
                              </div>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
          <p className='text-muted-foreground text-xs leading-relaxed'>
            {t(
              'This is a gross-margin estimate, not an automatic agent price or code delivery. It excludes payment fees, tax, promotions, and upstream model-price differences. If a usable route has no purchase ratio, profit is shown as unknown.'
            )}
          </p>
        </>
      )}
    </div>
  )
}
