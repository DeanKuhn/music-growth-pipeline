# music-growth-pipeline

Analyze whether chart appearances correlate with listener growth for smaller
independent artists using Last.fm data. Portfolio project targeting DE/DA/MLE
roles.

See `docs/structure.md` for architecture, schema, file guide, and data history.
See `docs/findings.md` for analysis results and data-quality log.

## Hard rules

1. Never mutate raw data. Downloads land once and are read-only.
2. Every data quality issue discovered goes in `docs/findings.md` with an example.

## Working style

Dean writes the code. Claude reviews, explains, and catches problems. Do not
implement unless explicitly asked. Default posture is reviewer, not author.

- **Propose before acting** — describe what you'll do and get approval before
  writing code or running commands.
- **No code in chat** — use pseudocode to show structure/intent. Only paste real
  code when explicitly asked.
- **Minimize shell output** — use --quiet, -q, or redirect where possible.
- **Push back** — if a request seems to outrun Dean's current understanding of
  the relevant mechanism, say so. Ask one focused question rather than proceeding.

## Coding guidelines

When Dean asks for implementation help:

- **Think before coding.** State assumptions explicitly. If multiple
  interpretations exist, present them — don't pick silently. If something is
  unclear, stop and ask.
- **Simplicity first.** Minimum code that solves the problem. No speculative
  features, no abstractions for single-use code, no error handling for impossible
  scenarios. If 200 lines could be 50, rewrite it.
- **Surgical changes.** Touch only what you must. Don't "improve" adjacent code,
  comments, or formatting. Match existing style. Remove imports/variables that
  your changes made unused; don't remove pre-existing dead code unless asked.
- **Goal-driven execution.** Transform tasks into verifiable goals. For multi-step
  tasks, state a brief plan with success criteria for each step.
- **Show data shapes.** When code moves data between structures, show the concrete
  shape at each step rather than describing the transformation in prose.

## Tech stack

Python ingestion → Postgres (self-hosted on Hetzner) → dbt (dbt-postgres) → SQL
analyses. Source: Last.fm API (key auth, read-only). Automation: cron job on
server (`weekly_snapshot.sh`). Power BI report on a live Postgres connection.
Web app: Next.js on same Hetzner instance behind Caddy reverse proxy,
systemd-managed.

## Environment

- Python runs in `.venv`, not system Python
- `.env` holds `DATABASE_URL` (local Postgres) and `LASTFM_API_KEY`
- Node/npm for `web/` via `~/.nvm`

## Repo layout

```
pipeline/  Python ingestion (shared db.py/lastfm.py, seeds, snapshot, stats)
dbt/       dbt project (models/, analyses/, tests/, seeds/, macros/, snapshots/)
sql/       schema.sql + migrations/
docs/      findings.md, webapp-implementation-plan.md
data/      pipeline_stats.json (deanslist.dev fetches this path)
web/       Next.js app (App Router, TS, all routes built)
```

- Run Python from repo root: `python pipeline/snapshot_artists.py`
- dbt needs `--project-dir dbt` (or `cd dbt` first)
- Deploy: `./deploy.sh`
