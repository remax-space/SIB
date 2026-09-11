'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { PageHeader } from '@/components/layouts/page-header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { FadeIn } from '@/components/ui/animate'
import { ArrowLeft, Upload, FileText, Brain, Trash2, Eye, RefreshCw, Plus } from 'lucide-react'
import { CASE_STATUSES, READ_STATUSES, ANALYSIS_STATUSES, getIcpClass } from '@/lib/constants'
import { toast } from 'sonner'
import { putUploadedFile } from '@/lib/upload-file'

export function CaseDetailClient({ caseId }: { caseId: string }) {
  const [caseData, setCaseData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [extracting, setExtracting] = useState<string | null>(null)
  const [viewDoc, setViewDoc] = useState<any>(null)

  const fetchCase = useCallback(() => {
    fetch(`/api/cases/${caseId}`)
      .then((r) => r.json())
      .then((data) => setCaseData(data))
      .catch((e) => console.error(e))
      .finally(() => setLoading(false))
  }, [caseId])

  useEffect(() => { fetchCase() }, [fetchCase])

  async function handleUpload(files: FileList | null) {
    if (!files?.length) return
    setUploading(true)
    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i]
        if (!file) continue

        // Step 1: Get presigned URL
        const presignRes = await fetch('/api/documents/upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            caseId,
            fileName: file.name,
            contentType: file.type || 'application/pdf',
            fileSize: file.size,
          }),
        })
        if (!presignRes.ok) {
          toast.error(`Erro ao preparar upload de ${file.name}`)
          continue
        }
        const { uploadUrl, cloud_storage_path } = await presignRes.json()

        try {
          await putUploadedFile(uploadUrl, file, cloud_storage_path)
        } catch {
          toast.error(`Erro ao enviar ${file.name}`)
          continue
        }

        // Step 3: Register in DB
        await fetch('/api/documents/complete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            caseId,
            fileName: file.name,
            contentType: file.type || 'application/pdf',
            fileSize: file.size,
            cloud_storage_path,
          }),
        })

        toast.success(`${file.name} enviado com sucesso`)
      }
      fetchCase()
    } catch (err: any) {
      console.error(err)
      toast.error('Erro no upload')
    } finally {
      setUploading(false)
    }
  }

  async function handleExtract(docId: string) {
    setExtracting(docId)
    try {
      const res = await fetch(`/api/documents/${docId}/extract`, { method: 'POST' })
      if (!res.ok) {
        const data = await res.json()
        toast.error(data?.error ?? 'Erro na extração')
        return
      }
      toast.success('Texto extraído com sucesso')
      fetchCase()
    } catch (err: any) {
      console.error(err)
      toast.error('Erro na extração')
    } finally {
      setExtracting(null)
    }
  }

  async function handleDeleteDoc(docId: string) {
    if (!confirm('Excluir este documento?')) return
    try {
      await fetch(`/api/documents/${docId}`, { method: 'DELETE' })
      toast.success('Documento excluído')
      fetchCase()
    } catch (err: any) {
      console.error(err)
      toast.error('Erro ao excluir')
    }
  }

  if (loading) return <p className="text-muted-foreground">Carregando caso...</p>
  if (!caseData || caseData?.error) return <p className="text-destructive">Caso não encontrado.</p>

  const statusDef = CASE_STATUSES?.find((s: any) => s?.value === caseData?.status)

  return (
    <div className="space-y-6">
      <FadeIn>
        <PageHeader
          title={caseData?.title ?? 'Caso'}
          description={`${caseData?.caseId} • ${caseData?.clientName} • ${caseData?.classText}`}
          actions={
            <div className="flex gap-2">
              <Link href="/casos">
                <Button variant="ghost" size="sm"><ArrowLeft className="w-4 h-4 mr-1" />Voltar</Button>
              </Link>
              <span className={`text-xs px-3 py-1.5 rounded-full ${statusDef?.color ?? ''} flex items-center`}>
                {statusDef?.label ?? caseData?.status}
              </span>
            </div>
          }
        />
      </FadeIn>

      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview">Visão Geral</TabsTrigger>
          <TabsTrigger value="corpus">Corpus Documental</TabsTrigger>
          <TabsTrigger value="analyses">Análises</TabsTrigger>
        </TabsList>

        {/* OVERVIEW TAB */}
        <TabsContent value="overview">
          <Card>
            <CardContent className="p-6 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-muted-foreground">Número Processual</p>
                  <p className="font-mono text-sm">{caseData?.caseId}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Cliente</p>
                  <p className="text-sm">{caseData?.clientName}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Classe Processual</p>
                  <p className="text-sm">{caseData?.classText}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Papel Principal</p>
                  <p className="text-sm">{caseData?.primaryRole}</p>
                </div>
                {caseData?.objective && (
                  <div className="md:col-span-2">
                    <p className="text-xs text-muted-foreground">Objetivo Processual</p>
                    <p className="text-sm">{caseData.objective}</p>
                  </div>
                )}
                {caseData?.cutoffDate && (
                  <div>
                    <p className="text-xs text-muted-foreground">Data de Corte</p>
                    <p className="text-sm font-mono">{caseData.cutoffDate}</p>
                  </div>
                )}
                {caseData?.clientDoc && (
                  <div>
                    <p className="text-xs text-muted-foreground">CPF/CNPJ</p>
                    <p className="text-sm font-mono">{caseData.clientDoc}</p>
                  </div>
                )}
                {caseData?.notes && (
                  <div className="md:col-span-2">
                    <p className="text-xs text-muted-foreground">Observações</p>
                    <p className="text-sm">{caseData.notes}</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* CORPUS TAB */}
        <TabsContent value="corpus">
          <div className="space-y-4">
            {/* Upload area */}
            <Card>
              <CardContent className="p-6">
                <label className="flex flex-col items-center justify-center py-8 border-2 border-dashed border-border rounded-lg cursor-pointer hover:border-primary/50 transition-colors">
                  <Upload className="w-8 h-8 text-muted-foreground mb-2" />
                  <p className="text-sm text-muted-foreground">
                    {uploading ? 'Enviando...' : 'Clique ou arraste arquivos PDF aqui'}
                  </p>
                  <input
                    type="file"
                    accept=".pdf"
                    multiple
                    className="hidden"
                    disabled={uploading}
                    onChange={(e: any) => handleUpload(e?.target?.files)}
                  />
                </label>
              </CardContent>
            </Card>

            {/* Document list */}
            {(caseData?.documents?.length ?? 0) === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum documento no corpus.</p>
            ) : (
              <div className="space-y-2">
                {(caseData?.documents ?? []).map((doc: any) => {
                  const readDef = READ_STATUSES?.find((s: any) => s?.value === doc?.readStatus);
                  return (
                    <Card key={doc?.id} variant="interactive">
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-3 flex-1 min-w-0">
                            <FileText className="w-5 h-5 text-primary shrink-0" />
                            <div className="min-w-0">
                              <p className="text-sm font-medium truncate">{doc?.filename}</p>
                              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                <span>{((doc?.fileSize ?? 0) / 1024).toFixed(0)} KB</span>
                                {doc?.pageCount && <span>• {doc.pageCount} pág.</span>}
                                <span className={`px-1.5 py-0.5 rounded-sm ${readDef?.color ?? ''}`}>
                                  {readDef?.label ?? doc?.readStatus}
                                </span>
                              </div>
                              <p className="text-[10px] font-mono text-muted-foreground/60 mt-0.5">SHA-256: {doc?.sha256?.substring(0, 16)}...</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            {doc?.extractedText && (
                              <Button variant="ghost" size="icon-sm" onClick={() => setViewDoc(viewDoc?.id === doc?.id ? null : doc)}>
                                <Eye className="w-4 h-4" />
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              onClick={() => handleExtract(doc?.id)}
                              disabled={extracting === doc?.id}
                            >
                              <RefreshCw className={`w-4 h-4 ${extracting === doc?.id ? 'animate-spin' : ''}`} />
                            </Button>
                            <Button variant="ghost" size="icon-sm" onClick={() => handleDeleteDoc(doc?.id)}>
                              <Trash2 className="w-4 h-4 text-destructive" />
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}

            {/* Text viewer */}
            {viewDoc && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Texto Extraído: {viewDoc?.filename}</CardTitle>
                </CardHeader>
                <CardContent>
                  <pre className="text-xs whitespace-pre-wrap max-h-96 overflow-y-auto bg-muted/50 p-4 rounded-lg font-mono">
                    {viewDoc?.extractedText ?? '(sem texto)'}
                  </pre>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        {/* ANALYSES TAB */}
        <TabsContent value="analyses">
          <div className="space-y-4">
            <div className="flex justify-end">
              <Link href={`/casos/${caseId}/analise/nova`}>
                <Button size="sm"><Plus className="w-4 h-4 mr-1" />Nova Análise</Button>
              </Link>
            </div>

            {(caseData?.analyses?.length ?? 0) === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <Brain className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
                  <p className="text-muted-foreground">Nenhuma análise realizada para este caso.</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-2">
                {(caseData?.analyses ?? []).map((a: any) => {
                  const statusDef = ANALYSIS_STATUSES?.find((s: any) => s?.value === a?.status);
                  return (
                    <Link key={a?.id} href={`/casos/${caseId}/analise/${a?.id}`}>
                      <Card variant="interactive" className="mb-2">
                        <CardContent className="p-4">
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <p className="font-mono text-xs text-primary">{a?.jobId}</p>
                              <p className="text-sm text-muted-foreground mt-0.5">
                                {a?.runMode === 'COMPLETA' ? '5 Agentes' : a?.runMode} • {a?.provider}
                              </p>
                            </div>
                            <div className="flex items-center gap-3">
                              {a?.icpScore != null && (
                                <span className={`font-mono font-bold text-lg ${getIcpClass(a.icpScore)}`}>
                                  {Number(a.icpScore).toFixed(1)}
                                </span>
                              )}
                              <span className={`text-xs px-2 py-0.5 rounded-full ${statusDef?.color ?? ''}`}>
                                {statusDef?.label ?? a?.status}
                              </span>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
