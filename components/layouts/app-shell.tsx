'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import { PanelLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetTitle, SheetDescription, SheetTrigger } from '@/components/ui/sheet'

export function AppShell({
  sidebar,
  header,
  children,
  className,
}: {
  sidebar: React.ReactNode
  header?: React.ReactNode
  children: React.ReactNode
  className?: string
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false)

  return (
    <div className="min-h-screen bg-background">
      {/* Sidebar */}
      <aside
        className={cn(
          'hidden md:block fixed inset-y-0 left-0 z-50 w-64 border-r bg-card'
        )}
      >
        <div className="flex h-full flex-col overflow-y-auto p-4">
          {sidebar}
        </div>
      </aside>

      {/* Main area */}
      <div className="md:pl-64">
        {/* Header */}
        <header className="sticky top-0 z-30 flex h-14 items-center gap-4 border-b bg-card/80 backdrop-blur-md px-4 sm:px-6 md:hidden">
          <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}><SheetTrigger asChild><Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            aria-label="Abrir navegação"
          >
            <PanelLeft className="h-5 w-5" />
          </Button></SheetTrigger><SheetContent side="left" className="w-72 overflow-y-auto"><SheetTitle className="sr-only">Navegação do SIB</SheetTitle><SheetDescription className="sr-only">Escolha uma área do sistema.</SheetDescription><div onClick={event => { if ((event.target as HTMLElement).closest('a')) setSidebarOpen(false) }}>{sidebar}</div></SheetContent></Sheet>
          {header}
        </header>

        {/* Content */}
        <main className={cn('p-4 sm:p-6 lg:p-8', className)}>
          {children}
        </main>
      </div>
    </div>
  )
}
