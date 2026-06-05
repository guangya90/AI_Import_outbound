// 模拟 AI 返回的 7 种 strategy 的"乱序/非标准"输出, 验证 normalizeRule 修复
import type { ParseRule } from '../src/lib/rule-engine/types';

// 把 normalizeRule 内部逻辑抽出来
function normalizeRule(rule: any, opts: { fileType: string }): ParseRule {
  if (rule.header?.type === 'kv-rows' && !Array.isArray(rule.header.rows) && rule.header.fieldMap) {
    rule.header = {
      type: 'kv-rows',
      rows: [{ row: rule.header.row ?? 0, layout: rule.header.layout ?? 'horizontal', fieldMap: rule.header.fieldMap }]
    };
  }
  if (rule.header?.type === 'kv-rows' && Array.isArray(rule.header.rows)) {
    rule.header.rows = rule.header.rows.map((r: any) => {
      if (!r.fieldMap && r.alias && r.canonical) {
        return { row: r.row ?? 0, fieldMap: { [r.alias]: r.canonical }, layout: r.layout };
      }
      return r;
    });
  }
  if (rule.detail?.columnMap) {
    const fixed: Record<number, string> = {};
    for (const [k, v] of Object.entries(rule.detail.columnMap)) fixed[Number(k)] = String(v);
    rule.detail.columnMap = fixed;
  }
  if (rule.detail?.rowRange) {
    rule.detail.rowRange = { from: Number(rule.detail.rowRange.from), to: Number(rule.detail.rowRange.to) };
  }
  if (rule.header?.type === 'inline' && !rule.header.fields && rule.header.fieldMap) {
    rule.header.fields = rule.header.fieldMap;
  }
  if (!rule.sheetMode) rule.sheetMode = 'first';
  if (!rule.fileType) rule.fileType = opts.fileType;

  if (rule.header?.type === 'card') {
    const h = rule.header;
    if (!h.marker || typeof h.marker !== 'string') h.marker = '^[▶▷▸]\\s*';
    if (!Array.isArray(h.headerPattern)) {
      if (h.headerPattern) h.headerPattern = [h.headerPattern];
      else if (h.fieldMap) h.headerPattern = [{ row: 0, layout: 'horizontal', fieldMap: h.fieldMap }];
      else h.headerPattern = [];
    }
    h.headerPattern = h.headerPattern.map((p: any) => {
      if (!p) return p;
      if (!p.fieldMap && p.alias && p.canonical) {
        return { row: 0, layout: p.layout ?? 'horizontal', fieldMap: { [p.alias]: p.canonical } };
      }
      if (!p.fieldMap && p.aliases && p.canonical) {
        const fm: Record<string, string> = {};
        for (const a of p.aliases) fm[a] = p.canonical;
        return { row: 0, layout: p.layout ?? 'horizontal', fieldMap: fm };
      }
      if (!p.row) p.row = 0;
      if (!p.layout) p.layout = 'horizontal';
      return p;
    });
    if (typeof h.itemStartAfterHeader !== 'number') h.itemStartAfterHeader = 0;
    if (typeof h.itemHeaderRow !== 'number') h.itemHeaderRow = 0;
  }

  if (rule.header?.type === 'pdf-text') {
    const h = rule.header;
    if (!h.headerFields || typeof h.headerFields !== 'object') h.headerFields = {};
    if (typeof h.detailPattern !== 'string') h.detailPattern = '^(.+)$';
    if (!h.detailFieldMap || typeof h.detailFieldMap !== 'object') {
      h.detailFieldMap = {};
    } else {
      const fixed: Record<number, string> = {};
      for (const [k, v] of Object.entries(h.detailFieldMap)) fixed[Number(k)] = String(v);
      h.detailFieldMap = fixed;
    }
    if (!Array.isArray(h.skipPatterns)) h.skipPatterns = [];
    else h.skipPatterns = h.skipPatterns.filter((s: any) => typeof s === 'string');
    if (rule.detail && (!rule.detail.columnMap || typeof rule.detail.columnMap !== 'object')) {
      rule.detail.columnMap = {};
    }
  }

  if (rule.header?.type === 'matrix' && Array.isArray(rule.header.valueColumns)) {
    rule.header.valueColumns = rule.header.valueColumns.map((c: any) => ({
      column: Number(c.column),
      headerAlias: c.headerAlias,
      field: c.field,
      target: c.target === 'detail' ? 'detail' : 'header'
    }));
  }
  return rule as ParseRule;
}

function assert(cond: boolean, msg: string) {
  if (!cond) { console.error('❌', msg); process.exitCode = 1; }
  else console.log('✅', msg);
}

// 1) kv-rows: AI 把 fieldMap 直接挂在 header 而不是 rows[]
{
  const ai: any = {
    id: 't1', name: 't1', fileType: 'xlsx',
    header: { type: 'kv-rows', row: 1, layout: 'horizontal', fieldMap: { 收货机构: '收货门店' } },
    detail: { startRow: 2, columnMap: { '0': 'SKU物品编码' } }
  };
  const out = normalizeRule(ai, { fileType: 'xlsx' });
  assert((out.header as any).type === 'kv-rows', 'kv-rows: type 保持');
  assert(Array.isArray((out.header as any).rows), 'kv-rows: 包装为 rows[]');
  assert((out.header as any).rows[0].fieldMap['收货机构'] === '收货门店', 'kv-rows: fieldMap 内容保留');
  assert((out.detail.columnMap as any)[0] === 'SKU物品编码', 'kv-rows: columnMap key 数字化为 0');
}

