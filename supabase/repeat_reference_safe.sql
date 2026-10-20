-- ============================================================================
-- SATF Repeat-Reference-Safe Persistence Migration
-- Description:
--   1. Drops UNIQUE constraint on satf_operational_tours(booking_reference)
--      to allow distinct tours sharing a booking reference (e.g. separate guest
--      bookings in the same month, or non-contiguous travel periods).
--   2. Adds source_record_id column and creates a partial UNIQUE index on
--      source_record_id (WHERE source_record_id IS NOT NULL) to guarantee
--      re-import idempotency per Excel source cell.
--   3. Maintains non-unique performance index on booking_reference for fast lookups.
--   4. Updates satf_mutate_tour_atomic with tagged dollar-quoting ($func$) and
--      field-preserving logic: an omitted source_record_id or missing optional
--      properties during UPDATE will NEVER erase existing tour values.
--
-- Safety Guarantees:
--   - Does NOT drop or recreate table: all existing records preserved.
--   - Does NOT alter primary key (id): all existing tour IDs ('satf-...') preserved.
--   - satf_audit_log foreign key (tour_id REFERENCES satf_operational_tours(id))
--     remains 100% valid and unaffected.
--   - Zero downtime, backward-compatible.
-- ============================================================================

-- 1. Drop the table-level UNIQUE constraint on booking_reference
ALTER TABLE public.satf_operational_tours
    DROP CONSTRAINT IF EXISTS satf_operational_tours_booking_reference_key;

-- Also drop any standalone unique index if created separately
DROP INDEX IF EXISTS public.satf_operational_tours_booking_reference_key;
DROP INDEX IF EXISTS public.idx_satf_tours_booking_ref_unique;

-- 2. Add source_record_id column if not already present
ALTER TABLE public.satf_operational_tours
    ADD COLUMN IF NOT EXISTS source_record_id TEXT;

-- 3. Ensure provenance JSONB column exists with proper default
ALTER TABLE public.satf_operational_tours
    ADD COLUMN IF NOT EXISTS provenance JSONB DEFAULT '{}'::jsonb;

-- 4. Safe backfill: Populate source_record_id from existing provenance JSONB
-- Targets rows where source_record_id IS NULL and provenance contains a valid source_record_id
UPDATE public.satf_operational_tours
SET source_record_id = NULLIF(trim(provenance->>'source_record_id'), '')
WHERE source_record_id IS NULL
  AND provenance IS NOT NULL
  AND provenance ? 'source_record_id'
  AND NULLIF(trim(provenance->>'source_record_id'), '') IS NOT NULL;

-- 5. Defensive conflict resolution prior to unique index creation:
-- In the event legacy records share a duplicate source_record_id, retain the primary/latest
-- record and clear the duplicate row's source_record_id to NULL to guarantee index builds cleanly.
WITH duplicate_sources AS (
    SELECT id,
           ROW_NUMBER() OVER (
               PARTITION BY source_record_id
               ORDER BY last_updated DESC, created_at DESC
           ) as rn
    FROM public.satf_operational_tours
    WHERE source_record_id IS NOT NULL
)
UPDATE public.satf_operational_tours t
SET source_record_id = NULL
FROM duplicate_sources d
WHERE t.id = d.id AND d.rn > 1;

-- 6. Create standard non-unique index on booking_reference for fast queries
CREATE INDEX IF NOT EXISTS idx_satf_tours_booking_ref
    ON public.satf_operational_tours(booking_reference);

-- 7. Create partial UNIQUE index on source_record_id for idempotent Excel re-imports
CREATE UNIQUE INDEX IF NOT EXISTS idx_satf_tours_source_record_id
    ON public.satf_operational_tours(source_record_id)
    WHERE source_record_id IS NOT NULL;

