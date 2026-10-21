-- Bookiry v0.4.1: transactional booking calendar outbox.
-- Run after migration 008; does not delete bookings.
BEGIN;
CREATE TABLE IF NOT EXISTS public.booking_calendar_jobs (
 booking_id uuid PRIMARY KEY REFERENCES public.bookings(id) ON DELETE CASCADE,
 company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
 revision bigint NOT NULL DEFAULT 1,
 processed_revision bigint NOT NULL DEFAULT 0,
 attempts integer NOT NULL DEFAULT 0,
 next_attempt_at timestamptz NOT NULL DEFAULT now(),
 locked_until timestamptz,
 last_error text,
 updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.booking_calendar_jobs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.booking_calendar_jobs FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.queue_booking_calendar_change() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
 IF TG_OP = 'INSERT' OR
    (NEW.starts_at,NEW.ends_at,NEW.status,NEW.employee_id,NEW.service_id)
    IS DISTINCT FROM
    (OLD.starts_at,OLD.ends_at,OLD.status,OLD.employee_id,OLD.service_id)
 THEN
  INSERT INTO public.booking_calendar_jobs(booking_id,company_id)
   VALUES(NEW.id,NEW.company_id)
   ON CONFLICT (booking_id) DO UPDATE SET
    revision=public.booking_calendar_jobs.revision+1,
    next_attempt_at=now(),
    attempts=0,
    locked_until=NULL,
    updated_at=now();
 END IF;
 RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS queue_booking_calendar_change ON public.bookings;
CREATE TRIGGER queue_booking_calendar_change
 AFTER INSERT OR UPDATE ON public.bookings
 FOR EACH ROW EXECUTE FUNCTION public.queue_booking_calendar_change();
CREATE OR REPLACE FUNCTION public.claim_booking_calendar_jobs(p_limit int DEFAULT 10)
RETURNS SETOF public.booking_calendar_jobs
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
 IF auth.role() <> 'service_role' THEN RAISE EXCEPTION 'Forbidden'; END IF;
 RETURN QUERY
 WITH selected AS (
  SELECT j.booking_id FROM public.booking_calendar_jobs j
  WHERE j.revision > j.processed_revision AND j.next_attempt_at <= now()
   AND (j.locked_until IS NULL OR j.locked_until < now())
  ORDER BY j.updated_at FOR UPDATE SKIP LOCKED LIMIT least(greatest(p_limit,1),20)
 )
 UPDATE public.booking_calendar_jobs j SET locked_until=now()+interval '2 minutes'
 FROM selected s WHERE j.booking_id=s.booking_id
 RETURNING j.*;
END;
$$;
REVOKE ALL ON FUNCTION public.claim_booking_calendar_jobs(integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_booking_calendar_jobs(integer) TO service_role;
COMMIT;
