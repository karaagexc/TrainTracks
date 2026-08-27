import { NextResponse } from 'next/server';
import { getAdminContext } from '@/domain/auth/admin';
import { noStoreHeaders } from '@/domain/predictions/http';

export const dynamic = 'force-dynamic';

export async function GET() {
    const context = await getAdminContext();
    if (!context) {
        return NextResponse.json({ ok: false, authenticated: false, isAdmin: false }, {
            status: 401,
            headers: noStoreHeaders(),
        });
    }

    return NextResponse.json({
        ok: context.isAdmin,
        authenticated: true,
        isAdmin: context.isAdmin,
        email: context.user.email ?? null,
    }, {
        status: context.isAdmin ? 200 : 403,
        headers: noStoreHeaders(),
    });
}
