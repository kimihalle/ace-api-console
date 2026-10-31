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

import { channelSchema } from '../../types'
import {
  CHANNEL_FORM_DEFAULT_VALUES,
  channelFormSchema,
  transformChannelToFormDefaults,
  transformFormDataToCreatePayload,
  transformFormDataToUpdatePayload,
} from '../channel-form'

const validForm = {
  ...CHANNEL_FORM_DEFAULT_VALUES,
  name: 'upstream',
  type: 1,
  key: 'fixture-key',
  models: 'model-a',
  group: ['retail'],
}

describe('channel purchase ratio', () => {
  it('saves and reloads a configured purchase ratio, including explicit zero', () => {
    for (const ratio of [0.3, 0]) {
      const payload = transformFormDataToCreatePayload({
        ...validForm,
        upstream_cost_ratio: ratio,
      })
      const data = JSON.parse(payload.channel.setting || '{}')
      expect(data.upstream_cost_ratio).toBe(ratio)
      const channel = channelSchema.parse({
        id: 1,
        type: 1,
        key: '',
        status: 1,
        name: 'upstream',
        created_time: 0,
        test_time: 0,
        response_time: 0,
        balance_updated_time: 0,
        setting: payload.channel.setting,
      })
      expect(transformChannelToFormDefaults(channel).upstream_cost_ratio).toBe(
        ratio
      )
    }
  })
  it('clears the ratio without turning unknown cost into a free upstream', () => {
    const payload = transformFormDataToUpdatePayload(
      { ...validForm, upstream_cost_ratio: undefined },
      1
    )
    expect(JSON.parse(payload.setting || '{}')).not.toHaveProperty(
      'upstream_cost_ratio'
    )
  })
  it('rejects invalid and unbounded purchase ratios before saving', () => {
    for (const ratio of [-1, Number.NaN, Number.POSITIVE_INFINITY, 1000001]) {
      expect(
        channelFormSchema.safeParse({
          ...validForm,
          upstream_cost_ratio: ratio,
        }).success
      ).toBe(false)
    }
  })
})
