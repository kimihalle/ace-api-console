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
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar'
import { useStatus } from '@/hooks/use-status'
import { useSystemConfig } from '@/hooks/use-system-config'
import { cn } from '@/lib/utils'

import { HeaderLogo } from './header-logo'

type SystemBrandProps = {
  defaultName?: string
  defaultVersion?: string
  /**
   * Visual layout:
   * - 'sidebar': stacked card style (used inside the sidebar header).
   * - 'inline': compact horizontal pill (used inside the top app bar).
   */
  variant?: 'sidebar' | 'inline'
}

/**
 * System brand component
 * Displays current system logo + name.
 * - inline: compact pill in the top app bar; clicking navigates to home (/)
 * - sidebar: stacked card in the sidebar header (display only)
 */
export function SystemBrand(props: SystemBrandProps) {
  const { t } = useTranslation()
  const { status } = useStatus()
  const { logo, hasCustomLogo, systemName } = useSystemConfig()
  const [failedLogo, setFailedLogo] = useState('')
  const logoOnly = hasCustomLogo && failedLogo !== logo

  const variant = props.variant ?? 'sidebar'
  const name = status?.system_name || props.defaultName || systemName
  const version =
    status?.version || props.defaultVersion || t('Unknown version')

  if (variant === 'inline') {
    return (
      <a
        href='/'
        aria-label={name}
        title={name}
        className={cn(
          'text-foreground inline-flex h-7 min-w-0 items-center gap-1.5 rounded-md px-1.5 text-sm font-medium transition-colors outline-none select-none',
          'hover:bg-accent focus-visible:ring-ring/40 focus-visible:ring-2'
        )}
      >
        <div className='flex h-6 min-w-5 shrink-0 items-center justify-center'>
          <HeaderLogo
            key={logo}
            src={logo}
            alt=''
            loading={false}
            logoLoaded
            onError={() => setFailedLogo(logo)}
            onLoad={() => setFailedLogo('')}
          />
        </div>
        {!logoOnly && <span className='max-w-[12rem] truncate'>{name}</span>}
      </a>
    )
  }

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <SidebarMenuButton
          size='lg'
          className='hover:text-sidebar-foreground active:text-sidebar-foreground cursor-default hover:bg-transparent active:bg-transparent'
          render={<div />}
        >
          <div className='flex h-8 min-w-8 items-center justify-center group-data-[collapsible=icon]:w-8'>
            <HeaderLogo
              key={logo}
              src={logo}
              alt={name}
              loading={false}
              logoLoaded
              className='h-8 max-w-44 group-data-[collapsible=icon]:max-w-8'
              onError={() => setFailedLogo(logo)}
              onLoad={() => setFailedLogo('')}
            />
          </div>
          <div className='grid flex-1 text-start text-sm leading-tight group-data-[collapsible=icon]:hidden'>
            {!logoOnly && (
              <span className='truncate font-semibold'>{name}</span>
            )}
            <span className='truncate text-xs'>{version}</span>
          </div>
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
