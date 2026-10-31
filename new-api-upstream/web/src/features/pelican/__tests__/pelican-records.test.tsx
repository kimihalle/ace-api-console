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
import { toast } from 'sonner'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { batchDeletePelicanSamples, getPelicanSamples } from '../pelican-api'
import { PelicanSamplesManager } from '../pelican-samples-manager'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, values: Record<string, unknown> = {}) =>
      key.replaceAll(/\{\{(\w+)\}\}/g, (_match, name: string) =>
        String(values[name] ?? name)
      ),
  }),
}))
vi.mock('../pelican-api', () => ({
  getPelicanSamples: vi.fn(),
  getPelicanAdminDocument: vi.fn(),
  deletePelicanSample: vi.fn(),
  batchDeletePelicanSamples: vi.fn(),
}))

const records = [
  { id: 9, status: 'success', model: 'model-a' },
  { id: 8, status: 'failed', model: 'model-b' },
  { id: 7, status: 'running', model: 'model-c' },
].map((record) => ({
  hour: 3600,
  checked_at: 3600,
  group: 'vip',
  latency_ms: 20,
  error_code: '',
  prompt_version: 'pelican-html-v1',
  ...record,
}))

let availableRecords = [...records]

function mount() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(
    <QueryClientProvider client={client}>
      <PelicanSamplesManager />
    </QueryClientProvider>
  )
}

