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
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { getUserQuotaDates } from '@/features/dashboard/api'
import dayjs from '@/lib/dayjs'

import { ModelUsageRanking } from '../model-usage-ranking'

const scope = vi.hoisted(() => ({ admin: true }))
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en', resolvedLanguage: 'en' },
  }),
}))
vi.mock('@/features/dashboard/api', () => ({ getUserQuotaDates: vi.fn() }))
vi.mock('@/stores/auth-store', () => ({
  useAuthStore: (selector: (state: unknown) => unknown) =>
    selector({ auth: { user: { id: 1 } } }),
}))
vi.mock('@/stores/system-config-store', () => ({
  useSystemConfigStore: (selector: (state: unknown) => unknown) =>
    selector({ config: { currency: {} } }),
}))
vi.mock('@/lib/format', () => ({
  formatLogQuota: (value: number) => `quota:${value}`,
  formatNumber: (value: number) => String(value),
}))
vi.mock('@/lib/status-query', () => ({
  statusQueryOptions: {
    queryKey: ['status'],
    queryFn: async () => ({ enable_data_export: true }),
  },
}))
vi.mock('../usage-logs-provider', () => ({
  useLogsViewScope: () => ({
    isAdminView: scope.admin,
    viewAccess: scope.admin ? 'root' : 'self',
  }),
}))

function mount() {
  const inspect = vi.fn()
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  render(
    <QueryClientProvider client={client}>
      <ModelUsageRanking onInspect={inspect} />
    </QueryClientProvider>
  )
  return { inspect }
}
beforeEach(() => {
  scope.admin = true
  vi.mocked(getUserQuotaDates)
    .mockReset()
    .mockResolvedValue({
      success: true,
      data: [
        {
          model_name: 'expensive-model',
          created_at: 1,
          quota: 1000,
          count: 1,
          token_used: 10,
        },
        {
          model_name: 'busy-model',
          created_at: 1,
          quota: 100,
          count: 10,
          token_used: 1000,
        },
      ],
    })
})
afterEach(cleanup)
describe('model usage ranking view', () => {
  it('displays the same initial period that is used to query model totals', async () => {
    mount()
    await screen.findByText('expensive-model')
    const request = vi.mocked(getUserQuotaDates).mock.calls[0]
    if (!request) throw new Error('Expected an aggregate usage request')
    const [range] = request
    const start = dayjs
      .unix(range.start_timestamp)
      .format('YYYY-MM-DD HH:mm:ss')
    const end = dayjs.unix(range.end_timestamp).format('YYYY-MM-DD HH:mm:ss')
    expect(
      screen.getByRole('button', { name: `${start} ~ ${end}` })
    ).toBeTruthy()
  })
  it('sorts the full model totals and drills into the selected model and period', async () => {
    const { inspect } = mount()
    await screen.findByText('expensive-model')
    const user = userEvent.setup()
    const table = screen.getByRole('table')
    expect(within(table).getAllByRole('row')[1].textContent).toContain(
      'expensive-model'
    )
    await user.click(screen.getByRole('tab', { name: 'Requests' }))
    expect(within(table).getAllByRole('row')[1].textContent).toContain(
      'busy-model'
    )
    await user.click(
      within(within(table).getAllByRole('row')[1]).getByRole('button', {
        name: 'View request logs',
      })
    )
    expect(inspect).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'busy-model' }),
      expect.objectContaining({
        start: expect.any(Number),
        end: expect.any(Number),
      })
    )
  })
  it('uses the self aggregate endpoint and hides username filtering in only-mine scope', async () => {
    scope.admin = false
    mount()
    await screen.findByText('expensive-model')
    expect(screen.queryByRole('textbox', { name: 'Username' })).toBeNull()
    expect(getUserQuotaDates).toHaveBeenCalledWith(
      expect.not.objectContaining({ username: expect.anything() }),
      false
    )
  })
  it('shows an error without old totals and recovers when retry succeeds', async () => {
    vi.mocked(getUserQuotaDates).mockRejectedValueOnce(new Error('offline'))
    mount()
    await screen.findByText('Failed to load model usage')
    expect(screen.queryByText('Recorded spending')).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }))
    await screen.findByText('expensive-model')
  })
  it('renders an empty state when no aggregate records exist', async () => {
    vi.mocked(getUserQuotaDates).mockResolvedValue({ success: true, data: [] })
    mount()
    await waitFor(() =>
      expect(
        screen.getByText('No aggregated usage in this period')
      ).toBeTruthy()
    )
    expect(screen.queryByRole('table')).toBeNull()
  })
})
