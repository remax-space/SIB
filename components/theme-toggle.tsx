'use client'

import { Monitor, Moon, Sun } from 'lucide-react'
import { useTheme } from 'next-themes'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ClientOnly } from '@/components/client-only'
import { applyTheme, type SibTheme } from '@/lib/theme'
import { cn } from '@/lib/utils'

const OPTIONS: { value: SibTheme; label: string; icon: typeof Sun }[] = [
  { value: 'light', label: 'Claro', icon: Sun },
  { value: 'dark', label: 'Escuro', icon: Moon },
  { value: 'system', label: 'Sistema', icon: Monitor },
]

function ThemeIcon({ resolved }: { resolved?: string }) {
  return (
    <span className="relative flex h-4 w-4 items-center justify-center">
      <Sun
        className={cn(
          'absolute h-4 w-4 transition-all duration-300',
          resolved === 'dark' ? 'rotate-90 scale-0 opacity-0' : 'rotate-0 scale-100 opacity-100'
        )}
      />
      <Moon
        className={cn(
          'absolute h-4 w-4 transition-all duration-300',
          resolved === 'dark' ? 'rotate-0 scale-100 opacity-100' : '-rotate-90 scale-0 opacity-0'
        )}
      />
    </span>
  )
}

function ThemeToggleFallback({ className }: { className?: string }) {
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      className={cn('shrink-0', className)}
      aria-label="Alternar tema"
      title="Alternar tema"
      disabled
    >
      <ThemeIcon />
      <span className="sr-only">Alternar tema</span>
    </Button>
  )
}

function ThemeToggleMenu({ className }: { className?: string }) {
  const { theme, setTheme, resolvedTheme, systemTheme } = useTheme()

  const resolvedLabel =
    theme === 'system'
      ? `Sistema — ${systemTheme === 'dark' || resolvedTheme === 'dark' ? 'escuro' : 'claro'} agora`
      : theme === 'light'
        ? 'Tema claro'
        : 'Tema escuro'

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          className={cn('shrink-0', className)}
          aria-label={resolvedLabel}
          title={resolvedLabel}
        >
          <ThemeIcon resolved={resolvedTheme} />
          <span className="sr-only">Alternar tema</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        {OPTIONS.map(({ value, label, icon: Icon }) => {
          const active = theme === value
          const hint =
            value === 'system'
              ? resolvedTheme === 'dark'
                ? 'escuro agora'
                : 'claro agora'
              : null
          return (
            <DropdownMenuItem
              key={value}
              onClick={(event) => applyTheme(value, setTheme, event)}
              className={cn('gap-2', active && 'bg-accent')}
            >
              <Icon className="h-4 w-4" />
              <span className="flex-1">{label}</span>
              {hint && (
                <span className="text-[10px] text-muted-foreground">{hint}</span>
              )}
              {active && <span className="text-primary text-[10px] font-semibold">●</span>}
            </DropdownMenuItem>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function ThemeToggle({ className }: { className?: string }) {
  return (
    <ClientOnly fallback={<ThemeToggleFallback className={className} />}>
      <ThemeToggleMenu className={className} />
    </ClientOnly>
  )
}
