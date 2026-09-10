'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { PageHeader } from '@/components/layouts/page-header'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { FadeIn } from '@/components/ui/animate'
import { ArrowLeft, Save } from 'lucide-react'
import { LEGAL_CLASSES } from '@/lib/constants'
import { toast } from 'sonner'
import Link from 'next/link'

export function NovoCasoClient() {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    caseId: '',
    title: '',
    clientName: '',
    clientDoc: '',
    classText: '',
    primaryRole: '',
    objective: '',
    cutoffDate: '',
    notes: '',
  })

  function updateField(field: string, value: string) {
    setForm((prev) => {
      const next = { ...(prev ?? {}), [field]: value }
      if (field === 'classText') {
        const cls = LEGAL_CLASSES?.find((c: any) => c?.label === value)
        if (cls) next.primaryRole = cls.role
      }
      return next
    })
  }

  async function handleSubmit(e: React.FormEvent) {
    e?.preventDefault?.()
    if (!form?.caseId || !form?.title || !form?.clientName || !form?.classText) {
      toast.error('Preencha todos os campos obrigatórios')
      return
    }
    setSaving(true)
    try {
      const res = await fetch('/api/cases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      if (!res.ok) {
        const data = await res.json()
        toast.error(data?.error ?? 'Erro ao criar caso')
        return
      }
      const newCase = await res.json()
      toast.success('Caso criado com sucesso')
      router.push(`/casos/${newCase?.id}`)
    } catch (err: any) {
      console.error(err)
      toast.error('Erro ao criar caso')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <FadeIn>
        <PageHeader
          title="Novo Caso"
          description="Cadastre um novo caso jurídico para análise pelo Método Basile"
          actions={
            <Link href="/casos">
              <Button variant="ghost" size="sm"><ArrowLeft className="w-4 h-4 mr-1" />Voltar</Button>
            </Link>
          }
        />
      </FadeIn>

      <Card>
        <CardContent className="p-6">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Número Processual *</Label>
                <Input
                  placeholder="5000001-01.2026.8.09.0000"
                  value={form?.caseId ?? ''}
                  onChange={(e: any) => updateField('caseId', e?.target?.value ?? '')}
                />
              </div>
              <div className="space-y-2">
                <Label>Título do Caso *</Label>
                <Input
                  placeholder="Descrição curta do caso"
                  value={form?.title ?? ''}
                  onChange={(e: any) => updateField('title', e?.target?.value ?? '')}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Nome do Cliente *</Label>
                <Input
                  value={form?.clientName ?? ''}
                  onChange={(e: any) => updateField('clientName', e?.target?.value ?? '')}
                />
              </div>
              <div className="space-y-2">
                <Label>CPF/CNPJ</Label>
                <Input
                  value={form?.clientDoc ?? ''}
                  onChange={(e: any) => updateField('clientDoc', e?.target?.value ?? '')}
                  placeholder="Opcional"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Classe Processual *</Label>
                <select
                  value={form?.classText ?? ''}
                  onChange={(e: any) => updateField('classText', e?.target?.value ?? '')}
                  className="w-full bg-card border border-input rounded-lg px-3 py-2 text-sm text-foreground"
                >
                  <option value="">Selecione...</option>
                  {LEGAL_CLASSES?.map((c: any) => (
                    <option key={c?.value} value={c?.label}>{c?.label}</option>
                  )) ?? []}
                </select>
              </div>
              <div className="space-y-2">
                <Label>Papel Principal</Label>
                <Input value={form?.primaryRole ?? ''} readOnly className="text-muted-foreground" />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Objetivo Processual</Label>
              <Textarea
                value={form?.objective ?? ''}
                onChange={(e: any) => updateField('objective', e?.target?.value ?? '')}
                placeholder="Descreva o objetivo processual..."
                rows={3}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Data de Corte</Label>
                <Input
                  type="date"
                  value={form?.cutoffDate ?? ''}
                  onChange={(e: any) => updateField('cutoffDate', e?.target?.value ?? '')}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Observações</Label>
              <Textarea
                value={form?.notes ?? ''}
                onChange={(e: any) => updateField('notes', e?.target?.value ?? '')}
                rows={2}
              />
            </div>

            <div className="flex justify-end pt-4">
              <Button type="submit" disabled={saving}>
                <Save className="w-4 h-4 mr-1" />
                {saving ? 'Salvando...' : 'Criar Caso'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
