/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query'
import { Eye, Play, RefreshCw, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { ConfirmDialog } from '@/components/confirm-dialog'
import { CopyButton } from '@/components/copy-button'
import { StaticDataTable } from '@/components/data-table'
import { EmptyState } from '@/components/empty-state'
import { ErrorState } from '@/components/error-state'
import { LoadingState } from '@/components/loading-state'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import {
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { SettingsSection } from '@/features/system-settings/components/settings-section'
import { handleServerError } from '@/lib/handle-server-error'

import { pelicanPreviewDocument } from './lib/pelican-preview'
import {
  deletePelicanSample,
  batchDeletePelicanSamples,
  getPelicanAdminDocument,
  getPelicanSamples,
  type PelicanSample,
  type PelicanDocument,
  type PelicanSampleStatus,
} from './pelican-api'

const samplesKey = ['system-settings', 'pelican-samples'] as const
const statusColors: Record<string, string> = {
  success: 'text-emerald-600',
  failed: 'text-destructive',
  running: 'text-amber-600',
}

function sampleStatus(status: string, t: (key: string) => string) {
  if (status === 'success') return t('Generated')
  if (status === 'running') return t('Running')
  return t('Failed')
}

export function PelicanSamplesManager() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [groupInput, setGroupInput] = useState('')
  const [modelInput, setModelInput] = useState('')
  const [group, setGroup] = useState('')
  const [model, setModel] = useState('')
  const [status, setStatus] = useState<PelicanSampleStatus>('all')
  const [selected, setSelected] = useState<Set<number>>(() => new Set())
  const [deleteTarget, setDeleteTarget] = useState<PelicanSample | null>(null)
  const [batchDeleteIds, setBatchDeleteIds] = useState<number[] | null>(null)
  const [preview, setPreview] = useState<PelicanSample | null>(null)
  const [previewDocument, setPreviewDocument] =
    useState<PelicanDocument | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewError, setPreviewError] = useState(false)
  const [previewAttempt, setPreviewAttempt] = useState(0)
  const [playback, setPlayback] = useState(0)

  const query = useInfiniteQuery({
    queryKey: [...samplesKey, group, model, status],
    initialPageParam: 0,
    queryFn: ({ pageParam }) =>
      getPelicanSamples({
        group: group || undefined,
        model: model || undefined,
        status,
        before: pageParam || undefined,
        limit: 50,
      }),
    getNextPageParam: (lastPage) => lastPage.next_before || undefined,
    refetchOnWindowFocus: false,
    refetchInterval: deleteTarget || batchDeleteIds ? false : 30000,
  })
  const remove = useMutation({
    mutationFn: deletePelicanSample,
    onSuccess: () => {
      setDeleteTarget(null)
      void queryClient.invalidateQueries({ queryKey: samplesKey })
      toast.success(t('Record deleted'))
    },
  })
  const removeBatch = useMutation({
    mutationFn: batchDeletePelicanSamples,
    onSuccess: async (result, ids) => {
      setBatchDeleteIds(null)
      setSelected(new Set())
      setPreview(null)
      await queryClient.invalidateQueries({ queryKey: samplesKey })
      toast.success(t('Deleted {{count}} records', { count: result.deleted }))
      if (result.deleted < ids.length) {
        toast.info(
          t('Some selected records were already deleted or are still running.')
        )
      }
    },
    onError: (error) =>
      handleServerError(error, t('Unable to delete selected records')),
  })
  const busy = remove.isPending || removeBatch.isPending

  useEffect(() => {
    if (!preview) return
    const controller = new AbortController()
    setPreviewLoading(true)
    setPreviewError(false)
    setPreviewDocument(null)
    getPelicanAdminDocument(preview.id, controller.signal)
      .then((document) => {
        if (controller.signal.aborted) return
        setPreviewDocument(document)
      })
      .finally(() => {
        if (!controller.signal.aborted) setPreviewLoading(false)
      })
      .catch(() => {
        if (!controller.signal.aborted) setPreviewError(true)
      })
    return () => {
      controller.abort()
    }
  }, [preview, previewAttempt])

  const applyFilters = () => {
    setSelected(new Set())
    setGroup(groupInput.trim())
    setModel(modelInput.trim())
  }
  const resetFilters = () => {
    setSelected(new Set())
    setGroupInput('')
    setModelInput('')
    setGroup('')
    setModel('')
  }
  const records = [
    ...new Map(
      (query.data?.pages.flatMap((page) => page.records) ?? []).map(
        (record) => [record.id, record]
      )
    ).values(),
  ]
  const selectable = records.filter((record) => record.status !== 'running')
  const selectedIds = selectable
    .filter((record) => selected.has(record.id))
    .map((record) => record.id)

  return (
    <>
      <SettingsSection title={t('Generated Pelican records')}>
        <p className='text-muted-foreground text-sm'>
          {t(
            'Review, preview, and delete hourly generated records. Deleting a record cannot be undone.'
          )}
        </p>
        <Tabs
          value={status}
          onValueChange={(value) => {
            if (value === 'all' || value === 'success' || value === 'failed') {
              setStatus(value)
              setSelected(new Set())
            }
          }}
        >
          <TabsList aria-label={t('Record status')}>
            <TabsTrigger value='all' disabled={busy}>
              {t('All')}
            </TabsTrigger>
            <TabsTrigger value='success' disabled={busy}>
              {t('Success')}
            </TabsTrigger>
            <TabsTrigger value='failed' disabled={busy}>
              {t('Failed')}
            </TabsTrigger>
          </TabsList>
        </Tabs>
        <div className='flex flex-col gap-2 sm:flex-row'>
          <Input
            disabled={busy}
            value={groupInput}
            onChange={(event) => setGroupInput(event.target.value)}
            onKeyDown={(event) => event.key === 'Enter' && applyFilters()}
            placeholder={t('Filter by group')}
            aria-label={t('Filter by group')}
          />
          <Input
            disabled={busy}
            value={modelInput}
            onChange={(event) => setModelInput(event.target.value)}
            onKeyDown={(event) => event.key === 'Enter' && applyFilters()}
            placeholder={t('Filter by model')}
            aria-label={t('Filter by model')}
          />
          <Button variant='outline' onClick={applyFilters} disabled={busy}>
            <RefreshCw />
            {t('Apply filters')}
          </Button>
          {(group || model) && (
            <Button variant='ghost' onClick={resetFilters} disabled={busy}>
              {t('Clear')}
            </Button>
          )}
        </div>
        <div className='flex flex-wrap items-center gap-2 text-sm'>
          <span role='status' aria-live='polite'>
            {t('{{count}} records selected', { count: selectedIds.length })}
          </span>
          <Button
            variant='ghost'
            size='sm'
            disabled={!selectedIds.length || busy}
            onClick={() => setSelected(new Set())}
          >
            {t('Clear selection')}
          </Button>
          <Button
            variant='destructive'
            size='sm'
            disabled={
              !selectedIds.length ||
              selectedIds.length > 1000 ||
              busy ||
              query.isFetching
            }
            onClick={() => setBatchDeleteIds([...selectedIds])}
          >
            <Trash2 />
            {t('Delete selected')}
          </Button>
          <span className='text-muted-foreground text-xs'>
            {t(
              'Only loaded records are selected. Load earlier records to select more.'
            )}
          </span>
        </div>
        {query.isPending && <LoadingState />}
        {query.isError && (
          <EmptyState
            title={t('Unable to load records')}
            action={
              <Button onClick={() => void query.refetch()}>{t('Retry')}</Button>
            }
          />
        )}
        {query.isSuccess && !records.length && (
          <EmptyState title={t('No Pelican records yet')} />
        )}
        {query.isSuccess && records.length > 0 && (
          <StaticDataTable tableClassName='min-w-[760px]'>
            <TableHeader>
              <TableRow>
                <TableHead className='w-10'>
                  <Checkbox
                    aria-label={t('Select all loaded records')}
                    checked={
                      selectable.length > 0 &&
                      selectedIds.length === selectable.length
                    }
                    indeterminate={
                      selectedIds.length > 0 &&
                      selectedIds.length < selectable.length
                    }
                    disabled={!selectable.length || busy}
                    onCheckedChange={(checked) =>
                      setSelected(
                        checked
                          ? new Set(selectable.map((record) => record.id))
                          : new Set()
                      )
                    }
                  />
                </TableHead>
                <TableHead>{t('Time')}</TableHead>
                <TableHead>{t('Group')}</TableHead>
                <TableHead>{t('Model')}</TableHead>
                <TableHead>{t('Status')}</TableHead>
                <TableHead>{t('Latency')}</TableHead>
                <TableHead className='text-right'>{t('Actions')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {records.map((record) => (
                <TableRow key={record.id}>
                  <TableCell>
                    <Checkbox
                      aria-label={t('Select record {{id}}', { id: record.id })}
                      checked={
                        selected.has(record.id) && record.status !== 'running'
                      }
                      disabled={record.status === 'running' || busy}
                      onCheckedChange={(checked) =>
                        setSelected((current) => {
                          const next = new Set(current)
                          if (checked) next.add(record.id)
                          else next.delete(record.id)
                          return next
                        })
                      }
                    />
                  </TableCell>
                  <TableCell>
                    {new Date(record.checked_at * 1000).toLocaleString()}
                  </TableCell>
                  <TableCell className='max-w-40 truncate'>
                    {record.group}
                  </TableCell>
                  <TableCell className='max-w-56 truncate'>
                    {record.model}
                  </TableCell>
                  <TableCell>
                    <span
                      className={
                        statusColors[record.status] ?? 'text-muted-foreground'
                      }
                    >
                      {sampleStatus(record.status, t)}
                    </span>
                    {record.error_code && (
                      <div className='text-muted-foreground text-xs'>
                        {record.error_code}
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    {(record.latency_ms / 1000).toLocaleString(undefined, {
                      maximumFractionDigits: 2,
                    })}
                    s
                  </TableCell>
                  <TableCell>
                    <div className='flex justify-end gap-1'>
                      {record.status === 'success' && (
                        <Button
                          variant='ghost'
                          size='icon-sm'
                          aria-label={t('Preview card')}
                          onClick={() => setPreview(record)}
                        >
                          <Eye />
                        </Button>
                      )}
                      <Button
                        variant='ghost'
                        size='icon-sm'
                        aria-label={t('Delete record')}
                        disabled={record.status === 'running' || busy}
                        onClick={() => setDeleteTarget(record)}
                      >
                        <Trash2 />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </StaticDataTable>
        )}
        {query.hasNextPage && (
          <div className='flex justify-center'>
            <Button
              variant='outline'
              disabled={
                query.isFetchingNextPage || busy || records.length >= 1000
              }
              onClick={() => void query.fetchNextPage()}
            >
              <RefreshCw />
              {query.isFetchingNextPage
                ? t('Loading records')
                : t('Load earlier records')}
            </Button>
          </div>
        )}
        {records.length >= 1000 && query.hasNextPage && (
          <p className='text-muted-foreground text-xs'>
            {t(
              'Each batch supports up to 1000 records. Delete this batch or refine the filters to continue.'
            )}
          </p>
        )}
      </SettingsSection>
      <ConfirmDialog
        open={batchDeleteIds != null}
        onOpenChange={(open) =>
          !open && !removeBatch.isPending && setBatchDeleteIds(null)
        }
        title={t('Delete selected records?')}
        desc={t(
          'Permanently delete {{count}} selected records and their saved source? This cannot be undone.',
          { count: batchDeleteIds?.length ?? 0 }
        )}
        destructive
        confirmText={t('Delete')}
        isLoading={removeBatch.isPending}
        handleConfirm={() => {
          if (batchDeleteIds?.length) removeBatch.mutate(batchDeleteIds)
        }}
      />
      <ConfirmDialog
        open={deleteTarget != null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title={t('Delete Pelican record?')}
        desc={t(
          'This removes the stored source and its hourly result permanently.'
        )}
        destructive
        confirmText={t('Delete')}
        isLoading={remove.isPending}
        handleConfirm={() => {
          if (deleteTarget) remove.mutate(deleteTarget.id)
        }}
      />
      <Dialog
        open={preview != null}
        onOpenChange={(open) => !open && setPreview(null)}
      >
        <DialogContent className='max-w-4xl'>
          <DialogHeader>
            <DialogTitle>
              {preview?.group} / {preview?.model}
            </DialogTitle>
            <DialogDescription>
              {preview && new Date(preview.checked_at * 1000).toLocaleString()}
            </DialogDescription>
          </DialogHeader>
          {previewLoading && <LoadingState />}
          {previewError && (
            <ErrorState
              title={t('Unable to load preview')}
              onRetry={() => setPreviewAttempt((value) => value + 1)}
            />
          )}
          {!previewLoading && previewDocument && (
            <>
              <iframe
                key={playback}
                title={`${preview?.model ?? ''} Pelican test`}
                className='aspect-[4/3] max-h-[65vh] w-full rounded-md border bg-white'
                sandbox='allow-scripts'
                referrerPolicy='no-referrer'
                srcDoc={pelicanPreviewDocument(
                  previewDocument.source,
                  previewDocument.format
                )}
              />
              <div className='flex items-center justify-between gap-2 text-sm'>
                <span className='text-muted-foreground'>
                  {previewDocument.format === 'html'
                    ? t('Animated HTML')
                    : t('Legacy SVG')}
                </span>
                <div className='flex items-center gap-2'>
                  <CopyButton value={previewDocument.source} />
                  <Button
                    size='sm'
                    variant='outline'
                    onClick={() => setPlayback((value) => value + 1)}
                  >
                    <Play />
                    {t('Replay')}
                  </Button>
                </div>
              </div>
              <details className='min-w-0 text-sm'>
                <summary className='cursor-pointer'>{t('Source code')}</summary>
                <pre
                  className='bg-muted mt-2 max-h-64 overflow-auto rounded-md p-3 text-xs'
                  tabIndex={0}
                >
                  <code>{previewDocument.source}</code>
                </pre>
              </details>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
