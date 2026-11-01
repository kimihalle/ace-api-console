import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, expect, it, vi } from 'vitest'

import { api } from '@/lib/api'

import { usePricingData } from '../hooks/use-pricing-data'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  localStorage.clear()
})

it('public pricing follows saved order, filters unavailable groups, and refreshes changed order', async () => {
  let order = ['vip', '10', '2', 'hidden', 'auto']
  vi.spyOn(api, 'get').mockImplementation(async (url) => ({
    data:
      url === '/api/status'
        ? { success: true, data: { system_name: 'Fixture' } }
        : {
            success: true,
            data: [],
            vendors: [],
            usable_group: {
              '2': 'two',
              '10': 'ten',
              default: 'Default',
              vip: 'VIP',
              auto: 'Auto',
            },
            group_ratio: { '2': 1, '10': 1, default: 1, vip: 0.5 },
            group_display_order: order,
          },
  }))
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const wrapper = (props: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{props.children}</QueryClientProvider>
  )
  const { result } = renderHook(() => usePricingData(), { wrapper })
  await waitFor(() =>
    expect(result.current.availableGroups).toEqual([
      'vip',
      '10',
      '2',
      'default',
    ])
  )
  order = ['default', '2', 'vip', '10']
  await client.invalidateQueries({ queryKey: ['pricing'] })
  await waitFor(() => expect(result.current.availableGroups).toEqual(order))
  client.clear()
})
