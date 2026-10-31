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
import { RefreshCw, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { StaticDataTable } from '@/components/data-table'
import { EmptyState } from '@/components/empty-state'
import { ErrorState } from '@/components/error-state'
import { LoadingState } from '@/components/loading-state'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Progress } from '@/components/ui/progress'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { getUserQuotaDates } from '@/features/dashboard/api'
import { toIntlLocale } from '@/i18n/languages'
import { formatLogQuota, formatNumber } from '@/lib/format'
import { requireServerSuccess } from '@/lib/server-error-message'
import { statusQueryOptions } from '@/lib/status-query'
import { useAuthStore } from '@/stores/auth-store'
import { useSystemConfigStore } from '@/stores/system-config-store'

import {
  aggregateModelUsage,
  sortModelUsage,
  type ModelUsageMetric,
  type ModelUsageRow,
} from '../lib/model-usage'
import { getDefaultTimeRange } from '../lib/utils'
import { CompactDateTimeRangePicker } from './compact-date-time-range-picker'
import { useLogsViewScope } from './usage-logs-provider'

export function ModelUsageRanking(props: {
  onInspect: (
    row: ModelUsageRow,
    range: { start: number; end: number; username?: string }
  ) => void
}) {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const { isAdminView, viewAccess } = useLogsViewScope()
  const userId = useAuthStore((state) => state.auth.user?.id)
  useSystemConfigStore((state) => state.config.currency)
  const { data: status } = useQuery(statusQueryOptions)
  const [username, setUsername] = useState('')
  const [metric, setMetric] = useState<ModelUsageMetric>('quota')
  const [limit, setLimit] = useState(20)
  const [validation, setValidation] = useState('')
  const [range, setRange] = useState(() => {
    const { start } = getDefaultTimeRange()
    return {
      start: Math.floor(start.getTime() / 3600000) * 3600,
      end: Math.floor(Date.now() / 1000),
      username: '',
    }
  })
  const [draft, setDraft] = useState<{ start?: Date; end?: Date }>(() => ({
    start: new Date(range.start * 1000),
    end: new Date(range.end * 1000),
  }))
  const disabled = status?.enable_data_export === false
  const query = useQuery({
    queryKey: ['model-usage-ranking', viewAccess, userId, range],
    enabled: !disabled && userId != null,
    queryFn: async () => {
      const result = requireServerSuccess(
        await getUserQuotaDates(
          {
            start_timestamp: range.start,
            end_timestamp: range.end,
            ...(isAdminView && range.username
              ? { username: range.username }
              : {}),
          },
          isAdminView
        )
      )
      return aggregateModelUsage(result.data)
    },
  })
  const rows = useMemo(
    () => sortModelUsage(query.data ?? [], metric),
    [query.data, metric]
  )
  const total = rows.reduce((sum, row) => sum + row.quota, 0)
  const requests = rows.reduce((sum, row) => sum + row.count, 0)
  const tokens = rows.reduce((sum, row) => sum + row.tokens, 0)
  return (
    <section
      className='flex h-full min-h-0 flex-col gap-4 overflow-auto'
      aria-label={t('Model usage ranking')}
    >
      <form
        className='flex flex-wrap items-center gap-2'
        onSubmit={(event) => {
          event.preventDefault()
          if (
            !draft.start ||
            !draft.end ||
            draft.start > draft.end ||
            draft.start.getTime() > Date.now()
          ) {
            setValidation(t('Select a valid start and end date'))
            return
          }
          setValidation('')
          setLimit(20)
          setRange({
            start: Math.floor(draft.start.getTime() / 3600000) * 3600,
            end: Math.min(
              Math.floor(Date.now() / 1000),
              Math.floor(draft.end.getTime() / 1000)
            ),
            username: isAdminView ? username.trim() : '',
          })
        }}
      >
        <CompactDateTimeRangePicker
          start={draft.start}
          end={draft.end}
          onChange={setDraft}
        />
        {isAdminView && (
          <Input
            className='w-full sm:w-44'
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            aria-label={t('Username')}
            placeholder={t('Username')}
          />
        )}
        <Button type='submit' size='sm'>
          <Search className='size-4' />
          {t('Search')}
        </Button>
        <Button
          type='button'
          variant='outline'
          size='icon-sm'
          aria-label={t('Refresh')}
          disabled={query.isFetching || disabled}
          onClick={() => void query.refetch()}
        >
          <RefreshCw className='size-4' />
        </Button>
      </form>
      {validation && (
        <p className='text-destructive text-sm' role='alert'>
          {validation}
        </p>
      )}
      <p className='text-muted-foreground text-xs'>
        {t(
          'Hourly aggregates may be delayed. Boundary hours are included; use request logs for exact timestamps.'
        )}
      </p>
      {disabled && (
        <EmptyState
          title={t('Usage aggregation is disabled')}
          description={t(
            'Enable dashboard data export in system settings to collect model statistics.'
          )}
        />
      )}
      {!disabled && query.isPending && <LoadingState />}
      {!disabled && query.isError && (
        <ErrorState
          title={t('Failed to load model usage')}
          onRetry={() => void query.refetch()}
        />
      )}
      {!disabled && !query.isPending && !query.isError && !rows.length && (
        <EmptyState title={t('No aggregated usage in this period')} />
      )}
      {!disabled && !query.isPending && !query.isError && rows.length > 0 && (
        <>
          <div className='grid grid-cols-2 gap-4 rounded-lg border p-4 lg:grid-cols-4'>
            {[
              { label: t('Recorded spending'), value: formatLogQuota(total) },
              {
                label: t('Recorded requests'),
                value: formatNumber(requests, locale),
              },
              { label: 'Tokens', value: formatNumber(tokens, locale) },
              {
                label: t('Active models'),
                value: formatNumber(rows.length, locale),
              },
            ].map((stat) => (
              <div key={stat.label} className='min-w-0 space-y-1'>
                <p className='text-muted-foreground text-xs'>{stat.label}</p>
                <p className='text-xl font-semibold break-words tabular-nums'>
                  {stat.value}
                </p>
              </div>
            ))}
          </div>
          <Tabs
            value={metric}
            onValueChange={(value) => {
              if (
                value === 'quota' ||
                value === 'count' ||
                value === 'tokens'
              ) {
                setMetric(value)
              }
            }}
          >
            <TabsList aria-label={t('Ranking metric')}>
              <TabsTrigger value='quota'>{t('Spending')}</TabsTrigger>
              <TabsTrigger value='count'>{t('Requests')}</TabsTrigger>
              <TabsTrigger value='tokens'>Tokens</TabsTrigger>
            </TabsList>
          </Tabs>
          <StaticDataTable
            data={rows.slice(0, limit)}
            getRowKey={(row) => row.model}
            tableClassName='min-w-[760px]'
            columns={[
              {
                id: 'rank',
                header: t('Rank'),
                cell: (_row, index) => formatNumber(index + 1, locale),
              },
              {
                id: 'model',
                header: t('Model'),
                cell: (row) => (
                  <span
                    className='inline-block max-w-64 truncate align-middle'
                    title={row.model}
                  >
                    {row.model || t('Unknown model')}
                  </span>
                ),
              },
              {
                id: 'quota',
                header: t('Spending'),
                cell: (row) => formatLogQuota(row.quota),
              },
              {
                id: 'share',
                header: t('Spending share'),
                cell: (row) => (
                  <div className='w-24 space-y-1'>
                    <span>{formatNumber(row.share, locale)}%</span>
                    <Progress
                      value={row.share}
                      aria-label={t('Spending share')}
                    />
                  </div>
                ),
              },
              {
                id: 'count',
                header: t('Requests'),
                cell: (row) => formatNumber(row.count, locale),
              },
              {
                id: 'tokens',
                header: 'Tokens',
                cell: (row) => formatNumber(row.tokens, locale),
              },
              {
                id: 'average',
                header: t('Average per request'),
                cell: (row) =>
                  row.average === null ? '-' : formatLogQuota(row.average),
              },
              {
                id: 'inspect',
                header: t('Details'),
                cell: (row) => (
                  <Button
                    variant='ghost'
                    size='sm'
                    disabled={!row.model}
                    onClick={() =>
                      props.onInspect(row, {
                        ...range,
                        username: isAdminView ? range.username : '',
                      })
                    }
                  >
                    {t('View request logs')}
                  </Button>
                ),
              },
            ]}
          />
          {rows.length > limit && (
            <Button
              className='self-center'
              variant='outline'
              onClick={() => setLimit((value) => value + 20)}
            >
              {t('Load more')}
            </Button>
          )}
        </>
      )}
    </section>
  )
}
