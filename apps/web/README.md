# VC Meeting OS (Web)

Next.js app for VC Meeting OS v2.

## Setup

1. Install deps:

```bash
npm ci
```

2. Configure environment variables in `.env.local`:

```bash
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
GROQ_API_KEY=...
CRON_SECRET=...
NEXT_PUBLIC_APP_URL=...
```

3. Run dev server:

```bash
npm run dev
```

## Transcript Processing Architecture

- `POST /api/process` enqueues a `processing_jobs` record and returns `jobId`.
- Worker endpoint `GET/POST /api/process/worker` processes queued jobs.
- `vercel.json` config schedules worker every minute.
- `ProcessingProgress` subscribes to `processing_jobs` realtime updates.

### Worker Security

Set `CRON_SECRET`. Worker requires in all environments:

```http
Authorization: Bearer <CRON_SECRET>
```

Without `CRON_SECRET`, the worker endpoint returns `401`.

## Quality Checks

```bash
npm run lint
npm run build
```

CI runs both checks in GitHub Actions (`.github/workflows/ci.yml`).
