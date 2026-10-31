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

import { StaticDataTable } from '@/components/data-table'
import { toIntlLocale } from '@/i18n/languages'
import { formatBillingCurrencyFromUSD } from '@/lib/currency'
import { formatNumber } from '@/lib/format'
import { useSystemConfigStore } from '@/stores/system-config-store'

import type { ProfitBreakdown, ProfitRecord } from './types'

const statuses: Record<string, string> = {
  estimated: 'Estimated',
  missing_snapshot: 'No historical cost snapshot',
  missing_cost_ratio: 'Unconfigured cost',
  zero_sale_basis: 'Sales basis unavailable',
  invalid_pricing: 'Invalid pricing',
  subscription: 'Subscription revenue unallocated',
}

export function ProfitRecords(props: { records: ProfitRecord[] }) {
  useSystemConfigStore((state) => state.config.currency)
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const money = (value: number | null) =>
    value === null
      ? '-'
      : formatBillingCurrencyFromUSD(value, {
          locale,
          abbreviate: false,
          digitsSmall: 6,
        })
  return (
    <StaticDataTable
      data={props.records}
      getRowKey={(row, index) => `${row.request_id}-${index}`}
      columns={[
        {
          id: 'time',
          header: t('Time'),
          cell: (row) => new Date(row.created_at * 1000).toLocaleString(locale),
        },
        { id: 'user', header: t('Username'), cell: (row) => row.username },
        {
          id: 'channel',
          header: t('Channel ID'),
          cell: (row) => formatNumber(row.channel_id, locale),
        },
        { id: 'group', header: t('Group'), cell: (row) => row.group },
        { id: 'model', header: t('Model'), cell: (row) => row.model },
        {
          id: 'purchase',
          header: t('Upstream purchase ratio'),
          cell: (row) =>
            row.purchase_ratio === null
              ? '-'
              : new Intl.NumberFormat(locale, {
                  maximumFractionDigits: 8,
                }).format(row.purchase_ratio),
        },
        {
          id: 'sale',
          header: t('Effective sales ratio'),
          cell: (row) =>
            row.sale_ratio === null
              ? '-'
              : new Intl.NumberFormat(locale, {
                  maximumFractionDigits: 8,
                }).format(row.sale_ratio),
        },
        {
          id: 'revenue',
          header: t('Customer consumption'),
          cell: (row) => money(row.revenue),
        },
        {
          id: 'cost',
          header: t('Estimated upstream cost'),
          cell: (row) => money(row.cost),
        },
        {
          id: 'profit',
          header: t('Estimated gross profit'),
          cell: (row) => (
            <span
              className={
                row.gross_profit !== null && row.gross_profit < 0
                  ? 'text-destructive'
                  : ''
              }
            >
              {money(row.gross_profit)}
            </span>
          ),
        },
        {
          id: 'status',
          header: t('Cost status'),
          cell: (row) => t(statuses[row.status] || 'Unknown'),
        },
      ]}
    />
  )
}

export function ProfitBreakdowns(props: {
  rows: ProfitBreakdown[]
  label: string
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
  return (
    <StaticDataTable
      data={props.rows}
      getRowKey={(row) => row.key}
      columns={[
        { id: 'key', header: props.label, cell: (row) => row.key },
        {
          id: 'requests',
          header: t('Calls'),
          cell: (row) => formatNumber(row.requests, locale),
        },
        {
          id: 'revenue',
          header: t('Customer consumption'),
          cell: (row) => money(row.revenue),
        },
        {
          id: 'known',
          header: t('Consumption with known cost'),
          cell: (row) => money(row.known_revenue),
        },
        {
          id: 'cost',
          header: t('Estimated upstream cost'),
          cell: (row) => (row.known_requests ? money(row.cost) : '-'),
        },
        {
          id: 'profit',
          header: t('Estimated gross profit'),
          cell: (row) => (
            <span
              className={
                row.known_requests && row.gross_profit < 0
                  ? 'text-destructive'
                  : undefined
              }
            >
              {row.known_requests ? money(row.gross_profit) : '-'}
            </span>
          ),
        },
        {
          id: 'margin',
          header: t('Gross margin'),
          cell: (row) => (
            <span
              className={
                row.margin !== null && row.margin < 0
                  ? 'text-destructive'
                  : undefined
              }
            >
              {row.margin === null
                ? '-'
                : `${formatNumber(row.margin, locale)}%`}
            </span>
          ),
        },
        {
          id: 'unknown',
          header: t('Calls with unknown cost'),
          cell: (row) => formatNumber(row.unknown_requests, locale),
        },
      ]}
    />
  )
}
