## Layout

The root layout, `app/layout.tsx`, is the single place for app-wide providers and global infrastructure.

**Do not remove any existing entries without a reason.** Current infrastructure in the layout:

| Entry | Purpose |
|-------|---------|
| `ThemeProvider` | Light/dark mode via `next-themes` |
| `Toaster` | Global toast notifications via Sonner |
| `ChunkLoadErrorHandler` | Required — prevents known ChunkLoadError race condition bug |

---

## Typography

| Role | Font | Tailwind Class | Default Usage |
|------|------|---------------|-------|
| Body | DM Sans | `font-sans` | All body text, labels, descriptions |
| Display | Plus Jakarta Sans | `font-display` | Page titles, hero headings, section headers |
| Mono | JetBrains Mono | `font-mono` | Code snippets, numeric data, IDs, timestamps |

**Size hierarchy:** Use Tailwind's scale. Headings: `text-4xl`→`text-3xl`→`text-2xl`→`text-xl`. Body: `text-base`→`text-sm`. Captions: `text-xs`.

Always use `tracking-tight` on large headings (`text-2xl` and above).

---

## Color System (Design Tokens)

All colors use CSS variables — **never hardcode color values**. `:root` is the light theme; `.dark` is the professional navy theme (pixel-identical to the original SIB dark). Theme resolution defaults to the OS (`prefers-color-scheme`) and is persisted in `localStorage` under `sib-theme`.

| Token | Purpose | Light | Dark |
|-------|---------|-------|------|
| `background` / `foreground` | Page-level bg and text | `#FBFAF7` / `#171C26` | `#0D0F14` / `#E8EAF0` |
| `card` / `card-foreground` | Card surfaces | white / navy text | `#1E2330` / `#E8EAF0` |
| `primary` / `primary-foreground` | Brand buttons, links, accents | `#99791F` (AA) | `#C9A227` gold |
| `secondary` / `secondary-foreground` | Secondary buttons, subtle highlights | warm cream | navy 14% |
| `muted` / `muted-foreground` | Disabled states, helper text | warm gray | `#8B90A0` |
| `accent` / `accent-foreground` | Hover states | warm cream | navy 18% |
| `destructive` / `destructive-foreground` | Errors, delete actions | deep red | `#E74C3C` |
| `border` / `input` / `ring` | Borders, fields, focus | warm stone / gold | navy / gold |
| `success` / `warning` / `info` | Status semantics | deeper for AA | `#27AE60` / `#E67E22` / blue |
| `nav` / `nav-hover` / `nav-foreground` | Nav + navy action buttons | soft navy tint | `#16304f` / `#1c3b60` / slate-100 |
| `nav-active` / `nav-active-foreground` | Selected nav item | `#16304f` / cream | slate-100 / `#12233d` |
| `nav-border` | Navy borders | cool stone | `#24456b` |
| `surface` / `surface-2` / `field` | Panels and inputs | off-white / white | `#141b28` / `#1a3050` / `#0D0F14` |
| `overlay` | Modal backdrops | navy 8% | black |
| `danger-surface` | Destructive chrome (SAIR) | soft red | `#3a1620` |

Usage: `bg-primary`, `text-muted-foreground`, `bg-nav`, `text-success`, `border-nav-border`, etc.

**Theme controls:** `ThemeToggle` (`@/components/theme-toggle`) — compact dropdown (Claro / Escuro / Sistema) for chrome. `ThemeSelector` (`@/components/theme-selector`) — preview cards for Settings. Both use `applyTheme()` (`@/lib/theme`) for a circular View Transition from the click origin.

---

## Spacing Scale

Based on an 8px grid. Use these CSS variables or Tailwind equivalents:

| Token | Value | Tailwind |
|-------|-------|----------|
| `--spacing-xs` | 4px | `p-1`, `gap-1` |
| `--spacing-sm` | 8px | `p-2`, `gap-2` |
| `--spacing-md` | 16px | `p-4`, `gap-4` |
| `--spacing-lg` | 24px | `p-6`, `gap-6` |
| `--spacing-xl` | 32px | `p-8`, `gap-8` |
| `--spacing-2xl` | 48px | `p-12`, `gap-12` |
| `--spacing-3xl` | 64px | `p-16`, `gap-16` |

**Vary spacing rhythm** — don't use the same gap everywhere. Hero → large gap → content → medium gap → footer.

---

## Shadow Scale

| Token | Default Usage |
|-------|-------|
| `--shadow-sm` | Subtle card lift, input focus |
| `--shadow-md` | Cards, dropdowns, popovers |
| `--shadow-lg` | Modals, elevated panels |

