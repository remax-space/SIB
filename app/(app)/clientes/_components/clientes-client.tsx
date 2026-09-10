'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { PageHeader } from '@/components/layouts/page-header'
import { Input } from '@/components/ui/input'
import { Users, Search, User } from 'lucide-react'

export function ClientesClient() {
  const [cases, setCases] = useState<any[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/cases')
      .then(r => r.json())
      .then(data => setCases(data ?? []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const clientMap = new Map<string, { name: string; doc?: string; cases: any[] }>()
  for (const c of cases) {
    const key = (c.clientName || 'Sem Nome').toLowerCase()
    if (!clientMap.has(key)) {
      clientMap.set(key, { name: c.clientName || 'Sem Nome', doc: c.clientDoc, cases: [] })
    }
    clientMap.get(key)!.cases.push(c)
  }

  const clients = Array.from(clientMap.values())
    .filter(cl => !search || cl.name.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name))

  return (
    <div className="space-y-6">
      <PageHeader
        title="Pesquisa Clientes"
        description="Busca e visualização de clientes cadastrados no sistema"
      />

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Buscar cliente por nome..."
          className="pl-10"
        />
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Carregando...</p>
      ) : clients.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <Users className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground">{search ? 'Nenhum cliente encontrado para esta busca.' : 'Nenhum cliente cadastrado.'}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {clients.map((cl, i) => (
            <Card key={i} variant="interactive">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-primary/10">
                    <User className="w-5 h-5 text-primary" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-bold">{cl.name}</p>
                    {cl.doc && <p className="text-[10px] text-muted-foreground font-mono">{cl.doc}</p>}
                    <p className="text-[10px] text-muted-foreground">{cl.cases.length} processo(s)</p>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {cl.cases.slice(0, 3).map((c: any) => (
                      <Link key={c.id} href={`/casos/${c.id}`} className="text-[10px] font-mono text-primary hover:underline bg-primary/5 px-2 py-0.5 rounded">
                        {c.caseId}
                      </Link>
                    ))}
                    {cl.cases.length > 3 && <span className="text-[10px] text-muted-foreground">+{cl.cases.length - 3}</span>}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
