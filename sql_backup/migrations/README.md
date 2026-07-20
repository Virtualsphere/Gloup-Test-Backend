# Legacy SQL notes (do not run by hand on deploy)

Schema changes are now applied automatically via versioned Umzug migrations in
`/migrations` on app startup.

- `2026-07-18_add_customer_contact_to_appointments.sql`
  → `migrations/20260718120000-add-customer-contact-to-appointments.js`
- `2026-07-02_add_pending_to_appointments_status.sql`
  → `migrations/20260702120000-add-pending-to-appointments-status.js`

Those JS migrations are idempotent, so if you already applied the SQL manually,
startup will detect that and only record them in `SequelizeMeta`.
