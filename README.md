# PLANetBAO

In-house replacement for Skello (project folder: Skellobis). Brick 1: planning and time clock.

- What it must do: [docs/spec-brick-1.md](docs/spec-brick-1.md)
- How it is built: [docs/architecture.md](docs/architecture.md)

## Layout

| Folder | What it is |
|---|---|
| `apps/api` | The server (NestJS). One folder per area in `src/`: `auth`, `access`, `org`, `people`, `devices`, `planning`, `timeclock`. |
| `apps/api/prisma` | The database model (`schema.prisma`), its migrations, and the seeds. |
| `apps/web` | The web app (React), in French. `src/pages`: the management screens (Planning, Badgeuse, Demandes) and the tablet at `/kiosk`. `src/me`: Mon espace, the personal side for every employee. |
| `packages/labor-rules` | The hours rules as plain functions with tests. No database, no server. |
| `docs` | Spec, architecture, reference data. |

## Run it

Needs Node 24 and Docker (running). All commands are from the project root.

**Once, after cloning:**

```bash
git clone git@github.com:ankim21/hello_planning.git && cd hello_planning
npm install
cp apps/api/.env.example apps/api/.env   # then set JWT_SECRET and SEED_ADMIN_PASSWORD in it
npm run db:up            # PostgreSQL (port 5433) and a fake mailbox, in Docker
npm run db:migrate       # creates the tables
npm run generate -w api  # generates the database client
npm run db:seed          # 13 entities and sites, 9 posts, first administrator
npm run db:seed:demo     # fake employees, a tablet and some shifts (development only)
```

**Each time, in two terminals:**

```bash
npm run db:up     # only if Docker was restarted
npm run dev:api   # server on http://localhost:3000
npm run dev:web   # web app on http://localhost:5173
```

Then open http://localhost:5173 and log in with a demo account. All are
invented, at the site Petit Bao Bastille, with the password `dev-password-123`:

| Login | Role |
|---|---|
| `director@example.com` | Site director |
| `chef@example.com` | Head chef |
| `alice@example.com` | Employee, salle |
| `bob@example.com` | Employee, kitchen |

- Administrator: `admin@example.com` with the `SEED_ADMIN_PASSWORD` you set in `.env`.
- Tablet (clocking): http://localhost:5173/kiosk, code `demo-tablet-token-for-development-only`, PIN `1234` for everyone.
- Tests: `npm test`.

## E-mail

The app e-mails a link to choose a password, for new accounts and forgotten
passwords. In development nothing leaves the machine: every e-mail lands in a
fake mailbox at http://localhost:8025. In production, set `SMTP_URL`,
`MAIL_FROM` and `APP_URL` in `apps/api/.env` with your provider's details.
With `SMTP_URL` empty no e-mail is sent, and the administrator is shown a
temporary password to pass on by hand.

## Where to change things

- A clocking rule (grace minutes, break length): `packages/labor-rules/src/time-entry.ts`, then its tests.
- Who may do what: `apps/api/src/access/permissions.ts`.
- A table or a column: `apps/api/prisma/schema.prisma`, then `npm run db:migrate`.
- Sites, entities, posts: `apps/api/prisma/seed.ts`.
