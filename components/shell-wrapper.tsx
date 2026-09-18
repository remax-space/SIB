'use client'

import { AppShell } from '@/components/layouts/app-shell'
import { Sidebar } from '@/components/sidebar'
import { AnalysisDrafts } from '@/components/analysis-drafts'

export function ShellWrapper({ children, role }: { children: React.ReactNode; role?: string }) {
  return (
    <AnalysisDrafts><AppShell sidebar={<Sidebar role={role} />}>
      {children}
    </AppShell></AnalysisDrafts>
  )
}
