# API Scale Readiness For 100,000 Users

Date: 2026-06-12

Scope: static codebase review only. I did not change any API route, payload, or response contract. The recommendations below are designed to keep the frontend contract stable while improving production reliability and scale.

## Executive Summary

The backend can likely handle **100,000 registered users** if active traffic is moderate and database indexes are healthy. It is **not yet ready to confidently handle 100,000 highly active/concurrent users** without infrastructure, query, caching, queueing, and observability improvements.

The main risk is not Express itself. The main risk is database pressure from unbounded queries, missing/unclear indexes, synchronous work inside request paths, noisy production logging, table sync on startup, and notification/reporting workloads running in the same API process.

Recommended target: keep the API contract unchanged, but optimize behind the scenes with pagination defaults, database indexes, Redis/cache, background workers, safer deployment, structured logs, and load testing.

## Current Architecture Observed

- Node.js + Express API in `app.js`.
- Sequelize + MySQL in `src/core/database/connection.js`.
- Main API groups: `/user`, `/partner`, `/admin`.
- MySQL connection pool currently configured as `max: 20`, `min: 5`.
- Production boot runs `connection.sync({ force: false })` through `src/core/database/initialize.js`.
- Cron jobs start inside the API process through `CronHelper.initCronJobs()`.
- Firebase notifications, Razorpay payment logic, file upload/resizing, reports, and admin operations are handled in the same app.

## Can It Handle 100,000 Users?

### 100,000 Registered Users

Yes, with important caveats. A MySQL-backed Node API can support 100k registered users if:

- Queries are indexed.
- Large lists are paginated.
- Notifications are queued.
- Reports are not executed as expensive live scans during peak traffic.
- Logs and monitoring are production-grade.
- The app can run multiple instances safely.

### 100,000 Concurrent Users

No, not in the current shape. A single Node process with a 20-connection DB pool and live SQL-heavy endpoints will bottleneck quickly. Handling this level needs horizontal scaling, load balancing, read replicas, queues, caching, and strict DB query discipline.

### Likely Safe Near-Term Capacity

Without load testing, exact numbers cannot be guaranteed. Based on the code shape:

- Registered users: 100k is reasonable after index/query cleanup.
- Concurrent active users: depends on endpoint mix, but current DB pool and query patterns are the limiting factor.
- Admin/reporting/notification endpoints are the highest risk under load.

## Biggest Bottlenecks

### 1. Unbounded Admin Queries

Several admin methods return full tables without pagination:

- `getallusers` uses `User.findAll()` ordered by id with no limit.
- `getadminnotification` returns all admin notification logs.
- `getpayoutlogs` returns all wallet logs.
- `getCancelledOrders` returns all cancelled appointments.
- `getallpartner` loads all completed stores, then owners, appointments, categories, and addresses into memory.
- `getverifypartnerlist` returns all pending partners.

Examples:

- `src/core/database/Controller/AdminDbController.js:214`
- `src/core/database/Controller/AdminDbController.js:237`
- `src/core/database/Controller/AdminDbController.js:244`
- `src/core/database/Controller/AdminDbController.js:907`
- `src/core/database/Controller/AdminDbController.js:2660`
- `src/core/database/Controller/AdminDbController.js:2695`

Impact at 100k users:

- High memory usage in Node.
- Slow admin dashboards.
- DB table scans.
- API latency spikes for normal users if admin/reporting hits the same DB.

Optimization without changing frontend API:

- Add default server-side pagination even when frontend does not pass `page`/`limit`.
- Keep the same response shape where possible.
- Add optional `page` and `limit` support to existing APIs.
- Cap maximum `limit` to 50 or 100.
- For legacy screens that expect all data, introduce internal export/background jobs instead of returning everything in one request.

### 2. Database Startup Sync In Production

Startup calls:

```js
await connection.sync({ force: false });
```

Location:

- `src/core/database/initialize.js:32`

Risk:

- Production startup can perform schema checks/changes at runtime.
- Multiple app instances can race at startup.
- Schema changes are not versioned or auditable.

Industry-level fix:

- Use Sequelize migrations or SQL migrations.
- Run migrations as a deployment step, not inside every API boot.
- Disable automatic sync in production.

### 3. Production Pool Logging Every 5 Seconds

`src/core/database/connection.js` logs pool size, available, borrowed, and pending connections every 5 seconds.

Location:

- `src/core/database/connection.js:26`

Risk:

- Log noise and cost.
- Harder incident debugging.
- Can leak operational details.

Fix:

- Move pool metrics to a metrics system.
- Log only on interval in non-production, or behind `DB_POOL_DEBUG=true`.

### 4. DB Pool Size Is Static

Current pool:

```js
pool: {
  max: 20,
  min: 5,
  acquire: 60000,
  idle: 10000,
  evict: 1000
}
```

