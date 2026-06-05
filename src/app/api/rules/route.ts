import { NextRequest, NextResponse } from 'next/server';
import { deleteRule, listRules, upsertRule } from '@/lib/db';
import { BUILTIN_RULES } from '@/lib/rule-engine/builtin-rules';

export const runtime = 'nodejs';
export const maxDuration = 30;
export const dynamic = 'force-dynamic';

/** GET /api/rules - 列出所有规则 (含内置) */
export async function GET() {
  try {
    const custom = await listRules().catch((e) => {
      console.warn('[rules list]', e.message);
      return [];
    });
    // 合并内置
    const builtin = BUILTIN_RULES.map((r) => ({ ...r, is_builtin: true, source: 'builtin' }));
    return NextResponse.json({ ok: true, rules: [...builtin, ...custom] });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

/** POST /api/rules - 创建或更新规则 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const rule = body.rule;
    if (!rule?.id) {
      return NextResponse.json({ error: 'rule.id 必填' }, { status: 400 });
    }
    rule.isBuiltin = false;
    rule.source = rule.source ?? 'manual';
    await upsertRule(rule);
    return NextResponse.json({ ok: true, rule });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

/** DELETE /api/rules?id=xxx */
export async function DELETE(req: NextRequest) {
  try {
    const id = req.nextUrl.searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'id 必填' }, { status: 400 });
    await deleteRule(id);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
