-- Bookiry v0.4: encrypted calendar OAuth connections.
-- All secret material must be encrypted by application code before insert.
BEGIN;
CREATE TABLE IF NOT EXISTS public.calendar_oauth_credentials(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
 employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
 provider text NOT NULL CHECK(provider IN ('google','microsoft')),
 external_account_id text,
 access_token_ciphertext text NOT NULL,
 refresh_token_ciphertext text,
 expires_at timestamptz,
 connected_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(company_id,employee_id,provider)
);
ALTER TABLE public.calendar_oauth_credentials ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.calendar_oauth_credentials FROM PUBLIC,anon,authenticated;
COMMIT;
