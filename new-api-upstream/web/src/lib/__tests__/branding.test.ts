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
import { afterEach, describe, expect, test } from 'vitest'

import { applyFaviconToDom } from '@/lib/dom-utils'
import { mapStatusDataToConfig } from '@/lib/status-query'

afterEach(() => {
  document
    .querySelectorAll('link[rel~="icon"]')
    .forEach((link) => link.remove())
})

describe('independent browser icon settings', () => {
  test('maps the browser icon separately from a custom logo', () => {
    expect(
      mapStatusDataToConfig({
        system_name: '25code',
        logo: '/wide.svg',
        favicon: '/tab.png',
      })
    ).toMatchObject({
      systemName: '25code',
      logo: '/wide.svg',
      favicon: '/tab.png',
      hasCustomLogo: true,
    })
  })

  test('does not reuse the logo when the favicon setting is empty', () => {
    expect(
      mapStatusDataToConfig({ logo: '/wide.svg', favicon: '' })
    ).toMatchObject({
      favicon: '/newapi-admin/favicon.ico',
      hasCustomLogo: true,
    })
    expect(mapStatusDataToConfig({ logo: '' })).toMatchObject({
      hasCustomLogo: false,
    })
  })

  test('replaces existing icon links and restores the default after clearing', () => {
    document.head.insertAdjacentHTML(
      'beforeend',
      '<link rel="shortcut icon" href="/old.ico" type="image/x-icon"><link rel="icon" href="/other.png" sizes="16x16">'
    )
    applyFaviconToDom('/tab.svg')
    expect(document.querySelectorAll('link[rel~="icon"]')).toHaveLength(1)
    expect(
      document.querySelector('link[rel="icon"]')?.getAttribute('href')
    ).toBe('/tab.svg')
    expect(
      document.querySelector('link[rel="icon"]')?.getAttribute('type')
    ).toBeNull()
    applyFaviconToDom('')
    expect(
      document.querySelector('link[rel="icon"]')?.getAttribute('href')
    ).toBe('/newapi-admin/favicon.ico')
  })
})
