'use client'

import { AppShell } from '@/components/layouts/app-shell'
import { Sidebar } from '@/components/sidebar'

export function ShellWrapper({ children, role }: { children: React.ReactNode; role?: string }) {
  return (
    <AppShell sidebar={<Sidebar role={role} />}>
      {children}
    </AppShell>
  )
}
