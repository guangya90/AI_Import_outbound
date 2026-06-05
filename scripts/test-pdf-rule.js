// 测试内置 PDF 规则 (qianzhai-pdf) 能否解析真实 PDF
const fs = require('fs');
const path = require('path');
const pdfParse = require('pdf-parse');

const FILE = 'C:\\Users\\Liguangya\\Desktop\\AI考试附件\\demos\\黔寨寨贵州烙锅（鞍山店）常温.pdf';
const RULE_PATH = 'd:\\AI_Code\\Cursor_code\\AI_New_Excel\\src\\lib\\rule-engine\\builtin-rules.ts';

(async () => {
  // 1) 读 PDF
  const buf = fs.readFileSync(FILE);
  const data = await pdfParse(buf);
  const text = data.text;

  // 2) 用与 parsePdf 相同的方式拆行
  const lines = text.split(/\r?\n/).map((l) => [l.trim()]).filter(([l]) => l);
  console.log(`共 ${lines.length} 行非空`);

  // 3) 提取 header (模拟 extractPdfHeaders)
  const headerFields = {
    '单据编号': '外部编码',
    '收货机构': '收货门店',
    '订货机构': '订货机构',
    '收货人': '收件人姓名',
    '收货电话': '收件人电话',
    '收货地址': '收件人地址'
  };
  const sortedAliases = Object.keys(headerFields).sort((a, b) => b.length - a.length);
  const out = {};
  for (const [line] of lines) {
    const matches = [];
    for (const alias of sortedAliases) {
      const esc = alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const re = new RegExp(`${esc}\\s*[:：]`, 'g');
      let m;
      while ((m = re.exec(line)) !== null) {
        matches.push({ alias, start: m.index, end: m.index + m[0].length });
      }
    }
    matches.sort((a, b) => a.start - b.start);
    const seen = new Set();
    const uniq = matches.filter(m => { if (seen.has(m.alias)) return false; seen.add(m.alias); return true; });
    for (let i = 0; i < uniq.length; i++) {
      const cur = uniq[i];
      const nextStart = i + 1 < uniq.length ? uniq[i + 1].start : line.length;
      const value = line.substring(cur.end, nextStart).trim();
      if (value && !out[headerFields[cur.alias]]) {
        out[headerFields[cur.alias]] = value;
      }
    }
  }
  console.log('\n=== 抽取的 header ===');
  for (const [k, v] of Object.entries(out)) {
    console.log(`  ${k}: ${v}`);
  }

  // 4) 测试 detail 正则
  const detailPattern = '^\\s*(\\d+)\\s*(饮品类|熟烙类|自助调料类|主食类|火锅菜类|工作服|其它)\\s*(ZBWP\\d+)\\s+([\\u4e00-\\u9fa5A-Za-z（）()0-9.\\s]+\\d+[a-zA-Z]*\\*?\\d*[a-zA-Z/瓶件包盒桶码袋箱]*)\\s*(件|瓶|包|盒|桶|码|袋|箱)\\s*(\\d+(?:\\.\\d+)?)\\s*$';
  const re = new RegExp(detailPattern);
  const skipPatterns = [
    '^合\\s*计', '^\\s*第\\s*\\d+\\s*页', '^\\s*物品类别\\s*物品编码',
    '^\\s*制单日期', '^\\s*打印次数', '^\\s*收货人签字',
    '^\\s*备注\\s*[:：]?\\s*$', '^\\s*配送重量'
  ].map(p => new RegExp(p));
  const fieldMap = { 1: '__seq__', 2: '物品类别', 3: 'SKU物品编码', 4: 'SKU物品名称', 5: '订货单位', 6: 'SKU发货数量' };

  let matched = 0, skipped = 0, unmatched = 0;
  const items = [];
  const unmatchSamples = [];
  for (const [line] of lines) {
    const cleaned = line.replace(/\s+/g, ' ').trim();
    if (skipPatterns.some(r => r.test(cleaned))) { skipped++; continue; }
    const m = cleaned.match(re);
    if (m) {
      matched++;
      const item = {};
      for (const [g, f] of Object.entries(fieldMap)) item[f] = (m[Number(g)] || '').trim();
      items.push(item);
    } else {
      unmatched++;
      if (unmatchSamples.length < 8) unmatchSamples.push(cleaned);
    }
  }
  console.log(`\n=== 详情抽取: 匹配 ${matched} / 跳过 ${skipped} / 未匹配 ${unmatched} ===`);
  console.log('前 3 条:');
  items.slice(0, 3).forEach((it, i) => {
    console.log(`  ${i + 1}.`, JSON.stringify(it));
  });
  if (unmatchSamples.length) {
    console.log('\n未匹配样例:');
    unmatchSamples.forEach(s => console.log('  >', s.slice(0, 100)));
  }
})();
