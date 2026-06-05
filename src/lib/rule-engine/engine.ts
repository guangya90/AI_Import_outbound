import {
  CellValue,
  DetailConfig,
  DetailItem,
  HeaderStrategy,
  KvRowConfig,
  OrderItem,
  ParsedDocument,
  ParseResult,
  ParseRule,
  Sheet,
  CANONICAL_FIELDS
} from './types';
import { cv, isPhone, isTotalRow, parseKvLine, toNumber } from './helpers';

/** 主体: 规则引擎 - 把 ParsedDocument + ParseRule -> OrderItem[] */
export function applyRule(doc: ParsedDocument, rule: ParseRule): ParseResult {
  const result: ParseResult = {
    orders: [],
    totalRows: 0,
    parseErrors: [],
    ruleUsed: rule.id
  };

  const sheets = selectSheets(doc, rule.sheetMode ?? 'first');

  for (const sheet of sheets) {
    try {
      const orders = parseSheet(sheet, rule, doc);
      result.orders.push(...orders);
      result.totalRows += sheet.rows.length;
    } catch (e: any) {
      result.parseErrors.push(`[${sheet.name}] ${e.message}`);
    }
  }

  // 后处理: 合并
  if (rule.postProcess?.mergeByExternalCode) {
    result.orders = mergeByExternalCode(result.orders);
  }

  // 校验
  applyValidations(result.orders, rule.validations ?? []);

  // 二次校验: A/B组二选一必填
  applyGroupValidation(result.orders);

  return result;
}

function selectSheets(doc: ParsedDocument, mode: 'all' | 'first' | string[]): Sheet[] {
  if (mode === 'all') return doc.sheets;
  if (mode === 'first') return doc.sheets.slice(0, 1);
  if (Array.isArray(mode)) {
    return doc.sheets.filter((s) => mode.includes(s.name));
  }
  return doc.sheets;
}

function parseSheet(sheet: Sheet, rule: ParseRule, doc: ParsedDocument): OrderItem[] {
  let rows = sheet.rows.slice();

  // 1. 跳过配置
  if (rule.skip?.skipTopRows) {
    rows = rows.slice(rule.skip.skipTopRows);
  }
  if (rule.skip?.skipTopRows === undefined && rule.skip?.skipHeaderContains) {
    let i = 0;
    while (i < rows.length) {
      const line = rows[i].map(cv).join('|');
      if (rule.skip.skipHeaderContains.some((kw) => line.includes(kw))) i++;
      else break;
    }
    rows = rows.slice(i);
  }

  // 2. 根据 strategy 抽取 header & detail
  switch (rule.header.type) {
    case 'kv-rows':
      return parseKvRowsStrategy(sheet, rows, rule, doc);
    case 'static':
      return parseStaticStrategy(sheet, rows, rule, doc);
    case 'inline':
      return parseInlineStrategy(sheet, rows, rule, doc);
    case 'matrix':
      return parseMatrixStrategy(sheet, rows, rule, doc);
    case 'card':
      return parseCardStrategy(sheet, rows, rule, doc);
    case 'multi-sheet-footer':
      return parseMultiSheetFooterStrategy(sheet, rows, rule, doc);
    case 'pdf-text':
      return parsePdfTextStrategy(sheet, rows, rule, doc);
  }
}

/* ====================== Strategy 1: kv-rows ====================== */
function parseKvRowsStrategy(
  sheet: Sheet,
  rows: CellValue[][],
  rule: ParseRule,
  doc: ParsedDocument
): OrderItem[] {
  const orders: OrderItem[] = [];
  if (rule.header.type !== 'kv-rows') return [];

  // 抽取所有 kv-row 指定的字段 -> 合并为 header
  const headerValues: Record<string, string> = extractKvHeaders(rows, rule.header.rows);

  // 抽取 detail 行
  const detailRows = extractDetailRows(rows, rule.detail);
  const details = mapDetailRows(detailRows, rule.detail.columnMap);

  // 拆分 header 中的 multiple external codes (例如同单据多订单 - 暂时不拆分,合并为单条)
  orders.push(
    makeOrder(headerValues, details, {
      sourceFile: doc.fileName,
      sourceSheet: sheet.name
    })
  );

  return orders;
}

