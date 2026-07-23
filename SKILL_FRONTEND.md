# SKILL_FRONTEND.md

## Skill Name

NovaNet MM - Dashboard Frontend Skill

## Use This Skill When

Working on `admin-dashboard/` or `reseller-dashboard/`.

## Required Context

- `AGENTS.md`
- `SKILL_API_CONTRACTS.md`
- `DEPLOYMENT.md`

## Tech Stack

- Vite + React + TypeScript
- Tailwind CSS + local shadcn-style components
- React Router

## Data Fetching

- Dashboards call the Express backend with `VITE_API_BASE_URL`.
- Do not call Supabase service-role APIs from frontend code.
- Keep frontend API types aligned with backend response shapes.

## Auth Pattern

- Login is handled by backend auth endpoints.
- Backend sets httpOnly cookies.
- Route guards redirect unauthenticated users to login.

## Build

```bash
npm run build
```

GitHub Actions deploys only these two dashboards to Cloudflare Pages.

## Environment Variables

```text
VITE_API_BASE_URL=
VITE_SUPABASE_URL=       # reseller dashboard only if still needed
VITE_SUPABASE_ANON_KEY=  # reseller dashboard only if still needed
```
