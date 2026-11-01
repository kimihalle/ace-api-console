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
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { getChannels } from '@/features/channels/api'
import { channelSchema } from '@/features/channels/types'
import { useSystemOptions } from '@/features/system-settings/hooks/use-system-options'

import { ResellerPricingPanel } from '../reseller-pricing-panel'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en', resolvedLanguage: 'en' },
  }),
}))
vi.mock('@/features/channels/api', () => ({ getChannels: vi.fn() }))
vi.mock(
  '@/features/system-settings/hooks/use-system-options',
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import('@/features/system-settings/hooks/use-system-options')
      >()
    return { ...actual, useSystemOptions: vi.fn() }
  }
)

const systemOptions = [
  { key: 'GroupRatio', value: '{"default":0.5}' },
  { key: 'GroupGroupRatio', value: '{}' },
  { key: 'UserUsableGroups', value: '{"default":"Default"}' },
  { key: 'GroupDisplayOrder', value: '["default"]' },
  {
    key: 'group_ratio_setting.group_special_usable_group',
    value: '{}',
  },
  { key: 'QuotaPerUnit', value: '500000' },
  { key: 'USDExchangeRate', value: '7' },
]

function channel(id: number, name: string, ratio: number) {
  return channelSchema.parse({
    id,
    type: 1,
    key: '',
    name,
    status: 1,
    created_time: 0,
    test_time: 0,
    response_time: 0,
    balance_updated_time: 0,
    group: 'default',
    models: 'model-a',
    setting: JSON.stringify({ upstream_cost_ratio: ratio }),
  })
}

function renderPanel() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={client}>
      <ResellerPricingPanel />
    </QueryClientProvider>
  )
}

beforeEach(() => {
  vi.mocked(useSystemOptions).mockReturnValue({
    data: { data: systemOptions },
    isPending: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
  } as unknown as ReturnType<typeof useSystemOptions>)
  vi.mocked(getChannels).mockResolvedValue({
    success: true,
    data: {
      items: [channel(1, 'Primary supplier', 0.4)],
      total: 1,
      page: 1,
      page_size: 100,
    },
  })
})

afterEach(() => {
  cleanup()
  vi.resetAllMocks()
})

describe('reseller pricing panel', () => {
  it('uses live group and channel ratios to quote the eight code values', async () => {
    renderPanel()
    const rows = await screen.findAllByRole('row')
    expect(rows).toHaveLength(11)
    expect(screen.getByText('Primary supplier')).toBeInTheDocument()
    expect(screen.getByText('0.5x')).toBeInTheDocument()
    expect(screen.getByText('0.8x')).toBeInTheDocument()
    expect(screen.getAllByText(/CN¥10\.00/).length).toBeGreaterThan(0)

    const user = userEvent.setup()
    await user.clear(screen.getByLabelText('Agent price discount'))
    await user.type(screen.getByLabelText('Agent price discount'), '70')

    const tenYuanRow = rows.find((row) =>
      row.querySelector('td')?.textContent?.includes('CN¥10.00')
    )
    expect(tenYuanRow).toBeDefined()
    await waitFor(() => {
      expect(tenYuanRow).toHaveTextContent('-CN¥1.00')
    })
  })

  it('loads every page of enabled channels for its cost basis', async () => {
    vi.mocked(getChannels)
      .mockResolvedValueOnce({
        success: true,
        data: {
          items: Array.from({ length: 100 }, (_, index) =>
            channel(index + 1, `supplier-${index + 1}`, 0.4)
          ),
          total: 101,
          page: 1,
          page_size: 100,
        },
      })
      .mockResolvedValueOnce({
        success: true,
        data: {
          items: [channel(101, 'last supplier', 0.9)],
          total: 101,
          page: 2,
          page_size: 100,
        },
      })

    renderPanel()
    expect(await screen.findByText('last supplier')).toBeInTheDocument()
    await waitFor(() =>
      expect(getChannels).toHaveBeenCalledWith({
        p: 2,
        page_size: 100,
        status: 'enabled',
      })
    )
    expect(screen.getAllByText('0.9x').length).toBeGreaterThan(0)
  })
})