function extractKvHeaders(rows: CellValue[][], configs: KvRowConfig[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const cfg of configs) {
    const idx = cfg.row < 0 ? rows.length + cfg.row : cfg.row;
    if (idx < 0 || idx >= rows.length) continue;
    const row = rows[idx];
    // 布局: horizontal = 左 key 右 value, vertical = 上 key 下 value (同一列)
    const layout = cfg.layout ?? 'horizontal';
    for (const [alias, canonical] of Object.entries(cfg.fieldMap)) {
      const aliases = Array.isArray(alias) ? alias : [alias];
      const candidates = [alias, ...aliases];
      const v = extractByLayout(row, candidates, layout);
      if (v) out[canonical] = v;
    }
  }
  return out;
}

function extractByLayout(row: CellValue[], aliases: string[], layout: 'horizontal' | 'vertical' | 'mixed'): string {
  for (let i = 0; i < row.length; i++) {
    const cell = cv(row[i]);
    if (!cell) continue;
    for (const alias of aliases) {
      // 1) "key:value" 合并形式
      if (cell.startsWith(alias) && (cell.includes(':') || cell.includes('：'))) {
        const idx = Math.max(cell.indexOf(':'), cell.indexOf('：'));
        const v = cell.substring(idx + 1).trim();
        if (v) return v;
      }
      // 2) 完全匹配 alias
      if (cell === alias || cell === alias + '：' || cell === alias + ':') {
        if (layout === 'horizontal') {
          // 找下一非空
          for (let j = i + 1; j < row.length; j++) {
            const nv = cv(row[j]);
            if (nv) return nv;
          }
        } else {
          // vertical 模式: alias 在第一列, value 在第二列 - 与 horizontal 相同
          for (let j = i + 1; j < row.length; j++) {
            const nv = cv(row[j]);
            if (nv) return nv;
          }
        }
      }
      // 3) 包含 alias (兜底)
      if (cell.includes(alias) && cell.length > alias.length + 1) {
        // 例如 "门店名称: XX" 但 alias 是 "门店名称"
        const after = cell.split(alias)[1] || '';
        const cleaned = after.replace(/^[:：\s]+/, '').trim();
        if (cleaned) return cleaned;
      }
    }
  }
  return '';
}

/* ====================== Strategy 2: static ====================== */
function parseStaticStrategy(
  sheet: Sheet,
  rows: CellValue[][],
  rule: ParseRule,
  doc: ParsedDocument
): OrderItem[] {
  const detailRows = extractDetailRows(rows, rule.detail);
  const details = mapDetailRows(detailRows, rule.detail.columnMap);
  const header = { ...(rule.header.type === 'static' ? rule.header.values : {}) };

  // 可选: 默认门店名从 sheet 名推断
  if (rule.postProcess?.defaultStoreFromSheetName) {
    if (!header.收货门店) header.收货门店 = sheet.name;
  }

  return [makeOrder(header, details, { sourceFile: doc.fileName, sourceSheet: sheet.name })];
}

/* ====================== Strategy 3: inline (湖南仓) ====================== */
function parseInlineStrategy(
  sheet: Sheet,
  rows: CellValue[][],
  rule: ParseRule,
  doc: ParsedDocument
): OrderItem[] {
  // 找表头行: 包含 '物品编码' 的行
  const headerRowIdx = findHeaderRow(rows, ['物品编码', '商品编码', 'SKU编码', 'SKU物品编码']);
  if (headerRowIdx === -1) return [];

  const inlineCfg = rule.header.type === 'inline' ? rule.header : null;
  if (!inlineCfg) return [];

  const dataRows = rows.slice(headerRowIdx + 1);
  const detailRows = extractDetailRows(dataRows, rule.detail);
  const colMap = rule.detail.columnMap;

  // 找出 inline 字段在每行中的列号
  // rule.header.fields: { alias_in_file: canonical_field }
  const inlineColMap: Record<string, number> = {};
  for (const [alias, canonical] of Object.entries(inlineCfg.fields)) {
    const colIdx = findColumn(rows[headerRowIdx], alias);
    if (colIdx !== -1) inlineColMap[canonical] = colIdx;
  }

  // groupBy: 找到 groupBy 字段的列号
  const groupByCol = inlineCfg.groupBy
    ? findColumn(rows[headerRowIdx], inlineCfg.groupBy)
    : undefined;

  // 按 groupBy 分组
  const groups = new Map<string, { header: Record<string, string>; details: DetailItem[] }>();
  for (const dRow of detailRows) {
    const groupKey = groupByCol !== undefined ? cv(dRow[groupByCol]) : '_default_';

    if (!groups.has(groupKey)) {
      const header: Record<string, string> = {};
      for (const [canonical, col] of Object.entries(inlineColMap)) {
        header[canonical] = cv(dRow[col]);
      }
      groups.set(groupKey, { header, details: [] });
    }
    // 添加 detail
    const details = mapDetailRows([dRow], colMap);
    groups.get(groupKey)!.details.push(...details);
  }

  return Array.from(groups.values()).map((g) =>
    makeOrder(g.header, g.details, { sourceFile: doc.fileName, sourceSheet: sheet.name })
  );
}

