'use client'

import { useState } from 'react'
import { PageHeader } from '@/components/layouts/page-header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { FadeIn } from '@/components/ui/animate'
import { Shield, Info, AlertTriangle } from 'lucide-react'
import { SIB_VERSION, SIB_BUILD_DATE } from '@/lib/constants'

export function ConfigClient() {
  return (
    <div className="space-y-6 max-w-3xl">
      <FadeIn>
        <PageHeader
          title="Configurações"
          description="Configurações gerais do sistema SIB"
        />
      </FadeIn>

      {/* System Info */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2"><Info className="w-4 h-4" />Informações do Sistema</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-xs text-muted-foreground">Versão</p>
              <p className="font-mono">{SIB_VERSION}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Data do Build</p>
              <p className="font-mono">{SIB_BUILD_DATE}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Metodologia</p>
              <p>Método Basile™</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Pipeline de Agentes</p>
              <p>5 agentes sequenciais</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Data Governance */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2"><Shield className="w-4 h-4" />Governança de Dados</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-xs text-muted-foreground">Modo de Privacidade</p>
              <p className="text-emerald-400">LEGAL_PROFESSIONAL</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Proteção de Dados</p>
              <p>Sigilo profissional ativo</p>
            </div>
          </div>
          <div className="p-3 bg-muted/50 rounded-lg text-xs text-muted-foreground">
            Os documentos e análises são armazenados com proteção de sigilo profissional. As chamadas de IA utilizam a infraestrutura segura da plataforma.
          </div>
        </CardContent>
      </Card>

      {/* ICP Reference */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">🏆 Escala ICP Basile</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 text-sm">
            <div className="flex items-center gap-3">
              <span className="w-16 text-right font-mono font-bold icp-excellent">90–100</span>
              <span>Altamente Confiável</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="w-16 text-right font-mono font-bold icp-good">75–89</span>
              <span>Fortemente Provável</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="w-16 text-right font-mono font-bold icp-moderate">60–74</span>
              <span>Moderadamente Sustentável</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="w-16 text-right font-mono font-bold icp-low">40–59</span>
              <span>Fragilmente Sustentável</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="w-16 text-right font-mono font-bold icp-critical">&lt;40</span>
              <span>Criticamente Insuficiente</span>
            </div>
          </div>
          <div className="mt-4 text-xs text-muted-foreground">
            <p><strong>Composição:</strong> Autenticidade (25), Completude (20), Corroboração (20), Coerência Cronológica (15), Contraditório (10), Validade Formal (10)</p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
