# Desk

A small support inbox for the FDE workshop. Sign in, browse tickets, and open a ticket to read its details.

## Run

```sh
docker compose up --build
```

Open http://localhost:8088. The database persists across restarts. Stop with `docker compose down`.

## Demo accounts

All accounts use the local workshop password `workshop123`.

| Email | Role |
| --- | --- |
| sara@example.test | Support agent |
| omar@example.test | Support agent |
| amina@example.test | Customer |
| bilal@example.test | Customer |

These accounts and ticket records are synthetic.

## Layout

- `frontend/`: browser interface, built by Vite.
- `backend/`: Flask API, server-side sessions, and built frontend hosting.
- `database/`: PostgreSQL schema and migrations.
- `tests/`: browser and database integration tests.



## The exercise

Read [EXERCISE.md](EXERCISE.md). Participants implement ticket claiming; it is intentionally absent from the starter.

## Test

Requires Node.js 24+ and Docker Compose. Browser tests run against the app started above.

```sh
npm install
npm run build
npm run test:coverage
npx playwright install chromium webkit
npm run test:e2e
```

Backend tests use a **separate disposable PostgreSQL instance** and do not touch the application's data:

```sh
docker compose -p desk-tests -f compose.test.yaml up --build --abort-on-container-exit --exit-code-from backend-tests
docker compose -p desk-tests -f compose.test.yaml down
```

Frontend TypeScript and React components have 100% statement, branch, function, and line thresholds. Backend Python has a 100% line/branch gate. Entry modules, API handlers, session helpers, database connections, and demo seeding are included. Dependencies, configuration, HTML, CSS, and SQL do not have executable-source percentage metrics; schema constraints and SQL behavior are exercised against real PostgreSQL. Unit tests simulate browser state and API failures; Playwright exercises the running containers in Chrome, WebKit, and mobile Chrome.

Reports are generated under `coverage/` and `playwright-report/`. Browser screenshots and failure traces are in `test-results/`; use `npx playwright show-report` to inspect the report. The same checks are configured in `.github/workflows/test.yml`.

## Data and local development

- Frontend: React with strict TypeScript, bundled by Vite and served by Flask alongside `/api/`. `frontend/app.tsx` manages sessions and selection; `frontend/views.tsx` contains the screen components; `frontend/api.ts` and `frontend/types.ts` define the typed API client and domain models.
- Backend: Flask, Gunicorn, Psycopg; opaque HttpOnly session cookie, server-side session expiry.
- Database: PostgreSQL 17. Schema lives in `database/migrations/*.sql`, applied once each, in filename order, by `migrate()` in `backend/store.py` (applied files are recorded in `schema_migrations`). `backend/seed.py` runs it on every app start under a transaction lock, then seeds synthetic demo records without resetting existing rows.
- The combined `app` service is published at `127.0.0.1:8088`. The test database uses localhost port 55439.
- `npm run build` type-checks the frontend and its unit tests, then builds `frontend/dist/`. The Docker build runs the same checks. CI runs both the build and coverage gate.
- For frontend hot reload, run `npm run dev`. Vite proxies `/api` to `http://127.0.0.1:8000`; run the backend there, or use Docker Compose for the complete app.
- After editing the app, run `docker compose up -d --build` to rebuild it.
- To inspect data: `docker compose exec db psql -U workshop -d supportdesk`.
- **Migrations:** add a numbered file to `database/migrations/` and keep it idempotent (`IF NOT EXISTS`) as well: a database that predates `schema_migrations` re-runs its files once to adopt them. The database image has no init scripts, so there is one path for fresh and existing databases. To apply a new migration to an existing volume, rebuild and restart the app: `docker compose up -d --build` (do not add `-v`). Existing rows are preserved; `002-ticket-assignee.sql` adds a nullable `tickets.assignee_id` so existing tickets start unassigned.

Run this synthetic workshop environment locally. The demo accounts, HTTP cookie configuration, and known password are for workshop use.

## Present the login flow

With the app running, launch a visible Chromium browser and Playwright Inspector:

```sh
npm run demo:login
```

The demo pauses three times: on the login screen, with Sara's credentials filled, and after the inbox assertions pass. Click **Resume** in Playwright Inspector at each pause (or press F8 while the Inspector is focused). Actions run slowly enough to narrate. The browser stays open at the final pause until you resume. Stop early with Ctrl+C in the terminal.

This demo has its own config and is excluded from the regular automated suite. To verify its complete flow without pauses:

```sh
DESK_DEMO_AUTO=1 npm run demo:login
```

## Deploy frontend and backend together on Render

The root `Dockerfile` builds the React frontend, then copies it into the Python image. One Gunicorn process serves the built UI and `/api/` on the same origin. PostgreSQL remains a separate managed database so app redeploys preserve data.

1. Create a Render PostgreSQL database and a **Web Service** from this repository's `main` branch. Choose **Docker** as the language/runtime.
2. Use the kata repository root as the build context and `./Dockerfile` as the Dockerfile path. If deploying from the parent presentation repository, set **Root Directory** to `kata`.
3. Set the web service's `DATABASE_URL` to the database's **internal connection URL**, with both resources in the same Render region. Keep it server-side.
4. Set the health check path to `/api/health`. Leave Docker Command empty to use the image's startup command. Render supplies `PORT`; startup binds to `0.0.0.0:$PORT` (8000 locally).
5. Deploy. Startup initializes a completely empty database and seeds the demo accounts once. Existing tables and records are preserved; pending migrations are applied automatically on each start.
6. Open the service URL and verify login, ticket reads, refresh, and logout. With Render's `RENDER=true` environment marker, Flask trusts one forwarded protocol header so HTTPS login cookies have `Secure`; it retains the original Host for same-origin checks.

Local startup uses the same combined image via `docker compose up --build`. After upgrading from the old three-service Compose layout, use `docker compose down --remove-orphans` followed by `docker compose up -d --build --wait`. This preserves the database volume; do not add `-v`.

For a local port override, the image also supports `docker run -e PORT=10000 -e DATABASE_URL=... -p 127.0.0.1:8088:10000 desk`. Set `RENDER=true` only behind the trusted Render proxy. The workshop still uses synthetic accounts and a known demo password.

References: [Docker on Render](https://render.com/docs/docker), [web service ports](https://render.com/docs/web-services#port-binding), [Flask proxy configuration](https://flask.palletsprojects.com/en/stable/deploying/proxy_fix/). This configuration is tested locally; it has not been deployed to a Render account.