-- 8. Update satf_mutate_tour_atomic procedure to persist source_record_id and provenance
-- Uses tagged dollar-quoting ($func$) and field-preserving logic
CREATE OR REPLACE FUNCTION public.satf_mutate_tour_atomic(
    p_tour JSONB,
    p_action TEXT,
    p_operator TEXT DEFAULT 'coordinator',
    p_expected_last_updated TIMESTAMPTZ DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $func$
DECLARE
    v_tour_id TEXT := p_tour->>'id';
    v_booking_ref TEXT := p_tour->>'booking_reference';
    v_source_record_id TEXT;
    v_current_last_updated TIMESTAMPTZ;
    v_new_last_updated TIMESTAMPTZ := now();
    v_result JSONB;
BEGIN
    IF p_action = 'update' THEN
        -- Select existing record state. Coalesce source_record_id and booking_ref
        -- so omitted or null values in p_tour CANNOT erase existing values.
        SELECT
            last_updated,
            booking_reference,
            COALESCE(
                NULLIF(p_tour->>'source_record_id', ''),
                NULLIF(p_tour->'provenance'->>'source_record_id', ''),
                source_record_id
            )
        INTO v_current_last_updated, v_booking_ref, v_source_record_id
        FROM public.satf_operational_tours
        WHERE id = v_tour_id;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'TOUR_NOT_FOUND: Tour % not found', v_tour_id;
        END IF;

        IF p_expected_last_updated IS NOT NULL AND v_current_last_updated > p_expected_last_updated THEN
            RAISE EXCEPTION 'CONCURRENCY_CONFLICT: Tour was updated by another coordinator at %', v_current_last_updated;
        END IF;

        -- Update with defensive field preservation:
        -- Any property absent from p_tour preserves the current database value.
        UPDATE public.satf_operational_tours
        SET
            booking_reference = COALESCE(NULLIF(p_tour->>'booking_reference', ''), v_booking_ref),
            source_record_id = v_source_record_id,
            group_data = CASE
                WHEN p_tour ? 'group_data' AND p_tour->'group_data' IS NOT NULL AND p_tour->'group_data' <> 'null'::jsonb
                THEN p_tour->'group_data'
                ELSE public.satf_operational_tours.group_data
            END,
            status = COALESCE(NULLIF(p_tour->>'status', ''), public.satf_operational_tours.status),
            agency = CASE
                WHEN p_tour ? 'agency' THEN p_tour->>'agency'
                ELSE public.satf_operational_tours.agency
            END,
            package_code = CASE
                WHEN p_tour ? 'package_code' THEN p_tour->>'package_code'
                ELSE public.satf_operational_tours.package_code
            END,
            circuit_name = CASE
                WHEN p_tour ? 'circuit_name' THEN p_tour->>'circuit_name'
                ELSE public.satf_operational_tours.circuit_name
            END,
            destination = CASE
                WHEN p_tour ? 'destination' AND p_tour->>'destination' IS NOT NULL
                THEN p_tour->>'destination'
                ELSE public.satf_operational_tours.destination
            END,
            arrival_date = CASE
                WHEN p_tour ? 'arrival_date' AND p_tour->>'arrival_date' IS NOT NULL AND p_tour->>'arrival_date' <> ''
                THEN (p_tour->>'arrival_date')::date
                ELSE public.satf_operational_tours.arrival_date
            END,
            departure_date = CASE
                WHEN p_tour ? 'departure_date' AND p_tour->>'departure_date' IS NOT NULL AND p_tour->>'departure_date' <> ''
                THEN (p_tour->>'departure_date')::date
                ELSE public.satf_operational_tours.departure_date
            END,
            flights = CASE
                WHEN p_tour ? 'flights' AND p_tour->'flights' IS NOT NULL AND p_tour->'flights' <> 'null'::jsonb
                THEN p_tour->'flights'
                ELSE public.satf_operational_tours.flights
            END,
            hotels = CASE
                WHEN p_tour ? 'hotels' AND p_tour->'hotels' IS NOT NULL AND p_tour->'hotels' <> 'null'::jsonb
                THEN p_tour->'hotels'
                ELSE public.satf_operational_tours.hotels
            END,
            itinerary = CASE
                WHEN p_tour ? 'itinerary' AND p_tour->'itinerary' IS NOT NULL AND p_tour->'itinerary' <> 'null'::jsonb
                THEN p_tour->'itinerary'
                ELSE public.satf_operational_tours.itinerary
            END,
            assignments = CASE
                WHEN p_tour ? 'assignments' AND p_tour->'assignments' IS NOT NULL AND p_tour->'assignments' <> 'null'::jsonb
                THEN p_tour->'assignments'
                ELSE public.satf_operational_tours.assignments
            END,
            special_requests = CASE
                WHEN p_tour ? 'special_requests' AND p_tour->'special_requests' IS NOT NULL AND p_tour->'special_requests' <> 'null'::jsonb
                THEN p_tour->'special_requests'
                ELSE public.satf_operational_tours.special_requests
            END,
            issues = CASE
                WHEN p_tour ? 'issues' AND p_tour->'issues' IS NOT NULL AND p_tour->'issues' <> 'null'::jsonb
                THEN p_tour->'issues'
                ELSE public.satf_operational_tours.issues
            END,
            operational_notes = CASE
                WHEN p_tour ? 'operational_notes' THEN p_tour->>'operational_notes'
                ELSE public.satf_operational_tours.operational_notes
            END,
            cancellation_reason = CASE
                WHEN p_tour ? 'cancellation_reason' THEN p_tour->>'cancellation_reason'
                ELSE public.satf_operational_tours.cancellation_reason
            END,
            cancelled_at = CASE
                WHEN p_tour ? 'cancelled_at' AND p_tour->>'cancelled_at' IS NOT NULL AND p_tour->>'cancelled_at' <> ''
                THEN (p_tour->>'cancelled_at')::timestamptz
                ELSE public.satf_operational_tours.cancelled_at
            END,
            is_imported = CASE
                WHEN p_tour ? 'is_imported' AND p_tour->>'is_imported' IS NOT NULL
                THEN (p_tour->>'is_imported')::boolean
                ELSE public.satf_operational_tours.is_imported
            END,
            source_sheet = CASE
                WHEN p_tour ? 'source_sheet' THEN p_tour->>'source_sheet'
                ELSE public.satf_operational_tours.source_sheet
            END,
            source_row = CASE
                WHEN p_tour ? 'source_row' AND p_tour->>'source_row' IS NOT NULL AND p_tour->>'source_row' <> ''
                THEN (p_tour->>'source_row')::integer
                ELSE public.satf_operational_tours.source_row
            END,
            source_provenance = CASE
                WHEN p_tour ? 'source_provenance' THEN p_tour->>'source_provenance'
                ELSE public.satf_operational_tours.source_provenance
            END,
            provenance = CASE
                WHEN p_tour ? 'provenance' AND p_tour->'provenance' IS NOT NULL AND p_tour->'provenance' <> 'null'::jsonb
                THEN COALESCE(public.satf_operational_tours.provenance, '{}'::jsonb) || (p_tour->'provenance')
                ELSE public.satf_operational_tours.provenance
            END,
            last_updated = v_new_last_updated
        WHERE id = v_tour_id;

    ELSIF p_action = 'create' THEN
        v_source_record_id := COALESCE(
            NULLIF(p_tour->>'source_record_id', ''),
            NULLIF(p_tour->'provenance'->>'source_record_id', '')
        );

        INSERT INTO public.satf_operational_tours (
            id, booking_reference, source_record_id, group_data, status, agency, package_code,
            circuit_name, destination, arrival_date, departure_date, flights,
            hotels, itinerary, assignments, special_requests, issues,
            operational_notes, is_imported, source_sheet, source_row,
            source_provenance, provenance, created_at, last_updated
        ) VALUES (
            v_tour_id, v_booking_ref, v_source_record_id, COALESCE(p_tour->'group_data', '{}'::jsonb),
            p_tour->>'status', p_tour->>'agency', p_tour->>'package_code',
            p_tour->>'circuit_name', COALESCE(p_tour->>'destination', ''),
            (p_tour->>'arrival_date')::date, (p_tour->>'departure_date')::date,
            COALESCE(p_tour->'flights', '[]'::jsonb), COALESCE(p_tour->'hotels', '[]'::jsonb),
            COALESCE(p_tour->'itinerary', '[]'::jsonb), COALESCE(p_tour->'assignments', '[]'::jsonb),
            COALESCE(p_tour->'special_requests', '[]'::jsonb), COALESCE(p_tour->'issues', '[]'::jsonb),
            p_tour->>'operational_notes', COALESCE((p_tour->>'is_imported')::boolean, false),
            p_tour->>'source_sheet', (p_tour->>'source_row')::integer,
            p_tour->>'source_provenance', COALESCE(p_tour->'provenance', '{}'::jsonb), now(), v_new_last_updated
        );

    ELSIF p_action = 'cancel' THEN
        SELECT last_updated, booking_reference, source_record_id
        INTO v_current_last_updated, v_booking_ref, v_source_record_id
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
            cancelled_at = COALESCE((p_tour->>'cancelled_at')::timestamptz, now()),
            last_updated = v_new_last_updated
        WHERE id = v_tour_id;

    ELSE
        RAISE EXCEPTION 'INVALID_ACTION: Unknown mutation action %', p_action;
    END IF;

    -- Audit log entry inside the same transaction
    INSERT INTO public.satf_audit_log (
        tour_id,
        booking_reference,
        action,
        operator,
        changes,
        created_at
    ) VALUES (
        v_tour_id,
        v_booking_ref,
        p_action,
        p_operator,
        jsonb_build_object(
            'action', p_action,
            'tour_id', v_tour_id,
            'booking_reference', v_booking_ref,
            'source_record_id', v_source_record_id,
            'status', COALESCE(p_tour->>'status', (CASE WHEN p_action = 'cancel' THEN 'cancelled' ELSE 'upcoming' END)),
            'mutation_timestamp', v_new_last_updated
        ),
        v_new_last_updated
    );

    SELECT row_to_json(t)::jsonb INTO v_result
    FROM public.satf_operational_tours t
    WHERE t.id = v_tour_id;

    RETURN v_result;
END;
$func$;

-- Preserve security privileges: strictly grant only to service_role
REVOKE ALL ON FUNCTION public.satf_mutate_tour_atomic(JSONB, TEXT, TEXT, TIMESTAMPTZ) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.satf_mutate_tour_atomic(JSONB, TEXT, TEXT, TIMESTAMPTZ) FROM anon;
REVOKE ALL ON FUNCTION public.satf_mutate_tour_atomic(JSONB, TEXT, TEXT, TIMESTAMPTZ) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.satf_mutate_tour_atomic(JSONB, TEXT, TEXT, TIMESTAMPTZ) TO service_role;
