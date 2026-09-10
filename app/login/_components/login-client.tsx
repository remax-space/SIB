'use client'

import { useState } from 'react'
import Image from 'next/image'
import { signIn } from 'next-auth/react'
import { getDeviceFingerprint } from '@/lib/fingerprint'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Loader2, KeyRound, ShieldCheck, Lock } from 'lucide-react'
import { ThemeToggle } from '@/components/theme-toggle'

type Mode = 'machine' | 'admin'

export function LoginClient() {
  const [mode, setMode] = useState<Mode>('machine')
  const [licenseKey, setLicenseKey] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleMachine(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const fingerprint = await getDeviceFingerprint()
      const res = await signIn('credentials', {
        mode: 'machine',
        licenseKey,
        fingerprint,
        redirect: false,
      })
      if (res?.error) {
        setError('Licença inválida, revogada ou já vinculada a outra máquina.')
      } else {
        window.location.href = '/'
      }
    } catch {
      setError('Falha ao validar a licença. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  async function handleAdmin(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await signIn('credentials', {
        mode: 'admin',
        email,
        password,
        redirect: false,
      })
      if (res?.error) {
        setError('Credenciais do operador mestre incorretas.')
      } else {
        window.location.href = '/'
      }
    } catch {
      setError('Falha na autenticação. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="relative min-h-screen flex items-center justify-center bg-background px-4">
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center mb-8">
          <div className="relative w-20 h-20 mb-4">
            <Image src="/sib-logo.png" alt="SIB" fill className="object-contain" priority />
          </div>
          <h1 className="text-xl font-bold text-foreground tracking-wide">SIB</h1>
          <p className="text-xs text-muted-foreground mt-1">Sistema de Inteligência Basile</p>
        </div>

        <div className="bg-card border border-nav-border rounded-xl p-6 shadow-lg">
          <div className="flex gap-2 mb-6">
            <button
              type="button"
              onClick={() => { setMode('machine'); setError('') }}
              className={`flex-1 flex items-center justify-center gap-2 text-xs font-bold py-2.5 rounded-lg border transition-colors ${mode === 'machine' ? 'bg-nav text-nav-foreground border-nav-border' : 'bg-transparent text-muted-foreground border-transparent hover:text-foreground'}`}
            >
              <KeyRound className="w-3.5 h-3.5" /> LICENÇA
            </button>
            <button
              type="button"
              onClick={() => { setMode('admin'); setError('') }}
              className={`flex-1 flex items-center justify-center gap-2 text-xs font-bold py-2.5 rounded-lg border transition-colors ${mode === 'admin' ? 'bg-nav text-nav-foreground border-nav-border' : 'bg-transparent text-muted-foreground border-transparent hover:text-foreground'}`}
            >
              <ShieldCheck className="w-3.5 h-3.5" /> ACESSO MESTRE
            </button>
          </div>

          {mode === 'machine' ? (
            <form onSubmit={handleMachine} className="space-y-4">
              <div>
                <label className="text-xs font-bold text-foreground/80 tracking-wide mb-1.5 block">
                  CHAVE DE LICENÇA DA MÁQUINA
                </label>
                <Input
                  value={licenseKey}
                  onChange={(e) => setLicenseKey(e.target.value)}
                  placeholder="SIB-XXXX-XXXX-XXXX"
                  className="bg-input border-border text-sm font-mono tracking-wider uppercase"
                  autoComplete="off"
                  required
                />
                <p className="text-[11px] text-muted-foreground mt-2 leading-relaxed">
                  A licença trava nesta máquina no primeiro acesso. Não funcionará em outro computador.
                </p>
              </div>
              {error && <p className="text-xs text-destructive">{error}</p>}
              <Button type="submit" disabled={loading} className="w-full bg-nav text-nav-foreground hover:bg-nav-hover border border-nav-border font-bold text-xs tracking-wide">
                {loading ? <><Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />VALIDANDO...</> : <><Lock className="w-3.5 h-3.5 mr-2" />ACESSAR SISTEMA</>}
              </Button>
            </form>
          ) : (
            <form onSubmit={handleAdmin} className="space-y-4">
              <div>
                <label className="text-xs font-bold text-foreground/80 tracking-wide mb-1.5 block">E-MAIL DO OPERADOR</label>
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="operador@sib.com"
                  className="bg-input border-border text-sm"
                  autoComplete="username"
                  required
                />
              </div>
              <div>
                <label className="text-xs font-bold text-foreground/80 tracking-wide mb-1.5 block">SENHA MESTRE</label>
                <Input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="bg-input border-border text-sm"
                  autoComplete="current-password"
                  required
                />
              </div>
              {error && <p className="text-xs text-destructive">{error}</p>}
              <Button type="submit" disabled={loading} className="w-full bg-nav text-nav-foreground hover:bg-nav-hover border border-nav-border font-bold text-xs tracking-wide">
                {loading ? <><Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />ENTRANDO...</> : <><ShieldCheck className="w-3.5 h-3.5 mr-2" />ENTRAR COMO MESTRE</>}
              </Button>
            </form>
          )}
        </div>

        <p className="text-center text-[11px] text-muted-foreground mt-6">
          Acesso restrito · Uso autorizado somente mediante licença
        </p>
      </div>
    </div>
  )
}
