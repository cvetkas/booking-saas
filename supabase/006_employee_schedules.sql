-- Booking SaaS v0.3.1 – employee day exceptions
-- Non-destructive. Requires existing employees/company_members tables and v0.3 RLS helper functions.
-- Run in Supabase SQL Editor once, before testing employee special-day UI.
BEGIN;

CREATE TABLE IF NOT EXISTS public.employee_day_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  employee_id uuid NOT NULL,
  local_date date NOT NULL,
  mode text NOT NULL CHECK (mode IN ('closed', 'custom')),
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT employee_day_overrides_employee_fk
    FOREIGN KEY (company_id,employee_id)
    REFERENCES public.employees(company_id,id) ON DELETE CASCADE,
  CONSTRAINT employee_day_overrides_unique_date UNIQUE (company_id,employee_id,local_date),
  CONSTRAINT employee_day_overrides_composite_unique UNIQUE (company_id,employee_id,id)
);

CREATE TABLE IF NOT EXISTS public.employee_day_override_shifts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  employee_id uuid NOT NULL,
  override_id uuid NOT NULL,
  start_local time NOT NULL,
  end_local time NOT NULL,
  CONSTRAINT override_shift_valid_time CHECK (start_local < end_local),
  CONSTRAINT override_shift_fk FOREIGN KEY (company_id,employee_id,override_id)
    REFERENCES public.employee_day_overrides(company_id,employee_id,id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS employee_day_override_employee_date_idx
  ON public.employee_day_overrides(employee_id,local_date);
CREATE INDEX IF NOT EXISTS employee_day_override_shifts_override_idx
  ON public.employee_day_override_shifts(override_id);

ALTER TABLE public.employee_day_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_day_override_shifts ENABLE ROW LEVEL SECURITY;

GRANT SELECT,INSERT,UPDATE,DELETE ON public.employee_day_overrides TO authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.employee_day_override_shifts TO authenticated;
REVOKE ALL ON public.employee_day_overrides FROM anon;
REVOKE ALL ON public.employee_day_override_shifts FROM anon;

DROP POLICY IF EXISTS day_overrides_member_select ON public.employee_day_overrides;
CREATE POLICY day_overrides_member_select ON public.employee_day_overrides FOR SELECT TO authenticated
  USING (public.is_company_member(company_id));
DROP POLICY IF EXISTS day_overrides_admin_insert ON public.employee_day_overrides;
CREATE POLICY day_overrides_admin_insert ON public.employee_day_overrides FOR INSERT TO authenticated
  WITH CHECK (public.is_company_admin(company_id));
DROP POLICY IF EXISTS day_overrides_admin_update ON public.employee_day_overrides;
CREATE POLICY day_overrides_admin_update ON public.employee_day_overrides FOR UPDATE TO authenticated
  USING (public.is_company_admin(company_id)) WITH CHECK (public.is_company_admin(company_id));
DROP POLICY IF EXISTS day_overrides_admin_delete ON public.employee_day_overrides;
CREATE POLICY day_overrides_admin_delete ON public.employee_day_overrides FOR DELETE TO authenticated
  USING (public.is_company_admin(company_id));

DROP POLICY IF EXISTS override_shifts_member_select ON public.employee_day_override_shifts;
CREATE POLICY override_shifts_member_select ON public.employee_day_override_shifts FOR SELECT TO authenticated
  USING (public.is_company_member(company_id));
DROP POLICY IF EXISTS override_shifts_admin_insert ON public.employee_day_override_shifts;
CREATE POLICY override_shifts_admin_insert ON public.employee_day_override_shifts FOR INSERT TO authenticated
  WITH CHECK (public.is_company_admin(company_id));
DROP POLICY IF EXISTS override_shifts_admin_update ON public.employee_day_override_shifts;
CREATE POLICY override_shifts_admin_update ON public.employee_day_override_shifts FOR UPDATE TO authenticated
  USING (public.is_company_admin(company_id)) WITH CHECK (public.is_company_admin(company_id));
DROP POLICY IF EXISTS override_shifts_admin_delete ON public.employee_day_override_shifts;
CREATE POLICY override_shifts_admin_delete ON public.employee_day_override_shifts FOR DELETE TO authenticated
  USING (public.is_company_admin(company_id));

COMMIT;
