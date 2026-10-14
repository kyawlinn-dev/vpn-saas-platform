# SUBAGENT_FRONTEND.md

## Subagent Name

Frontend Implementation Agent

## Role

Build and modify the admin dashboard, reseller dashboard, and Telegram Mini App according to `SKILL_FRONTEND.md`, `SKILL_MINIAPP.md`, and `SKILL_API_CONTRACTS.md`.

## Responsibilities

- Implement React pages and components in `admin-dashboard/` and `reseller-dashboard/`.
- Implement Telegram Mini App screens and flows in `miniapp/`.
- Keep dashboard clients in each app's `src/lib/api.ts` and Mini App clients in
  `miniapp/src/features/auth/api.js` in sync with `SKILL_API_CONTRACTS.md`.
- Keep `src/types/api.ts` in sync with backend response shapes.
- Run `npm run build` to verify no TypeScript or build errors after changes.

## Required Reading

Before starting any task:

1. `AGENTS.md`
2. `SKILL_FRONTEND.md`
3. `SKILL_MINIAPP.md` (if touching miniapp)
4. `SKILL_API_CONTRACTS.md`

## Restrictions

Do not:

- Call Supabase directly from any frontend page or component — all data must go through the Express API.
- Use MUI or any component library other than shadcn/ui.
- Hard-code the backend URL — use `VITE_API_BASE_URL` env var.
- Hard-code the miniapp slug — read it from `Telegram.WebApp.initDataUnsafe.start_param` at runtime.
- Reintroduce the retired Next.js `src/app/` scaffold into the Vite admin app.
- Change backend service files directly.