/* ====================== Strategy 4: matrix (欢乐牧场) ====================== */
function parseMatrixStrategy(
  sheet: Sheet,
  rows: CellValue[][],
  rule: ParseRule,
  doc: ParsedDocument
): OrderItem[] {
  const matrixCfg = rule.header.type === 'matrix' ? rule.header : null;
  if (!matrixCfg) return [];

  // 第一行就是表头 (keyColumn 标题 + 各门店列)
  const headerRow = rows[0];
  const dataRows = rows.slice(1);

  const orders: OrderItem[] = [];
  for (const dRow of dataRows) {
    // 跳过空行
    if (dRow.every((c) => !cv(c))) continue;
    // 跳过合计行
    if (isTotalRow(cv(dRow[0]))) continue;

    const skuInfo: Record<string, string> = {};
    if (rule.detail.columnMap[matrixCfg.keyColumn]) {
      skuInfo[rule.detail.columnMap[matrixCfg.keyColumn]] = cv(dRow[matrixCfg.keyColumn]);
    }
    // 抽取 SKU 物品编码/名称/规格
    for (const [colStr, canonical] of Object.entries(rule.detail.columnMap)) {
      const col = Number(colStr);
      // 跳过矩阵列 (通常是最后几列)
      if (matrixCfg.valueColumns.find((v) => v.column === col)) continue;
      skuInfo[canonical] = cv(dRow[col]);
    }

    // 对每个 value column, 若有值则生成一条 order
    for (const vc of matrixCfg.valueColumns) {
      const v = cv(dRow[vc.column]);
      if (!v) continue;
      const num = toNumber(v);
      if (num === null || num <= 0) continue;

      const header: Record<string, string> = {
        ...(matrixCfg.staticHeader ?? {}),
        收货门店: vc.headerAlias ?? cv(headerRow[vc.column])
      };

      // 该 order 仅包含一个 detail (对应的 SKU 数量)
      const detail: DetailItem = {
        SKU物品编码: skuInfo['SKU物品编码'] || '',
        SKU物品名称: skuInfo['SKU物品名称'] || '',
        SKU发货数量: num,
        SKU规格型号: skuInfo['SKU规格型号'] || '',
        errors: []
      };

      orders.push(
        makeOrder(header, [detail], { sourceFile: doc.fileName, sourceSheet: sheet.name })
      );
    }
  }
  return orders;
}

