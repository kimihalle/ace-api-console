import { createFileRoute, redirect } from '@tanstack/react-router'

import { ImageStudioLogs } from '@/features/image-studio'
import { ROLE } from '@/lib/roles'
import { useAuthStore } from '@/stores/auth-store'

export const Route = createFileRoute('/_authenticated/image-studio/')({
  beforeLoad: () => {
    if ((useAuthStore.getState().auth.user?.role ?? 0) < ROLE.ADMIN) {
      throw redirect({ to: '/403' })
    }
  },
  component: ImageStudioLogs,
})
