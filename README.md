# URL Shortener

A production-grade URL shortening service built with Node.js, TypeScript, PostgreSQL, and Redis.

## Stack

| Layer | Technology | Why |
|-------|-----------|-----|
| Runtime | Node.js + TypeScript | Type safety, async I/O |
| Framework | Express | Minimal, production-proven |
| Database | PostgreSQL (Prisma ORM) | Relational integrity, credible at scale |
| Cache | Redis (ioredis) | Sub-millisecond lookups, TTL-native |
| Queue | BullMQ | Reliable background jobs, retry logic |
| Auth | JWT (jsonwebtoken) | Stateless, horizontally scalable |

## System Design

```
Client
  │
  ▼
Express API
  ├── POST /shorten ──► Rate Limiter (Redis sliding window)
  │                         │
  │                         ▼
  │                    Auth Middleware (JWT)
  │                         │
  │                         ▼
  │                    URL Validator (SSRF + phishing heuristics)
  │                         │
  │                         ▼
  │                    PostgreSQL (create record)
  │                         │
  │                         ▼
  │                    Redis (cache: url:{code} → {url, urlId, expiresAt})
  │
  └── GET /:code ───► Redis lookup (cache hit → redirect, zero DB)
                           │
                     cache miss
                           │
                           ▼
                      PostgreSQL lookup → re-populate Redis
                           │
                           ▼
                      BullMQ (enqueue click job, non-blocking)
                           │
                           ▼
                      301 Redirect
                           │
                     [background]
                           ▼
                      BullMQ Worker → PostgreSQL (write Click record)
```

### Key Design Decisions

**Base62 encoding over random strings**
Short codes are derived from the database row ID via Base62 encoding (`0-9a-zA-Z`). This is deterministic and collision-free — no need to check for duplicates on insert. IDs grow naturally: ID 1 → `1`, ID 3844 → `100`.

**Redis-first redirect path**
Every redirect checks Redis before hitting PostgreSQL. Cache entries store `{ url, urlId, expiresAt }` — the `urlId` is embedded so click analytics can be enqueued without a secondary DB lookup. Cache hit = zero DB queries.

**Sliding window rate limiter**
Rate limiting uses a Redis sorted set (one per IP) instead of a simple counter. This avoids the burst-at-boundary problem of fixed windows — a user cannot send 2× the limit by splitting requests across a window boundary.

**Async click tracking**
Click events are enqueued into BullMQ immediately after redirect. A separate worker writes them to PostgreSQL. This keeps the redirect path fast (~1ms Redis lookup) regardless of write volume. Failed jobs retry with exponential backoff (3 attempts).

**DB-level stats aggregation**
The `/stats` endpoint uses `COUNT`, `distinct`, and `groupBy` at the database level. The app layer receives 3 small result sets regardless of how many clicks exist. No risk of OOM on high-volume URLs.

## API Reference

All endpoints return JSON. Protected endpoints require `Authorization: Bearer <token>`.

### Auth

#### POST /auth/register
```json
// Request
{ "email": "user@example.com", "password": "secret123" }

// Response 201
{ "id": 1, "email": "user@example.com" }
```

#### POST /auth/login
```json
// Request
{ "email": "user@example.com", "password": "secret123" }

// Response 200
{ "token": "<jwt>" }
```

### URLs

#### POST /shorten `[auth required]`
```json
// Request
{
  "url": "https://example.com/very/long/path",
  "ttlSeconds": 86400   // optional, min 60
}

// Response 201
{
  "shortCode": "1a",
  "shortUrl": "http://localhost:3000/1a",
  "originalUrl": "https://example.com/very/long/path",
  "expiresAt": "2026-05-04T00:00:00.000Z"
}
```

Rate limit: 10 requests per IP per minute (sliding window).

#### GET /:code
Redirects to the original URL (301). Returns `410` if expired, `404` if not found.

#### GET /my/urls `[auth required]`
```
GET /my/urls?limit=10&cursor=50
```
Cursor-based pagination. Returns owned URLs with click counts.

#### GET /:code/stats `[auth required, owner only]`
```json
{
  "shortCode": "1a",
  "originalUrl": "https://example.com/...",
  "expiresAt": null,
  "totalClicks": 1042,
  "uniqueIPs": 387,
  "topUserAgents": [
    { "userAgent": "Mozilla/5.0...", "count": 412 }
  ]
}
```

### Error codes

| Status | Meaning |
|--------|---------|
| 400 | Validation error (invalid URL, bad params) |
| 401 | Missing or invalid JWT |
| 403 | Resource belongs to another user |
| 404 | Short code not found |
| 409 | Email already registered |
| 410 | Link has expired |
| 429 | Rate limit exceeded |
| 500 | Internal server error |

## Local Setup

### Prerequisites
- Node.js 20+
- PostgreSQL 14+
- Redis 6+ (or Docker)

### 1. Clone and install
```bash
git clone <repo>
cd url-shortener
npm install
```

### 2. Start Redis
```bash
docker run -d --name redis-local -p 6379:6379 redis:alpine
```

### 3. Configure environment
```bash
cp .env.example .env
# Edit .env with your DATABASE_URL and JWT_SECRET
```

```env
DATABASE_URL="postgresql://user:password@localhost:5432/urlshortener"
JWT_SECRET="your-strong-secret-here"
PORT=3000
REDIS_HOST=localhost
REDIS_PORT=6379
```

### 4. Run migrations and start
```bash
npm run prisma:migrate
npm run dev
```

Server starts on `http://localhost:3000`.

## Database Schema

```
User
  id          Int       PK
  email       String    UNIQUE
  password    String    (bcrypt, 10 rounds)
  createdAt   DateTime
  urls        Url[]

Url
  id          Int       PK
  shortCode   String    UNIQUE, INDEX
  originalUrl String
  expiresAt   DateTime? nullable
  userId      Int       FK → User
  createdAt   DateTime
  clicks      Click[]

Click
  id          Int       PK
  urlId       Int       FK → Url, INDEX
  ip          String
  userAgent   String
  timestamp   DateTime
```

## Security

- **SSRF prevention** — private/loopback IPs blocked at validation
- **Phishing heuristics** — suspicious TLDs and hostname patterns rejected
- **User enumeration** — login uses constant-time bcrypt comparison even on not-found
- **JWT** — 7-day expiry, secret validated on startup in production (`process.exit(1)` if missing)
- **Ownership gates** — stats endpoint verifies `userId` matches token

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DATABASE_URL` | Yes | — | PostgreSQL connection string |
| `JWT_SECRET` | Yes (prod) | `dev_secret_change_in_prod` | JWT signing secret |
| `PORT` | No | `3000` | HTTP port |
| `REDIS_HOST` | No | `localhost` | Redis host |
| `REDIS_PORT` | No | `6379` | Redis port |
