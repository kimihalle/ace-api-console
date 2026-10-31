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
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { EmptyState } from '@/components/empty-state'
import { ErrorState } from '@/components/error-state'
import { LoadingState } from '@/components/loading-state'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import {
  SettingsForm,
  SettingsSwitchContent,
  SettingsSwitchItem,
} from '@/features/system-settings/components/settings-form-layout'
import { SettingsPageFormActions } from '@/features/system-settings/components/settings-page-context'
import { SettingsSection } from '@/features/system-settings/components/settings-section'

import { pelicanSchema, type PelicanConfig } from './lib/pelican-schema'
import {
  getPelicanSettings,
  runPelicanSamples,
  savePelicanSettings,
} from './pelican-api'

const settingsKey = ['system-settings', 'pelican'] as const

export function PelicanSettingsCard() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const query = useQuery({
    queryKey: settingsKey,
    queryFn: getPelicanSettings,
    refetchOnWindowFocus: false,
  })
  const form = useForm<PelicanConfig>({
    resolver: zodResolver(pelicanSchema),
    defaultValues: {
      enabled: false,
      public_enabled: true,
      retention_days: 7,
      targets: [],
    },
  })
  useEffect(() => {
    if (query.data) form.reset(query.data.config)
  }, [query.data, form])
  const save = useMutation({
    mutationFn: savePelicanSettings,
    onSuccess: (config) => {
      form.reset(config)
      void queryClient.invalidateQueries({ queryKey: settingsKey })
      toast.success(t('Saved successfully'))
    },
  })
  const run = useMutation({
    mutationFn: runPelicanSamples,
    onSuccess: () =>
      toast.success(
        t(
          'Pelican sampling queued; failed samples will be retried and successful samples skipped'
        )
      ),
  })
  const targets = form.watch('targets')
  const count = targets.reduce((sum, target) => sum + target.models.length, 0)

  if (query.isPending) return <LoadingState />
  if (query.isError) {
    return (
      <ErrorState
        onRetry={() => {
          void query.refetch()
        }}
      />
    )
  }
  const available = { ...query.data.available }
  // Keep removed/disabled selections visible so they can be unchecked.
  for (const target of targets) {
    available[target.group] = [
      ...new Set([...(available[target.group] ?? []), ...target.models]),
    ]
  }

  return (
    <SettingsSection title={t('Pelican test')}>
      <p className='text-muted-foreground text-sm'>
        {t('Upstream quota only. No user balance or channel status changes.')}
      </p>
      <Form {...form}>
        <SettingsForm
          onSubmit={form.handleSubmit((values) => save.mutate(values))}
        >
          <SettingsPageFormActions
            onSave={form.handleSubmit((values) => save.mutate(values))}
            isSaving={save.isPending}
          />
          <FormField
            control={form.control}
            name='enabled'
            render={({ field }) => (
              <SettingsSwitchItem>
                <SettingsSwitchContent>
                  <FormLabel>{t('Enable hourly pelican sampling')}</FormLabel>
                </SettingsSwitchContent>
                <FormControl>
                  <Switch
                    checked={field.value}
                    onCheckedChange={field.onChange}
                    disabled={save.isPending}
                  />
                </FormControl>
              </SettingsSwitchItem>
            )}
          />
          <FormField
            control={form.control}
            name='public_enabled'
            render={({ field }) => (
              <SettingsSwitchItem>
                <SettingsSwitchContent>
                  <FormLabel>
                    {t('Show Pelican test in user workspace')}
                  </FormLabel>
                  <FormDescription>
                    {t(
                      'When disabled, users cannot see the Pelican test menu or public records.'
                    )}
                  </FormDescription>
                </SettingsSwitchContent>
                <FormControl>
                  <Switch
                    checked={field.value}
                    onCheckedChange={field.onChange}
                    disabled={save.isPending}
                  />
                </FormControl>
              </SettingsSwitchItem>
            )}
          />
          <FormField
            control={form.control}
            name='retention_days'
            render={({ field }) => (
              <FormItem className='max-w-xs'>
                <FormLabel>{t('Sample retention (days)')}</FormLabel>
                <FormControl>
                  <Input
                    type='number'
                    min={1}
                    max={30}
                    step={1}
                    {...field}
                    onChange={(event) =>
                      field.onChange(event.target.valueAsNumber)
                    }
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name='targets'
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  {t('Published groups and models')} ({count}/20)
                </FormLabel>
                <FormDescription>
                  {t(
                    'All users can view selected groups in the Pelican test menu.'
                  )}
                </FormDescription>
                <Input
                  aria-label={t('Search models')}
                  placeholder={t('Search models')}
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
                {Object.keys(available).length === 0 && (
                  <EmptyState title={t('No available models')} />
                )}
                <div className='grid min-w-0 gap-3'>
                  {Object.entries(available)
                    .sort(([a], [b]) => a.localeCompare(b))
                    .map(([group, names]) => (
                      <fieldset
                        className='min-w-0 rounded-lg border p-4'
                        key={group}
                      >
                        <legend className='max-w-full px-2 text-sm font-medium break-all'>
                          {group}
                        </legend>
                        <div className='grid max-h-64 grid-cols-1 gap-3 overflow-auto sm:grid-cols-2 xl:grid-cols-3'>
                          {names
                            .filter((name) =>
                              `${group} ${name}`
                                .toLowerCase()
                                .includes(search.toLowerCase())
                            )
                            .map((name) => {
                              const selected =
                                field.value
                                  .find((target) => target.group === group)
                                  ?.models.includes(name) ?? false
                              return (
                                <label
                                  key={name}
                                  className='flex min-w-0 items-center gap-2 text-sm'
                                >
                                  <Checkbox
                                    checked={selected}
                                    disabled={
                                      save.isPending ||
                                      (!selected && count >= 20)
                                    }
                                    aria-label={`${group} / ${name}`}
                                    onCheckedChange={(checked) => {
                                      const next = field.value.filter(
                                        (target) => target.group !== group
                                      )
                                      const previous =
                                        field.value.find(
                                          (target) => target.group === group
                                        )?.models ?? []
                                      const models = checked
                                        ? [...previous, name]
                                        : previous.filter(
                                            (model) => model !== name
                                          )
                                      if (models.length) {
                                        next.push({ group, models })
                                      }
                                      field.onChange(next)
                                    }}
                                  />
                                  <span className='break-all'>{name}</span>
                                </label>
                              )
                            })}
                        </div>
                      </fieldset>
                    ))}
                </div>
                <FormMessage />
              </FormItem>
            )}
          />
          <div className='flex flex-wrap items-center gap-3'>
            <Button
              type='button'
              variant='outline'
              disabled={
                !query.data.config.enabled ||
                form.formState.isDirty ||
                run.isPending ||
                save.isPending
              }
              onClick={() => run.mutate()}
            >
              {t('Run current hour now')}
            </Button>
          </div>
          <details className='text-muted-foreground text-sm'>
            <summary className='cursor-pointer'>
              {t('Fixed sample prompt')} · {query.data.prompt_version}
            </summary>
            <p className='mt-3 break-words'>{query.data.prompt}</p>
            <p className='mt-2'>
              {t('5-minute timeout · 8192 output tokens · 20 pairs maximum')}
            </p>
          </details>
        </SettingsForm>
      </Form>
    </SettingsSection>
  )
}
