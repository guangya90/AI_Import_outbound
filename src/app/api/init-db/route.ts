import { NextResponse } from 'next/server';
import { initSchema } from '@/lib/db';

export const runtime = 'nodejs';
export const maxDuration = 30;

export async function GET() {
  try {
    await initSchema();
    return NextResponse.json({ ok: true, message: '数据库表已初始化' });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