Location:

- `src/core/database/connection.js:15`

Risk:

- Too low for high traffic on one instance.
- Too high if many instances are deployed, because MySQL max connections can be exhausted.

Fix:

- Move pool config to env variables.
- Size pool per instance based on DB capacity.
- Track pool pending count and slow queries.
- Prefer more app instances with controlled pool size over one large process.

### 5. Missing Index Strategy

Some models define indexes, but many high-traffic tables do not define clear indexes for common filters and joins.

Important query columns seen:

- `User.status`, `User.phone`, `User.email`, `User.apple_sub`
- `UserSession.user_id`, `UserSession.status`
- `Store.status`, `Store.completion_status`, `Store.createdAt`, `Store.phone`, `Store.email`
- `StoreSession.store_id`, `StoreSession.status`
- `appointments.user_id`, `appointments.store_id`, `appointments.booking_date`, `appointments.status`, `appointments.payment_status`, `appointments.razorpay_id`
- `appointment_items.appointment_id`
- `Reviews.store_id`, `Reviews.status`
- `Favourites.user_id`, `Favourites.store_id`, `Favourites.status`
- `PartnerAddress.store_id`, `PartnerAddress.status`, `PartnerAddress.location`
- `StoreServices.store_id`, `StoreServices.status`, `StoreServices.service_category`
- `WalletLogs.user_id`, `WalletLogs.date`
- `NotificationLogs.user_id`, `NotificationLogs.date`

Recommended indexes:

```sql
CREATE INDEX idx_user_status ON User(status);
CREATE INDEX idx_user_phone ON User(phone);

CREATE INDEX idx_user_session_user_status ON UserSession(user_id, status);
CREATE INDEX idx_store_session_store_status ON StoreSession(store_id, status);

CREATE INDEX idx_store_status_completion_created ON Store(status, completion_status, createdAt);
CREATE INDEX idx_store_phone ON Store(phone);

CREATE INDEX idx_appointments_user_date ON appointments(user_id, booking_date);
CREATE INDEX idx_appointments_store_date ON appointments(store_id, booking_date);
CREATE INDEX idx_appointments_status_date ON appointments(status, booking_date);
CREATE INDEX idx_appointments_payment_status ON appointments(payment_status);
CREATE INDEX idx_appointments_razorpay ON appointments(razorpay_id);

CREATE INDEX idx_appointment_items_appointment ON appointment_items(appointment_id);

CREATE INDEX idx_reviews_store_status ON Reviews(store_id, status);
CREATE INDEX idx_favourites_user_store_status ON Favourites(user_id, store_id, status);

CREATE INDEX idx_partner_address_store_status ON PartnerAddress(store_id, status);
CREATE INDEX idx_store_services_store_status ON StoreServices(store_id, status);
CREATE INDEX idx_store_services_category_status ON StoreServices(service_category, status);

CREATE INDEX idx_wallet_logs_user_date ON WalletLogs(user_id, date);
CREATE INDEX idx_notification_logs_user_date ON NotificationLogs(user_id, date);
```

Before adding indexes in production:

- Run `EXPLAIN` on the slow queries.
- Check existing indexes first.
- Add indexes in small migrations during low traffic.
- Avoid locking large tables without an online migration plan.

### 6. High-Cost Location Queries

The nearby salon query is better than a full scan because it uses a bounding box and `ST_Distance_Sphere`, but it still joins reviews, services, categories, languages, and favourites in one request.

Location:

- `src/core/database/Controller/userDbController.js:2080`

Good:

- It uses `LIMIT/OFFSET`.
- It applies bounding box filters before exact distance.

Risk:

- `latitude` and `longitude` appear stored as strings in the model.
- `ST_Distance_Sphere` and aggregation can be expensive with many stores/reviews/services.
- Offset pagination gets slower on deep pages.

Fix:

- Store latitude/longitude as numeric decimal columns.
- Keep spatial index on `PartnerAddress.location`.
- Add supporting indexes on status/store ids.
- Cache repeated nearby searches for short TTLs like 30-120 seconds.
- Consider cursor-based pagination internally later, while preserving current page/limit API externally.

### 7. Notifications Are Not Queued

Notification sending and notification logging are handled directly from API/admin flows.

Examples:

- `FirebaseService.notifyOrderStatus` calls `sendEachForMulticast` directly.
- Admin notification token collection loads all active user or partner device ids.

Locations:

- `src/core/utils/notifier.js:111`
- `src/core/database/Controller/AdminDbController.js:675`
- `src/core/database/Controller/AdminDbController.js:743`

Risk:

- Sending to large audiences can block request handling.
- FCM has batch limits and transient failures.
- Bulk inserts for success/failure logs can become huge.

