# PLANetBAO

In-house replacement for Skello (project folder: Skellobis). Brick 1: planning and time clock.

- What it must do: [docs/spec-brick-1.md](docs/spec-brick-1.md)
- How it is built: [docs/architecture.md](docs/architecture.md)

## Layout

| Folder | What it is |
|---|---|
| `apps/api` | The server (NestJS). One folder per area in `src/`: `auth`, `access`, `org`, `people`, `devices`, `planning`, `timeclock`. |
| `apps/api/prisma` | The database model (`schema.prisma`), its migrations, and the seeds. |
| `apps/web` | The web app (React), in French: Planning (week, month, by post), Badgeuse, Mon profil, and the tablet at `/kiosk`. |
| `packages/labor-rules` | The hours rules as plain functions with tests. No database, no server. |
| `docs` | Spec, architecture, reference data. |

## First run

Needs Node 24 and Docker.

```bash
npm install
cp apps/api/.env.example apps/api/.env   # then set JWT_SECRET and the admin password
npm run db:up            # starts PostgreSQL in Docker, on port 5433
npm run db:migrate       # creates the tables
npm run generate -w api  # generates the database client
npm run db:seed          # 13 entities and sites, 9 posts, first administrator
npm run db:seed:demo     # optional, development only: fake employees and a tablet
```

## Every day

```bash
npm run dev:api   # server on http://localhost:3000
npm run dev:web   # web app on http://localhost:5173
npm test          # rules and rights tests
```

With the demo seed: log in as `director@example.com`, and open `/kiosk` with
the tablet code printed by the seed. All demo PINs are `1234`. `alice@example.com`
(salle) and `bob@example.com` (kitchen) are plain employee logins, to try leave requests.

## Where to change things

- A clocking rule (grace minutes, break length): `packages/labor-rules/src/time-entry.ts`, then its tests.
- Who may do what: `apps/api/src/access/permissions.ts`.
- A table or a column: `apps/api/prisma/schema.prisma`, then `npm run db:migrate`.
- Sites, entities, posts: `apps/api/prisma/seed.ts`.
