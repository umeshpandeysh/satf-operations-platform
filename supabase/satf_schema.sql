-- ==============================================================================
-- SATF Operations Platform — Supabase PostgreSQL Production Schema
-- File: supabase/satf_schema.sql
--
-- This schema establishes server-side ACID persistence for SATF tours,
-- assignments, hotel confirmations, operational notes, and issue resolution.
-- ==============================================================================

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Main Operational Tours Table
CREATE TABLE IF NOT EXISTS public.satf_operational_tours (
    id TEXT PRIMARY KEY,
    booking_reference TEXT NOT NULL UNIQUE,
    group_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    status TEXT NOT NULL CHECK (status IN ('upcoming', 'active', 'completed', 'cancelled', 'attention')),
    itinerary_type TEXT,
    package_code TEXT,
    circuit_name TEXT,
    agency TEXT,
    destination TEXT NOT NULL DEFAULT '',
    arrival_date DATE NOT NULL,
    departure_date DATE NOT NULL,
    flights JSONB NOT NULL DEFAULT '[]'::jsonb,
    hotels JSONB NOT NULL DEFAULT '[]'::jsonb,
    itinerary JSONB NOT NULL DEFAULT '[]'::jsonb,
    assignments JSONB NOT NULL DEFAULT '[]'::jsonb,
    special_requests JSONB NOT NULL DEFAULT '[]'::jsonb,
    issues JSONB NOT NULL DEFAULT '[]'::jsonb,
    operational_notes TEXT,
    cancellation_reason TEXT,
    cancelled_at TIMESTAMPTZ,
    is_imported BOOLEAN NOT NULL DEFAULT false,
    source_sheet TEXT,
    source_row INTEGER,
    source_provenance TEXT,
    provenance JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_updated TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Performance Indexes
CREATE INDEX IF NOT EXISTS idx_satf_tours_arrival ON public.satf_operational_tours(arrival_date);
CREATE INDEX IF NOT EXISTS idx_satf_tours_departure ON public.satf_operational_tours(departure_date);
CREATE INDEX IF NOT EXISTS idx_satf_tours_status ON public.satf_operational_tours(status);
CREATE INDEX IF NOT EXISTS idx_satf_tours_booking_ref ON public.satf_operational_tours(booking_reference);
CREATE INDEX IF NOT EXISTS idx_satf_tours_last_updated ON public.satf_operational_tours(last_updated DESC);

-- 2. Operational Dispatch Audit Log
-- Preserves audit history even if parent tour is deleted (ON DELETE SET NULL)
CREATE TABLE IF NOT EXISTS public.satf_audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tour_id TEXT REFERENCES public.satf_operational_tours(id) ON DELETE SET NULL,
    booking_reference TEXT NOT NULL,
    action TEXT NOT NULL CHECK (action IN ('create', 'update', 'cancel', 'delete', 'assignment_change', 'issue_resolved')),
    operator TEXT NOT NULL,
    changes JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_satf_audit_tour_id ON public.satf_audit_log(tour_id);
CREATE INDEX IF NOT EXISTS idx_satf_audit_created_at ON public.satf_audit_log(created_at DESC);

-- 3. Row Level Security (RLS) Policies
ALTER TABLE public.satf_operational_tours ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.satf_audit_log ENABLE ROW LEVEL SECURITY;

-- Deny public anon access to protect Japanese tourist guest information and operational assignments
DROP POLICY IF EXISTS "Deny anon access to operational tours" ON public.satf_operational_tours;
CREATE POLICY "Deny anon access to operational tours"
    ON public.satf_operational_tours
    FOR ALL
    TO anon
    USING (false);

-- Service role bypass for backend Next.js API routes
DROP POLICY IF EXISTS "Service role full access to operational tours" ON public.satf_operational_tours;
CREATE POLICY "Service role full access to operational tours"
    ON public.satf_operational_tours
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

DROP POLICY IF EXISTS "Service role full access to audit log" ON public.satf_audit_log;
CREATE POLICY "Service role full access to audit log"
    ON public.satf_audit_log
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- 4. Atomic Mutation + Audit Stored Procedure (Transaction Boundary)
-- Guarantees ACID transactional consistency between tour mutation and audit logging.
-- If audit logging or concurrency validation fails, the entire transaction rolls back.
CREATE OR REPLACE FUNCTION public.satf_mutate_tour_atomic(
    p_tour JSONB,
    p_action TEXT,
    p_operator TEXT DEFAULT 'coordinator',
    p_expected_last_updated TIMESTAMPTZ DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_tour_id TEXT := p_tour->>'id';
    v_booking_ref TEXT := p_tour->>'booking_reference';
    v_current_last_updated TIMESTAMPTZ;
    v_new_last_updated TIMESTAMPTZ := now();
    v_result JSONB;
BEGIN
    IF p_action = 'update' THEN
        SELECT last_updated INTO v_current_last_updated
        FROM public.satf_operational_tours
        WHERE id = v_tour_id;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'TOUR_NOT_FOUND: Tour % not found', v_tour_id;
        END IF;

        IF p_expected_last_updated IS NOT NULL AND v_current_last_updated > p_expected_last_updated THEN
            RAISE EXCEPTION 'CONCURRENCY_CONFLICT: Tour was updated by another coordinator at %', v_current_last_updated;
        END IF;

        UPDATE public.satf_operational_tours
        SET
            booking_reference = v_booking_ref,
            group_data = COALESCE(p_tour->'group_data', '{}'::jsonb),
            status = p_tour->>'status',
            agency = p_tour->>'agency',
            package_code = p_tour->>'package_code',
            circuit_name = p_tour->>'circuit_name',
            destination = COALESCE(p_tour->>'destination', ''),
            arrival_date = (p_tour->>'arrival_date')::date,
            departure_date = (p_tour->>'departure_date')::date,
            flights = COALESCE(p_tour->'flights', '[]'::jsonb),
            hotels = COALESCE(p_tour->'hotels', '[]'::jsonb),
            itinerary = COALESCE(p_tour->'itinerary', '[]'::jsonb),
            assignments = COALESCE(p_tour->'assignments', '[]'::jsonb),
            special_requests = COALESCE(p_tour->'special_requests', '[]'::jsonb),
            issues = COALESCE(p_tour->'issues', '[]'::jsonb),
            operational_notes = p_tour->>'operational_notes',
            cancellation_reason = p_tour->>'cancellation_reason',
            cancelled_at = (p_tour->>'cancelled_at')::timestamptz,
            is_imported = COALESCE((p_tour->>'is_imported')::boolean, false),
            source_sheet = p_tour->>'source_sheet',
            source_row = (p_tour->>'source_row')::integer,
            source_provenance = p_tour->>'source_provenance',
            last_updated = v_new_last_updated
        WHERE id = v_tour_id;

    ELSIF p_action = 'create' THEN
        INSERT INTO public.satf_operational_tours (
            id, booking_reference, group_data, status, agency, package_code,
            circuit_name, destination, arrival_date, departure_date, flights,
            hotels, itinerary, assignments, special_requests, issues,
            operational_notes, is_imported, source_sheet, source_row,
            source_provenance, created_at, last_updated
        ) VALUES (
            v_tour_id, v_booking_ref, COALESCE(p_tour->'group_data', '{}'::jsonb),
            p_tour->>'status', p_tour->>'agency', p_tour->>'package_code',
            p_tour->>'circuit_name', COALESCE(p_tour->>'destination', ''),
            (p_tour->>'arrival_date')::date, (p_tour->>'departure_date')::date,
            COALESCE(p_tour->'flights', '[]'::jsonb), COALESCE(p_tour->'hotels', '[]'::jsonb),
            COALESCE(p_tour->'itinerary', '[]'::jsonb), COALESCE(p_tour->'assignments', '[]'::jsonb),
            COALESCE(p_tour->'special_requests', '[]'::jsonb), COALESCE(p_tour->'issues', '[]'::jsonb),
            p_tour->>'operational_notes', COALESCE((p_tour->>'is_imported')::boolean, false),
            p_tour->>'source_sheet', (p_tour->>'source_row')::integer,
            p_tour->>'source_provenance', now(), v_new_last_updated
        );

    ELSIF p_action = 'cancel' THEN
        SELECT last_updated, booking_reference INTO v_current_last_updated, v_booking_ref
        FROM public.satf_operational_tours
        WHERE id = v_tour_id;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'TOUR_NOT_FOUND: Tour % not found', v_tour_id;
        END IF;

        IF p_expected_last_updated IS NOT NULL AND v_current_last_updated > p_expected_last_updated THEN
            RAISE EXCEPTION 'CONCURRENCY_CONFLICT: Tour was updated by another coordinator at %', v_current_last_updated;
        END IF;

        UPDATE public.satf_operational_tours
        SET
            status = 'cancelled',
            cancellation_reason = COALESCE(p_tour->>'cancellation_reason', 'Cancelled by coordinator'),
            cancelled_at = now(),
            last_updated = v_new_last_updated
        WHERE id = v_tour_id;
    END IF;

    -- Record audit log inside the same atomic transaction
    -- If audit logging fails, the tour mutation rolls back
    INSERT INTO public.satf_audit_log (
        tour_id, booking_reference, action, operator, changes, created_at
    ) VALUES (
        v_tour_id, v_booking_ref, p_action, p_operator,
        jsonb_build_object(
            'tour_id', v_tour_id,
            'booking_reference', v_booking_ref,
            'action', p_action,
            'last_updated', v_new_last_updated,
            'changes', p_tour
        ),
        now()
    );

    SELECT to_jsonb(t) INTO v_result
    FROM public.satf_operational_tours t
    WHERE t.id = v_tour_id;

    RETURN v_result;
END;
$$;

-- Security hardening: ensure RPC cannot be executed by untrusted clients or anon keys
REVOKE ALL ON FUNCTION public.satf_mutate_tour_atomic(JSONB, TEXT, TEXT, TIMESTAMPTZ) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.satf_mutate_tour_atomic(JSONB, TEXT, TEXT, TIMESTAMPTZ) FROM anon;
REVOKE ALL ON FUNCTION public.satf_mutate_tour_atomic(JSONB, TEXT, TEXT, TIMESTAMPTZ) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.satf_mutate_tour_atomic(JSONB, TEXT, TEXT, TIMESTAMPTZ) TO service_role;
