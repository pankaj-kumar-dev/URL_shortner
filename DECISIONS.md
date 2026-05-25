# Architecture Decisions

[README](README.md) | [Architecture](ARCHITECTURE.md) | [Technical Debt](TECH_DEBT.md)

## Decision Matrix

| Decision | Why It Exists | Tradeoff | Production Note |
|---|---|---|---|
| Express | small API, low ceremony | manual structure | add conventions as routes grow |
| TypeScript strict mode | safer refactors | more typing | good open-source signal |
| PostgreSQL + Prisma | relational ownership and analytics | ORM/migration discipline | add migration checks in CI |
| Base62 from DB ID | no collisions or retries | enumerable codes | consider random/custom aliases |
| Redis redirect cache | protects DB on hot path | Redis latency matters | monitor hit rate and latency |
| Cache stores `urlId` | click enqueue avoids DB on hit | cache schema coupling | version cache payload if needed |
| BullMQ click jobs | redirect not blocked by analytics | best-effort enqueue | add queue metrics/dead-letter policy |
| Sliding-window limiter | avoids fixed-window bursts | Redis write per shorten | trust proxy before production |
| Fail-open limiter | preserves availability | weaker abuse control | choose fail mode by threat model |
| JWT auth | stateless scaling | no revocation | add refresh/revocation if needed |
| bcrypt | standard password hashing | CPU cost | throttle login attempts |
| Owner-only stats | prevents cross-user leaks | DB lookup required | keep authorization close to query |
| URL heuristics | local safety baseline | incomplete SSRF defense | add DNS-aware checks |
| `301` redirect | signals permanence | sticky client caches | validate product requirement |
| In-process worker | simple local dev | lifecycle coupling | split worker process |

## Reusable Components

| Component | Reuse Value | Boundary |
|---|---|---|
| `encodeBase62` | high | pure numeric encoding |
| `validateUrl` | medium | needs stronger network checks |
| `rateLimiter` | medium | Express + Redis middleware |
| Prisma singleton | high | process-local DB client |
| Redis client | high | centralize with BullMQ config |

## Decision Themes

| Theme | Evidence |
|---|---|
| Low-latency reads | Redis-first redirect path |
| Durable source of truth | PostgreSQL owns URL/click/user records |
| Async non-critical work | click writes moved to BullMQ |
| Explicit tradeoffs | predictable codes, best-effort analytics, fail-open limiter |
