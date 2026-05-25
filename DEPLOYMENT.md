# Deployment

[README](README.md) | [Architecture](ARCHITECTURE.md) | [Technical Debt](TECH_DEBT.md)

## Runtime Requirements

| Dependency | Purpose |
|---|---|
| Node.js 20+ | API runtime |
| PostgreSQL 14+ | durable data |
| Redis 6+ | cache, limiter, BullMQ backend |

## Commands

| Stage | Command |
|---|---|
| Install | `npm install` |
| Generate Prisma | `npm run prisma:generate` |
| Migrate local DB | `npm run prisma:migrate` |
| Build | `npm run build` |
| Start | `npm run start` |
| Dev | `npm run dev` |

## Environment

| Variable | Required | Current Use |
|---|---:|---|
| `DATABASE_URL` | yes | Prisma datasource |
| `JWT_SECRET` | production | JWT signing; prod startup requires it |
| `PORT` | no | Express port, default `3000` |
| `REDIS_HOST` | yes | Redis fallback and BullMQ |
| `REDIS_PORT` | yes | Redis fallback and BullMQ |
| `REDIS_URL` | partial | supported by cache client, not BullMQ |

## Recommended Topology

| Unit | Current Repo | Production Target |
|---|---|---|
| Web API | `node dist/index.js` | N replicas behind load balancer |
| Worker | created by queue import | dedicated worker service |
| PostgreSQL | Prisma-managed schema | managed DB with backups |
| Redis | cache + queue + limiter | managed HA Redis |

## Readiness Checklist

| Item | State |
|---|---|
| Build script | present |
| Prisma migrations | present |
| Tests | missing |
| Health endpoints | missing |
| Structured logs | missing |
| Metrics | missing |
| Worker separation | missing |
| Graceful shutdown | missing |
| Data retention | missing |

## Deployment Risks

| Risk | Mitigation |
|---|---|
| API replicas also run workers | split worker process |
| Redis config mismatch | centralize Redis config |
| Queue backlog invisible | add metrics and alerts |
| Click table unbounded | retention + rollups |
| Permanent redirects | confirm `301` requirement |
