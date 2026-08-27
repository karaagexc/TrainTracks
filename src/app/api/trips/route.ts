import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

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

function text(value: unknown, maxLength = 120): string | null {
    return typeof value === 'string' && value.trim().length > 0
        ? value.trim().slice(0, maxLength)
        : null;
}

function finiteNumber(value: unknown, min = 0, max = Number.MAX_SAFE_INTEGER): number | null {
    const parsed = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(parsed) ? Math.max(min, Math.min(max, parsed)) : null;
}

async function getAuthenticatedClient() {
    const supabase = await createClient();
    const { data: { user }, error } = await supabase.auth.getUser();
    return { supabase, user: error ? null : user };
}

export async function GET(request: NextRequest) {
    const { supabase, user } = await getAuthenticatedClient();
    if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });

    const requestedLimit = Number(request.nextUrl.searchParams.get('limit'));
    const limit = Number.isFinite(requestedLimit) ? Math.max(1, Math.min(100, requestedLimit)) : 3;
    const { data, error } = await supabase
        .from('trip_history')
        .select(TRIP_COLUMNS)
        .eq('user_id', user.id)
        .order('completed_at', { ascending: false })
        .limit(limit);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ trips: data ?? [] }, { headers: { 'Cache-Control': 'private, no-store' } });
}

export async function POST(request: NextRequest) {
    const { supabase, user } = await getAuthenticatedClient();
    if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });

    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    if (!body) return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });

    const clientTripId = text(body.client_trip_id, 160)
        ?? text(request.headers.get('x-idempotency-key'), 160);
    const originId = text(body.origin_id, 80);
    const originName = text(body.origin_name);
    const destinationId = text(body.destination_id, 80);
    const destinationName = text(body.destination_name);
    const lineId = text(body.line_id, 20);
    const ticketType = text(body.ticket_type, 30);
    const startedAt = text(body.started_at, 40);
    if (!clientTripId || !originId || !originName || !destinationId || !destinationName || !lineId || !ticketType || !startedAt) {
        return NextResponse.json({ error: 'Missing required trip fields.' }, { status: 400 });
    }

    const payload = {
        user_id: user.id,
        client_trip_id: clientTripId,
        origin_id: originId,
        origin_name: originName,
        destination_id: destinationId,
        destination_name: destinationName,
        line_id: lineId,
        destination_line_id: text(body.destination_line_id, 20),
        ticket_type: ticketType,
        fare: finiteNumber(body.fare, 0, 10_000) ?? 0,
        distance_km: finiteNumber(body.distance_km, 0, 500) ?? 0,
        direction: text(body.direction, 30),
        duration_minutes: finiteNumber(body.duration_minutes, 0, 24 * 60),
        started_at: startedAt,
        completed_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
        .from('trip_history')
        .upsert(payload, { onConflict: 'user_id,client_trip_id' })
        .select(TRIP_COLUMNS)
        .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ trip: data }, { status: 201 });
}

export async function PATCH(request: NextRequest) {
    const { supabase, user } = await getAuthenticatedClient();
    if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    const id = text(body?.id, 80);
    const patchValue = body?.patch;
    if (!id || !patchValue || typeof patchValue !== 'object') {
        return NextResponse.json({ error: 'Trip id and patch are required.' }, { status: 400 });
    }

    const candidate = patchValue as Record<string, unknown>;
    const patch: Record<string, unknown> = {};
    const fare = finiteNumber(candidate.fare, 0, 10_000);
    const distance = finiteNumber(candidate.distance_km, 0, 500);
    if (fare !== null) patch.fare = fare;
    if (distance !== null) patch.distance_km = distance;
    if ('direction' in candidate) patch.direction = text(candidate.direction, 30);
    if (Object.keys(patch).length === 0) {
        return NextResponse.json({ error: 'No supported repair fields.' }, { status: 400 });
    }

    const { error } = await supabase
        .from('trip_history')
        .update(patch)
        .eq('id', id)
        .eq('user_id', user.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
}