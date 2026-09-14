# DetailFlow — Frontend

Next.js (App Router) + TypeScript + Tailwind CSS frontend for DetailFlow.

See the repository root [README.md](../README.md) for full setup instructions, and [docs/ARCHITECTURE.md](../docs/ARCHITECTURE.md) for the system design.

## Quick start

```bash
npm install
cp .env.local.example .env.local   # if not already present
npm run dev
```

Runs at http://localhost:3000. Requires the backend API running at the URL configured in `.env.local` (`NEXT_PUBLIC_API_URL`, default `http://localhost:8000/api`).
