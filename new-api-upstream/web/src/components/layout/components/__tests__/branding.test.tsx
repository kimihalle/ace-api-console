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
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
} from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import { SystemBrand } from '@/components/layout/components/system-brand'
import { useUpdateOption } from '@/features/system-settings/hooks/use-update-option'
import { useSystemConfig } from '@/hooks/use-system-config'
import { api } from '@/lib/api'
import { mapStatusDataToConfig, STATUS_QUERY_KEY } from '@/lib/status-query'
import { useSystemConfigStore } from '@/stores/system-config-store'

let queryClient: QueryClient

function wrapper({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
}

beforeEach(() => {
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  window.localStorage.clear()
  useSystemConfigStore.setState(useSystemConfigStore.getInitialState(), true)
  const status = {
    system_name: '25code',
    logo: '/wide.svg',
    favicon: '/tab.png',
  }
  queryClient.setQueryData(STATUS_QUERY_KEY, status)
  useSystemConfigStore.getState().setConfig(mapStatusDataToConfig(status))
})

afterEach(() => {
  cleanup()
  queryClient.clear()
  window.localStorage.clear()
  useSystemConfigStore.setState(useSystemConfigStore.getInitialState(), true)
  document
    .querySelectorAll('link[rel~="icon"]')
    .forEach((link) => link.remove())
  vi.restoreAllMocks()
})

describe('website branding', () => {
  test('custom logos have an accessible site name without duplicate visible text or cropping', () => {
    render(<SystemBrand variant='inline' />, { wrapper })
    const brand = screen.getByRole('link', { name: '25code' })
    expect(brand.textContent).toBe('')
    const logo = brand.querySelector('img')
    expect(logo).toHaveAttribute('src', '/wide.svg')
    expect(logo).toHaveClass('w-auto', 'object-contain')
    expect(logo).not.toHaveClass('rounded-full', 'object-cover')
  })

  test('empty logo settings show the website name', () => {
    useSystemConfigStore
      .getState()
      .setConfig(mapStatusDataToConfig({ system_name: '25code', logo: '' }))
    render(<SystemBrand variant='inline' />, { wrapper })
    expect(screen.getByRole('link', { name: '25code' })).toHaveTextContent(
      '25code'
    )
  })

  test('failed custom logos fall back to the default image and visible site name', () => {
    render(<SystemBrand variant='inline' />, { wrapper })
    const brand = screen.getByRole('link', { name: '25code' })
    const logo = brand.querySelector('img')
    if (!logo) throw new Error('Expected the custom brand image')
    fireEvent.error(logo)
    expect(brand).toHaveTextContent('25code')
    expect(brand.querySelector('img')).toHaveAttribute('src', '/logo.png')
  })

  test('changing settings updates the document title and independent icon without reloading', async () => {
    renderHook(() => useSystemConfig({ autoLoad: true }), { wrapper })
    expect(document.title).toBe('25code')
    expect(document.querySelector('link[rel="icon"]')).toHaveAttribute(
      'href',
      '/tab.png'
    )
    act(() =>
      useSystemConfigStore.getState().setConfig({
        systemName: 'ACE',
        favicon: '/ace.svg',
        logo: '/another-logo.svg',
      })
    )
    expect(document.title).toBe('ACE')
    expect(document.querySelector('link[rel="icon"]')).toHaveAttribute(
      'href',
      '/ace.svg'
    )
    act(() => useSystemConfigStore.getState().setConfig({ favicon: '' }))
    expect(document.querySelector('link[rel="icon"]')).toHaveAttribute(
      'href',
      '/newapi-admin/favicon.ico'
    )
  })

  test('a previously failed logo is retried after changing settings and hides the fallback name once loaded', () => {
    render(<SystemBrand variant='inline' />, { wrapper })
    const brand = screen.getByRole('link', { name: '25code' })
    const failed = brand.querySelector('img')
    if (!failed) throw new Error('Expected the custom brand image')
    fireEvent.error(failed)
    act(() =>
      useSystemConfigStore.getState().setConfig({ logo: '/alternate.svg' })
    )
    act(() => useSystemConfigStore.getState().setConfig({ logo: '/wide.svg' }))
    const retried = brand.querySelector('img')
    if (!retried) throw new Error('Expected the retried brand image')
    expect(retried).toHaveAttribute('src', '/wide.svg')
    fireEvent.load(retried)
    expect(brand.textContent).toBe('')
  })

  test('saving a branding option refreshes public status and updates branding immediately', async () => {
    vi.spyOn(api, 'put').mockResolvedValue({ data: { success: true } })
    vi.spyOn(api, 'get').mockResolvedValue({
      data: {
        success: true,
        data: {
          system_name: 'Updated',
          logo: '/wide.svg',
          favicon: '/new.ico',
        },
      },
    })
    const { result } = renderHook(
      () => {
        useSystemConfig({ autoLoad: true })
        return useUpdateOption()
      },
      { wrapper }
    )
    render(<SystemBrand variant='inline' />, { wrapper })
    await act(async () => {
      await result.current.mutateAsync({ key: 'Favicon', value: '/new.ico' })
    })
    await waitFor(() => expect(document.title).toBe('Updated'))
    expect(document.querySelector('link[rel="icon"]')).toHaveAttribute(
      'href',
      '/new.ico'
    )
    expect(screen.getByRole('link', { name: 'Updated' }).textContent).toBe('')
  })
})