beforeEach(() => {
  availableRecords = [...records]
  vi.mocked(batchDeletePelicanSamples)
    .mockReset()
    .mockImplementation(async (ids) => {
      availableRecords = availableRecords.filter(
        (record) => !ids.includes(record.id)
      )
      return { deleted: ids.length }
    })
  vi.mocked(getPelicanSamples)
    .mockReset()
    .mockImplementation(async (params = {}) => ({
      records: params.before
        ? [{ ...records[1], id: 6, model: 'older-model' }]
        : availableRecords.filter(
            (record) =>
              !params.status ||
              params.status === 'all' ||
              record.status === params.status
          ),
      next_before: params.before ? 0 : 7,
    }))
})
afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('pelican record filters and selection', () => {
  it('requests the selected status from the server and clears the previous selection', async () => {
    mount()
    const user = userEvent.setup()
    await user.click(
      await screen.findByRole('checkbox', { name: 'Select record 9' })
    )
    expect(screen.getByText('1 records selected')).toBeVisible()
    await user.click(screen.getByRole('tab', { name: 'Failed' }))
    await waitFor(() =>
      expect(getPelicanSamples).toHaveBeenLastCalledWith(
        expect.objectContaining({ status: 'failed' })
      )
    )
    expect(await screen.findByText('model-b')).toBeVisible()
    expect(screen.queryByText('model-a')).not.toBeInTheDocument()
    expect(screen.getByText('0 records selected')).toBeVisible()
    await user.click(screen.getByRole('tab', { name: 'Success' }))
    expect(await screen.findByText('model-a')).toBeVisible()
    expect(getPelicanSamples).toHaveBeenLastCalledWith(
      expect.objectContaining({ status: 'success', before: undefined })
    )
  })

  it('selects loaded finished records and exposes partial selection after unchecking one row', async () => {
    mount()
    const user = userEvent.setup()
    const all = await screen.findByRole('checkbox', {
      name: 'Select all loaded records',
    })
    await user.click(all)
    expect(screen.getByText('2 records selected')).toBeVisible()
    expect(
      screen.getByRole('checkbox', { name: 'Select record 7' })
    ).toHaveAttribute('aria-disabled', 'true')
    expect(all).toHaveAttribute('aria-checked', 'true')
    await user.click(screen.getByRole('checkbox', { name: 'Select record 9' }))
    expect(all).toHaveAttribute('aria-checked', 'mixed')
    await user.click(screen.getByRole('button', { name: 'Clear selection' }))
    expect(screen.getByText('0 records selected')).toBeVisible()
    expect(all).toHaveAttribute('aria-checked', 'false')
  })

  it('keeps new pages unselected until the user explicitly selects all loaded records again', async () => {
    mount()
    const user = userEvent.setup()
    const all = await screen.findByRole('checkbox', {
      name: 'Select all loaded records',
    })
    await user.click(all)
    await user.click(
      screen.getByRole('button', { name: 'Load earlier records' })
    )
    expect(await screen.findByText('older-model')).toBeVisible()
    expect(
      screen.getByRole('checkbox', { name: 'Select record 6' })
    ).toHaveAttribute('aria-checked', 'false')
    expect(all).toHaveAttribute('aria-checked', 'mixed')
    await user.click(all)
    expect(screen.getByText('3 records selected')).toBeVisible()
  })

  it('clears selected records when group and model filters are applied', async () => {
    mount()
    const user = userEvent.setup()
    await user.click(
      await screen.findByRole('checkbox', { name: 'Select record 9' })
    )
    await user.type(
      screen.getByRole('textbox', { name: 'Filter by group' }),
      'vip'
    )
    await user.type(
      screen.getByRole('textbox', { name: 'Filter by model' }),
      'model-a'
    )
    await user.click(screen.getByRole('button', { name: 'Apply filters' }))
    await waitFor(() =>
      expect(getPelicanSamples).toHaveBeenLastCalledWith(
        expect.objectContaining({ group: 'vip', model: 'model-a' })
      )
    )
    expect(screen.getByText('0 records selected')).toBeVisible()
  })

  it('deletes only selected records after confirmation and refreshes the list', async () => {
    mount()
    const user = userEvent.setup()
    await user.click(
      await screen.findByRole('checkbox', { name: 'Select record 8' })
    )
    await user.click(screen.getByRole('button', { name: 'Delete selected' }))
    const dialog = await screen.findByRole('alertdialog')
    expect(within(dialog).getByText(/1 selected records/)).toBeVisible()
    expect(batchDeletePelicanSamples).not.toHaveBeenCalled()
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }))
    await waitFor(() =>
      expect(batchDeletePelicanSamples).toHaveBeenCalledWith(
        [8],
        expect.anything()
      )
    )
    await waitFor(() =>
      expect(screen.queryByText('model-b')).not.toBeInTheDocument()
    )
    expect(screen.getByText('model-a')).toBeVisible()
    expect(screen.getByText('0 records selected')).toBeVisible()
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })

  it('keeps records and selection when the delete confirmation is cancelled', async () => {
    mount()
    const user = userEvent.setup()
    await user.click(
      await screen.findByRole('checkbox', { name: 'Select all loaded records' })
    )
    await user.click(screen.getByRole('button', { name: 'Delete selected' }))
    const dialog = await screen.findByRole('alertdialog')
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    await waitFor(() =>
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    )
    expect(batchDeletePelicanSamples).not.toHaveBeenCalled()
    expect(screen.getByText('2 records selected')).toBeVisible()
    expect(screen.getByText('model-a')).toBeVisible()
    expect(screen.getByText('model-b')).toBeVisible()
  })

  it('keeps the selection and allows retry when batch deletion fails', async () => {
    vi.mocked(batchDeletePelicanSamples).mockRejectedValueOnce(
      new Error('Deletion temporarily unavailable')
    )
    const errorToast = vi.spyOn(toast, 'error')
    mount()
    const user = userEvent.setup()
    await user.click(
      await screen.findByRole('checkbox', { name: 'Select record 8' })
    )
    await user.click(screen.getByRole('button', { name: 'Delete selected' }))
    const dialog = await screen.findByRole('alertdialog')
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }))
    await waitFor(() => expect(errorToast).toHaveBeenCalled())
    expect(screen.getByText('1 records selected')).toBeVisible()
    expect(screen.getByText('model-b')).toBeVisible()
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }))
    await waitFor(() =>
      expect(screen.queryByText('model-b')).not.toBeInTheDocument()
    )
  })
})
