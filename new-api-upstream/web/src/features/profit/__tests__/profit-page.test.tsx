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
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ProfitPage } from '..'
import { getProfitOverview, getProfitReport } from '../api'
import { ProfitFilteredSummary } from '../profit-summary'
import { ProfitBreakdowns } from '../profit-tables'
import type { ProfitOverview, ProfitReport } from '../types'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en', resolvedLanguage: 'en' },
  }),
}))
vi.mock('@tanstack/react-router', () => ({
  Link: (props: { to: string; children: ReactNode }) => (
    <a href={props.to}>{props.children}</a>
  ),
}))
vi.mock('../api', () => ({
  getProfitReport: vi.fn(),
  getProfitOverview: vi.fn(),
}))

const report: ProfitReport = {
  excluded_requests: 0,
  totals: {
    requests: 2,
    known_requests: 1,
    unknown_requests: 1,
    revenue: 1.5,
    known_revenue: 0.5,
    cost: 0.3,
    gross_profit: 0.2,
    margin: 40,
  },
  daily: [],
  channels: [],
  groups: [],
  records: [
    {
      request_id: 'unknown-fixture',
      created_at: 1800000000,
      username: 'operator-test',
      channel_id: 4,
      model: 'model-a',
      group: 'retail',
      status: 'missing_snapshot',
      revenue: 1,
      purchase_ratio: null,
      sale_ratio: null,
      cost: null,
      gross_profit: null,
    },
  ],
  page: 1,
  page_size: 20,
}

const period = {
  ...report.totals,
  excluded_requests: 0,
  requests: 1,
  unknown_requests: 0,
}
const overview: ProfitOverview = {
  today: period,
  yesterday: { ...period, gross_profit: -0.1, margin: -20 },
  month: { ...period, gross_profit: 2, cost: 3 },
  lifetime: { ...period, gross_profit: 20, cost: 30, unknown_requests: 2 },
  complete: true,
  processed_logs: 100,
  timezone: 'Asia/Shanghai',
  as_of: 1800000000,
}

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={client}>
      <ProfitPage />
    </QueryClientProvider>
  )
}

beforeEach(() => {
  vi.mocked(getProfitReport).mockResolvedValue(report)
  vi.mocked(getProfitOverview).mockResolvedValue(overview)
})
afterEach(() => {
  cleanup()
  vi.resetAllMocks()
  vi.restoreAllMocks()
})

