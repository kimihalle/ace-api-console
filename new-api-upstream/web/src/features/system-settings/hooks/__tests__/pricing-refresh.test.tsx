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

it('saving the current notice refreshes its query and notifies other tabs', async () => {
  vi.spyOn(api, 'put').mockResolvedValue({ data: { success: true } })
  const client = new QueryClient()
  client.setQueryData(['notice'], { success: true, data: 'Old notice' })
  const wrapper = (props: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{props.children}</QueryClientProvider>
  )
  const { result } = renderHook(() => useUpdateOption(), { wrapper })
  const notify = vi.fn()
  window.addEventListener('ace-notice-updated', notify)

  try {
    await act(() =>
      result.current.mutateAsync({ key: 'Notice', value: 'New notice' })
    )

    expect(client.getQueryState(['notice'])?.isInvalidated).toBe(true)
    expect(localStorage.getItem('ace-notice-updated')).not.toBeNull()
    expect(notify).toHaveBeenCalledOnce()
  } finally {
    window.removeEventListener('ace-notice-updated', notify)
    client.clear()
  }
})

it.each([
  'console_setting.announcements',
  'console_setting.announcements_enabled',
])(
  'saving %s invalidates the cached status used by public announcements',
  async (key) => {
    vi.spyOn(api, 'put').mockResolvedValue({ data: { success: true } })
    const client = new QueryClient()
    client.setQueryData(['status'], {
      announcements_enabled: false,
      announcements: [],
    })
    localStorage.setItem('status', JSON.stringify({ announcements: [] }))
    const wrapper = (props: { children: ReactNode }) => (
      <QueryClientProvider client={client}>
        {props.children}
      </QueryClientProvider>
    )
    const { result } = renderHook(() => useUpdateOption(), { wrapper })

    try {
      const value = key.endsWith('_enabled')
        ? 'true'
        : '[{"content":"Service update","publishDate":"2026-11-07T00:00:00Z","type":"default"}]'
      await act(() => result.current.mutateAsync({ key, value }))

      expect(client.getQueryState(['status'])?.isInvalidated).toBe(true)
      expect(localStorage.getItem('status')).toBeNull()
      expect(localStorage.getItem('ace-status-updated')).not.toBeNull()
    } finally {
      client.clear()
    }
  }
)
