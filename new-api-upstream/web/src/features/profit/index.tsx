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
import { Link } from '@tanstack/react-router'
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Info,
  RefreshCw,
} from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { ErrorState } from '@/components/error-state'
import { LoadingState } from '@/components/loading-state'
import { Button } from '@/components/ui/button'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { SettingsPageFrame } from '@/features/system-settings/components/settings-page'
import { toIntlLocale } from '@/i18n/languages'
import { formatNumber } from '@/lib/format'
import { getServerErrorMessage } from '@/lib/server-error-message'

import { getProfitReport } from './api'
import { ProfitFilterControls } from './profit-filters'
import { ProfitOverviewCards } from './profit-overview'
import { ProfitFilteredSummary } from './profit-summary'
import { ProfitBreakdowns, ProfitRecords } from './profit-tables'
import { ResellerPricingPanel } from './reseller-pricing-panel'
import type { ProfitFilters } from './types'

export function ProfitPage() {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const [rollingDays, setRollingDays] = useState<number | null>(7)
  const [filters, setFilters] = useState<ProfitFilters>(() => {
    const until = Math.floor(Date.now() / 1000)
    return {
      start_timestamp: until - 7 * 86400,
      end_timestamp: until,
      page: 1,
      page_size: 20,
    }
  })
  const query = useQuery({
    queryKey: ['profit', filters],
    queryFn: () => getProfitReport(filters),
    meta: { errorToast: false },
  })
  const data = query.data
  const totals = data?.totals

  return (
    <SettingsPageFrame title={t('Profit statistics')}>
      <div className='flex flex-wrap items-center justify-between gap-2'>
        <Collapsible className='min-w-0 flex-1'>
          <CollapsibleTrigger className='text-muted-foreground group flex items-center gap-2 text-xs'>
            <Info className='size-3.5' aria-hidden='true' />
            {t('Statistics scope')}
            <ChevronDown
              className='size-3.5 transition-transform group-data-[panel-open]:rotate-180'
              aria-hidden='true'
            />
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className='text-muted-foreground max-w-4xl space-y-2 pt-3 text-xs leading-relaxed'>
              <p>
                {t(
                  'Gross profit is estimated from channel purchase ratios and the effective sales ratio at settlement.'
                )}
              </p>
              <p>
                {t(
                  'Both sides must use the same model-price baseline. Recharge discounts, fees and separately billed failed retries are excluded. Unknown costs are excluded from gross profit.'
                )}
              </p>
              <p>
                {t(
                  'Only settled wallet API calls are included. Subscriptions, asynchronous tasks and channel tests are excluded. Keep consumption logging enabled to collect statistics.'
                )}
              </p>
              <p>
                {t(
                  'Historical totals accumulate retained logs and preserve totals already processed. Calls without cost snapshots do not count toward profit.'
                )}
              </p>
            </div>
          </CollapsibleContent>
        </Collapsible>
        <Link
          to='/channels'
          className='text-primary shrink-0 text-xs underline underline-offset-4'
        >
          {t('Configure purchase ratios in Channels')}
        </Link>
      </div>
      <ProfitOverviewCards />
      <section
        aria-label={t('Filtered report')}
        className='space-y-4 border-t pt-5'
      >
        <div className='flex flex-wrap items-start justify-between gap-3'>
          <div className='min-w-0 space-y-1'>
            <h2 className='text-base font-semibold'>{t('Filtered report')}</h2>
            <p className='text-muted-foreground text-xs tabular-nums'>
              {new Date(filters.start_timestamp * 1000).toLocaleString(locale)}
              {' — '}
              {new Date(filters.end_timestamp * 1000).toLocaleString(locale)}
            </p>
          </div>
          <Button
            type='button'
            variant='outline'
            size='icon'
            aria-label={t('Refresh')}
            title={t('Refresh')}
            disabled={query.isFetching}
            onClick={() => {
              const until = Math.floor(Date.now() / 1000)
              if (rollingDays !== null && until !== filters.end_timestamp) {
                setFilters((previous) => ({
                  ...previous,
                  start_timestamp: until - rollingDays * 86400,
                  end_timestamp: until,
                  page: 1,
                }))
                return
              }
              void query.refetch()
            }}
          >
            <RefreshCw
              aria-hidden='true'
              className={query.isFetching ? 'animate-spin' : undefined}
            />
          </Button>
        </div>
        <ProfitFilterControls
          filters={filters}
          loading={query.isFetching}
          onApply={(next, days) => {
            setFilters(next)
            setRollingDays(days)
          }}
        />
        {query.isPending && <LoadingState />}
        {query.isError && (
          <ErrorState
            description={getServerErrorMessage(query.error)}
            onRetry={() => void query.refetch()}
          />
        )}
        {!query.isError && data && totals && (
          <>
            <ProfitFilteredSummary
              totals={totals}
              excluded={data.excluded_requests}
            />
            <Tabs defaultValue='daily'>
              <TabsList className='h-auto max-w-full flex-wrap'>
                <TabsTrigger value='daily'>{t('Daily summary')}</TabsTrigger>
                <TabsTrigger value='channels'>{t('By channel')}</TabsTrigger>
                <TabsTrigger value='groups'>{t('By group')}</TabsTrigger>
                <TabsTrigger value='records'>{t('Call details')}</TabsTrigger>
                <TabsTrigger value='reseller'>
                  {t('Reseller quotes')}
                </TabsTrigger>
              </TabsList>
              <TabsContent value='daily'>
                <ProfitBreakdowns
                  rows={data.daily}
                  label={t('Date (server time)')}
                />
              </TabsContent>
              <TabsContent value='channels'>
                <ProfitBreakdowns
                  rows={data.channels}
                  label={t('Channel ID')}
                />
              </TabsContent>
              <TabsContent value='groups'>
                <ProfitBreakdowns rows={data.groups} label={t('Group')} />
              </TabsContent>
              <TabsContent value='records'>
                <ProfitRecords records={data.records} />
                <div className='mt-3 flex flex-wrap items-center justify-end gap-3'>
                  <span className='text-muted-foreground text-sm'>
                    {t('Page')} {formatNumber(filters.page, locale)} /{' '}
                    {formatNumber(
                      Math.max(
                        1,
                        Math.ceil(totals.requests / filters.page_size)
                      ),
                      locale
                    )}
                  </span>
                  <Button
                    variant='outline'
                    size='icon'
                    aria-label={t('Previous page')}
                    title={t('Previous page')}
                    disabled={filters.page <= 1 || query.isFetching}
                    onClick={() =>
                      setFilters((previous) => ({
                        ...previous,
                        page: previous.page - 1,
                      }))
                    }
                  >
                    <ChevronLeft />
                  </Button>
                  <Button
                    variant='outline'
                    size='icon'
                    aria-label={t('Next page')}
                    title={t('Next page')}
                    disabled={
                      filters.page * filters.page_size >= totals.requests ||
                      query.isFetching
                    }
                    onClick={() =>
                      setFilters((previous) => ({
                        ...previous,
                        page: previous.page + 1,
                      }))
                    }
                  >
                    <ChevronRight />
                  </Button>
                </div>
              </TabsContent>
              <TabsContent value='reseller'>
                <ResellerPricingPanel />
              </TabsContent>
            </Tabs>
          </>
        )}
      </section>
    </SettingsPageFrame>
  )
}
