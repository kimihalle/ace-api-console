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
import { describe, expect, it } from 'vitest'

import { aggregateModelUsage, sortModelUsage } from '../model-usage'

describe('model usage aggregates', () => {
  it('combines all hourly/model records before computing totals and shares', () => {
    const rows = aggregateModelUsage([
      {
        model_name: 'a',
        created_at: 1,
        quota: 500000,
        count: 2,
        token_used: 300,
      },
      {
        model_name: 'a',
        created_at: 2,
        quota: 250000,
        count: 1,
        token_used: 200,
      },
      {
        model_name: 'b',
        created_at: 2,
        quota: 250000,
        count: 5,
        token_used: 2000,
      },
    ])
    expect(rows.find((row) => row.model === 'a')).toEqual({
      model: 'a',
      quota: 750000,
      count: 3,
      tokens: 500,
      share: 75,
      average: 250000,
    })
    expect(sortModelUsage(rows, 'quota')[0].model).toBe('a')
    expect(sortModelUsage(rows, 'count')[0].model).toBe('b')
    expect(sortModelUsage(rows, 'tokens')[0].model).toBe('b')
    expect(rows[0].model).toBe('a')
  })
  it('keeps free usage and missing model names without division errors', () => {
    const rows = aggregateModelUsage([
      { created_at: 1, quota: 0, count: 0, token_used: 0 },
    ])
    expect(rows[0]).toEqual({
      model: '',
      quota: 0,
      count: 0,
      tokens: 0,
      share: 0,
      average: null,
    })
    expect(aggregateModelUsage([])).toEqual([])
  })
  it('rejects incomplete or invalid aggregate values instead of displaying invented zeros', () => {
    expect(() => aggregateModelUsage([{ created_at: 1, quota: 1 }])).toThrow()
    expect(() =>
      aggregateModelUsage([
        { created_at: 1, quota: -1, count: 2, token_used: 1 },
      ])
    ).toThrow()
    expect(() =>
      aggregateModelUsage([
        { created_at: 1, quota: Infinity, count: 2, token_used: 1 },
      ])
    ).toThrow()
  })
})
