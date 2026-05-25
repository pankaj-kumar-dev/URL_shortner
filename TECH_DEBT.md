# Technical Debt

[README](README.md) | [Architecture](ARCHITECTURE.md) | [Decisions](DECISIONS.md) | [Deployment](DEPLOYMENT.md)

## Priority Debt

| Priority | Debt | Impact | Fix |
|---|---|---|---|
| P0 | No tests found | regressions in auth, redirects, expiry, stats | unit + integration tests |
| P0 | Worker import side effect | API and worker cannot scale separately | dedicated worker entrypoint |
| P0 | Redis config drift | cache may use `REDIS_URL`, queue cannot | shared Redis config factory |
| P1 | No health/readiness endpoints | weak deployment orchestration | `/healthz`, `/readyz` |
| P1 | Console logging only | poor production diagnostics | structured logger |
| P1 | No queue metrics | invisible backlog/failures | BullMQ metrics/dashboard |
| P1 | No graceful shutdown | dropped requests/jobs | signal handlers |

## Security Debt

| Debt | Risk | Fix |
|---|---|---|
| URL safety is heuristic | DNS rebinding/private resolved IPs may pass | DNS resolution + IP range checks |
| Weak password policy | low-entropy credentials | stronger policy + login throttling |
| No JWT revocation | stolen token valid until expiry | refresh token/session denylist |
| Raw IP retention | privacy/compliance exposure | retention policy or hashing |
| No proxy trust strategy | limiter may key on proxy IP | configure trusted proxy |

## Bottlenecks

| Area | Current Limit | Scaling Path |
|---|---|---|
| Redirects | Redis throughput/availability | HA Redis, hit-rate tracking |
| Stats | `Click` aggregation cost | rollups/materialized views |
| Click writes | one in-process worker | worker pool |
| Shorten | two DB writes | transaction or generated slug strategy |
| Auth | bcrypt CPU | login throttling, worker isolation |

## Future Improvements

| Horizon | Improvement | Outcome |
|---|---|---|
| Near | tests, health checks, structured logs | production confidence |
| Near | split worker and shared Redis config | cleaner deployment |
| Mid | analytics rollups and retention | scalable stats |
| Mid | stronger SSRF protection | safer public shortening |
| Later | custom aliases, admin abuse tooling | product extensibility |