/* ====================== Strategy 5: card (门店调拨单) ====================== */
function parseCardStrategy(
  sheet: Sheet,
  rows: CellValue[][],
  rule: ParseRule,
  doc: ParsedDocument
): OrderItem[] {
  const cardCfg = rule.header.type === 'card' ? rule.header : null;
  if (!cardCfg) return [];

  const orders: OrderItem[] = [];
  const markerRegex = new RegExp(cardCfg.marker);

  type CardRec = { header: Record<string, string>; items: DetailItem[] };
  let current: CardRec = { header: {}, items: [] };
  let inCard = false;
  let itemHeaderSeen = false;

  const flush = () => {
    if (inCard && (current.header.收货门店 || current.header.收件人姓名 || current.items.length)) {
      orders.push(makeOrder(current.header, current.items, { sourceFile: doc.fileName, sourceSheet: sheet.name }));
    }
    current = { header: {}, items: [] };
    itemHeaderSeen = false;
  };

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const line = row.map(cv).join(' ').trim();

    if (markerRegex.test(line)) {
      flush();
      inCard = true;
      itemHeaderSeen = false;
      continue;
    }

    if (!inCard) continue;

    // 抽取 card 内 header (key-value 行)
    for (const cfg of cardCfg.headerPattern) {
      const layout = cfg.layout ?? 'horizontal';
      for (const [alias, canonical] of Object.entries(cfg.fieldMap)) {
        if (current.header[canonical]) continue;
        const v = extractByLayout(row, [alias], layout);
        if (v) current.header[canonical] = v;
      }
    }

    // 检测 item 表头行
    if (!itemHeaderSeen && (line.includes('物品编码') || line.includes('商品编码')) && (line.includes('数量'))) {
      itemHeaderSeen = true;
      continue;
    }

    if (itemHeaderSeen) {
      // 跳过空行
      if (row.every((c) => !cv(c))) continue;
      // 跳过合计
      if (isTotalRow(cv(row[0]))) continue;

      const detail = mapDetailRows([row], rule.detail.columnMap)[0];
      if (detail && (detail.SKU物品编码 || detail.SKU物品名称)) {
        current.items.push(detail);
      }
    }
  }
  flush();

  return orders;
}

/* ====================== Strategy 6: multi-sheet-footer ====================== */
function parseMultiSheetFooterStrategy(
  sheet: Sheet,
  rows: CellValue[][],
  rule: ParseRule,
  doc: ParsedDocument
): OrderItem[] {
  if (rule.header.type !== 'multi-sheet-footer') return [];
  const cfg = rule.header;

  // 1. 抽取 header (KV 来自 footer)
  const header: Record<string, string> = extractKvHeaders(rows, cfg.footerRows);
  // 2. 用 sheet 名作为门店 (若未指定)
  if (!header[cfg.sheetNameField]) {
    header[cfg.sheetNameField] = sheet.name;
  }

  // 3. 抽取 detail 行 (从 cfg.headerRowIndex 之后开始)
  const detailRows = extractDetailRows(rows, rule.detail);
  const details = mapDetailRows(detailRows, rule.detail.columnMap);

  return [makeOrder(header, details, { sourceFile: doc.fileName, sourceSheet: sheet.name })];
}

/* ====================== Strategy 7: pdf-text (PDF/纯文本用正则) ====================== */
function parsePdfTextStrategy(
  sheet: Sheet,
  rows: CellValue[][],
  rule: ParseRule,
  doc: ParsedDocument
): OrderItem[] {
  const cfg = rule.header.type === 'pdf-text' ? rule.header : null;
  if (!cfg) return [];

  // 1) 抽取 header: 先把全文拼成一行, 跨行抽取 key:value
  const header = extractPdfHeaders(rows, cfg.headerFields);

  // 2) 抽取 detail: 每行尝试匹配 detailPattern
  const details: DetailItem[] = [];
  let re: RegExp;
  try {
    re = new RegExp(cfg.detailPattern);
  } catch (e: any) {
    throw new Error(`pdf-text detailPattern 不是合法正则: ${e.message}`);
  }
  const skipRes = (cfg.skipPatterns ?? []).map((p) => {
    try { return new RegExp(p); } catch { return null; }
  }).filter(Boolean) as RegExp[];

  for (const row of rows) {
    const line = row.map(cv).join(' ').replace(/\s+/g, ' ').trim();
    if (!line) continue;
    if (skipRes.some((r) => r.test(line))) continue;
    const m = line.match(re);
    if (!m) continue;
    const item: DetailItem = {
      SKU物品编码: '',
      SKU物品名称: '',
      SKU发货数量: '',
      SKU规格型号: '',
      errors: []
    };
    for (const [g, canonical] of Object.entries(cfg.detailFieldMap)) {
      const v = m[Number(g)] ?? '';
      (item as any)[canonical] = v.trim();
    }
    // 数量转数字
    if (item.SKU发货数量) {
      const n = toNumber(item.SKU发货数量);
      if (n !== null) item.SKU发货数量 = n;
    }
    details.push(item);
  }

  return [makeOrder(header, details, { sourceFile: doc.fileName, sourceSheet: sheet.name })];
}

