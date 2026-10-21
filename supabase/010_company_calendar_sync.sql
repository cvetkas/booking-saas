-- Restrict manual calendar sync to one authorized company.
CREATE OR REPLACE FUNCTION public.claim_company_calendar_jobs(p_company_id uuid,p_limit int DEFAULT 5)
RETURNS SETOF public.booking_calendar_jobs
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
 IF auth.role() <> 'service_role' THEN RAISE EXCEPTION 'Forbidden'; END IF;
 RETURN QUERY
 WITH selected AS (
  SELECT j.booking_id FROM public.booking_calendar_jobs j
  WHERE j.company_id=p_company_id
    AND j.revision > j.processed_revision AND j.next_attempt_at <= now()
    AND (j.locked_until IS NULL OR j.locked_until < now())
  ORDER BY j.updated_at FOR UPDATE SKIP LOCKED LIMIT least(greatest(p_limit,1),10)
 )
 UPDATE public.booking_calendar_jobs j SET locked_until=now()+interval '2 minutes'
 FROM selected s WHERE j.booking_id=s.booking_id
 RETURNING j.*;
END;
$$;
REVOKE ALL ON FUNCTION public.claim_company_calendar_jobs(uuid,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_company_calendar_jobs(uuid,integer) TO service_role;
