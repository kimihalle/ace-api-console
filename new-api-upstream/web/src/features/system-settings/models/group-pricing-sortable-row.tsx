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
import { GripVertical } from 'lucide-react'
import { Reorder, useDragControls } from 'motion/react'
import { createContext, useContext, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'

const DragContext = createContext<ReturnType<typeof useDragControls> | null>(
  null
)

type GroupPricingSortableRowProps = {
  id: string
  children: ReactNode
  onDragEnd: () => void
}

export function GroupPricingSortableRow(props: GroupPricingSortableRowProps) {
  const controls = useDragControls()
  return (
    <DragContext.Provider value={controls}>
      <Reorder.Item
        as='tr'
        value={props.id}
        dragListener={false}
        dragMomentum={false}
        dragControls={controls}
        onDragEnd={props.onDragEnd}
        data-slot='table-row'
        className='bg-card relative border-b'
        whileDrag={{ zIndex: 1 }}
      >
        {props.children}
      </Reorder.Item>
    </DragContext.Provider>
  )
}

type GroupPricingDragHandleProps = {
  name: string
  disabled: boolean
  onMove: (direction: 'up' | 'down') => void
}

export function GroupPricingDragHandle(props: GroupPricingDragHandleProps) {
  const { t } = useTranslation()
  const controls = useContext(DragContext)
  return (
    <Button
      type='button'
      variant='ghost'
      size='icon-sm'
      className='text-muted-foreground cursor-grab touch-none active:cursor-grabbing'
      disabled={props.disabled}
      aria-label={t('Drag {{group}} to reorder', { group: props.name })}
      title={t('Drag to reorder. Use Up and Down arrow keys when focused.')}
      onPointerDown={(event) => {
        if (!props.disabled) controls?.start(event)
      }}
      onKeyDown={(event) => {
        if (props.disabled || !['ArrowUp', 'ArrowDown'].includes(event.key)) {
          return
        }
        event.preventDefault()
        props.onMove(event.key === 'ArrowUp' ? 'up' : 'down')
      }}
    >
      <GripVertical className='size-4' aria-hidden='true' />
    </Button>
  )
}
