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
import { RotateCcw, Search } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { DateTimePicker } from '@/components/datetime-picker'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'

import type { ProfitFilters } from './types'

export function ProfitFilterControls(props: {
  filters: ProfitFilters
  loading: boolean
  onApply: (filters: ProfitFilters, rollingDays: number | null) => void
}) {
  const { t } = useTranslation()
  const [preset, setPreset] = useState('7d')
  const [start, setStart] = useState<Date | undefined>(
    () => new Date(props.filters.start_timestamp * 1000)
  )
  const [end, setEnd] = useState<Date | undefined>(
    () => new Date(props.filters.end_timestamp * 1000)
  )
  const [channel, setChannel] = useState('')
  const [model, setModel] = useState('')
  const [group, setGroup] = useState('')
  const [validation, setValidation] = useState(false)

  return (
    <form
      aria-label={t('Profit filters')}
      className='space-y-4'
      onSubmit={(event) => {
        event.preventDefault()
        const days = preset === 'custom' ? null : Number.parseInt(preset, 10)
        let until = Math.floor(Date.now() / 1000)
        let from = until - (days ?? 7) * 86400
        if (days === null) {
          from = Math.floor((start?.getTime() ?? Number.NaN) / 1000)
          until = Math.floor((end?.getTime() ?? Number.NaN) / 1000)
        }
        if (
          !Number.isFinite(from) ||
          !Number.isFinite(until) ||
          from <= 0 ||
          until <= from ||
          until - from > 31 * 86400 ||
          (channel !== '' &&
            (!Number.isSafeInteger(Number(channel)) || Number(channel) < 1))
        ) {
          setValidation(true)
          return
        }
        setValidation(false)
        setStart(new Date(from * 1000))
        setEnd(new Date(until * 1000))
        props.onApply(
          {
            start_timestamp: from,
            end_timestamp: until,
            channel_id: channel ? Number(channel) : undefined,
            model: model.trim() || undefined,
            group: group.trim() || undefined,
            page: 1,
            page_size: 20,
          },
          days
        )
      }}
    >
      <div className='flex flex-wrap items-center justify-between gap-3'>
        <ToggleGroup
          value={[preset]}
          onValueChange={(values) => {
            if (values.length > 0) {
              setPreset(values[0])
              setValidation(false)
              if (values[0] !== 'custom') {
                const until = Date.now()
                setStart(
                  new Date(until - Number.parseInt(values[0], 10) * 86400000)
                )
                setEnd(new Date(until))
              }
            }
          }}
          variant='outline'
          size='sm'
          aria-label={t('Report time range')}
        >
          <ToggleGroupItem value='7d'>{t('Last 7 days')}</ToggleGroupItem>
          <ToggleGroupItem value='30d'>{t('Last 30 days')}</ToggleGroupItem>
          <ToggleGroupItem value='custom'>{t('Custom')}</ToggleGroupItem>
        </ToggleGroup>
        <Button
          type='button'
          variant='ghost'
          size='sm'
          disabled={props.loading}
          onClick={() => {
            const until = Math.floor(Date.now() / 1000)
            const from = until - 7 * 86400
            setPreset('7d')
            setChannel('')
            setModel('')
            setGroup('')
            setValidation(false)
            setStart(new Date(from * 1000))
            setEnd(new Date(until * 1000))
            props.onApply(
              {
                start_timestamp: from,
                end_timestamp: until,
                page: 1,
                page_size: 20,
              },
              7
            )
          }}
        >
          <RotateCcw aria-hidden='true' />
          {t('Reset')}
        </Button>
      </div>
      {preset === 'custom' && (
        <div className='grid gap-3 xl:grid-cols-2'>
          <fieldset className='min-w-0 space-y-1.5'>
            <legend className='mb-1.5 text-xs font-medium'>
              {t('Start time')}
            </legend>
            <DateTimePicker
              value={start}
              onChange={setStart}
              placeholder={t('Start time')}
              className='w-full min-w-0 [&>button:first-child]:min-w-0 [&>input]:w-24'
            />
          </fieldset>
          <fieldset className='min-w-0 space-y-1.5'>
            <legend className='mb-1.5 text-xs font-medium'>
              {t('End time')}
            </legend>
            <DateTimePicker
              value={end}
              onChange={setEnd}
              placeholder={t('End time')}
              className='w-full min-w-0 [&>button:first-child]:min-w-0 [&>input]:w-24'
            />
          </fieldset>
        </div>
      )}
      <div className='grid items-end gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)_minmax(0,1fr)_auto]'>
        <div className='min-w-0 space-y-1.5'>
          <Label htmlFor='profit-channel' className='text-xs'>
            {t('Channel ID')}
          </Label>
          <Input
            id='profit-channel'
            type='number'
            min={1}
            value={channel}
            onChange={(event) => setChannel(event.target.value)}
            placeholder={t('All channels')}
            className='w-full'
          />
        </div>
        <div className='min-w-0 space-y-1.5'>
          <Label htmlFor='profit-model' className='text-xs'>
            {t('Model')}
          </Label>
          <Input
            id='profit-model'
            value={model}
            onChange={(event) => setModel(event.target.value)}
            maxLength={256}
            placeholder={t('All models')}
            className='w-full'
          />
        </div>
        <div className='min-w-0 space-y-1.5'>
          <Label htmlFor='profit-group' className='text-xs'>
            {t('Group')}
          </Label>
          <Input
            id='profit-group'
            value={group}
            onChange={(event) => setGroup(event.target.value)}
            maxLength={64}
            placeholder={t('All groups')}
            className='w-full'
          />
        </div>
        <Button type='submit' disabled={props.loading}>
          <Search aria-hidden='true' />
          {t('Search')}
        </Button>
      </div>
      {validation && (
        <p role='alert' className='text-destructive text-sm'>
          {t(
            'Choose a valid time range of up to 31 days and a positive channel ID.'
          )}
        </p>
      )}
    </form>
  )
}
