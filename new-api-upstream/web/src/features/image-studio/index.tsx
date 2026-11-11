import { useQuery } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight, Eye, RefreshCw, Search } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { SettingsPageFrame } from '@/features/system-settings/components/settings-page'
import { getAllLogs } from '@/features/usage-logs/api'
import type { UsageLog } from '@/features/usage-logs/data/schema'
import { formatQuota } from '@/lib/format'
import { getServerErrorMessage } from '@/lib/server-error-message'
import { api } from '@/lib/http-client'

type StudioInfo = {
  image_studio_prompt?: string
  image_studio_size?: string
  image_studio_quality?: string
  image_studio_count?: number
}

function studioInfo(log: UsageLog): StudioInfo {
  try {
    const parsed = JSON.parse(log.other) as { admin_info?: StudioInfo }
    return parsed.admin_info ?? {}
  } catch {
    return {}
  }
}

function GeneratedImage({ requestId, index }: { requestId: string; index: number }) {
  const [source, setSource] = useState('')
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let active = true
    let objectUrl = ''
    setSource('')
    setFailed(false)
    api.get(`/api/image-studio/admin/${encodeURIComponent(requestId)}/${index}`, { responseType: 'blob' })
      .then(async ({ data }) => {
        const blob = data as Blob
        if (blob.type.includes('application/json')) {
          const envelope = JSON.parse(await blob.text()) as { data?: { source?: string } }
          if (typeof envelope.data?.source !== 'string') throw new Error('Image source missing')
          if (active) setSource(envelope.data.source)
          return
        }
        objectUrl = URL.createObjectURL(blob)
        if (active) setSource(objectUrl)
      })
      .catch(() => { if (active) setFailed(true) })
    return () => {
      active = false
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [requestId, index])

  if (failed) return <div className='text-muted-foreground grid size-full place-items-center text-sm'>Image unavailable</div>
  if (!source) return <div className='text-muted-foreground grid size-full place-items-center text-sm'>Loading image...</div>
  return <img src={source} alt={`Generated image ${index + 1}`} referrerPolicy='no-referrer' className='size-full object-contain' />
}