Industry-level fix:

- Use a queue such as BullMQ + Redis, RabbitMQ, SQS, or similar.
- API creates a notification job and returns quickly.
- Worker processes send notifications in batches.
- Store progress/failure status for admin visibility.

### 8. Synchronous Work In Request Paths

Booking/payment flows perform many DB calls, wallet updates, notifications, and logs inside a single request path.

Examples:

- `createorder` loops services and performs repeated DB reads.
- `paymentsucssess` updates booking, fetches booking/store/tokens/user, updates wallet, logs notifications, sends FCM.

Locations:

- `src/User/middleware/appmiddleware.js:882`
- `src/User/middleware/appmiddleware.js:1479`

Risk:

- Slow payment response.
- Duplicate payment success calls can cause duplicate wallet/notification side effects unless idempotency is strict.
- Request latency depends on third-party services.

Fix without API change:

- Keep payment response shape.
- Make payment update idempotent by checking existing status/payment id.
- Move notification sending to a background job after DB commit.
- Batch service lookups with `WHERE id IN (...)` instead of one query per service.
- Use transactions consistently for booking, wallet, appointment items, coupon usage, and payment updates.

### 9. Large Amount Of Console Logging

There are many `console.log` statements in auth, payment, admin, partner, and user flows. Some logs include request bodies, tokens, passwords, OTP data, or full query output.

Examples:

- `src/User/middleware/authmiddleware.js`
- `src/Partner/middleware/partnerauthmiddleware.js`
- `src/User/middleware/appmiddleware.js`
- `src/core/database/Controller/userDbController.js:3335`
- `src/core/utils/notifier.js:157`

Risk:

- Sensitive data leakage.
- High log volume under traffic.
- Harder production debugging.

Fix:

- Replace direct console logs with structured logger.
- Redact tokens, OTPs, passwords, payment IDs, and request bodies.
- Use log levels: error, warn, info, debug.
- Disable debug logs in production.

### 10. Rate Limiting Exists But Is Too Narrow

Auth OTP routes have rate limiting:

- `src/User/routes/userauthroutes.js:17`
- `src/Partner/routes/partnerauthroutes.js:14`

Good:

- OTP endpoints have some protection.

Gaps:

- Rate limit is in-memory by default, so it does not work correctly across multiple app instances.
- Expensive user/admin search/report endpoints are not globally protected.
- Login/social auth routes are less protected than OTP routes.

Fix:

- Use Redis-backed rate limiting.
- Apply stricter limits to OTP, login, payment verification, search, reports, uploads, and notification sends.
- Add per-user and per-IP limits.

## Industry-Level Things Missing

### 1. Production Migrations

Replace runtime `sync()` with migrations:

- Sequelize CLI migrations.
- SQL migration files.
- Migration run in CI/CD or deployment script.
- Rollback plan.

### 2. Observability

Add:

- Request id/correlation id.
- Structured JSON logs.
- Metrics: request latency, error rate, DB pool pending, slow query count, queue depth.
- APM: OpenTelemetry, New Relic, Datadog, Elastic APM, or similar.
- Health endpoint that checks DB and critical dependencies.

Current `/status` only returns a static live response.

### 3. Background Job System

Move these to workers:

- Bulk notifications.
- PDF generation.
- Email sending.
- Large exports.
- Cron jobs.
- Image processing if CPU-heavy.
- Payment post-processing notifications.

### 4. Cache Layer

Add Redis for:

- Rate limit store.
- OTP/session throttling.
- Popular categories/banners/languages/services.
- Nearby salon query short TTL cache.
- Admin dashboard summary cache.

### 5. Load Testing

Use k6, Artillery, or JMeter.

Test scenarios:

- OTP send/verify.
- Home/nearby salons.
- Store details.
- Booking create/payment success.
- Admin dashboard.
- Partner appointment list.

Suggested target before claiming 100k readiness:

- p95 latency under 300-500ms for read APIs.
- p95 under 1-2s for payment/booking APIs.
- Error rate below 1%.
- DB pool pending near zero during normal load.

### 6. Horizontal Scaling Readiness

Before multiple app instances:

- Remove in-memory-only rate limits.
- Ensure cron jobs run only once, not once per instance.
- Ensure upload storage is shared or object-storage based.
- Ensure sessions are not tied to one process.
- Ensure logs/metrics are centralized.

### 7. Secrets Management

Secrets and credentials appear in config/docker files, including database passwords and app secrets.

Examples:

- `config/config.js:56`
- `config/config.js:61`
- `config/config.js:64`
- `docker-compose.yml:10`
- `docker-compose.yml:46`

Fix:

- Move all secrets to environment variables or a secrets manager.
- Rotate any exposed production secrets.
- Do not commit Firebase/service-account/private-key files.

