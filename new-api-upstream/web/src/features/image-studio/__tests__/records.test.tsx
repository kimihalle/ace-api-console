import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import { getAllLogs } from '@/features/usage-logs/api'
import type { UsageLog } from '@/features/usage-logs/data/schema'
import { api } from '@/lib/http-client'

import { ImageStudioLogs } from '..'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))
vi.mock('@/features/usage-logs/api', () => ({ getAllLogs: vi.fn() }))
vi.mock('@/lib/http-client', () => ({ api: { get: vi.fn() } }))

const log = {
  id: 1,
  user_id: 7,
  username: 'customer',
  token_name: 'art-key',
  model_name: 'image-model',
  group: 'retail',
  created_at: 1800000000,
  type: 2,
  quota: 100,
  use_time: 8,
  channel: 3,
  channel_name: 'main',
  request_id: 'req-image-1',
  other: JSON.stringify({
    admin_info: {
      image_studio: true,
      image_studio_prompt: 'a red tree',
      image_studio_count: 2,
    },
  }),
} as UsageLog

beforeEach(() => {
  vi.mocked(getAllLogs).mockResolvedValue({
    success: true,
    data: { items: [log], total: 1, page: 1, page_size: 20 },
  })
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

beforeEach(() => {
  vi.mocked(api.get).mockResolvedValue({
    data: new Blob([JSON.stringify({ success: true, data: { source: 'https://images.example.test/result.png' } })], {
      type: 'application/json',
    }),
  } as never)
})

it('loads only marked image requests and opens the selected record details', async () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  render(
    <QueryClientProvider client={client}>
      <ImageStudioLogs />
    </QueryClientProvider>
  )

  await screen.findByText('a red tree')
  expect(getAllLogs).toHaveBeenCalledWith(
    expect.objectContaining({ image_studio: true, usage_only: true })
  )
  await userEvent.click(screen.getByText('a red tree'))
  expect(screen.getByText('req-image-1')).toBeInTheDocument()
  expect(screen.getByText('Request details')).toBeInTheDocument()
})

it('applies the failed-status filter to the server query', async () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  render(
    <QueryClientProvider client={client}>
      <ImageStudioLogs />
    </QueryClientProvider>
  )

  await screen.findByText('a red tree')
  await userEvent.selectOptions(
    screen.getByRole('combobox', { name: 'Status' }),
    '5'
  )
  await waitFor(() =>
    expect(getAllLogs).toHaveBeenLastCalledWith(
      expect.objectContaining({ image_studio: true, type: 5 })
    )
  )
})

it('opens the generated image preview for the selected request', async () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  render(
    <QueryClientProvider client={client}>
      <ImageStudioLogs />
    </QueryClientProvider>
  )

  await screen.findByText('a red tree')
  await userEvent.click(screen.getByRole('button', { name: 'View' }))

  expect(await screen.findByRole('dialog')).toBeInTheDocument()
  expect(await screen.findByAltText('Generated image 1')).toHaveAttribute(
    'src',
    'https://images.example.test/result.png'
  )
  expect(api.get).toHaveBeenCalledWith(
    '/api/image-studio/admin/req-image-1/0',
    { responseType: 'blob' }
  )
})