Mapped to Tailwind: `shadow-sm`, `shadow-md`, `shadow-lg`. Light shadows are soft; dark shadows keep the original heavier navy elevation.

---

## Border Radius

| Token | Value | Default Usage |
|-------|-------|-------|
| `--radius` | 0.625rem | Default (buttons, inputs, cards) |
| `--radius-sm` | calc(var(--radius) - 4px) | Small elements (badges, chips) |
| `--radius-lg` | calc(var(--radius) + 4px) | Large containers, hero cards |
| `--radius-full` | 9999px | Avatars, pills, circular buttons |

---

## Animation Timing

| Token | Value | Tailwind Class | Default Usage |
|-------|-------|---------------|-------|
| `--duration-fast` | 150ms | `duration-fast` | Hover states, toggles |
| `--duration-normal` | 250ms | `duration-normal` | Page transitions, reveals |
| `--duration-slow` | 350ms | `duration-slow` | Complex animations, modals |

---

## Layout Components

### `Container` — `@/components/layouts/container`
Centers content with responsive padding. Props: `size` (`sm`|`md`|`lg`|`xl`|`full`).
```tsx
<Container size="lg">{children}</Container>
```

### `Section` — `@/components/layouts/section`
Vertical spacing wrapper for page sections. Props: `id`, `className`.
```tsx
<Section id="features">{children}</Section>
```

### `PageHeader` — `@/components/layouts/page-header`
Title + description + action buttons. Use at top of every app page.
```tsx
<PageHeader title="Dashboard" description="Overview of your account" actions={<Button>Export</Button>} />
```

### `AppShell` — `@/components/layouts/app-shell`
Sidebar + header + main content. The standard layout for dashboards and admin panels.
```tsx
<AppShell sidebar={<nav>...</nav>} header={<div>...</div>}>{children}</AppShell>
```

### `AuthLayout` — `@/components/layouts/auth-layout`
Centered card on gradient background. Use for login, signup, onboarding flows.
```tsx
<AuthLayout title="Welcome back" description="Sign in to continue">{form}</AuthLayout>
```

---

## Animation Components — `@/components/ui/animate`

| Component | Default Usage | Key Props |
|-----------|-------|-----------|
| `FadeIn` | Reveal content on scroll | `delay`, `duration` |
| `ScaleIn` | Pop-in effect | `delay` |
| `SlideIn` | Directional entrance | `from` (`top`\|`bottom`\|`left`\|`right`), `delay` |
| `Stagger` + `StaggerItem` | Sequential reveal for lists/grids | `staggerDelay` |
| `HoverLift` | Lift effect on hover (cards, links) | — |
| `PressScale` | Press-down feedback for buttons | — |
| `SkeletonPulse` | Loading placeholder | `className` (set width/height) |

**Pattern:** Wrap page sections in `FadeIn`, list items in `Stagger`/`StaggerItem`, interactive cards in `HoverLift`.

---

## UI Components — `@/components/ui/`

### Core
| Component | Import | Key Props |
|-----------|--------|-----------|
| `Button` | `@/components/ui/button` | `variant` (`default`\|`secondary`\|`outline`\|`ghost`\|`destructive`\|`link`\|`glass`), `size` (`default`\|`xs`\|`sm`\|`lg`\|`icon`\|`icon-sm`), `loading` (boolean). **`glass`** (and legacy `glass-dark`/`glass-light` aliases) derives from `--foreground` and works in both themes. **Link**: focus uses underline, not ring. |
| `Badge` | `@/components/ui/badge` | `variant` (`default`\|`secondary`\|`outline`\|`destructive`) |
| `Card` | `@/components/ui/card` | `variant` (`default`\|`interactive`\|`glass`\|`glass-interactive`\|`ghost`; legacy `glass-dark`/`glass-light` aliases remain). Composed: `Card`, `CardHeader`, `CardTitle`, `CardDescription`, `CardContent`, `CardFooter`. **Interactive**: always wrap in `<a>` or `<button>` for keyboard access. |
| `Separator` | `@/components/ui/separator` | `orientation` (`horizontal`\|`vertical`) |