### 8. Security Headers And Input Limits

Helmet exists, which is good. Add:

- JSON body size limit.
- URL encoded body size limit.
- Upload file type validation.
- Central input validation for critical endpoints.
- Request timeout.
- CORS config from env.

Example:

```js
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));
```

### 9. Error Handling Standardization

Current code often catches errors and returns generic messages. Add:

- Central error middleware.
- Consistent error codes.
- Safe production error output.
- Full internal error logging with request id.

### 10. Database Read/Write Separation

At larger scale:

- Use primary DB for writes.
- Use read replicas for admin reports, public search, dashboards, and exports.
- Keep payment/booking writes on primary.

## Optimization Roadmap

### Phase 1: Safe Production Cleanup

No frontend/API contract changes.

- Disable 5-second pool `console.log` in production.
- Remove sensitive console logs from auth/payment flows.
- Add JSON/body size limits.
- Move DB pool settings to env.
- Add request logging with request id.
- Add Redis-backed rate limiter for OTP/login/payment/search/report endpoints.
- Add indexes for the most common filters and joins.
- Add slow query logging in MySQL.

### Phase 2: Database And Query Optimization

- Add pagination/default caps to admin list endpoints.
- Add `EXPLAIN` analysis for top 10 slow SQL queries.
- Batch service/combo lookups in booking flow.
- Replace repeated live counts with cached summary tables where needed.
- Ensure payment success is idempotent.
- Add composite indexes for appointments, reviews, favourites, store services, sessions, and notification logs.

### Phase 3: Background Workers

- Add Redis + BullMQ.
- Move bulk notification sends to workers.
- Move email/PDF/exports to workers.
- Move cron jobs out of API process or guard them with a distributed lock.
- Add job status tracking for admin.

### Phase 4: Observability And Load Testing

- Add metrics endpoint or APM agent.
- Track p50/p95/p99 latency by route.
- Track DB pool usage and queue depth.
- Run k6/Artillery test suites.
- Set production SLOs and alerts.

### Phase 5: Scale Infrastructure

- Run multiple API instances behind Nginx/ALB.
- Use PM2 cluster or container replicas.
- Add read replica for reporting/search.
- Add CDN/object storage for uploads/static assets.
- Add automated backups and restore drills.

## Priority Fix List

### Critical

- Remove/guard production pool interval logging.
- Stop logging tokens, OTPs, passwords, and full request bodies.
- Make payment success and wallet credit idempotent.
- Add indexes for appointments, sessions, favourites, reviews, store status/completion, and notification logs.
- Replace runtime DB sync with migrations for production.

### High

- Add pagination/caps to admin full-list endpoints.
- Queue notifications and large email/PDF/export work.
- Redis-backed rate limiting.
- Add request/body size limits.
- Add structured logs and request ids.

### Medium

- Cache categories, banners, languages, services, dashboard counts, and nearby salon results.
- Add read replicas for reporting/admin queries.
- Add health checks that verify DB connectivity.
- Move cron jobs out of the API process or protect with distributed locks.

## Suggested Environment Settings

```env
DB_POOL_MAX=20
DB_POOL_MIN=2
DB_POOL_ACQUIRE_MS=30000
DB_POOL_IDLE_MS=10000
DB_POOL_DEBUG=false
JSON_BODY_LIMIT=1mb
URLENCODED_BODY_LIMIT=1mb
REDIS_URL=redis://redis:6379
LOG_LEVEL=info
```

Pool sizing rule:

```text
total_db_connections = app_instance_count * DB_POOL_MAX
```

Keep this safely below MySQL `max_connections`, leaving room for admin tools, migrations, workers, and replicas.

## Suggested Load Test Acceptance

Before saying the API is ready for 100k users, run at least:

- 1,000 virtual users for common read traffic.
- 100-300 virtual users for booking/payment flows.
- Admin/reporting tests separately because they are heavier.
- 30-60 minute soak test.
- Spike test for OTP/login.

Pass criteria:

- p95 read latency under 500ms.
- p95 booking/payment latency under 2s.
- Error rate below 1%.
- No DB pool starvation.
- No memory growth over time.
- No duplicate wallet/payment side effects.

## Final Recommendation

The backend is workable for production, but it is currently closer to an early production system than an industrial-scale system. For 100,000 registered users, focus first on database indexes, pagination caps, logging cleanup, idempotent payment handling, and queues. Those changes do not require frontend API changes and will give the biggest reliability gain.

The biggest industrial-level missing pieces are:

- Migrations instead of runtime sync.
- Redis-backed rate limiting and caching.
- Background workers for notifications and heavy jobs.
- Observability with metrics/traces/structured logs.
- Load testing with measured capacity numbers.
- Secrets management and rotation.
- A clear database indexing and slow-query process.
