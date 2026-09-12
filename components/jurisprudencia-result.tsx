import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { BookMarked } from 'lucide-react'

function favorColor(favor?: string) {
  return favor === 'FAVORAVEL' ? 'bg-success/20 text-success'
    : favor === 'CONTRARIO' ? 'bg-destructive/20 text-destructive'
    : 'bg-info/20 text-info'
}

export function JurisprudenciaResult({
  result,
  caseHref,
}: {
  result: any
  caseHref?: string
}) {
  if (!result) return null

  if (result.sem_resultados) {
    return (
      <Card className="border-warning/40">
        <CardContent className="p-5">
          <p className="text-sm text-warning">
            Nenhum precedente foi retornado pela base para esta consulta. O agente não produz jurisprudência sem resultados reais.
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      {result.sintese_jurisprudencial && (
        <Card className="border-primary/30">
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <BookMarked className="w-4 h-4 text-primary" /> Síntese Jurisprudencial
            </CardTitle>
          </CardHeader>
          <CardContent><p className="text-sm">{result.sintese_jurisprudencial}</p></CardContent>
        </Card>
      )}
      {(result.precedentes_aplicaveis?.length ?? 0) > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-sm">Precedentes Aplicáveis</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {(result.precedentes_aplicaveis ?? []).map((precedente: any, index: number) => (
              <div key={index} className="p-3 bg-muted/50 rounded-lg">
                <div className="flex flex-wrap items-center gap-2 mb-1">
                  <span className={`text-[10px] px-1.5 py-0.5 rounded ${favorColor(precedente?.favoravel)}`}>
                    {precedente?.favoravel ?? '—'}
                  </span>
                  {precedente?.forca && <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted">{precedente.forca}</span>}
                  {precedente?.tribunal && <span className="text-[11px] text-muted-foreground">{precedente.tribunal}</span>}
                </div>
                {precedente?.identificacao && <p className="text-xs font-semibold">{precedente.identificacao}</p>}
                {precedente?.ementa_resumo && <p className="text-xs text-muted-foreground mt-1">{precedente.ementa_resumo}</p>}
                {precedente?.como_se_aplica && <p className="text-[11px] text-primary mt-1">Aplicação: {precedente.como_se_aplica}</p>}
              </div>
            ))}
          </CardContent>
        </Card>
      )}
      {(result.enfraquece_mestre?.length ?? 0) > 0 && (
        <Card className="border-destructive/40">
          <CardHeader><CardTitle className="text-sm">Pontos que Enfraquecem o MESTRE</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {(result.enfraquece_mestre ?? []).map((item: any, index: number) => (
              <div key={index} className="p-3 bg-muted/50 rounded-lg">
                <p className="text-sm font-medium">{item?.ponto_do_mestre ?? '—'}</p>
                {item?.risco && <p className="text-xs text-destructive mt-1">Risco: {item.risco}</p>}
                {item?.ajuste_sugerido && <p className="text-[11px] text-success mt-1">Ajuste: {item.ajuste_sugerido}</p>}
              </div>
            ))}
          </CardContent>
        </Card>
      )}
      {result.dialogo_orientador && (
        <Card>
          <CardHeader><CardTitle className="text-sm">Diálogo com o Orientador</CardTitle></CardHeader>
          <CardContent><p className="text-sm">{result.dialogo_orientador}</p></CardContent>
        </Card>
      )}
      {result.recomendacao_jurisprudencial && (
        <Card className="border-primary/30">
          <CardHeader><CardTitle className="text-sm">Recomendação Jurisprudencial</CardTitle></CardHeader>
          <CardContent><p className="text-sm font-medium">{result.recomendacao_jurisprudencial}</p></CardContent>
        </Card>
      )}
      {caseHref && (
        <Link href={caseHref} className="inline-block text-xs text-primary hover:underline">
          Ver análise completa →
        </Link>
      )}
    </div>
  )
}