// 2) kv-rows: AI 写 alias+canonical 形式
{
  const ai: any = {
    id: 't2', name: 't2', fileType: 'xlsx',
    header: { type: 'kv-rows', rows: [{ row: 0, alias: '收货人', canonical: '收件人姓名' }] },
    detail: { startRow: 1, columnMap: {} }
  };
  const out = normalizeRule(ai, { fileType: 'xlsx' });
  assert((out.header as any).rows[0].fieldMap['收货人'] === '收件人姓名', 'kv-rows: alias+canonical → fieldMap');
}

// 3) inline: AI 写 fieldMap 而非 fields
{
  const ai = {
    id: 't3', name: 't3', fileType: 'xlsx',
    header: { type: 'inline', groupBy: '配送单号', fieldMap: { 收货机构: '收货门店' } },
    detail: { startRow: 1, columnMap: {} }
  };
  const out = normalizeRule(ai, { fileType: 'xlsx' });
  assert((out.header as any).fields?.['收货机构'] === '收货门店', 'inline: fieldMap → fields');
}

// 4) card: AI 漏 marker
{
  const ai = {
    id: 't4', name: 't4', fileType: 'xlsx',
    header: { type: 'card', fieldMap: { 调入门店: '收货门店' } },
    detail: { startRow: 0, columnMap: {} }
  };
  const out = normalizeRule(ai, { fileType: 'xlsx' });
  const h = out.header as any;
  assert(typeof h.marker === 'string', 'card: 默认 marker 已填');
  assert(Array.isArray(h.headerPattern) && h.headerPattern.length === 1, 'card: fieldMap 包装为 headerPattern');
  assert(h.headerPattern[0].fieldMap['调入门店'] === '收货门店', 'card: fieldMap 内容');
  assert(h.itemStartAfterHeader === 0 && h.itemHeaderRow === 0, 'card: 默认 itemXxx=0');
}

// 5) card: AI headerPattern 写 alias/canonical
{
  const ai = {
    id: 't5', name: 't5', fileType: 'xlsx',
    header: {
      type: 'card', marker: '^▶',
      headerPattern: [{ alias: '调入门店', canonical: '收货门店' }]
    },
    detail: { startRow: 0, columnMap: {} }
  };
  const out = normalizeRule(ai, { fileType: 'xlsx' });
  const h = out.header as any;
  assert(h.headerPattern[0].fieldMap['调入门店'] === '收货门店', 'card: alias/canonical → fieldMap');
}

// 6) matrix: AI 写 valueColumns 但 column 是字符串
{
  const ai = {
    id: 't6', name: 't6', fileType: 'xlsx',
    header: { type: 'matrix', keyColumn: 0, valueColumns: [
      { column: '13', headerAlias: '银泰店', field: '收货门店' }
    ] },
    detail: { startRow: 1, columnMap: {} }
  };
  const out = normalizeRule(ai, { fileType: 'xlsx' });
  const vc = (out.header as any).valueColumns;
  assert(vc[0].column === 13, 'matrix: column 数字化为 13');
  assert(vc[0].target === 'header', 'matrix: 默认 target=header');
}

// 7) pdf-text: AI 把 detailFieldMap key 写为数字 (JSON 实际就是数字, 这里测试 string "1" -> number 1)
{
  const ai = {
    id: 't7', name: 't7', fileType: 'pdf',
    header: {
      type: 'pdf-text',
      headerFields: { 单据编号: '外部编码' },
      detailPattern: '^(\\d+)\\s*(\\w+)$',
      detailFieldMap: { '1': 'SKU物品编码', '2': 'SKU物品名称' }
    },
    detail: { startRow: 0, columnMap: {} }
  };
  const out = normalizeRule(ai, { fileType: 'pdf' });
  const h = out.header as any;
  assert(h.headerFields['单据编号'] === '外部编码', 'pdf-text: headerFields 保留');
  assert(typeof h.detailPattern === 'string', 'pdf-text: detailPattern 字符串');
  assert(h.detailFieldMap[1] === 'SKU物品编码', 'pdf-text: detailFieldMap key 数字化为 1');
  assert((out.detail as any).columnMap && Object.keys((out.detail as any).columnMap).length === 0, 'pdf-text: columnMap 默认为 {}');
}

// 8) pdf-text: AI 完全漏 detailFieldMap
{
  const ai = {
    id: 't8', name: 't8', fileType: 'pdf',
    header: { type: 'pdf-text', headerFields: {}, detailPattern: '^(\\d+)$' },
    detail: { startRow: 0 }
  };
  const out = normalizeRule(ai, { fileType: 'pdf' });
  const h = out.header as any;
  assert(typeof h.detailFieldMap === 'object', 'pdf-text: 漏 detailFieldMap → 空对象');
  assert(Array.isArray(h.skipPatterns), 'pdf-text: 漏 skipPatterns → 数组');
}

// 9) fileType 兜底
{
  const ai: any = { id: 't9', name: 't9', header: { type: 'static', values: {} }, detail: { startRow: 0, columnMap: {} } };
  const out = normalizeRule(ai, { fileType: 'xlsx' });
  assert(out.fileType === 'xlsx', 'fileType 兜底: 由 opts 提供');
  assert(out.sheetMode === 'first', 'sheetMode 兜底: 默认 first');
}

// 10) rowRange 数字化
{
  const ai: any = {
    id: 't10', name: 't10', fileType: 'xlsx',
    header: { type: 'kv-rows', rows: [{ row: 0, fieldMap: {} }] },
    detail: { startRow: 1, rowRange: { from: '5', to: '-2' }, columnMap: {} }
  };
  const out = normalizeRule(ai, { fileType: 'xlsx' });
  const dr: any = (out as any).detail.rowRange;
  assert(dr.from === 5 && dr.to === -2, 'rowRange 字符串数字化');
}

console.log('\n--- 全部 normalizeRule 模拟测试完成 ---');
