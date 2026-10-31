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
import {
  CalendarDays,
  CalendarRange,
  History,
  RefreshCw,
  Sun,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { ErrorState } from '@/components/error-state'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { IconBadge } from '@/components/ui/icon-badge'
import { Skeleton } from '@/components/ui/skeleton'
import { toIntlLocale } from '@/i18n/languages'
import { formatBillingCurrencyFromUSD } from '@/lib/currency'
import { formatNumber } from '@/lib/format'
import { getServerErrorMessage } from '@/lib/server-error-message'
import { useSystemConfigStore } from '@/stores/system-config-store'

import { getProfitOverview } from './api'

export function ProfitOverviewCards() {
  useSystemConfigStore((state) => state.config.currency)
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const query = useQuery({
    queryKey: ['profit-overview'],
    queryFn: getProfitOverview,
    staleTime: 15000,
    refetchInterval: (state) =>
      state.state.data?.complete === false ? 2000 : 60000,
    meta: { errorToast: false },
  })
  const data = query.data
  const money = (value: number) =>
    formatBillingCurrencyFromUSD(value, {
      locale,
      abbreviate: false,
      digitsSmall: 6,
    })
  const periods = [
    {
      key: 'today' as const,
      title: t('Today'),
      icon: Sun,
      tone: 'success' as const,
    },
    {
      key: 'yesterday' as const,
      title: t('Yesterday'),
      icon: CalendarDays,
      tone: 'neutral' as const,
    },
    {
      key: 'month' as const,
      title: t('Current month'),
      icon: CalendarRange,
      tone: 'info' as const,
    },
    {
      key: 'lifetime' as const,
      title: t('All-time total'),
      icon: History,
      tone: 'warning' as const,
    },
  ]

  return (
    <section aria-label={t('Profit overview')} className='space-y-3'>
      <div className='flex items-start justify-between gap-3'>
        <div className='min-w-0 flex-1 space-y-1'>
          <h2 className='text-base font-semibold'>{t('Profit overview')}</h2>
          <p className='text-muted-foreground text-xs'>
            {t(
              'Global totals, independent of the report filters below. Periods use Beijing time (Asia/Shanghai).'
            )}
          </p>
        </div>
        <div className='flex shrink-0 items-center gap-3'>
          {data?.complete && (
            <span className='text-muted-foreground hidden text-xs tabular-nums sm:block'>
              {t('Updated at {{time}}', {
                time: new Date(data.as_of * 1000).toLocaleTimeString(locale, {
                  timeZone: data.timezone,
                }),
              })}
            </span>
          )}
          <Button
            type='button'
            variant='outline'
            size='icon'
            aria-label={t('Refresh overview')}
            title={t('Refresh overview')}
            disabled={query.isFetching}
            onClick={() => void query.refetch()}
          >
            <RefreshCw
              aria-hidden='true'
              className={query.isFetching ? 'animate-spin' : undefined}
            />
          </Button>
        </div>
      </div>
      {query.isError && (
        <ErrorState
          description={getServerErrorMessage(query.error)}
          onRetry={() => void query.refetch()}
        />
      )}
      {data?.complete === false && (
        <Alert>
          <AlertDescription>
            {t(
              'Building historical totals: {{count}} logs processed. Full totals appear when processing finishes.',
              { count: formatNumber(data.processed_logs, locale) }
            )}
          </AlertDescription>
        </Alert>
      )}
      <div className='grid grid-cols-2 gap-2 sm:gap-3 xl:grid-cols-4'>
        {periods.map((period) => {
          const totals = data?.[period.key]
          const ready = Boolean(data?.complete && totals && !query.isError)
          const known = Boolean(ready && totals?.known_requests)
          const Icon = period.icon
          let profit = '-'
          let cost = '-'
          let margin = '-'
          if (known && totals) {
            profit = money(totals.gross_profit)
            cost = money(totals.cost)
            if (totals.margin !== null) {
              margin = `${formatNumber(totals.margin, locale)}%`
            }
          } else if (ready && totals?.requests === 0) {
            profit = money(0)
            cost = money(0)
          }
          return (
            <Card
              key={period.key}
              size='sm'
              className='min-w-0 rounded-lg'
              aria-label={period.title}
            >
              <CardHeader className='flex items-center justify-between gap-2'>
                <CardTitle>{period.title}</CardTitle>
                <IconBadge tone={period.tone} size='sm'>
                  <Icon />
                </IconBadge>
              </CardHeader>
              <CardContent className='space-y-4'>
                <div>
                  <p className='text-muted-foreground text-xs'>
                    {t('Estimated gross profit')}
                  </p>
                  {query.isPending ? (
                    <Skeleton className='mt-1 h-8 w-28' />
                  ) : (
                    <p
                      className={`mt-1 text-2xl font-semibold break-all tabular-nums ${known && totals && totals.gross_profit < 0 ? 'text-destructive' : ''}`}
                    >
                      {profit}
                    </p>
                  )}
                </div>
                <dl className='space-y-2 text-xs'>
                  {[
                    [t('Estimated upstream cost'), cost],
                    [
                      t('Customer consumption'),
                      ready && totals ? money(totals.revenue) : '-',
                    ],
                  ].map(([label, value]) => (
                    <div
                      key={label}
                      className='flex min-w-0 items-baseline justify-between gap-3'
                    >
                      <dt className='text-muted-foreground'>{label}</dt>
                      <dd className='text-right font-medium break-all tabular-nums'>
                        {value}
                      </dd>
                    </div>
                  ))}
                </dl>
                <dl className='flex flex-wrap items-center justify-between gap-2 border-t pt-3 text-xs'>
                  <div className='flex items-baseline gap-2'>
                    <dt className='text-muted-foreground'>
                      {t('Gross margin')}
                    </dt>
                    <dd
                      className={
                        known && totals && totals.gross_profit < 0
                          ? 'text-destructive tabular-nums'
                          : 'tabular-nums'
                      }
                    >
                      {margin}
                    </dd>
                  </div>
                  <div className='flex items-baseline gap-2'>
                    <dt className='text-muted-foreground'>{t('Calls')}</dt>
                    <dd className='tabular-nums'>
                      {ready && totals
                        ? formatNumber(totals.requests, locale)
                        : '-'}
                    </dd>
                  </div>
                </dl>
                {ready && totals && totals.unknown_requests > 0 && (
                  <Badge
                    variant='warning'
                    className='h-auto max-w-full rounded-md py-1 whitespace-normal'
                  >
                    {t('Unknown-cost calls: {{count}}', {
                      count: formatNumber(totals.unknown_requests, locale),
                    })}
                  </Badge>
                )}
              </CardContent>
            </Card>
          )
        })}
      </div>
    </section>
  )
}