/**
 * 从 PDF 文本抽取 header:
 * - 把所有行拼成一段文本, 跨行扫描
 * - 对每个 alias, 用正则 {alias}[:：] 找位置, value 截至下一个 alias 或边界词
 * 这样可处理 "单据编号：A单据状态：B" 这种一行多 kv 的情况
 */
function extractPdfHeaders(rows: CellValue[][], fields: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  const aliases = Object.keys(fields);
  // 按 alias 长度倒序, 避免短 alias 误匹配长的 (例如 "收货人" vs "收货人签字区域")
  const sortedAliases = [...aliases].sort((a, b) => b.length - a.length);

  // 拼成一段连续文本 (保留换行作为位置标记, 后面剥掉)
  const fullText = rows.map((r) => r.map(cv).join(' ')).join('\n');

  // 边界词: aliases 自身 + 常见中文字段名 (防止 value 跨多个 key)
  const boundaries = [
    ...sortedAliases,
    // 常见出库单字段名
    '单据状态', '复审状态', '分拣状态', '是否需要推送', '订单日期',
    '预计发货日期', '期望到货日期', '发货日期', '发货操作时间',
    '制单日期', '创建人', '发货人', '收货人签字区域', '收货人签字',
    '收件人姓名', '收件人电话', '收件人地址', '收件人',
    '收货电话', '收货地址',
    '打印次数', '备注', '订货机构', '收货机构', '供货机构', '送货机构',
    '业务模式', '配送重量', '签收日期'
  ];
  const boundaryAlt = boundaries.map((b) => b.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  // 边界正则: 任意 boundary 跟随 [:：] (前瞻, 不消耗)
  const boundaryRe = new RegExp(`(?:${boundaryAlt})\\s*[:：]`);

  for (const alias of sortedAliases) {
    if (out[fields[alias]]) continue;
    const esc = alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`${esc}\\s*[:：]`, 'g');
    const m = re.exec(fullText);
    if (!m) continue;
    const valueStart = m.index + m[0].length;
    // 找下一个边界的位置
    const restText = fullText.substring(valueStart);
    const bm = restText.match(boundaryRe);
    const valueEnd = bm?.index !== undefined ? valueStart + bm.index : fullText.length;
    // 去除换行和首尾空白
    const value = fullText.substring(valueStart, valueEnd).replace(/[\r\n]+/g, ' ').trim();
    if (value) out[fields[alias]] = value;
  }
  return out;
}

/* ====================== Helpers ====================== */
function findHeaderRow(rows: CellValue[][], aliases: string[]): number {
  for (let i = 0; i < rows.length; i++) {
    const line = rows[i].map(cv).join('|');
    for (const a of aliases) {
      if (line.includes(a)) return i;
    }
  }
  return -1;
}

function findColumn(headerRow: CellValue[], alias: string | string[]): number {
  const aliases = Array.isArray(alias) ? alias : [alias];
  for (let i = 0; i < headerRow.length; i++) {
    const cell = cv(headerRow[i]);
    for (const a of aliases) {
      if (cell === a || cell.includes(a)) return i;
    }
  }
  return -1;
}

function extractDetailRows(rows: CellValue[][], cfg: DetailConfig): CellValue[][] {
  let start = cfg.startRow;
  let end = rows.length;
  if (cfg.rowRange) {
    start = cfg.rowRange.from < 0 ? rows.length + cfg.rowRange.from : cfg.rowRange.from;
    end = cfg.rowRange.to < 0 ? rows.length + cfg.rowRange.to : cfg.rowRange.to;
  }
  if (cfg.endMarkers) {
    for (let i = start; i < rows.length; i++) {
      const line = rows[i].map(cv).join('|');
      if (cfg.endMarkers.some((m) => line.includes(m))) {
        end = i;
        break;
      }
    }
  }
  const slice = rows.slice(start, end);
  return slice.filter((r) => {
    if (cfg.skipEmpty !== false && r.every((c) => !cv(c))) return false;
    return true;
  });
}

