# Tech Stack

## Framework & Runtime

- **Next.js 16** (App Router, RSC enabled)
- **React 19**
- **TypeScript 5.7** — `ignoreBuildErrors: true` in next.config.mjs (build won't fail on type errors)

## Styling

- **Tailwind CSS v4** with CSS variables for theming
- **shadcn/ui** (style: `new-york`, base color: `neutral`) — component library built on Radix UI
- Theme tokens use CSS variables (`bg-background`, `text-foreground`, `bg-card`, `border-border`, etc.)
- Dark mode via `next-themes` + `ThemeProvider`

## UI Components

- All UI primitives live in `components/ui/` and are shadcn/ui components
- Icons: **lucide-react**
- Charts: **recharts**
- Forms: **react-hook-form** + **zod** for validation
- Toasts/notifications: **sonner**

## Key Libraries

| Library | Purpose |
|---|---|
| `@radix-ui/*` | Headless UI primitives (via shadcn) |
| `date-fns` | Date utilities |
| `react-day-picker` | Calendar/date picker |
| `embla-carousel-react` | Carousels |
| `react-resizable-panels` | Resizable layouts |
| `vaul` | Drawer component |
| `cmdk` | Command palette |
| `@vercel/analytics` | Production analytics |

## Package Manager

**pnpm** (lockfile: `pnpm-lock.yaml`)

## Common Commands

```bash
# Development server
pnpm dev

# Production build
pnpm build

# Start production server
pnpm start

# Lint
pnpm lint
```

## Path Aliases

Configured in `tsconfig.json` and `components.json`:

- `@/components` → `components/`
- `@/components/ui` → `components/ui/`
- `@/lib` → `lib/`
- `@/hooks` → `hooks/`