describe('profit administrator report', () => {
  it('separates global and filtered totals and keeps accounting notes collapsed', async () => {
    renderPage()
    const filtered = await screen.findByRole('region', {
      name: 'Filtered results',
    })
    expect(
      within(filtered).getByText('Customer consumption')
    ).toBeInTheDocument()
    expect(
      screen.getByRole('region', { name: 'Profit overview' })
    ).toBeInTheDocument()
    expect(
      screen.queryByText(
        'Both sides must use the same model-price baseline. Recharge discounts, fees and separately billed failed retries are excluded. Unknown costs are excluded from gross profit.'
      )
    ).not.toBeInTheDocument()
    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: 'Statistics scope' }))
    expect(
      await screen.findByText(
        'Both sides must use the same model-price baseline. Recharge discounts, fees and separately billed failed retries are excluded. Unknown costs are excluded from gross profit.'
      )
    ).toBeVisible()
  })
  it('advances a rolling report to the current time when refreshed', async () => {
    let now = Date.UTC(2026, 9, 22, 10)
    vi.spyOn(Date, 'now').mockImplementation(() => now)
    renderPage()
    await screen.findByRole('region', { name: 'Filtered results' })
    now += 120000
    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: /^Refresh$/ }))
    await waitFor(() =>
      expect(getProfitReport).toHaveBeenLastCalledWith(
        expect.objectContaining({
          start_timestamp: now / 1000 - 7 * 86400,
          end_timestamp: now / 1000,
          page: 1,
        })
      )
    )
  })
  it('preserves custom report boundaries on refresh', async () => {
    let now = Date.UTC(2026, 9, 22, 10)
    vi.spyOn(Date, 'now').mockImplementation(() => now)
    renderPage()
    await screen.findByRole('region', { name: 'Filtered results' })
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Custom' }))
    await user.click(screen.getByRole('button', { name: /^Search$/ }))
    now += 120000
    await user.click(screen.getByRole('button', { name: /^Refresh$/ }))
    await waitFor(() =>
      expect(getProfitReport).toHaveBeenLastCalledWith(
        expect.objectContaining({ end_timestamp: (now - 120000) / 1000 })
      )
    )
  })
  it('supports a 30-day preset and clears filters with reset', async () => {
    renderPage()
    await screen.findByRole('region', { name: 'Filtered results' })
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Last 30 days' }))
    await user.type(screen.getByLabelText('Model'), 'model-a')
    await user.type(screen.getByLabelText('Group'), 'retail')
    await user.click(screen.getByRole('button', { name: /^Search$/ }))
    await waitFor(() => {
      const applied = vi.mocked(getProfitReport).mock.calls.at(-1)?.[0]
      if (!applied) throw new Error('Expected an applied profit filter')
      expect(applied.end_timestamp - applied.start_timestamp).toBe(30 * 86400)
      expect(applied.model).toBe('model-a')
    })
    await user.click(screen.getByRole('button', { name: 'Reset' }))
    await waitFor(() => {
      const applied = vi.mocked(getProfitReport).mock.calls.at(-1)?.[0]
      if (!applied) throw new Error('Expected reset profit filters')
      expect(applied.model).toBeUndefined()
      expect(applied.group).toBeUndefined()
      expect(applied.page).toBe(1)
    })
    expect(screen.getByLabelText('Model')).toHaveValue('')
  })
  it('hides stale filtered totals when a refresh fails', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(Date.UTC(2026, 9, 22, 10))
    renderPage()
    await screen.findByRole('region', { name: 'Filtered results' })
    vi.mocked(getProfitReport).mockRejectedValue(
      new Error('report unavailable')
    )
    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: /^Refresh$/ }))
    expect(await screen.findByText('report unavailable')).toBeInTheDocument()
    expect(
      screen.queryByRole('region', { name: 'Filtered results' })
    ).not.toBeInTheDocument()
  })
  it('uses zero for an empty report while keeping unknown costs unavailable', () => {
    const view = render(
      <ProfitFilteredSummary
        totals={{
          requests: 0,
          known_requests: 0,
          unknown_requests: 0,
          revenue: 0,
          known_revenue: 0,
          cost: 0,
          gross_profit: 0,
          margin: null,
        }}
        excluded={0}
      />
    )
    expect(
      screen.getByText('Estimated upstream cost').nextElementSibling
    ).toHaveTextContent('0')
    expect(
      screen.getByText('Estimated gross profit').nextElementSibling
    ).toHaveTextContent('0')
    view.rerender(
      <ProfitFilteredSummary
        totals={{ ...report.totals, known_requests: 0, unknown_requests: 2 }}
        excluded={0}
      />
    )
    expect(
      screen.getByText('Estimated upstream cost').nextElementSibling
    ).toHaveTextContent(/^-$/)
    expect(
      screen.getByText('Estimated gross profit').nextElementSibling
    ).toHaveTextContent(/^-$/)
  })
  it('highlights losses in grouped reports', () => {
    render(
      <ProfitBreakdowns
        label='Channel ID'
        rows={[{ ...report.totals, key: '4', gross_profit: -0.1, margin: -20 }]}
      />
    )
    expect(screen.getByText(/^-.*0\.1$/)).toHaveClass('text-destructive')
    expect(screen.getByText('-20%')).toHaveClass('text-destructive')
  })
  it('shows known-cost profit and never presents historical unknown costs as zero', async () => {
    renderPage()
    expect((await screen.findAllByText('40%')).length).toBeGreaterThan(0)
    const user = userEvent.setup()
    await user.click(screen.getByRole('tab', { name: 'Call details' }))
    expect(
      await screen.findByText('No historical cost snapshot')
    ).toBeInTheDocument()
    expect(screen.getByText('operator-test')).toBeInTheDocument()
  })
  it('applies model filters and resets the report to the first page', async () => {
    renderPage()
    await screen.findAllByText('40%')
    const user = userEvent.setup()
    await user.type(screen.getByLabelText('Model'), 'model-a')
    await user.click(screen.getByRole('button', { name: /^Search$/ }))
    await waitFor(() =>
      expect(getProfitReport).toHaveBeenLastCalledWith(
        expect.objectContaining({ model: 'model-a', page: 1 })
      )
    )
    expect(getProfitOverview).toHaveBeenCalledTimes(1)
  })
  it('offers retry after a failed report request', async () => {
    vi.mocked(getProfitReport).mockRejectedValue(
      new Error('report unavailable')
    )
    renderPage()
    expect(await screen.findByText('report unavailable')).toBeInTheDocument()
    vi.mocked(getProfitReport).mockResolvedValue(report)
    await userEvent.setup().click(screen.getByRole('button', { name: 'Retry' }))
    expect((await screen.findAllByText('40%')).length).toBeGreaterThan(0)
  })
  it('shows global period cards, including negative profit and unknown cost warnings', async () => {
    renderPage()
    const cards = await screen.findByRole('region', { name: 'Profit overview' })
    await waitFor(() =>
      expect(within(cards).getByText('All-time total')).toBeInTheDocument()
    )
    expect(within(cards).getByText('Yesterday')).toBeInTheDocument()
    expect(within(cards).getByText('Current month')).toBeInTheDocument()
    expect(within(cards).getByText(/Unknown-cost calls/)).toBeInTheDocument()
    const yesterday = within(cards).getByLabelText('Yesterday')
    await waitFor(() =>
      expect(within(yesterday).getByText(/^-.*0\.1$/)).toHaveClass(
        'text-destructive'
      )
    )
  })
  it('hides incomplete historical totals until the bounded aggregation finishes', async () => {
    vi.mocked(getProfitOverview).mockResolvedValue({
      ...overview,
      complete: false,
      processed_logs: 5000,
    })
    renderPage()
    expect(
      await screen.findByText(/Building historical totals/)
    ).toBeInTheDocument()
    const cards = screen.getByRole('region', { name: 'Profit overview' })
    expect(within(cards).queryByText(/\$20/)).not.toBeInTheDocument()
    expect(within(cards).getAllByText('-').length).toBeGreaterThan(0)
  })
  it('retries overview failures independently of the filtered report', async () => {
    vi.mocked(getProfitOverview).mockRejectedValue(
      new Error('overview unavailable')
    )
    renderPage()
    expect(await screen.findByText('overview unavailable')).toBeInTheDocument()
    vi.mocked(getProfitOverview).mockResolvedValue(overview)
    await userEvent.setup().click(screen.getByRole('button', { name: 'Retry' }))
    await waitFor(() =>
      expect(screen.queryByText('overview unavailable')).not.toBeInTheDocument()
    )
    expect(getProfitReport).toHaveBeenCalledTimes(1)
  })
})