function mapDetailRows(rows: CellValue[][], columnMap: Record<number, string>): DetailItem[] {
  return rows.map((row) => {
    const item: DetailItem = {
      SKU物品编码: '',
      SKU物品名称: '',
      SKU发货数量: '',
      SKU规格型号: '',
      errors: []
    };
    for (const [colStr, canonical] of Object.entries(columnMap)) {
      const col = Number(colStr);
      if (col >= row.length) continue;
      const v = cv(row[col]);
      (item as any)[canonical] = v;
    }
    return item;
  });
}

function makeOrder(
  header: Record<string, string>,
  details: DetailItem[],
  meta: { sourceFile?: string; sourceSheet?: string; sourceRow?: number }
): OrderItem {
  return {
    外部编码: header['外部编码'] ?? '',
    收货门店: header['收货门店'] ?? '',
    收件人姓名: header['收件人姓名'] ?? '',
    收件人电话: header['收件人电话'] ?? '',
    收件人地址: header['收件人地址'] ?? '',
    备注: header['备注'] ?? '',
    details,
    errors: [],
    warnings: [],
    sourceFile: meta.sourceFile,
    sourceSheet: meta.sourceSheet,
    sourceRow: meta.sourceRow
  };
}

function mergeByExternalCode(orders: OrderItem[]): OrderItem[] {
  const map = new Map<string, OrderItem>();
  const result: OrderItem[] = [];
  for (const o of orders) {
    const key = o.外部编码 || `__auto_${result.length}`;
    if (!o.外部编码) {
      result.push(o);
      continue;
    }
    if (map.has(key)) {
      const ex = map.get(key)!;
      ex.details.push(...o.details);
    } else {
      map.set(key, o);
      result.push(o);
    }
  }
  return result;
}

function applyValidations(orders: OrderItem[], validations: NonNullable<ParseRule['validations']>) {
  for (const o of orders) {
    for (const v of validations) {
      if (v.scope === 'header') {
        const val = (o as any)[v.field];
        const ok = checkValidation(val, v);
        if (!ok) {
          (v.onFail === 'warning' ? o.warnings : o.errors).push(v.message);
        }
      } else if (v.scope === 'detail') {
        for (const d of o.details) {
          const val = (d as any)[v.field];
          const ok = checkValidation(val, v);
          if (!ok) {
            (v.onFail === 'warning' ? d.errors : d.errors).push(v.message);
          }
        }
      }
    }
  }
}

function checkValidation(val: any, v: NonNullable<ParseRule['validations']>[number]): boolean {
  const s = String(val ?? '').trim();
  switch (v.type) {
    case 'required':
    case 'non-empty':
      return s.length > 0;
    case 'phone':
      return isPhone(s);
    case 'positive-number': {
      const n = Number(s);
      return !isNaN(n) && n > 0;
    }
    case 'regex':
      return new RegExp(v.pattern ?? '').test(s);
  }
}

function applyGroupValidation(orders: OrderItem[]) {
  // A/B 组: 至少填一组
  for (const o of orders) {
    const hasA = !!o.收货门店.trim();
    const hasB = !!(o.收件人姓名.trim() || o.收件人电话.trim() || o.收件人地址.trim());
    if (!hasA && !hasB) {
      o.errors.push('收货门店和收件人信息至少需填一组');
    }
  }

  // 收件人姓名+电话 二选一必填
  for (const o of orders) {
    if (!o.收件人姓名.trim() && !o.收件人电话.trim()) {
      o.warnings.push('收件人姓名/电话为空');
      if (!o.备注.includes('异常')) o.备注 = (o.备注 ? o.备注 + '；' : '') + '收件人姓名/电话为空';
    }
  }

  // Detail 必填
  for (const o of orders) {
    for (let i = 0; i < o.details.length; i++) {
      const d = o.details[i];
      if (!d.SKU物品编码.trim()) d.errors.push('SKU物品编码缺失必填');
      if (!d.SKU物品名称.trim()) d.errors.push('SKU物品名称缺失必填');
      const n = Number(d.SKU发货数量);
      if (!d.SKU发货数量 || isNaN(n) || n <= 0) {
        d.errors.push('SKU发货数量异常');
        d.SKU发货数量 = '【数量异常】';
      }
    }
  }
}
