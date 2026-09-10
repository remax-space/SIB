'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { signOut } from 'next-auth/react'
import { LogOut } from 'lucide-react'
import { cn } from '@/lib/utils'
import { SIB_VERSION } from '@/lib/constants'
import { ThemeToggle } from '@/components/theme-toggle'

const navSections = [
  {
    items: [
      { href: '/', label: 'CRIADOR' },
      { href: '/mestre', label: 'MESTRE' },
      { href: '/orientacoes', label: 'ORIENTADOR' },
      { href: '/jurisprudencia', label: 'JURISPRUDÊNCIA' },
    ],
  },
  {
    items: [
      { href: '/casos', label: 'Processos' },
      { href: '/caixas', label: 'Caixas Processuais' },
      { href: '/triagem', label: 'Triagem Documental' },
    ],
  },
  {
    items: [
      { href: '/clientes', label: 'PESQUISA CLIENTES' },
      { href: '/datajud', label: 'DATAJUD CNJ' },
    ],
  },
]

const adminItems = [
  { href: '/licencas', label: 'LICENÇAS / MÁQUINAS' },
  { href: '/provedores', label: 'PROVEDORES DE IA' },
  { href: '/configuracoes', label: 'Configurações' },
]

export function Sidebar({ role }: { role?: string }) {
  const pathname = usePathname()
  const isAdmin = role === 'ADMIN'

  return (
    <>
      {/* Logo */}
      <div className="mb-6 flex flex-col items-center">
        <Link href="/" className="flex flex-col items-center gap-2">
          <div className="w-24 h-24 rounded-2xl overflow-hidden border border-primary/40 shadow-lg">
            <Image
              src="/sib-logo.png"
              alt="SIB — Sistema Inteligência Jurídica Basile"
              width={96}
              height={96}
              className="w-full h-full object-cover"
              priority
            />
          </div>
        </Link>
      </div>

      {/* Navigation */}
      <nav className="space-y-2 flex-1">
        {navSections.map((section, si) => (
          <div key={si} className={cn('space-y-2', si > 0 && 'mt-3 pt-3 border-t border-border/40')}>
            {section.items.map((item) => {
              const isActive = item.href === '/'
                ? pathname === '/'
                : pathname?.startsWith(item.href)
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    'block px-4 py-2.5 rounded-md text-[13px] font-semibold tracking-wide transition-all duration-150',
                    isActive
                      ? 'bg-nav-active text-nav-active-foreground shadow-sm'
                      : 'bg-nav text-nav-foreground hover:bg-nav-hover'
                  )}
                >
                  {item.label}
                </Link>
              )
            })}
          </div>
        ))}

        {isAdmin && (
          <div className="space-y-2 mt-3 pt-3 border-t border-border/40">
            {adminItems.map((item) => {
              const isActive = pathname?.startsWith(item.href)
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    'block px-4 py-2.5 rounded-md text-[13px] font-semibold tracking-wide transition-all duration-150',
                    isActive
                      ? 'bg-nav-active text-nav-active-foreground shadow-sm'
                      : 'bg-nav text-nav-foreground hover:bg-nav-hover'
                  )}
                >
                  {item.label}
                </Link>
              )
            })}
          </div>
        )}
      </nav>

      {/* Footer */}
      <div className="mt-auto pt-3 border-t border-border/50">
        <div className="mb-2 flex items-center justify-between px-1">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Aparência</span>
          <ThemeToggle />
        </div>
        <button
          onClick={() => signOut({ redirectTo: '/login' })}
          className="w-full flex items-center gap-2 px-4 py-2.5 rounded-md text-[13px] font-semibold tracking-wide bg-danger-surface text-danger-surface-foreground hover:bg-danger-surface-hover border border-danger-surface-border transition-colors mb-3"
        >
          <LogOut className="w-3.5 h-3.5" /> SAIR
        </button>
        <div className="px-1 py-2 space-y-0.5">
          <p className="text-[11px] font-bold text-primary">SIB-00 MESTRE</p>
          <p className="text-[10px] text-muted-foreground">{isAdmin ? 'Operador mestre' : 'Licença de máquina'}</p>
          <p className="text-[9px] text-muted-foreground/50 font-mono mt-1">v{SIB_VERSION}</p>
        </div>
      </div>
    </>
  )
}
