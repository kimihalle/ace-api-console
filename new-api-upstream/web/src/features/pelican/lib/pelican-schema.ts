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
import * as z from 'zod'

export const pelicanSchema = z
  .object({
    enabled: z.boolean(),
    public_enabled: z.boolean(),
    retention_days: z.number().int().min(1).max(30),
    targets: z.array(
      z.object({
        group: z.string().min(1),
        models: z.array(z.string().min(1)).min(1),
      })
    ),
  })
  .superRefine((value, ctx) => {
    const count = value.targets.reduce(
      (sum, target) => sum + target.models.length,
      0
    )
    if (count > 20 || (value.enabled && count === 0)) {
      ctx.addIssue({
        code: 'custom',
        path: ['targets'],
        message: 'Choose between 1 and 20 pelican group/model pairs',
      })
    }
  })

export type PelicanConfig = z.infer<typeof pelicanSchema>
