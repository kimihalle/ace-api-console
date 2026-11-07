/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { expect, test, vi } from 'vitest'

import { NoticeSection } from '../notice-section'

vi.mock('@tanstack/react-router', () => ({
  Link: (props: {
    to: string
    params: Record<string, string>
    className?: string
    children: ReactNode
  }) => (
    <a
      className={props.className}
      href={props.to.replace('$section', props.params.section)}
    >
      {props.children}
    </a>
  ),
}))

test('the single notice explains overwrite behavior and links to announcement history', () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })

  render(
    <QueryClientProvider client={queryClient}>
      <NoticeSection defaultValue='Current notice' />
    </QueryClientProvider>
  )

  expect(
    screen.getByText(
      'This field shows one current notice. Saving new content replaces it and does not keep a history.'
    )
  ).toBeVisible()
  expect(
    screen.getByRole('link', { name: 'Manage announcement history' })
  ).toHaveAttribute('href', '/system-settings/content/announcements')
})
