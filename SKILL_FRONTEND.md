# SKILL_FRONTEND.md

## Skill Name

NovaNet MM — Admin and Reseller Dashboard Frontend Skill

## Use This Skill When

Working on `admin-dashboard/` or `reseller-dashboard/` — React component structure, routing, data fetching, UI conventions, or build config.

## Required Context

Read before coding:

- `AGENTS.md`
- `SKILL_API_CONTRACTS.md`

## Tech Stack (both dashboards)

- Vite + React + TypeScript
- Tailwind CSS + shadcn/ui components (local copies in `src/components/ui/`)
- React Router v6 (client-side routing)
- No MUI — migration to shadcn/Tailwind is complete

## Folder Structure

```text
admin-dashboard/src/
  App.tsx              — router + layout shell
  pages/               — one file per page/route
  components/          — shared reusable components
  components/ui/       — shadcn copies (Button, Card, Dialog, etc.)
  hooks/               — custom React hooks (e.g. useDashboardData)
  types/api.ts         — TypeScript types matching backend response shapes
  main.tsx             — Vite entry point

reseller-dashboard/src/
  (same shape)
```

## Dead Code Warning (admin-dashboard)

`admin-dashboard/src/app/` (Next.js scaffold) is dead code. The real app is `src/App.tsx` (Vite). Ignore `next.config.ts` and `.next/` artifacts. Do not add Next.js pages or imports.

## Data Fetching Pattern

- Custom hooks in `hooks/` call the backend REST API via `fetch`.
- Use `VITE_API_BASE_URL` (from `.env`) as the base URL for all API calls.
- Do not call Supabase directly from frontend pages — all data access goes through the Express backend.

## Auth Pattern

- Auth uses Supabase email+password login. On success the backend sets httpOnly cookies.
- `LoginPage.tsx` — handles the auth form; redirects to dashboard on success.
- Route protection: check auth state in `App.tsx` or a guard component; redirect to `/login` if unauthenticated.

## UI Conventions

- Use shadcn components for all UI elements (Button, Card, Dialog, Table, Badge, Input, etc.).
- Tailwind utility classes for spacing, color, and layout — no inline styles.
- Consistent card pattern: `<Card><CardHeader><CardTitle>…</CardTitle></CardHeader><CardContent>…</CardContent></Card>`.
- Status badges: use `<Badge variant="…">` with color variants matching order/server status values.
- Data tables: prefer the shadcn Table pattern with sortable columns where needed.

## TypeScript Types

Keep `src/types/api.ts` up to date with backend response shapes. When a backend response shape changes, update the type first, then update the component.

## Build

```bash
# From admin-dashboard/ or reseller-dashboard/
npm run dev      # Vite dev server
npm run build    # tsc -b && vite build
```

## Environment Variables

```
# admin-dashboard/.env
VITE_API_BASE_URL=http://localhost:3000/api

# reseller-dashboard/.env
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
VITE_API_BASE_URL=http://localhost:3000/api
```