### Forms
| Component | Import |
|-----------|--------|
| `Input` | `@/components/ui/input` | `variant` (`default`\|`error`\|`success`\|`ghost`), `size` (`default`\|`sm`\|`lg`) |
| `Textarea` | `@/components/ui/textarea` | `variant` (`default`\|`error`\|`success`\|`ghost`) |
| `Label` | `@/components/ui/label` |
| `Select` | `@/components/ui/select` |
| `Checkbox` | `@/components/ui/checkbox` |
| `RadioGroup` | `@/components/ui/radio-group` |
| `Switch` | `@/components/ui/switch` |
| `Slider` | `@/components/ui/slider` |
| `Calendar` | `@/components/ui/calendar` |
| `DateRangePicker` | `@/components/ui/date-range-picker` |
| `InputOTP` | `@/components/ui/input-otp` |
| `Form` | `@/components/ui/form` (react-hook-form integration) |

### Navigation & Layout
| Component | Import |
|-----------|--------|
| `Tabs` | `@/components/ui/tabs` — `Tabs`, `TabsList`, `TabsTrigger`, `TabsContent` |
| `Accordion` | `@/components/ui/accordion` — `Accordion`, `AccordionItem`, `AccordionTrigger`, `AccordionContent` |
| `NavigationMenu` | `@/components/ui/navigation-menu` |
| `Breadcrumb` | `@/components/ui/breadcrumb` |
| `Pagination` | `@/components/ui/pagination` |
| `Menubar` | `@/components/ui/menubar` |
| `ScrollArea` | `@/components/ui/scroll-area` |
| `Resizable` | `@/components/ui/resizable` |

### Overlays & Feedback
| Component | Import |
|-----------|--------|
| `Dialog` | `@/components/ui/dialog` |
| `AlertDialog` | `@/components/ui/alert-dialog` |
| `Sheet` | `@/components/ui/sheet` — side-panel overlay |
| `Drawer` | `@/components/ui/drawer` — bottom sheet (great for mobile) |
| `Popover` | `@/components/ui/popover` |
| `Tooltip` | `@/components/ui/tooltip` |
| `HoverCard` | `@/components/ui/hover-card` |
| `ContextMenu` | `@/components/ui/context-menu` |
| `DropdownMenu` | `@/components/ui/dropdown-menu` |
| `Command` | `@/components/ui/command` — command palette / searchable list |
| `Alert` | `@/components/ui/alert` |
| `toast` | `import { toast } from 'sonner'` — `toast.success()`, `toast.error()` |

### Data Display
| Component | Import |
|-----------|--------|
| `Table` | `@/components/ui/table` — `Table`, `TableHeader`, `TableBody`, `TableRow`, `TableHead`, `TableCell` |
| `Avatar` | `@/components/ui/avatar` |
| `Progress` | `@/components/ui/progress` |
| `Skeleton` | `@/components/ui/skeleton` |
| `AspectRatio` | `@/components/ui/aspect-ratio` |
| `Carousel` | `@/components/ui/carousel` |

### Misc
| Component | Import |
|-----------|--------|
| `Toggle` | `@/components/ui/toggle` |
| `ToggleGroup` | `@/components/ui/toggle-group` |
| `Collapsible` | `@/components/ui/collapsible` |
| `ThemeToggle` | `@/components/theme-toggle` — Claro / Escuro / Sistema dropdown |
| `ThemeSelector` | `@/components/theme-selector` — preview cards for Settings |
## SSR / Hydration Safety — `@/components/client-only`, `@/components/safe-format`
Server-rendered HTML must match the client's first render. An automated SSR lint
(`eslint.ssr.config.mjs` — do not delete) runs after every build and fails it on unsafe
patterns. Use these primitives instead of hand-rolling fixes:
| Primitive | Import | Use for |
|-----------|--------|---------|
| `ClientOnly` | `@/components/client-only` | Anything browser-only or non-deterministic: `window`/`localStorage` reads, live clocks, random values, third-party widgets. Pass a `fallback` sized like the content. |
| `useMounted()` | `@/components/client-only` | Hook variant when you need the boolean directly. |
| `SafeDate` / `SafeTime` | `@/components/safe-format` | Dates/times — formats with explicit locale + UTC so SSR matches client. `localize` re-renders in the visitor's timezone after mount. Props: `date` (Date\|string\|number), `options?` (Intl.DateTimeFormatOptions), `locale?`, `localize?`, `className?` — there is no `format`/`value` prop; e.g. `<SafeDate date={post.createdAt} options={{ dateStyle: 'medium' }} />`. |
| `SafeNumber` | `@/components/safe-format` | Numbers/currency, same guarantees. Props: `value` (number), `options?` (Intl.NumberFormatOptions), `currency?` (`currency="USD"`), `locale?`, `localize?`, `className?`. |
Rules of thumb: never touch `window`/`document` at module scope; never seed `useState` with
`Date.now()`/`Math.random()`/`new Date()`; never call `toLocaleString`-style methods without
an explicit locale (and `timeZone` for dates).
