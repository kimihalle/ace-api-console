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
import { renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { useSidebarView } from '../use-sidebar-view'

const state = vi.hoisted(() => ({ role: 100 }))
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))
vi.mock('@tanstack/react-router', () => ({ useLocation: () => '/users' }))
vi.mock('@/stores/auth-store', () => ({
  useAuthStore: (selector: (value: unknown) => unknown) =>
    selector({ auth: { user: { role: state.role } } }),
}))
vi.mock('../use-sidebar-config', () => ({
  useSidebarConfig: (groups: unknown) => groups,
}))
vi.mock('../use-sidebar-data', () => ({
  useSidebarData: () => ({
    navGroups: [
      {
        id: 'chat',
        title: 'Chat',
        items: [{ title: 'Chat', url: '/playground' }],
      },
      {
        id: 'general',
        title: 'General',
        items: [{ title: 'Keys', url: '/keys' }],
      },
      {
        id: 'personal',
        title: 'Personal',
        items: [{ title: 'Wallet', url: '/wallet' }],
      },
      {
        id: 'admin',
        title: 'Admin',
        items: [
          { title: 'Users', url: '/users' },
          {
            title: 'Settings',
            url: '/system-settings/site',
            requiredRole: 100,
          },
        ],
      },
    ],
  }),
}))
vi.mock('@/components/layout/lib/sidebar-view-registry', () => ({
  resolveSidebarView: () => null,
}))

afterEach(() => {
  state.role = 100
})
describe('dedicated administrator sidebar', () => {
  it('hides chat, general and personal sections but keeps administrator tools', () => {
    const { result } = renderHook(() => useSidebarView())
    expect(result.current.navGroups.map((group) => group.id)).toEqual(['admin'])
    expect(result.current.navGroups[0].items.map((item) => item.title)).toEqual(
      ['Users', 'Settings']
    )
  })
  it('does not expose root-only settings to an ordinary administrator', () => {
    state.role = 10
    const { result } = renderHook(() => useSidebarView())
    expect(result.current.navGroups[0].items.map((item) => item.title)).toEqual(
      ['Users']
    )
  })
  it('keeps existing customer navigation available outside the administrator role', () => {
    state.role = 1
    const { result } = renderHook(() => useSidebarView())
    expect(result.current.navGroups.map((group) => group.id)).toEqual([
      'chat',
      'general',
      'personal',
    ])
  })
})
