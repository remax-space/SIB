'use client'

import type { ReactNode } from 'react'
import { Maximize2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'

export function ExpandedView({ title, children, label = 'Ampliar visualização', description = 'Visualização ampliada do conteúdo disponível no SIB.' }: { title: string; children: ReactNode; label?: string; description?: string }) {
  return <Dialog><DialogTrigger asChild><Button type="button" variant="outline" size="sm" aria-label={`${label}: ${title}`}><Maximize2 className="mr-2 h-4 w-4" aria-hidden="true" />{label}</Button></DialogTrigger>
    <DialogContent className="flex h-[92dvh] w-[calc(100vw-1rem)] max-w-6xl flex-col gap-4 p-4 sm:p-6">
      <DialogHeader className="shrink-0 pr-10 text-left"><DialogTitle className="break-words leading-6">{title}</DialogTitle><DialogDescription>{description}</DialogDescription></DialogHeader>
      <div tabIndex={0} role="region" aria-label={title} className="min-h-0 flex-1 overflow-y-auto overscroll-contain rounded px-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><div className="mx-auto max-w-4xl space-y-4 pb-4 break-words">{children}</div></div>
    </DialogContent>
  </Dialog>
}
