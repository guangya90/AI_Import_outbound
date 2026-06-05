import { NextRequest, NextResponse } from 'next/server';
import { listOrders } from '@/lib/db';

export const runtime = 'nodejs';
export const maxDuration = 30;
export const dynamic = 'force-dynamic';

/** GET /api/orders?q=...&page=1&pageSize=20 */
export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const result = await listOrders({
      q: sp.get('q') ?? undefined,
      externalCode: sp.get('externalCode') ?? undefined,
      recipient: sp.get('recipient') ?? undefined,
      page: Number(sp.get('page') ?? '1'),
      pageSize: Number(sp.get('pageSize') ?? '20')
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (e: any) {
    console.error('[orders list]', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
