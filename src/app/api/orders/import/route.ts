import { NextRequest, NextResponse } from 'next/server';
import { initSchema, insertOrders } from '@/lib/db';

export const runtime = 'nodejs';
export const maxDuration = 30;

/** POST /api/orders/import  body: { orders: OrderItem[], batchId?: string } */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const orders: any[] = body.orders ?? [];
    const batchId = body.batchId ?? `BATCH-${Date.now()}`;

    if (!Array.isArray(orders) || !orders.length) {
      return NextResponse.json({ error: 'orders 为空' }, { status: 400 });
    }

    // 服务端再做一次基本校验: 必填/异常行
    const valid: any[] = [];
    for (const o of orders) {
      const hasA = !!o.收货门店?.trim();
      const hasB = !!(o.收件人姓名?.trim() || o.收件人电话?.trim() || o.收件人地址?.trim());
      if (!hasA && !hasB) continue; // 整单丢弃
      // 过滤空的 detail
      const details = (o.details ?? []).filter((d: any) => d.SKU物品编码 || d.SKU物品名称);
      if (!details.length) continue;
      valid.push({ ...o, details });
    }

    if (!valid.length) {
      return NextResponse.json({ error: '没有可导入的有效订单' }, { status: 400 });
    }

    await insertOrders(batchId, valid);
    return NextResponse.json({ ok: true, batchId, count: valid.length });
  } catch (e: any) {
    console.error('[import]', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

/** GET /api/orders/import  - 初始化 schema (开发期) */
export async function GET() {
  try {
    await initSchema();
    return NextResponse.json({ ok: true, message: 'schema 已初始化' });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
