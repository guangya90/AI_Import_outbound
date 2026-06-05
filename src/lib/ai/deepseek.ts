/**
 * 大模型调用 - DeepSeek 适配
 * 也可改用 OpenAI/Claude/通义千问 (兼容 OpenAI 协议)
 */
import type { ParseRule } from '../rule-engine/types';

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY ?? '';
const DEEPSEEK_BASE_URL = process.env.DEEPSEEK_BASE_URL ?? 'https://api.deepseek.com/v1';
const DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL ?? 'deepseek-chat';

export interface AiGenerateOptions {
  /** 文件预览文本 (前若干行/页) */
  filePreview: string;
  /** 文件类型 */
  fileType: 'xlsx' | 'csv' | 'docx' | 'pdf';
  /** Sheet 名称 (xlsx 多 sheet) */
  sheetNames?: string[];
}

/**
 * 调用 DeepSeek 生成规则
 */
export async function generateRuleFromFile(opts: AiGenerateOptions): Promise<ParseRule> {
  if (!DEEPSEEK_API_KEY) {
    throw new Error('DEEPSEEK_API_KEY 未配置,无法使用 AI 辅助生成');
  }
  const systemPrompt = `你是一名"出库单解析规则专家",你的任务是把任意格式的出库单文件分析后,输出一段 JSON 格式的解析规则,该规则将被一个规则引擎直接消费。

## 目标字段(全部使用下列标准名)
- 头部 header: 外部编码 / 收货门店 / 收件人姓名 / 收件人电话 / 收件人地址 / 备注
- 明细 detail: SKU物品编码 / SKU物品名称 / SKU发货数量 / SKU规格型号

## 规则引擎支持 7 种 strategy (header.type), 选错会导致规则不可用!
1. "kv-rows"     - 顶部/底部几行是 key:value, 中间一张明细表
2. "static"      - 静态字段, sheet 名作为门店名等
3. "inline"      - 每条数据行都含完整 header 字段 (跨行聚合, 用 groupBy 分组)
4. "matrix"      - SKU×门店 矩阵 (横向门店名作为列头)
5. "card"        - 卡片式结构 (▶ 调拨记录 #N 等分隔)
6. "multi-sheet-footer" - 多 Sheet 文件, Sheet 名即门店, 底部行含收货信息
7. "pdf-text"    - PDF 文本, 头部 key:value 散落多行, 明细每行用正则匹配

## 如何选择 strategy (按顺序判断, 第一个匹配即用)
- fileType === 'pdf' → "pdf-text"
- 看到 ▶ / ▷ / ▸ / 【 / 「 / ◆ / #编号 等明显卡片分隔符 → "card"
- 顶部或底部 1-3 行是 key:value, 中间是一张明细表 → "kv-rows"
- 每条数据行都重复 header 字段 (配送单号/收货人 出现 N 次) → "inline"
- 列头是横向门店名 ("银泰店|金桥店"), 纵向是 SKU → "matrix"
- 多 Sheet 且每个 Sheet 是独立门店 → "multi-sheet-footer"
- 其它/无明显 header → "static"

## 7 种 strategy 的完整 JSON 模板 (必须严格按这些字段名输出!)

### 模板 1: kv-rows
{
  "id": "<kebab-case-id>",
  "name": "<规则名>",
  "description": "<解析思路>",
  "fileType": "xlsx",
  "sheetMode": "first",
  "skip": { "skipTopRows": 0 },
  "header": {
    "type": "kv-rows",
    "rows": [
      { "row": 1, "layout": "horizontal", "fieldMap": { "收货机构": "收货门店", "订货机构": "订货机构" } },
      { "row": -2, "layout": "horizontal", "fieldMap": { "收货人": "收件人姓名", "收货电话": "收件人电话", "收货地址": "收件人地址" } }
    ]
  },
  "detail": {
    "startRow": 4,
    "endMarkers": ["合计"],
    "rowRange": { "from": 5, "to": -3 },
    "columnMap": { "2": "SKU物品编码", "3": "SKU物品名称", "5": "SKU规格型号", "14": "SKU发货数量" },
    "skipEmpty": true
  }
}
要点: row 可负数 (-1=最后一行); layout 必填; fieldMap 的 key=原始列头/文本, value=标准字段

### 模板 2: static
{
  "id": "<id>",
  "name": "<名>",
  "fileType": "xlsx",
  "sheetMode": "first",
  "skip": { "skipTopRows": 0 },
  "header": {
    "type": "static",
    "values": { "收货门店": "<门店名或留空>" }
  },
  "detail": {
    "startRow": 1,
    "endMarkers": ["合计"],
    "columnMap": { "0": "SKU物品编码", "1": "SKU物品名称", "3": "SKU发货数量" },
    "skipEmpty": true
  }
}

### 模板 3: inline (跨行聚合)
{
  "id": "<id>",
  "name": "<名>",
  "fileType": "xlsx",
  "sheetMode": "first",
  "skip": { "skipTopRows": 0 },
  "header": {
    "type": "inline",
    "groupBy": "配送单号",
    "fields": {
      "收货机构": "收货门店",
      "配送单号": "外部编码",
      "收货人": "收件人姓名",
      "收货电话": "收件人电话",
      "收货地址": "收件人地址"
    }
  },
  "detail": {
    "startRow": 2,
    "endMarkers": ["合计"],
    "columnMap": { "5": "SKU物品编码", "6": "SKU物品名称", "8": "SKU规格型号", "12": "SKU发货数量" },
    "skipEmpty": true
  }
}
要点: groupBy 是用来跨行聚合的列标准字段名(配送单号/单据号等); fields 是原始列头→标准字段

### 模板 4: matrix (横向矩阵)
{
  "id": "<id>",
  "name": "<名>",
  "fileType": "xlsx",
  "sheetMode": "first",
  "skip": { "skipTopRows": 0 },
  "header": {
    "type": "matrix",
    "keyColumn": 0,
    "staticHeader": { "备注": "" },
    "valueColumns": [
      { "column": 13, "headerAlias": "银泰店", "field": "收货门店", "target": "header" },
      { "column": 14, "headerAlias": "金桥店", "field": "收货门店", "target": "header" }
    ]
  },
  "detail": {
    "startRow": 1,
    "endMarkers": ["合计"],
    "columnMap": { "0": "SKU物品编码", "2": "SKU物品名称", "7": "SKU规格型号" },
    "skipEmpty": true
  }
}
要点: valueColumns 的 column 是列号(0-based); headerAlias 是该列的列头文本; target="header" 表示写入 header, "detail" 表示写入 detail

### 模板 5: card (卡片)
{
  "id": "<id>",
  "name": "<名>",
  "fileType": "xlsx",
  "sheetMode": "first",
  "skip": { "skipTopRows": 2 },
  "header": {
    "type": "card",
    "marker": "^▶\\s*调拨记录\\s*#?\\d+",
    "headerPattern": [
      { "row": 0, "layout": "horizontal", "fieldMap": { "调入门店": "收货门店", "收货人": "收件人姓名", "电话": "收件人电话", "收货地址": "收件人地址" } }
    ],
    "itemStartAfterHeader": 0,
    "itemHeaderRow": 0
  },
  "detail": {
    "startRow": 0,
    "columnMap": { "0": "SKU物品编码", "1": "SKU物品名称", "2": "SKU规格型号", "3": "SKU发货数量" },
    "skipEmpty": true
  }
}
要点: marker 必须是合法 JS 正则字符串(\\\\ 转义); headerPattern 必须是数组; itemStartAfterHeader/itemHeaderRow 给 0

### 模板 6: multi-sheet-footer
{
  "id": "<id>",
  "name": "<名>",
  "fileType": "xlsx",
  "sheetMode": "all",
  "skip": { "skipTopRows": 3 },
  "header": {
    "type": "multi-sheet-footer",
    "sheetNameField": "收货门店",
    "headerRowIndex": 3,
    "footerRows": [
      { "row": -4, "layout": "horizontal", "fieldMap": { "收货门店": "收货门店", "联系人": "收件人姓名" } },
      { "row": -3, "layout": "horizontal", "fieldMap": { "联系电话": "收件人电话", "收货地址": "收件人地址" } }
    ]
  },
  "detail": {
    "startRow": 1,
    "endMarkers": ["合计"],
    "columnMap": { "1": "SKU物品编码", "2": "SKU物品名称", "3": "SKU规格型号", "5": "SKU发货数量" },
    "skipEmpty": true
  }
}
要点: sheetNameField 必须为 "收货门店"; footerRows 字段在每个 sheet 末尾扫描

### 模板 7: pdf-text
{
  "id": "<id>",
  "name": "<名>",
  "fileType": "pdf",
  "sheetMode": "first",
  "skip": { "skipTopRows": 0 },
  "header": {
    "type": "pdf-text",
    "headerFields": {
      "单据编号": "外部编码",
      "收货机构": "收货门店",
      "订货机构": "订货机构",
      "收货人": "收件人姓名",
      "收货电话": "收件人电话",
      "收货地址": "收件人地址"
    },
    "detailPattern": "^\\\\s*(\\\\d+)\\\\s*(饮品类|熟烙类|自助调料类|主食类|火锅菜类|工作服|其它)\\\\s*(ZBWP\\\\d+)\\\\s*(.+?)\\\\s*(件|瓶|包|盒|桶|码|袋|箱)\\\\s*(\\\\d+(?:\\\\.\\\\d+)?)\\\\s*$",
    "detailFieldMap": {
      "1": "__seq__",
      "2": "物品类别",
      "3": "SKU物品编码",
      "4": "SKU物品名称",
      "5": "订货单位",
      "6": "SKU发货数量"
    },
    "skipPatterns": [
      "^合\\\\s*计",
      "^黔寨寨"
    ]
  },
  "detail": {
    "startRow": 0,
    "columnMap": {},
    "skipEmpty": true
  }
}
要点: detailPattern 必须有捕获组(从 1 开始); detailFieldMap 的 key 是字符串"1"/"2"等, value 是目标字段; skipPatterns 用 JS 正则字符串

## 关键约束 (不遵守将导致规则无法解析)
- 列号/行号 全部 0-based; 负数表示从末尾 (-1=最后一行)
- columnMap 的 key 必须是字符串"0","1"或数字 0,1; value 必须是标准字段名之一
- fieldMap / fields / headerFields / detailFieldMap / staticHeader / values 的 value 必须是标准字段名或空
- 矩阵的 valueColumns: target 必为 "header" 或 "detail"
- marker / detailPattern / skipPatterns 必须是合法 JS 正则字符串 (\\\\ 表示 \\\\)
- 不要使用任何文件名或具体门店名作为硬编码逻辑 (除非 static.values 中作为默认)
- 输出的 JSON 必须能被 JSON.parse 解析, 不要多余注释

## 你的回复格式
仅输出一个 JSON 对象, 不要包含 markdown 代码块 (\`\`\`), 不要任何解释。
- 紧凑格式, 不要多余空格或换行, 避免触发输出长度上限被截断
- 所有 key 按 JSON Schema 中的顺序输出`;

  const userPrompt = `请分析下面这份${opts.fileType}文件的内容, 生成对应的解析规则。

${opts.sheetNames?.length ? `Sheet 列表: ${opts.sheetNames.join(', ')}` : ''}

文件内容预览(前若干行):
\`\`\`
${opts.filePreview}
\`\`\`

请严格按 system 提示中的 7 个模板之一输出 ParseRule JSON, 不要做任何解释:`;

  const res = await fetch(`${DEEPSEEK_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${DEEPSEEK_API_KEY}`
    },
    body: JSON.stringify({
      model: DEEPSEEK_MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.1,
      max_tokens: 8000,
      response_format: { type: 'json_object' }
    })
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`DeepSeek API error: ${res.status} ${text}`);
  }
  const json = (await res.json()) as any;
  const content = (json.choices?.[0]?.message?.content ?? '').trim();
  const parsed = safeParseJson(content);
  // 兜底
  if (!parsed.id) parsed.id = `ai-${Date.now()}`;
  if (!parsed.fileType) parsed.fileType = opts.fileType;

  // 归一化: 修复 AI 可能输出的非标准格式
  return normalizeRule(parsed, opts);
}

