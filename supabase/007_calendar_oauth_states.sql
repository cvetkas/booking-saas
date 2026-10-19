-- Bookiry calendar OAuth connection handshake staging – v0.4 phase 1.
-- Only backend service role may access this table.
-- No OAuth access/refresh tokens are stored here.
BEGIN;
CREATE TABLE IF NOT EXISTS public.calendar_oauth_states (
  state_hash text PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider text NOT NULL CHECK(provider IN ('google','microsoft')),
  code_verifier text NOT NULL,
  redirect_uri text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '10 minutes'),
  consumed_at timestamptz,
  FOREIGN KEY (company_id, employee_id)
    REFERENCES public.employees(company_id, id) ON DELETE CASCADE,
  CHECK (expires_at > created_at)
);
CREATE INDEX IF NOT EXISTS calendar_oauth_states_expiry_idx
 ON public.calendar_oauth_states(expires_at);
ALTER TABLE public.calendar_oauth_states ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.calendar_oauth_states FROM PUBLIC, anon, authenticated;
COMMIT;
