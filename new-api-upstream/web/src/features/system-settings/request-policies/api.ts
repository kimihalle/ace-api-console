import { getChannels } from '@/features/channels/api'
import type { Channel } from '@/features/channels/types'
import { api } from '@/lib/api'
import { requireServerSuccess } from '@/lib/server-error-message'

export async function getHealthCheckChannels(): Promise<
  Pick<Channel, 'id' | 'name'>[]
> {
  const channels: Pick<Channel, 'id' | 'name'>[] = []
  for (let page = 1; ; page += 1) {
    const response = requireServerSuccess(
      await getChannels({
        p: page,
        page_size: 100,
        tag_mode: false,
        sort_by: 'id',
        sort_order: 'asc',
      })
    )
    if (!response.data) throw new Error('Failed to fetch channels')
    channels.push(...response.data.items.map(({ id, name }) => ({ id, name })))
    if (
      response.data.items.length === 0 ||
      page * response.data.page_size >= response.data.total
    ) {
      return channels
    }
  }
}

export type PolicyConfig = {
  options: Record<string, string>
}
export type PolicyDecision = { action: string; reason: string; source: string }
export type PolicyEvent = {
  attempt: number
  channel_id?: number
  group?: string
  rule?: string
  status?: number
  error_code?: string
  error_source?: string
  elapsed_ms: number
  decision: PolicyDecision
  health?: string
}
type Response<T> = { success: boolean; message?: string; data: T }
export async function getPolicyConfig() {
  const response = await api.get<Response<PolicyConfig>>(
    '/api/option/request_policy'
  )
  return requireServerSuccess(response.data).data
}
export async function savePolicyConfig(options: Record<string, string>) {
  const response = await api.patch<Response<PolicyConfig>>(
    '/api/option/request_policy',
    { options }
  )
  return requireServerSuccess(response.data).data
}
