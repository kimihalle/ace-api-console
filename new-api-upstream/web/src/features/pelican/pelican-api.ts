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
import { api } from '@/lib/api'
import { requireServerSuccess } from '@/lib/server-error-message'

import type { PelicanConfig } from './lib/pelican-schema'

export interface PelicanSettings {
  config: PelicanConfig
  available: Record<string, string[]>
  prompt: string
  prompt_version: string
  interval_seconds: number
}

export interface PelicanSample {
  id: number
  hour: number
  group: string
  model: string
  checked_at: number
  latency_ms: number
  status: string
  error_code: string
  prompt_version: string
}

export type PelicanSampleStatus = 'all' | 'success' | 'failed'
export interface PelicanSampleFilter {
  group?: string
  model?: string
  status?: PelicanSampleStatus
}
export interface PelicanSamplesPage {
  records: PelicanSample[]
  next_before: number
}

interface Response<T> {
  success: boolean
  message?: string
  data: T
}

export interface PelicanDocument {
  format: 'html' | 'svg'
  source: string
}

export async function getPelicanAdminDocument(
  id: number,
  signal?: AbortSignal
): Promise<PelicanDocument> {
  const res = await api.get<Response<PelicanDocument>>(
    `/api/pelican/admin/samples/${id}/document`,
    {
      signal,
      disableDuplicate: true,
      skipErrorHandler: true,
    }
  )
  return requireServerSuccess(res.data).data
}

export async function getPelicanSettings(): Promise<PelicanSettings> {
  const res = await api.get<Response<PelicanSettings>>(
    '/api/pelican/admin/settings'
  )
  return requireServerSuccess(res.data).data
}

export async function savePelicanSettings(
  config: PelicanConfig
): Promise<PelicanConfig> {
  const res = await api.put<Response<PelicanConfig>>(
    '/api/pelican/admin/settings',
    config
  )
  return requireServerSuccess(res.data).data
}

export async function runPelicanSamples(): Promise<void> {
  const res = await api.post<Response<{ task_id: string; created: boolean }>>(
    '/api/pelican/admin/run'
  )
  requireServerSuccess(res.data)
}

export async function getPelicanSamples(
  params: PelicanSampleFilter & {
    before?: number
    limit?: number
  } = {}
): Promise<PelicanSamplesPage> {
  const res = await api.get<Response<PelicanSamplesPage>>(
    '/api/pelican/admin/samples',
    { params }
  )
  return requireServerSuccess(res.data).data
}

export async function batchDeletePelicanSamples(
  ids: number[]
): Promise<{ deleted: number }> {
  const res = await api.post<Response<{ deleted: number }>>(
    '/api/pelican/admin/samples/batch-delete',
    { ids }
  )
  return requireServerSuccess(res.data).data
}

export async function deletePelicanSample(id: number): Promise<void> {
  const res = await api.delete<Response<{ id: number }>>(
    `/api/pelican/admin/samples/${id}`
  )
  requireServerSuccess(res.data)
}

export async function getPelicanAdminImage(
  id: number,
  signal?: AbortSignal
): Promise<Blob> {
  const res = await api.get<Blob>(`/api/pelican/admin/samples/${id}/image`, {
    responseType: 'blob',
    signal,
    disableDuplicate: true,
    skipErrorHandler: true,
    skipBusinessError: true,
  })
  return res.data
}
