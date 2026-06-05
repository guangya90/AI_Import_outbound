// 端到端测试: 用内置 qianzhai-pdf 规则解析真实 PDF, 输出 orders
// 使用 tsx 直接运行 TS
const fs = require('fs');
const path = require('path');
const pdfParse = require('pdf-parse');

const FILE = 'C:\\Users\\Liguangya\\Desktop\\AI考试附件\\demos\\黔寨寨贵州烙锅（鞍山店）常温.pdf';

(async () => {
  const buf = fs.readFileSync(FILE);
  const data = await pdfParse(buf);
  const text = data.text;

  // 与 server-parsers.ts 同样的拆行方式
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l);
  console.log(`PDF 共 ${data.numpages} 页, ${lines.length} 行非空`);

  // 打印前 30 行用于观察
  console.log('\n--- 前 30 行 ---');
  lines.slice(0, 30).forEach((l, i) => console.log(`  [${i}] ${l}`));

  // 转为 engine 期望的 CellValue[][] 结构
  const rows = lines.map((l) => [l]);

  // 动态加载内置规则
  const { BUILTIN_RULES } = require('../src/lib/rule-engine/builtin-rules.ts');
  const rule = BUILTIN_RULES.find((r) => r.id === 'qianzhai-pdf');
  if (!rule) { console.error('未找到内置规则 qianzhai-pdf'); process.exit(1); }

  const { applyRule } = require('../src/lib/rule-engine/engine.ts');
  const doc = {
    fileName: path.basename(FILE),
    sheets: [{ name: 'first', rows }]
  };
  const sheet = doc.sheets[0];

  const result = applyRule(doc, rule);
  console.log('\n=== 解析结果 ===');
  console.log('ruleUsed:', result.ruleUsed);
  console.log('orders:', result.orders.length);
  for (const o of result.orders) {
    console.log('\n--- Order ---');
    console.log('外部编码:', o.外部编码);
    console.log('收货门店:', o.收货门店);
    console.log('收件人姓名:', o.收件人姓名);
    console.log('收件人电话:', o.收件人电话);
    console.log('收件人地址:', o.收件人地址);
    console.log(`details: ${o.details.length} 条`);
    o.details.slice(0, 5).forEach((d, i) => console.log(`  [${i}]`, JSON.stringify(d)));
    if (o.details.length > 5) console.log(`  ... 还有 ${o.details.length - 5} 条`);
  }
  if (result.parseErrors?.length) console.log('\n错误:', result.parseErrors);
})();
