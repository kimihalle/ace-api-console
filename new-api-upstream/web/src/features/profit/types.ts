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
export interface ProfitTotals {
  requests: number
  known_requests: number
  unknown_requests: number
  revenue: number
  known_revenue: number
  cost: number
  gross_profit: number
  margin: number | null
}

export interface ProfitBreakdown extends ProfitTotals {
  key: string
}

export interface ProfitPeriod extends ProfitTotals {
  excluded_requests: number
}

export interface ProfitOverview {
  today: ProfitPeriod
  yesterday: ProfitPeriod
  month: ProfitPeriod
  lifetime: ProfitPeriod
  as_of: number
  timezone: string
  complete: boolean
  processed_logs: number
}

export interface ProfitRecord {
  request_id: string
  created_at: number
  username: string
  channel_id: number
  model: string
  group: string
  status: string
  revenue: number
  purchase_ratio: number | null
  sale_ratio: number | null
  cost: number | null
  gross_profit: number | null
}

export interface ProfitReport {
  excluded_requests: number
  totals: ProfitTotals
  daily: ProfitBreakdown[]
  channels: ProfitBreakdown[]
  groups: ProfitBreakdown[]
  records: ProfitRecord[]
  page: number
  page_size: number
}

export interface ProfitFilters {
  start_timestamp: number
  end_timestamp: number
  channel_id?: number
  model?: string
  group?: string
  page: number
  page_size: number
}
