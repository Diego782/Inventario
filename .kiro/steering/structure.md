# Project Structure

```
inventory-and-sales-app/
├── app/                        # Next.js App Router
│   ├── layout.tsx              # Root layout (fonts, metadata, Analytics)
│   ├── page.tsx                # Single-page shell — manages activeSection state
│   └── globals.css             # Global styles (Tailwind base + CSS variables)
│
├── components/
│   ├── ui/                     # shadcn/ui primitives (do not edit manually)
│   ├── sections/               # One component per app module/section
│   │   ├── dashboard-section.tsx
│   │   ├── inventario-section.tsx
│   │   ├── ventas-section.tsx
│   │   ├── fiadores-section.tsx
│   │   ├── empleados-section.tsx
│   │   ├── horarios-section.tsx
│   │   └── configuracion-section.tsx
│   ├── sidebar.tsx             # Collapsible sidebar with section navigation
│   ├── header.tsx              # Top header bar
│   ├── stat-card.tsx           # Reusable stat/metric card
│   └── theme-provider.tsx      # next-themes wrapper
│
├── hooks/
│   ├── use-mobile.ts           # Mobile breakpoint detection
│   └── use-toast.ts            # Toast hook
│
├── lib/
│   └── utils.ts                # cn() utility (clsx + tailwind-merge)
│
├── public/                     # Static assets and icons
├── styles/
│   └── globals.css             # Additional global styles
│
├── components.json             # shadcn/ui configuration
├── next.config.mjs
├── tsconfig.json
└── package.json
```

## Architecture Patterns

### Section-Based Navigation
The app is a single page (`app/page.tsx`) that holds `activeSection` state. The `Sidebar` calls `onSectionChange`, and the page renders the matching `*Section` component. There is no client-side routing between sections.

### Section Components
Each module lives in `components/sections/`. They are self-contained and marked `"use client"`. Local mock data is defined at the top of the file — sections are not yet wired to a backend.

### Component Conventions
- Use `"use client"` directive for any component with state or event handlers
- Import UI primitives from `@/components/ui/`
- Use `cn()` from `@/lib/utils` for conditional class merging
- Use Tailwind CSS variables for colors (`bg-card`, `text-muted-foreground`, etc.) — avoid hardcoded hex values
- Icons come from `lucide-react`

### Adding a New Section
1. Create `components/sections/{name}-section.tsx`
2. Add the menu item to the `menuItems` array in `components/sidebar.tsx`
3. Add a `case` to the `renderSection()` switch in `app/page.tsx`
