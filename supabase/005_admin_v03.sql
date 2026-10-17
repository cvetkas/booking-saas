-- Booking Platform v0.3: company settings permissions only.
-- Existing data is preserved. Run once in Supabase SQL Editor.
BEGIN;
GRANT UPDATE (name, booking_enabled) ON TABLE public.companies TO authenticated;
DROP POLICY IF EXISTS companies_admin_update ON public.companies;
CREATE POLICY companies_admin_update ON public.companies
 FOR UPDATE TO authenticated
 USING (public.is_company_admin(id))
 WITH CHECK (public.is_company_admin(id));
COMMIT;