/**
 * 安全解析 AI 返回的内容:
 * 1) 优先直接 JSON.parse
 * 2) 失败时去掉 markdown ```json ... ``` 代码块再试
 * 3) 再失败时用栈式括号匹配,提取首个平衡的 { ... } 子串
 * 4) 若仍失败,尝试补全未闭合的字符串/括号(应对 max_tokens 截断)
 * 这样可避免贪婪正则把解释文字也吞进去
 */
function safeParseJson(content: string): any {
  if (!content) throw new Error('AI 返回内容为空');
  // 1) 直接解析
  try {
    return JSON.parse(content);
  } catch (e1: any) {
    // 2) 去掉 markdown 代码块
    const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenced) {
      try {
        return JSON.parse(fenced[1].trim());
      } catch {}
    }
    // 3) 栈式匹配首个平衡 { ... }
    const balanced = extractBalancedJson(content);
    if (balanced) {
      try {
        return JSON.parse(balanced);
      } catch (e3: any) {
        // 4) 截断修复: 补全未闭合结构
        const repaired = repairTruncated(balanced);
        try {
          return JSON.parse(repaired);
        } catch (e4: any) {
          throw new Error(
            `AI 返回的不是合法 JSON: ${e3.message} (长度 ${balanced.length}, 截断修复失败: ${e4.message})`
          );
        }
      }
    }
    throw new Error(`AI 返回的不是合法 JSON: ${e1.message}`);
  }
}

