# Bookiry — development roadmap and calendar integration

Status: development only. Deploy only to Vercel Preview, not a public launch. Do not point bookiry.com at production yet.

## Phase 1: Google Calendar and Microsoft 365

Security prerequisites:
- Add Google Cloud OAuth web client and Microsoft Entra app registration separately.
- Store client IDs in server env and client secrets server-side only. Never expose refresh tokens in browser or Supabase client-side tables.
- Authorization-code flow with PKCE, cryptographically random one-use state, 10-minute expiry, exact redirect URI, verified user and owner/admin company membership.
- Bind each connection to the employee belonging to the company. Authenticate callback using a server-side state entry, not an arbitrary query string.
- Encrypt provider refresh tokens at rest using a separate server-side key, rotate credentials and handle revocation. Never log tokens.
- Use least-privilege scopes: Google Calendar free/busy and events access only if event creation is enabled; Microsoft Graph Calendars.ReadWrite for write sync. Request offline access.
- Query calendars for conflict checks, fail closed when selected busy calendars are temporarily unreachable, and provide clear user feedback.
- On reservation creation/rescheduling/cancellation: synchronize the chosen destination calendar, preserving provider event ID and idempotent retries. Use durable outbox jobs and event reconciliation before enabling production.
- Disconnect action must revoke where possible and delete protected credentials. Do not enable toggle `check_busy` for incomplete connections.

OAuth environment variable names (to be set later after registrations):
`GOOGLE_CALENDAR_CLIENT_ID`, `GOOGLE_CALENDAR_CLIENT_SECRET`,
`MICROSOFT_CALENDAR_CLIENT_ID`, `MICROSOFT_CALENDAR_CLIENT_SECRET`,
`CALENDAR_TOKEN_ENCRYPTION_KEY` and `APP_BASE_URL`.

Migration `007_calendar_oauth_states.sql` creates only a protected temporary OAuth handshake state table. It does not activate any connection or write calendar events. Apply in Supabase SQL Editor after verifying the database schema. Existing bookings remain untouched.

## Remaining development phases

1. Complete calendar OAuth and bidirectional consistency tests.
2. Notifications: Resend verified sender, delivery statuses, .ics tests, queues, retries, cancellation semantics.
3. Public booking: mobile-first branding, company-specific customization and friendly scheduling flow.
4. SaaS tenancy: company member roles, staff permissions, onboarding and subscription entitlements.
5. Service catalogue: pricing, categorization, locations, buffers and multi-staff assignments.
6. Security and quality: RLS audit, rate limiting, abuse controls, automated tests, accessibility, GDPR/data lifecycle.
7. Production launch: isolated production Supabase project, Vercel prod release, verified domain and mail DNS, monitoring and backups.

Acceptance condition: No phase is 'done' merely because Vercel build status says Ready; finish browser walkthrough, permissions and edge-case tests first.
