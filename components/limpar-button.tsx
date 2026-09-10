'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Eraser } from 'lucide-react'
import { toast } from 'sonner'

/**
 * Botão LIMPAR reutilizável.
 * Limpa/reseta os dados exibidos na janela atual (não apaga registros do banco,
 * a menos que onClear faça isso explicitamente). Uso: <LimparButton onClear={...} />
 */
export function LimparButton({
  onClear,
  label = 'Limpar',
  confirmMessage = 'Deseja limpar os dados exibidos nesta janela?',
  successMessage = 'Dados limpos',
  size = 'sm',
  variant = 'outline',
}: {
  onClear: () => void
  label?: string
  confirmMessage?: string
  successMessage?: string
  size?: 'sm' | 'default' | 'lg' | 'icon'
  variant?: 'outline' | 'ghost' | 'destructive' | 'default' | 'secondary'
}) {
  const [busy, setBusy] = useState(false)
  function handleClick() {
    if (typeof window !== 'undefined' && !window.confirm(confirmMessage)) return
    try {
      setBusy(true)
      onClear()
      toast.success(successMessage)
    } finally {
      setBusy(false)
    }
  }
  return (
    <Button type="button" variant={variant} size={size} onClick={handleClick} disabled={busy} title={label}>
      <Eraser className="w-4 h-4 mr-1" />
      {label}
    </Button>
  )
}
