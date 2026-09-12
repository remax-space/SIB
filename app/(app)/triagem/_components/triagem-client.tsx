'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { PageHeader } from '@/components/layouts/page-header'
import { FileSearch, FileText, CheckCircle, AlertCircle, Clock, Eye } from 'lucide-react'
import { READ_STATUSES } from '@/lib/constants'

export function TriagemClient() {
  const [docs, setDocs] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/documents')
      .then((res) => res.json())
      .then((data) => setDocs(Array.isArray(data) ? data : []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'LIDO_INTEGRALMENTE': return <CheckCircle className="w-3.5 h-3.5 text-success" />
      case 'LIDO_PARCIALMENTE': return <Eye className="w-3.5 h-3.5 text-info" />
      case 'ILEGIVEL': return <AlertCircle className="w-3.5 h-3.5 text-destructive" />
      default: return <Clock className="w-3.5 h-3.5 text-warning" />
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Triagem Documental"
        description="Visão geral do corpus documental e status de leitura"
      />

      {loading ? (
        <p className="text-sm text-muted-foreground">Carregando documentos...</p>
      ) : docs.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <FileSearch className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground">Nenhum documento encontrado.</p>
            <p className="text-sm text-muted-foreground mt-1">Faça upload de PDFs nos processos cadastrados.</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="text-left py-2.5 px-4 text-xs text-muted-foreground font-medium">Documento</th>
                  <th className="text-left py-2.5 px-4 text-xs text-muted-foreground font-medium">Processo</th>
                  <th className="text-left py-2.5 px-4 text-xs text-muted-foreground font-medium">Páginas</th>
                  <th className="text-left py-2.5 px-4 text-xs text-muted-foreground font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {docs.map((doc: any) => {
                  const statusDef = READ_STATUSES.find((status) => status.value === doc.readStatus)
                  return (
                    <tr key={doc.id} className="border-b border-border/50 hover:bg-accent/30 transition-colors">
                      <td className="py-2 px-4">
                        <div className="flex items-center gap-2">
                          <FileText className="w-3.5 h-3.5 text-muted-foreground" />
                          <span className="text-xs">{doc.filename}</span>
                        </div>
                      </td>
                      <td className="py-2 px-4 text-xs font-mono text-primary">
                        {doc.caseDbId ? (
                          <Link href={`/casos/${doc.caseDbId}`} className="hover:underline">{doc.caseName}</Link>
                        ) : (
                          doc.caseName
                        )}
                      </td>
                      <td className="py-2 px-4 text-xs text-muted-foreground">{doc.pageCount ?? '—'}</td>
                      <td className="py-2 px-4">
                        <div className="flex items-center gap-1.5">
                          {getStatusIcon(doc.readStatus)}
                          <span className={`text-xs ${statusDef?.color?.split(' ')[1] ?? ''}`}>{statusDef?.label ?? doc.readStatus}</span>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
