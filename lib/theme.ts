export type SibTheme = 'light' | 'dark' | 'system'

function resolvedFrom(theme: SibTheme): 'light' | 'dark' {
  if (theme === 'system') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  }
  return theme
}

function prefersReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/**
 * Applies a theme with an optional circular View Transition from the click origin.
 * next-themes' setTheme is async (React state), so the class is also toggled
 * synchronously inside the transition callback to capture the new snapshot.
 */
export function applyTheme(
  theme: SibTheme,
  setTheme: (theme: string) => void,
  event?: { clientX: number; clientY: number }
) {
  const root = document.documentElement
  if (event) {
    root.style.setProperty('--theme-x', `${event.clientX}px`)
    root.style.setProperty('--theme-y', `${event.clientY}px`)
  }

  const commit = () => {
    setTheme(theme)
    root.classList.toggle('dark', resolvedFrom(theme) === 'dark')
  }

  const doc = document as Document & {
    startViewTransition?: (cb: () => void) => unknown
  }

  if (typeof doc.startViewTransition === 'function' && !prefersReducedMotion()) {
    doc.startViewTransition(commit)
    return
  }

  commit()
}
