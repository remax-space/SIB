'use client'

import { Monitor, Moon, Sun } from 'lucide-react'
import { useTheme } from 'next-themes'
import { useMounted } from '@/components/client-only'
import { applyTheme, type SibTheme } from '@/lib/theme'
import { cn } from '@/lib/utils'

const CARDS: {
  value: SibTheme
  label: string
  description: string
  icon: typeof Sun
}[] = [
  {
    value: 'light',
    label: 'Claro',
    description: 'Off-white quente com dourado profundo.',
    icon: Sun,
  },
  {
    value: 'dark',
    label: 'Escuro',
    description: 'Navy profissional com ouro Basile.',
    icon: Moon,
  },
  {
    value: 'system',
    label: 'Sistema',
    description: 'Acompanha a preferência do dispositivo.',
    icon: Monitor,
  },
]

function PreviewSwatch({ mode }: { mode: 'light' | 'dark' }) {
  const isDark = mode === 'dark'
  return (
    <div
      className="relative h-20 overflow-hidden rounded-md border"
      style={{
        background: isDark ? '#0D0F14' : '#FBFAF7',
        borderColor: isDark ? '#24456b' : '#E5DFD2',
      }}
      aria-hidden
    >
      <div
        className="absolute inset-y-0 left-0 w-6"
        style={{ background: isDark ? '#16304f' : '#E4E8EE' }}
      />
      <div
        className="absolute top-3 right-3 h-2 w-10 rounded-full"
        style={{ background: isDark ? '#C9A227' : '#99791F' }}
      />
      <div
        className="absolute top-8 right-3 left-9 h-1.5 rounded-full opacity-40"
        style={{ background: isDark ? '#E8EAF0' : '#171C26' }}
      />
      <div
        className="absolute top-11 right-8 left-9 h-1.5 rounded-full opacity-20"
        style={{ background: isDark ? '#E8EAF0' : '#171C26' }}
      />
    </div>
  )
}

export function ThemeSelector() {
  const mounted = useMounted()
  const { theme, setTheme, resolvedTheme } = useTheme()
  const current = (mounted ? theme : 'system') as SibTheme | undefined

  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {CARDS.map(({ value, label, description, icon: Icon }) => {
        const selected = current === value
        const previewMode: 'light' | 'dark' =
          value === 'system'
            ? resolvedTheme === 'dark'
              ? 'dark'
              : 'light'
            : value
        return (
          <button
            key={value}
            type="button"
            onClick={(event) => applyTheme(value, setTheme, event)}
            aria-pressed={selected}
            className={cn(
              'group rounded-lg border p-3 text-left transition-all duration-normal',
              'hover:border-primary/40 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              selected
                ? 'border-primary bg-primary/5 shadow-sm gold-glow'
                : 'border-border bg-card'
            )}
          >
            <PreviewSwatch mode={previewMode} />
            <div className="mt-3 flex items-center gap-2">
              <Icon className={cn('h-4 w-4', selected ? 'text-primary' : 'text-muted-foreground')} />
              <span className="text-sm font-semibold">{label}</span>
              {value === 'system' && mounted && (
                <span className="ml-auto text-[10px] text-muted-foreground">
                  {resolvedTheme === 'dark' ? 'escuro agora' : 'claro agora'}
                </span>
              )}
            </div>
            <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{description}</p>
          </button>
        )
      })}
    </div>
  )
}
