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
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo } from 'react'

import { useStatus } from '@/hooks/use-status'
import { requireServerSuccess } from '@/lib/server-error-message'

import { getPricing } from '../api'
import { EXCLUDED_GROUPS } from '../constants'

export function usePricingData(enabled = true) {
  const queryClient = useQueryClient()
  const { status } = useStatus()

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['pricing'],
    queryFn: async () => requireServerSuccess(await getPricing()),
    staleTime: 5 * 60 * 1000,
    enabled,
  })

  useEffect(() => {
    const refresh = (event: Event) => {
      if (
        event instanceof StorageEvent &&
        event.key !== 'ace-pricing-updated'
      ) {
        return
      }
      void queryClient.invalidateQueries({ queryKey: ['pricing'] })
    }
    window.addEventListener('storage', refresh)
    window.addEventListener('ace-pricing-updated', refresh)
    return () => {
      window.removeEventListener('storage', refresh)
      window.removeEventListener('ace-pricing-updated', refresh)
    }
  }, [queryClient])

  const availableGroups = useMemo(() => {
    const groups = Object.keys(data?.usable_group ?? {}).filter(
      (name) => !EXCLUDED_GROUPS.includes(name)
    )
    const positions = new Map<string, number>()
    for (const name of data?.group_display_order ?? []) {
      if (!positions.has(name)) positions.set(name, positions.size)
    }
    return groups.sort(
      (a, b) =>
        (positions.get(a) ?? positions.size) -
        (positions.get(b) ?? positions.size)
    )
  }, [data?.usable_group, data?.group_display_order])

  // Ensure rates never reach zero to prevent division errors
  const priceRate = useMemo(
    () => Math.max((status?.price as number) ?? 1, 0.001),
    [status?.price]
  )
  const usdExchangeRate = useMemo(
    () => Math.max((status?.usd_exchange_rate as number) ?? priceRate, 0.001),
    [status?.usd_exchange_rate, priceRate]
  )

  const models = useMemo(() => {
    if (!data?.data || !data?.vendors) return []

    const vendorMap = new Map(data.vendors.map((v) => [v.id, v]))

    return data.data.map((model) => {
      const vendor = model.vendor_id
        ? vendorMap.get(model.vendor_id)
        : undefined
      return {
        ...model,
        key: model.model_name,
        vendor_name: vendor?.name,
        vendor_icon: vendor?.icon,
        vendor_description: vendor?.description,
        group_ratio: data.group_ratio,
      }
    })
  }, [data])

  return {
    models,
    vendors: data?.vendors ?? [],
    groupRatio: data?.group_ratio ?? {},
    usableGroup: data?.usable_group ?? {},
    availableGroups,
    endpointMap: data?.supported_endpoint ?? {},
    autoGroups: data?.auto_groups ?? [],
    isLoading,
    error,
    refetch,
    priceRate,
    usdExchangeRate,
  }
}
