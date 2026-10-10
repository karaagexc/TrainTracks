import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { boundedNumber, boundedText, validateTrip, validateTripPatch } from './validation';
import { isRecord } from '@/domain/config';
import { isSameOriginMutation } from '@/domain/auth/request';

export const dynamic = 'force-dynamic';

const TRIP_COLUMNS = [
    'id',
    'client_trip_id',
    'user_id',
    'origin_id',
    'origin_name',
    'destination_id',
    'destination_name',
    'line_id',
    'destination_line_id',
    'ticket_type',
    'fare',
    'distance_km',
    'direction',
    'duration_minutes',
    'started_at',
    'completed_at',
    'created_at',
].join(',');

const headers = { 'Cache-Control': 'private, no-store' };

async function getAuthenticatedClient() {
    const supabase = await createClient();
    const { data: { user }, error } = await supabase.auth.getUser();
    return { supabase, user: error ? null : user };
}

export async function GET(request: NextRequest) {
    const { supabase, user } = await getAuthenticatedClient();
    if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401, headers });

    const params = request.nextUrl.searchParams;
    const limit = params.has('limit') ? boundedNumber(params.get('limit'), 100, true) : 3;
    const offset = params.has('offset') ? boundedNumber(params.get('offset'), 1000000, true) : 0;
    if (limit === null || limit < 1 || offset === null) return NextResponse.json({ error: 'Invalid limit or offset.' }, { status: 400, headers });
    const paginated = params.has('offset') || params.get('pagination') === 'true';
    const { data, error } = await supabase
        .from('trip_history')
        .select(TRIP_COLUMNS)
        .eq('user_id', user.id)
        .order('completed_at', { ascending: false })
        .order('id', { ascending: false })
        .range(offset, offset + limit - 1 + (paginated ? 1 : 0));

    if (error) return NextResponse.json({ error: error.message }, { status: 500, headers });
    const result: Record<string, unknown> = { trips: (data ?? []).slice(0, limit) };
    if (paginated) result.pagination = { limit, offset, hasMore: (data?.length ?? 0) > limit,
        nextOffset: (data?.length ?? 0) > limit ? offset + limit : null };
    if (params.get('includeTotals') === 'true') {
        const totals = await supabase.rpc('trip_history_totals');
        if (totals.error) return NextResponse.json({ error: totals.error.message }, { status: 500, headers });
        const row = Array.isArray(totals.data) ? totals.data[0] : totals.data;
        if (!row) return NextResponse.json({ error: 'Trip totals unavailable.' }, { status: 500, headers });
        result.totals = { totalTrips: Number(row.total_trips), totalFare: Number(row.total_fare), totalDistance: Number(row.total_distance) };
    }
    return NextResponse.json(result, { headers });
}

export async function POST(request: NextRequest) {
    if (!isSameOriginMutation(request)) return NextResponse.json({ error: 'Forbidden origin.' }, { status: 403, headers });
    const { supabase, user } = await getAuthenticatedClient();
    if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401, headers });

    const body: unknown = await request.json().catch(() => null);
    const validation = validateTrip(body, user.id, request.headers.get('x-idempotency-key'));
    if (!validation.ok) return NextResponse.json({ error: validation.error }, { status: 400, headers });
    const payload = validation.value;

    const { data, error } = await supabase
        .from('trip_history')
        .upsert(payload, { onConflict: 'user_id,client_trip_id', ignoreDuplicates: true })
        .select(TRIP_COLUMNS)
        .maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500, headers });
    // ON CONFLICT DO NOTHING preserves every first-write field, including arrival time.
    const existing = data ? null : await supabase.from('trip_history').select(TRIP_COLUMNS)
        .eq('user_id', user.id).eq('client_trip_id', payload.client_trip_id).single();
    if (existing?.error || (!data && !existing?.data)) {
        return NextResponse.json({ error: existing?.error?.message ?? 'Trip write was not acknowledged.' }, { status: 500, headers });
    }
    return NextResponse.json({ trip: data ?? existing?.data }, { status: 201, headers });
}

export async function PATCH(request: NextRequest) {
    if (!isSameOriginMutation(request)) return NextResponse.json({ error: 'Forbidden origin.' }, { status: 403, headers });
    const { supabase, user } = await getAuthenticatedClient();
    if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401, headers });
    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    const id = boundedText(body?.id, 80);
    const patchValue = body?.patch;
    if (!id || !isRecord(patchValue)) {
        return NextResponse.json({ error: 'Trip id and patch are required.' }, { status: 400, headers });
    }

    const validation = validateTripPatch(patchValue);
    if (!validation.ok) return NextResponse.json({ error: validation.error }, { status: 400, headers });
    if (typeof validation.value.direction === 'string') {
        const existing = await supabase.from('trip_history').select('id,line_id').eq('id', id).eq('user_id', user.id).maybeSingle();
        if (existing.error) return NextResponse.json({ error: existing.error.message }, { status: 500, headers });
        if (!existing.data) return NextResponse.json({ error: 'Trip not found.' }, { status: 404, headers });
        const direction = validateTripPatch(patchValue, existing.data.line_id);
        if (!direction.ok) return NextResponse.json({ error: direction.error }, { status: 400, headers });
    }

    const { data, error } = await supabase
        .from('trip_history')
        .update(validation.value)
        .eq('id', id)
        .eq('user_id', user.id)
        .select('id').maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500, headers });
    if (!data) return NextResponse.json({ error: 'Trip not found.' }, { status: 404, headers });
    return NextResponse.json({ ok: true }, { headers });
}
