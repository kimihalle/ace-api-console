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
import type { QuotaDataItem } from '@/features/dashboard/types'

export type ModelUsageMetric = 'quota' | 'count' | 'tokens'
export type ModelUsageRow = {
  model: string
  quota: number
  count: number
  tokens: number
  share: number
  average: number | null
}

export function aggregateModelUsage(data: QuotaDataItem[]): ModelUsageRow[] {
  if (!Array.isArray(data)) throw new Error('Invalid aggregate usage response')
  const models = new Map<string, ModelUsageRow>()
  for (const item of data) {
    const values = [item.quota, item.count, item.token_used]
    if (
      values.some(
        (value) =>
          typeof value !== 'number' || !Number.isFinite(value) || value < 0
      )
    ) {
      throw new Error('Invalid aggregate usage totals')
    }
    const model = item.model_name || ''
    const row = models.get(model) ?? {
      model,
      quota: 0,
      count: 0,
      tokens: 0,
      share: 0,
      average: null,
    }
    row.quota += Number(item.quota)
    row.count += Number(item.count)
    row.tokens += Number(item.token_used)
    models.set(model, row)
  }
  const rows = [...models.values()]
  const total = rows.reduce((sum, row) => sum + row.quota, 0)
  for (const row of rows) {
    row.share = total > 0 ? (row.quota / total) * 100 : 0
    row.average = row.count > 0 ? row.quota / row.count : null
  }
  return rows
}

export function sortModelUsage(
  rows: ModelUsageRow[],
  metric: ModelUsageMetric
): ModelUsageRow[] {
  return [...rows].sort(
    (left, right) =>
      right[metric] - left[metric] ||
      left.model.localeCompare(right.model, 'en')
  )
}
