import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, expect, it, vi } from 'vitest'

import { api } from '@/lib/api'

import { useUpdateOption } from '../use-update-option'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  localStorage.clear()
})

it('saving a public brand field notifies the site to refresh its cached header and title', async () => {
  vi.spyOn(api, 'put').mockResolvedValue({ data: { success: true } })
  const client = new QueryClient()
  const wrapper = (props: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{props.children}</QueryClientProvider>
  )
  const { result } = renderHook(() => useUpdateOption(), { wrapper })
  const notify = vi.fn()
  window.addEventListener('ace-branding-updated', notify)
  try {
    await act(() =>
      result.current.mutateAsync({ key: 'SystemName', value: 'ACE Preview' })
    )
    expect(localStorage.getItem('ace-branding-updated')).not.toBeNull()
    expect(notify).toHaveBeenCalledOnce()
  } finally {
    window.removeEventListener('ace-branding-updated', notify)
    client.clear()
  }
})

it('saving group order invalidates public pricing and notifies other console tabs only after success', async () => {
  vi.spyOn(api, 'put').mockResolvedValue({ data: { success: true } })
  const client = new QueryClient()
  client.setQueryData(['pricing'], { group_display_order: ['default', 'vip'] })
  const wrapper = (props: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{props.children}</QueryClientProvider>
  )
  const { result } = renderHook(() => useUpdateOption(), { wrapper })
  const notify = vi.fn()
  window.addEventListener('ace-pricing-updated', notify)
  try {
    await act(() =>
      result.current.mutateAsync({
        key: 'GroupDisplayOrder',
        value: '["vip","default"]',
      })
    )
    expect(client.getQueryState(['pricing'])?.isInvalidated).toBe(true)
    expect(localStorage.getItem('ace-pricing-updated')).not.toBeNull()
    expect(notify).toHaveBeenCalledOnce()
    vi.mocked(api.put).mockResolvedValue({
      data: { success: false, message: 'Database unavailable' },
    })
    await act(async () => {
      await expect(
        result.current.mutateAsync({ key: 'GroupDisplayOrder', value: '[]' })
      ).rejects.toThrow()
    })
    expect(notify).toHaveBeenCalledOnce()
  } finally {
    window.removeEventListener('ace-pricing-updated', notify)
    client.clear()
  }
})