/**
 * 尝试修复被 max_tokens 截断的 JSON:
 * - 关闭未闭合的字符串
 * - 关闭未闭合的 [ 和 {
 * 仍无法修复时返回原串,让上层报错
 */
function repairTruncated(text: string): string {
  let inStr = false;
  let escape = false;
  const stack: string[] = [];
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inStr) {
      if (escape) {
        escape = false;
      } else if (c === '\\') {
        escape = true;
      } else if (c === '"') {
        inStr = false;
      }
      continue;
    }
    if (c === '"') {
      inStr = true;
    } else if (c === '{') {
      stack.push('}');
    } else if (c === '[') {
      stack.push(']');
    } else if (c === '}' || c === ']') {
      stack.pop();
    }
  }
  if (!inStr && stack.length === 0) return text; // 无需修复
  let suffix = '';
  if (inStr) suffix += '"';
  while (stack.length) suffix += stack.pop();
  return text + suffix;
}

/** 从字符串中找到首个 { ... } 平衡子串(支持嵌套) */
function extractBalancedJson(text: string): string | null {
  const start = text.indexOf('{');
  if (start < 0) return null;
  let depth = 0;
  let inStr = false;
  let escape = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (inStr) {
      if (escape) {
        escape = false;
      } else if (c === '\\') {
        escape = true;
      } else if (c === '"') {
        inStr = false;
      }
      continue;
    }
    if (c === '"') {
      inStr = true;
    } else if (c === '{') {
      depth++;
    } else if (c === '}') {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

/**
 * 归一化 AI 输出的规则: 修复常见的字段嵌套错误
 */
function normalizeRule(rule: any, opts: AiGenerateOptions): ParseRule {
  // 1) header.type === 'kv-rows' 但缺少 rows 数组 -> 包装为数组
  if (rule.header?.type === 'kv-rows' && !Array.isArray(rule.header.rows) && rule.header.fieldMap) {
    rule.header = {
      type: 'kv-rows',
      rows: [
        {
          row: rule.header.row ?? 0,
          layout: rule.header.layout ?? 'horizontal',
          fieldMap: rule.header.fieldMap
        }
      ]
    };
  }

  // 2) header.type === 'kv-rows' 但 rows 内某项缺少 fieldMap 包装
  if (rule.header?.type === 'kv-rows' && Array.isArray(rule.header.rows)) {
    rule.header.rows = rule.header.rows.map((r: any) => {
      if (!r.fieldMap && r.alias && r.canonical) {
        return { row: r.row ?? 0, fieldMap: { [r.alias]: r.canonical }, layout: r.layout };
      }
      return r;
    });
  }

  // 3) detail.columnMap 的 key 转为数字 (AI 可能输出字符串 "0")
  if (rule.detail?.columnMap) {
    const fixed: Record<number, string> = {};
    for (const [k, v] of Object.entries(rule.detail.columnMap)) {
      fixed[Number(k)] = String(v);
    }
    rule.detail.columnMap = fixed;
  }

  // 4) rowRange 的 from/to 转为数字
  if (rule.detail?.rowRange) {
    rule.detail.rowRange = {
      from: Number(rule.detail.rowRange.from),
      to: Number(rule.detail.rowRange.to)
    };
  }

  // 5) inline strategy 补全 fields 字段名
  if (rule.header?.type === 'inline' && !rule.header.fields && rule.header.fieldMap) {
    rule.header.fields = rule.header.fieldMap;
  }

  // 6) 多 Sheet 模式: 默认 'first' 当未指定
  if (!rule.sheetMode) rule.sheetMode = 'first';

  // 7) 确保 fileType 正确
  if (!rule.fileType) rule.fileType = opts.fileType;

  // 8) card strategy 归一化: AI 经常漏 marker / headerPattern / 字段包装
  if (rule.header?.type === 'card') {
    const h = rule.header;
    // 默认 marker: 匹配 "▶" / "▷" / "▸" 开头的任意文字 (含 # 编号)
    if (!h.marker || typeof h.marker !== 'string') {
      h.marker = '^[▶▷▸]\\s*';
    }
    // headerPattern 必须是数组
    if (!Array.isArray(h.headerPattern)) {
      if (h.headerPattern) {
        h.headerPattern = [h.headerPattern];
      } else if (h.fieldMap) {
        // AI 写成 { fieldMap: {...} } 形式
        h.headerPattern = [{ row: 0, layout: 'horizontal', fieldMap: h.fieldMap }];
      } else {
        h.headerPattern = [];
      }
    }
    // 每项包装 fieldMap
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
    // itemStartAfterHeader / itemHeaderRow 默认为 0
    if (typeof h.itemStartAfterHeader !== 'number') h.itemStartAfterHeader = 0;
    if (typeof h.itemHeaderRow !== 'number') h.itemHeaderRow = 0;
    // detail.columnMap 数字化
    if (h.detail?.columnMap) {
      const fixed: Record<number, string> = {};
      for (const [k, v] of Object.entries(h.detail.columnMap)) {
        fixed[Number(k)] = String(v);
      }
      h.detail.columnMap = fixed;
    }
  }

  // 9) pdf-text strategy 归一化: AI 经常把 detailFieldMap 的 key 写成数字或漏 skipPatterns
  if (rule.header?.type === 'pdf-text') {
    const h = rule.header;
    // headerFields 必填, 没有就建空
    if (!h.headerFields || typeof h.headerFields !== 'object') {
      h.headerFields = {};
    }
    // detailPattern 必填
    if (typeof h.detailPattern !== 'string') {
      h.detailPattern = '^(.+)$';
    }
    // detailFieldMap 必填, key 必须是数字或字符串数字
    if (!h.detailFieldMap || typeof h.detailFieldMap !== 'object') {
      h.detailFieldMap = {};
    } else {
      const fixed: Record<number, string> = {};
      for (const [k, v] of Object.entries(h.detailFieldMap)) {
        fixed[Number(k)] = String(v);
      }
      h.detailFieldMap = fixed;
    }
    // skipPatterns 必须是字符串数组
    if (!Array.isArray(h.skipPatterns)) {
      h.skipPatterns = [];
    } else {
      h.skipPatterns = h.skipPatterns.filter((s: any) => typeof s === 'string');
    }
    // detail.columnMap 是空对象 (pdf-text 不使用)
    if (rule.detail && (!rule.detail.columnMap || typeof rule.detail.columnMap !== 'object')) {
      rule.detail.columnMap = {};
    }
  }

  // 10) matrix strategy 归一化: valueColumns 中 target 必为 header|detail, 列号是数字
  if (rule.header?.type === 'matrix' && Array.isArray(rule.header.valueColumns)) {
    rule.header.valueColumns = rule.header.valueColumns.map((c: any) => ({
      column: Number(c.column),
      headerAlias: c.headerAlias,
      field: c.field,
      target: c.target === 'detail' ? 'detail' : 'header'
    }));
  }

  // 11) inline strategy 归一化: groupBy 必为标准字段名之一, 没有则留空
  if (rule.header?.type === 'inline') {
    const allowed = ['外部编码', '配送单号', '单据号', '上游单据'];
    if (rule.header.groupBy && !allowed.some((a) => rule.header.groupBy.includes(a))) {
      // 若 groupBy 是原始列头, 保留; 引擎会兼容处理
    }
  }

  return rule as ParseRule;
}
