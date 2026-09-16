'use client'

import { useState } from 'react'
import { Info } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'

const explanations: Record<string, string> = {
  PENDENTE: 'Este item foi cadastrado, mas ainda não passou pela etapa necessária de processamento. Verifique se a extração foi iniciada e se o arquivo está disponível.',
  LIDO_PARCIALMENTE: 'A leitura foi concluída apenas em parte. Algumas páginas podem estar sem texto pesquisável ou exigir OCR; revise o documento antes de tomar uma decisão.',
  ILEGIVEL: 'Não foi encontrado texto suficiente para uma leitura confiável. Envie uma versão com melhor qualidade ou providencie OCR.',
  EM_ANDAMENTO: 'O processamento ainda está sendo executado. Aguarde a conclusão para acessar todos os resultados.',
}

export function StatusExplanation({ status, label, detail }: { status?: string; label?: string; detail?: string }) {
  const [open, setOpen] = useState(false)
  const normalized = String(status ?? '').toUpperCase()
  const explanation = detail ?? explanations[normalized] ?? 'Não há uma explicação adicional registrada para este status.'
  return <>
    <button type="button" onClick={() => setOpen(true)} className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs hover:ring-2 hover:ring-primary/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label={`Ver motivo do status ${label ?? status}`}><span>{label ?? status}</span><Info className="h-3 w-3" /></button>
    <Dialog open={open} onOpenChange={setOpen}><DialogContent className="sm:max-w-md"><DialogHeader><DialogTitle>Status: {label ?? status}</DialogTitle><DialogDescription>{explanation}</DialogDescription></DialogHeader></DialogContent></Dialog>
  </>
}
