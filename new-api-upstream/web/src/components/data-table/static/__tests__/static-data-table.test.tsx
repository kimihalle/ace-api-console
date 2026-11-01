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
import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { StaticDataTable } from '../static-data-table'

const columns = [
  { id: 'name', header: 'Group', cell: (row: { name: string }) => row.name },
]

describe('static table rendering slots', () => {
  it('keeps default cells and renders a custom table body and row', () => {
    render(
      <StaticDataTable
        data={[{ name: 'vip' }]}
        columns={columns}
        renderBody={(rows) => <tbody data-testid='sortable-body'>{rows}</tbody>}
        renderRow={(_row, _index, cells) => (
          <tr data-testid='sortable-row'>{cells}</tr>
        )}
      />
    )
    const body = screen.getByTestId('sortable-body')
    expect(within(body).getByTestId('sortable-row')).toBeVisible()
    expect(within(body).getByRole('cell')).toHaveTextContent('vip')
  })

  it('preserves legacy custom rows and native empty states', () => {
    const view = render(
      <StaticDataTable
        data={[{ name: 'vip' }]}
        columns={columns}
        renderRow={(row) => (
          <tr>
            <td>Custom {row.name}</td>
          </tr>
        )}
      />
    )
    expect(screen.getByRole('cell')).toHaveTextContent('Custom vip')
    view.rerender(
      <StaticDataTable
        data={[]}
        columns={columns}
        emptyContent='No groups'
        renderBody={(rows) => <tbody data-testid='sortable-body'>{rows}</tbody>}
      />
    )
    expect(screen.getByRole('cell')).toHaveTextContent('No groups')
    expect(screen.queryByTestId('sortable-body')).not.toBeInTheDocument()
  })
})