export function ImageStudioLogs() {
  const { t } = useTranslation()
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [username, setUsername] = useState('')
  const [status, setStatus] = useState('all')
  const [selected, setSelected] = useState<UsageLog | null>(null)
  const [preview, setPreview] = useState<UsageLog | null>(null)
  const query = useQuery({
    queryKey: ['image-studio-logs', page, username, status],
    queryFn: async () => {
      const result = await getAllLogs({
        image_studio: true,
        usage_only: true,
        p: page,
        page_size: 20,
        ...(username ? { username } : {}),
        ...(status !== 'all' ? { type: Number(status) } : {}),
      })
      if (!result.success) {
        throw new Error(result.message || 'Failed to load records')
      }
      return result.data
    },
    meta: { errorToast: false },
  })
  const rows = (query.data?.items ?? []) as UsageLog[]
  const total = query.data?.total ?? 0
  const selectedInfo = selected ? studioInfo(selected) : null
  const previewCount = preview
    ? Math.max(1, Number(studioInfo(preview).image_studio_count) || 1)
    : 0

  return (
    <SettingsPageFrame title={t('Image generation records')}>
      <div className='flex flex-wrap items-center gap-2'>
        <form
          className='flex min-w-0 flex-1 gap-2 sm:flex-none'
          onSubmit={(event) => {
            event.preventDefault()
            setUsername(search.trim())
            setPage(1)
          }}
        >
          <Input
            aria-label={t('Search username')}
            placeholder={t('Search username')}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className='w-full sm:w-56'
          />
          <Button type='submit' variant='outline' aria-label={t('Search')}>
            <Search className='size-4' />
          </Button>
        </form>
        <select
          aria-label={t('Status')}
          value={status}
          onChange={(event) => {
            setStatus(event.target.value)
            setPage(1)
          }}
          className='border-input bg-background h-9 rounded-md border px-3 text-sm'
        >
          <option value='all'>{t('All statuses')}</option>
          <option value='2'>{t('Success')}</option>
          <option value='5'>{t('Failed')}</option>
        </select>
        <Button
          type='button'
          variant='outline'
          onClick={() => void query.refetch()}
          aria-label={t('Refresh')}
        >
          <RefreshCw className='size-4' />
        </Button>
        <span className='text-muted-foreground ml-auto text-xs'>
          {total} {t('records')}
        </span>
      </div>
      {query.isError && (
        <p role='alert' className='text-destructive text-sm'>
          {getServerErrorMessage(query.error)}
        </p>
      )}
      <div className='bg-card min-w-0 rounded-md border'>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('Time')}</TableHead>
              <TableHead>{t('User')}</TableHead>
              <TableHead>{t('API Key')}</TableHead>
              <TableHead>{t('Model')}</TableHead>
              <TableHead>{t('Group')}</TableHead>
              <TableHead>{t('Prompt')}</TableHead>
              <TableHead>{t('Images')}</TableHead>
              <TableHead>{t('Amount')}</TableHead>
              <TableHead>{t('Duration')}</TableHead>
              <TableHead>{t('Status')}</TableHead>
              <TableHead>{t('View')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((log) => {
              const info = studioInfo(log)
              return (
                <TableRow
                  key={log.id}
                  className='cursor-pointer'
                  onClick={() => setSelected(log)}
                >
                  <TableCell className='whitespace-nowrap'>
                    {new Date(log.created_at * 1000).toLocaleString()}
                  </TableCell>
                  <TableCell>{log.username || log.user_id}</TableCell>
                  <TableCell>{log.token_name || '-'}</TableCell>
                  <TableCell className='font-medium'>
                    {log.model_name}
                  </TableCell>
                  <TableCell>{log.group || '-'}</TableCell>
                  <TableCell
                    className='max-w-56 truncate'
                    title={info.image_studio_prompt}
                  >
                    {info.image_studio_prompt || '-'}
                  </TableCell>
                  <TableCell>{info.image_studio_count || '-'}</TableCell>
                  <TableCell>{formatQuota(log.quota)}</TableCell>
                  <TableCell>
                    {log.use_time ? `${log.use_time}s` : '-'}
                  </TableCell>
                  <TableCell>
                    {log.type === 5 ? t('Failed') : t('Success')}
                  </TableCell>
                  <TableCell>
                    {log.request_id && log.type !== 5 && (
                      <Button
                        type='button'
                        variant='ghost'
                        size='icon-sm'
                        aria-label={t('View')}
                        title={t('View')}
                        onClick={(event) => {
                          event.stopPropagation()
                          setPreview(log)
                        }}
                      >
                        <Eye className='size-4' />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              )
            })}
            {!query.isLoading && rows.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={11}
                  className='text-muted-foreground py-12 text-center'
                >
                  {t('No image generation records')}
                </TableCell>
              </TableRow>
            )}
            {query.isLoading && (
              <TableRow>
                <TableCell
                  colSpan={11}
                  className='text-muted-foreground py-12 text-center'
                >
                  {t('Loading...')}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      <div className='flex items-center justify-between gap-3'>
        <span className='text-muted-foreground text-xs'>
          {t(
            'Only requests from the customer image generation page appear here.'
          )}
        </span>
        <div className='flex items-center gap-2'>
          <Button
            type='button'
            variant='outline'
            size='icon'
            disabled={page <= 1}
            onClick={() => setPage((value) => value - 1)}
            aria-label={t('Previous page')}
          >
            <ChevronLeft className='size-4' />
          </Button>
          <span className='text-sm'>{page}</span>
          <Button
            type='button'
            variant='outline'
            size='icon'
            disabled={page * 20 >= total}
            onClick={() => setPage((value) => value + 1)}
            aria-label={t('Next page')}
          >
            <ChevronRight className='size-4' />
          </Button>
        </div>
      </div>
      {selected && (
        <div className='bg-card rounded-md border p-5'>
          <div className='mb-4 flex items-center justify-between gap-3'>
            <h2 className='text-base font-semibold'>{t('Request details')}</h2>
            <Button
              type='button'
              variant='outline'
              onClick={() => setSelected(null)}
            >
              {t('Close')}
            </Button>
          </div>
          <dl className='grid gap-3 text-sm sm:grid-cols-2'>
            <div>
              <dt className='text-muted-foreground'>{t('Request ID')}</dt>
              <dd className='break-all'>{selected.request_id || '-'}</dd>
            </div>
            <div>
              <dt className='text-muted-foreground'>{t('Channel')}</dt>
              <dd>{selected.channel_name || selected.channel || '-'}</dd>
            </div>
            <div>
              <dt className='text-muted-foreground'>{t('Size')}</dt>
              <dd>{selectedInfo?.image_studio_size || t('Model default')}</dd>
            </div>
            <div>
              <dt className='text-muted-foreground'>{t('Quality')}</dt>
              <dd>
                {selectedInfo?.image_studio_quality || t('Model default')}
              </dd>
            </div>
            <div className='sm:col-span-2'>
              <dt className='text-muted-foreground'>{t('Prompt excerpt')}</dt>
              <dd className='break-words whitespace-pre-wrap'>
                {selectedInfo?.image_studio_prompt || '-'}
              </dd>
            </div>
            {selected.type === 5 && (
              <div className='sm:col-span-2'>
                <dt className='text-muted-foreground'>{t('Error')}</dt>
                <dd className='break-words'>{selected.content}</dd>
              </div>
            )}
          </dl>
        </div>
      )}
      <Dialog
        open={preview !== null}
        onOpenChange={(open) => { if (!open) setPreview(null) }}
      >
        <DialogContent className='sm:max-w-5xl'>
          <DialogHeader>
            <DialogTitle>{t('Images')}</DialogTitle>
          </DialogHeader>
          <div className='grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4'>
            {preview && Array.from({ length: previewCount }, (_, index) => (
              <div key={`${preview.request_id}-${index}`} className='aspect-square overflow-hidden rounded-md border bg-muted'>
                <GeneratedImage requestId={preview.request_id} index={index} />
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </SettingsPageFrame>
  )
}
