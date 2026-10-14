# NovaNet MM Admin Dashboard

React + TypeScript + Vite; Tailwind and local UI components. Production hosting is Cloudflare Pages, deployed by the manual GitHub Deploy workflow.

## Local development

From this directory:

    npm ci
    npm run dev

Vite uses port 3001. Configure ignored .env.local with VITE_API_BASE_URL=http://localhost:3000/api and use the intended development backend. Authentication uses backend-issued cookies; never put a Supabase service-role key in frontend configuration.

## Validation and production

    npm run build

The build runs TypeScript and Vite. Production API base is https://api.novanetmm.com/api, injected by .github/workflows/deploy.yml. The app is not Next.js and does not deploy through Vercel.

See ../AGENTS.md, ../DEPLOYMENT.md, ../SKILL_FRONTEND.md and ../SKILL_API_CONTRACTS.md. docs/DOCUMENTATION.md at the repository root identifies current, development and historical documents.
