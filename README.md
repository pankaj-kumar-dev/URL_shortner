# URL Shortener

Production-style backend API for authenticated URL shortening, Redis-backed redirects, async click analytics, and owner-only stats.

![Architecture diagram](docs/diagrams/architecture.png)

## Project Snapshot

| Category | Details |
|---|---|
| Core use case | Shorten URLs, redirect by code, track clicks |
| Backend focus | Caching, queueing, auth, rate limiting, persistence |
| Primary read path | Redis cache hit -> redirect |
| Source of truth | PostgreSQL via Prisma |
| Async path | BullMQ click jobs -> `Click` table |
| Interview signal | Clear system-design tradeoffs in a small codebase |

## Tech Stack

| Layer | Technology | Why It Fits |
|---|---|---|
| Runtime | Node.js + TypeScript | async I/O, strict typing |
| API | Express | minimal routing surface |
| ORM | Prisma | typed relational access |
| Database | PostgreSQL | durable user/link/click model |
| Cache | Redis + ioredis | low-latency redirect lookup |
| Queue | BullMQ | retryable background click writes |
| Auth | JWT + bcrypt | stateless auth, password hashing |

## Features

| Feature | Route / Module | Engineering Value |
|---|---|---|
| User registration | `POST /auth/register` | bcrypt hashing, unique email constraint |
| Login | `POST /auth/login` | JWT issuance, constant-time compare pattern |
| Shorten URL | `POST /shorten` | auth, rate limit, validation, DB write, cache set |
| Redirect | `GET /:code` | Redis-first lookup, DB fallback, async analytics |
| User links | `GET /my/urls` | cursor pagination, ownership scope |
| Stats | `GET /:code/stats` | owner check, aggregate analytics |
| Link expiry | `ttlSeconds` | cache TTL aligned with DB expiry |
| URL safety | `urlValidator.ts` | local SSRF/phishing heuristics |

## Engineering Highlights

| Area | Implementation | Tradeoff |
|---|---|---|
| Short-code generation | Base62 from DB ID | collision-free, but predictable |
| Hot redirect path | Redis cache before PostgreSQL | fast reads, Redis becomes critical |
| Analytics | BullMQ job per click | low redirect latency, best-effort enqueue |
| Rate limiting | Redis sorted-set sliding window | accurate window, Redis write per request |
| Ownership | stats compare URL `userId` to JWT `userId` | secure analytics, extra DB lookup |

## Scalability Considerations

| Pressure Point | Current Behavior | Production Direction |
|---|---|---|
| Redirect volume | Redis handles hot reads | HA Redis, cache observability |
| Click volume | writes queued to BullMQ | separate workers, queue metrics |
| Stats queries | aggregate from `Click` | rollups, partitions, retention |
| URL creation | two DB writes | transaction or alternate slug strategy |
| Abuse traffic | per-IP limiter on `/shorten` | user/IP limits, proxy-aware IPs |

## Quick Start

```bash
npm install
npm run prisma:migrate
npm run dev
```

| Requirement | Value |
|---|---|
| PostgreSQL | `DATABASE_URL` |
| Redis | `REDIS_HOST`, `REDIS_PORT` |
| API port | `PORT` or `3000` |
| Production secret | `JWT_SECRET` |

## Documentation

| Document | Purpose |
|---|---|
| [ARCHITECTURE.md](ARCHITECTURE.md) | system map, flows, bottlenecks |
| [DECISIONS.md](DECISIONS.md) | why decisions exist and tradeoffs |
| [TECH_DEBT.md](TECH_DEBT.md) | risks, coupling, production gaps |
| [DEPLOYMENT.md](DEPLOYMENT.md) | runtime, environment, readiness |
| [INTERVIEW_GUIDE.md](INTERVIEW_GUIDE.md) | senior backend interview talking points |
| [docs/diagrams](docs/diagrams) | PNG previews and Excalidraw sources |

## Diagram Preview

| Flow | Preview |
|---|---|
| Request lifecycle | ![Request flow](docs/diagrams/request-flow.png) |
| Data model | ![DB flow](docs/diagrams/db-flow.png) |
| Async analytics | ![Async flow](docs/diagrams/async-flow.png) |

## Deployment Overview

| Unit | Current Repo | Production Expectation |
|---|---|---|
| API | `node dist/index.js` | horizontally scalable web process |
| Worker | starts through queue import | split into dedicated worker process |
| DB | Prisma migrations | managed Postgres, backups, retention |
| Redis | cache + queue + limiter | managed Redis with monitoring |

See [DEPLOYMENT.md](DEPLOYMENT.md).

## Future Improvements

| Priority | Improvement | Reason |
|---|---|---|
| P0 | Add unit/integration tests | reduce regression risk |
| P0 | Split worker process | scale API and analytics independently |
| P1 | Centralize Redis config | avoid cache/queue drift |
| P1 | Add health checks and structured logs | production operations |
| P1 | Strengthen SSRF defense | DNS-aware private IP blocking |
| P2 | Add analytics rollups | scalable stats for high-click links |

See [TECH_DEBT.md](TECH_DEBT.md).
