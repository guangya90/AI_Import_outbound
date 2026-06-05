import { NextRequest, NextResponse } from 'next/server';
import { applyRule } from '@/lib/rule-engine/engine';
import { parseFile } from '@/lib/parsers/server-parsers';
import { BUILTIN_RULES } from '@/lib/rule-engine/builtin-rules';
import { cv } from '@/lib/rule-engine/helpers';
import { getRule } from '@/lib/db';

export const runtime = 'nodejs';
export const maxDuration = 30;
export const dynamic = 'force-dynamic';

/** POST /api/parse - multipart/form-data: file + ruleId */
export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const file = form.get('file') as File | null;
    const ruleId = form.get('ruleId') as string | null;
    const inlineRule = form.get('rule') as string | null;

    if (!file) {
      return NextResponse.json({ error: '未提供文件' }, { status: 400 });
    }

    // 解析 rule - 优先级: 内置 -> 数据库 -> inline
    let rule: any = BUILTIN_RULES.find((r) => r.id === ruleId);
    if (!rule && ruleId) {
      // 查数据库
      try {
        const dbRule = await getRule(ruleId);
        if (dbRule?.rule_json) {
          rule = dbRule.rule_json;
        }
      } catch (e: any) {
        console.warn('[parse] getRule from db failed:', e.message);
      }
    }
    if (!rule && inlineRule) {
      try {
        rule = JSON.parse(inlineRule);
      } catch {
        return NextResponse.json({ error: '规则 JSON 格式错误' }, { status: 400 });
      }
    }
    if (!rule) {
      return NextResponse.json(
        { error: `未找到规则: ${ruleId} (内置规则 5 个,可在"规则管理"页创建新规则)` },
        { status: 400 }
      );
    }

    // 解析文件
    const buf = await file.arrayBuffer();
    const fileType = inferFileType(file.name);
    const doc = await parseFile(buf, file.name, fileType);
    const result = applyRule(doc, rule);

    return NextResponse.json({
      ok: true,
      ruleId: rule.id,
      ruleName: rule.name,
      orders: result.orders,
      totalRows: result.totalRows,
      parseErrors: result.parseErrors
    });
  } catch (e: any) {
    console.error('[parse]', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

function inferFileType(name: string): 'xlsx' | 'csv' | 'docx' | 'pdf' {
  const lower = name.toLowerCase();
  if (lower.endsWith('.xlsx') || lower.endsWith('.xls')) return 'xlsx';
  if (lower.endsWith('.csv')) return 'csv';
  if (lower.endsWith('.docx') || lower.endsWith('.doc')) return 'docx';
  if (lower.endsWith('.pdf')) return 'pdf';
  return 'xlsx';
}
