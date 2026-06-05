import { NextRequest, NextResponse } from 'next/server';
import { generateRuleFromFile } from '@/lib/ai/deepseek';
import { parseFile } from '@/lib/parsers/server-parsers';
import { cv } from '@/lib/rule-engine/helpers';

export const runtime = 'nodejs';
export const maxDuration = 60;

/** POST /api/ai/generate-rule - multipart: file
 *  返回 AI 推荐的解析规则
 */
export async function POST(req: NextRequest) {
  try {
    if (!process.env.DEEPSEEK_API_KEY) {
      return NextResponse.json(
        { error: 'DEEPSEEK_API_KEY 未配置,无法使用 AI 规则生成' },
        { status: 400 }
      );
    }

    const form = await req.formData();
    const file = form.get('file') as File | null;
    if (!file) {
      return NextResponse.json({ error: '未提供文件' }, { status: 400 });
    }

    const buf = await file.arrayBuffer();
    const fileType = inferFileType(file.name);
    const doc = await parseFile(buf, file.name, fileType);

    // 构造预览文本 (前若干行)
    const previewLines: string[] = [];
    const MAX_LINES = 80;
    const MAX_LINE_LEN = 200;
    for (const sheet of doc.sheets) {
      previewLines.push(`# Sheet: ${sheet.name}`);
      for (let i = 0; i < Math.min(MAX_LINES, sheet.rows.length); i++) {
        const row = sheet.rows[i].map((c) => cv(c).slice(0, MAX_LINE_LEN));
        previewLines.push(`Row ${i}: ${row.join(' | ')}`);
      }
      previewLines.push('');
    }
    if (doc.fullText && fileType === 'pdf') {
      previewLines.push('# PDF 全文:');
      previewLines.push(doc.fullText.slice(0, 5000));
    }

    const rule = await generateRuleFromFile({
      filePreview: previewLines.join('\n'),
      fileType,
      sheetNames: doc.sheets.map((s) => s.name)
    });

    return NextResponse.json({ ok: true, rule, fileType, sheetCount: doc.sheets.length });
  } catch (e: any) {
    console.error('[ai-generate]', e);
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
