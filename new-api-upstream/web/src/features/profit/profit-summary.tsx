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
import { useTranslation } from 'react-i18next'

import { Badge } from '@/components/ui/badge'
import { toIntlLocale } from '@/i18n/languages'
import { formatBillingCurrencyFromUSD } from '@/lib/currency'
import { formatNumber } from '@/lib/format'
import { useSystemConfigStore } from '@/stores/system-config-store'

import type { ProfitTotals } from './types'

export function ProfitFilteredSummary(props: {
  totals: ProfitTotals
  excluded: number
}) {
  useSystemConfigStore((state) => state.config.currency)
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const money = (value: number) =>
    formatBillingCurrencyFromUSD(value, {
      locale,
      abbreviate: false,
      digitsSmall: 6,
    })
  const available =
    props.totals.known_requests > 0 || props.totals.requests === 0
  return (
    <section
      aria-label={t('Filtered results')}
      className='space-y-3 border-y py-4'
    >
      <div className='flex flex-wrap items-center justify-between gap-2 text-xs'>
        <h3 className='font-medium'>{t('Filtered results')}</h3>
        <span className='text-muted-foreground'>
          {t('Calls')}: {formatNumber(props.totals.requests, locale)}
        </span>
      </div>
      <dl className='grid grid-cols-2 gap-x-4 gap-y-4 lg:grid-cols-4'>
        {[
          {
            label: t('Estimated gross profit'),
            value: available ? money(props.totals.gross_profit) : '-',
            loss: props.totals.gross_profit < 0,
          },
          {
            label: t('Estimated upstream cost'),
            value: available ? money(props.totals.cost) : '-',
          },
          {
            label: t('Customer consumption'),
            value: money(props.totals.revenue),
          },
          {
            label: t('Gross margin'),
            value:
              props.totals.margin === null
                ? '-'
                : `${formatNumber(props.totals.margin, locale)}%`,
            loss: props.totals.gross_profit < 0,
          },
        ].map((metric) => (
          <div key={metric.label} className='min-w-0'>
            <dt className='text-muted-foreground text-xs'>{metric.label}</dt>
            <dd
              className={`mt-1.5 text-lg font-semibold break-all tabular-nums ${metric.loss ? 'text-destructive' : ''}`}
            >
              {metric.value}
            </dd>
          </div>
        ))}
      </dl>
      <div className='text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-2 text-xs'>
        {props.totals.unknown_requests > 0 && (
          <>
            <Badge
              variant='warning'
              className='h-auto max-w-full rounded-md whitespace-normal'
            >
              {t('Unknown-cost calls: {{count}}', {
                count: formatNumber(props.totals.unknown_requests, locale),
              })}
            </Badge>
            <span>
              {t('Consumption with known cost')}:{' '}
              {money(props.totals.known_revenue)}
            </span>
          </>
        )}
        {props.excluded > 0 && (
          <span>
            {t('Excluded calls: {{count}}', { count: props.excluded })}
          </span>
        )}
      </div>
    </section>
  )
}
