-- ADDITIONAL migration: run AFTER booking_platform_schema_v3.sql.
-- Creates a company and its owner membership in ONE atomic transaction.
-- No service_role key is needed in the browser.
BEGIN;
CREATE OR REPLACE FUNCTION public.create_company_with_owner(p_name text, p_slug text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_company uuid;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
  END IF;
  IF p_name IS NULL OR length(btrim(p_name)) NOT BETWEEN 2 AND 120 THEN
    RAISE EXCEPTION 'Invalid company name' USING ERRCODE = '22023';
  END IF;
  IF p_slug IS NULL OR p_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' OR length(p_slug) > 80 THEN
    RAISE EXCEPTION 'Invalid company slug' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.companies(name,slug)
    VALUES (btrim(p_name),p_slug) RETURNING id INTO v_company;
  INSERT INTO public.company_members(company_id,user_id,role)
    VALUES (v_company,v_user,'owner');
  RETURN v_company;
END;
$$;
REVOKE ALL ON FUNCTION public.create_company_with_owner(text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_company_with_owner(text,text) TO authenticated;
COMMIT;
