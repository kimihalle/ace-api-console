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
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { SettingsPageProvider } from '@/features/system-settings/components/settings-page-context'

import { pelicanPreviewDocument } from '../lib/pelican-preview'
import {
  getPelicanSettings,
  savePelicanSettings,
  getPelicanSamples,
  getPelicanAdminDocument,
} from '../pelican-api'
import { PelicanSamplesManager } from '../pelican-samples-manager'
import { PelicanSettingsCard } from '../pelican-settings-card'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))
vi.mock('../pelican-api', () => ({
  getPelicanSettings: vi.fn(),
  savePelicanSettings: vi.fn(),
  runPelicanSamples: vi.fn(),
  getPelicanSamples: vi.fn(),
  getPelicanAdminDocument: vi.fn(),
  deletePelicanSample: vi.fn(),
  batchDeletePelicanSamples: vi.fn(),
}))

function TestPage() {
  const [container, setContainer] = useState<HTMLDivElement | null>(null)
  return (
    <>
      <div ref={setContainer} />
      <SettingsPageProvider actionsContainer={container}>
        <PelicanSettingsCard />
      </SettingsPageProvider>
    </>
  )
}

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(
    <QueryClientProvider client={client}>
      <TestPage />
    </QueryClientProvider>
  )
}

beforeEach(() => {
  vi.mocked(getPelicanSettings).mockResolvedValue({
    config: {
      enabled: false,
      public_enabled: true,
      retention_days: 7,
      targets: [],
    },
    available: { default: ['model-a'], vip: ['model-b'] },
    prompt: 'fixed prompt',
    prompt_version: 'v1',
    interval_seconds: 3600,
  })
  vi.mocked(savePelicanSettings).mockImplementation(async (config) => config)
})
afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('pelican administrator settings', () => {
  it('saves an enabled model in a different group and disables unsaved manual runs', async () => {
    renderPage()
    const user = userEvent.setup()
    const checkbox = await screen.findByText('model-b')
    expect(
      screen.getByRole('button', { name: 'Run current hour now' })
    ).toBeDisabled()
    await user.click(checkbox)
    await user.click(
      screen.getByRole('switch', { name: 'Enable hourly pelican sampling' })
    )
    await user.click(screen.getByRole('button', { name: 'Save Changes' }))
    await waitFor(() =>
      expect(savePelicanSettings).toHaveBeenCalledWith(
        {
          enabled: true,
          public_enabled: true,
          retention_days: 7,
          targets: [{ group: 'vip', models: ['model-b'] }],
        },
        expect.anything()
      )
    )
  })

  it('blocks enabling with no selected model and exposes validation to the user', async () => {
    renderPage()
    const user = userEvent.setup()
    await screen.findByText('model-a')
    await user.click(
      screen.getByRole('switch', { name: 'Enable hourly pelican sampling' })
    )
    await user.click(screen.getByRole('button', { name: 'Save Changes' }))
    expect(
      await screen.findByText(
        'Choose between 1 and 20 pelican group/model pairs'
      )
    ).toBeVisible()
    expect(savePelicanSettings).not.toHaveBeenCalled()
  })

  it('saves the user workspace visibility setting independently of sampling', async () => {
    renderPage()
    const user = userEvent.setup()
    await screen.findByText('model-a')
    await user.click(
      screen.getByRole('switch', {
        name: 'Show Pelican test in user workspace',
      })
    )
    await user.click(screen.getByRole('button', { name: 'Save Changes' }))
    await waitFor(() =>
      expect(savePelicanSettings).toHaveBeenCalledWith(
        {
          enabled: false,
          public_enabled: false,
          retention_days: 7,
          targets: [],
        },
        expect.anything()
      )
    )
  })

  it('shows retry after a failed fetch instead of a blank settings form', async () => {
    vi.mocked(getPelicanSettings).mockRejectedValueOnce(new Error('offline'))
    renderPage()
    expect(await screen.findByRole('button', { name: 'Retry' })).toBeVisible()
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(await screen.findByText('model-b')).toBeVisible()
  })
})

describe('pelican animated previews', () => {
  const source =
    '<html><head></head><body><script>requestAnimationFrame(() => {})</script><div>model-authored animation</div></body></html>'
  function renderSamples() {
    vi.mocked(getPelicanSamples).mockResolvedValue({
      records: [
        {
          id: 7,
          hour: 3600,
          checked_at: 3600,
          group: 'vip',
          model: 'test-model',
          latency_ms: 12,
          status: 'success',
          error_code: '',
          prompt_version: 'pelican-html-v1',
        },
      ],
      next_before: 0,
    })
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    render(
      <QueryClientProvider client={client}>
        <PelicanSamplesManager />
      </QueryClientProvider>
    )
  }

  it('shows actual source in an opaque iframe and replays without another upstream request', async () => {
    vi.mocked(getPelicanAdminDocument).mockResolvedValue({
      format: 'html',
      source,
    })
    renderSamples()
    const user = userEvent.setup()
    await user.click(
      await screen.findByRole('button', { name: 'Preview card' })
    )
    const frame = await screen.findByTitle('test-model Pelican test')
    expect(frame).toHaveAttribute('sandbox', 'allow-scripts')
    expect(frame).toHaveAttribute('referrerpolicy', 'no-referrer')
    expect(frame.getAttribute('srcdoc')).toContain(source)
    expect(frame.getAttribute('srcdoc')).toContain("connect-src 'none'")
    expect(
      screen.queryByText('model-authored animation')
    ).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Replay' }))
    expect(screen.getByTitle('test-model Pelican test')).not.toBe(frame)
    expect(getPelicanAdminDocument).toHaveBeenCalledTimes(1)
    await user.click(screen.getByText('Source code'))
    expect(screen.getByText(source)).toBeVisible()
  })

  it('shows a retry when preview loading fails', async () => {
    vi.mocked(getPelicanAdminDocument)
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce({ format: 'svg', source: '<svg></svg>' })
    renderSamples()
    const user = userEvent.setup()
    await user.click(
      await screen.findByRole('button', { name: 'Preview card' })
    )
    expect(await screen.findByText('Unable to load preview')).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Retry' }))
    expect(await screen.findByText('Legacy SVG')).toBeVisible()
  })

  it('rejects oversized previews before placing source in the iframe', () => {
    expect(() => pelicanPreviewDocument('x'.repeat(1048577))).toThrow()
  })
})
