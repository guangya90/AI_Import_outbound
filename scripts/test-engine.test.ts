// 测试规则引擎 - 直接相对路径
import * as fs from 'fs';
import * as path from 'path';
import { BUILTIN_RULES } from '../src/lib/rule-engine/builtin-rules';
import { applyRule } from '../src/lib/rule-engine/engine';
import { parseFile } from '../src/lib/parsers/server-parsers';

const DEMO_DIR = 'C:\\Users\\Liguangya\\Desktop\\AI考试附件\\demos';

async function main() {
  const mapping: { rule: string; file: string; type: 'xlsx' | 'csv' | 'docx' | 'pdf' }[] = [
    { rule: 'liming-tun-fenghuang', file: '12.25海口龙湖天街-配送发货单PS2512220005001(1).xlsx', type: 'xlsx' },
    { rule: 'hunan-cang', file: '湖南仓.xlsx', type: 'xlsx' },
    { rule: 'huanle-muchang-matrix', file: '欢乐牧场模板0430.xlsx', type: 'xlsx' },
    { rule: 'multi-sheet-yingtai', file: '多门店分Sheet出库单.xlsx', type: 'xlsx' },
    { rule: 'diao-card', file: '门店调拨单-卡片式.xlsx', type: 'xlsx' }
  ];

  for (const m of mapping) {
    const rule = BUILTIN_RULES.find((r) => r.id === m.rule)!;
    const filePath = path.join(DEMO_DIR, m.file);
    if (!fs.existsSync(filePath)) {
      console.log(`[SKIP] ${m.file} 不存在`);
      continue;
    }
    const buf = fs.readFileSync(filePath);
    const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    try {
      const doc = await parseFile(ab, m.file, m.type);
      const result = applyRule(doc, rule);
      console.log(`\n=== ${m.rule} ===`);
      console.log(`文件: ${m.file}, sheets=${doc.sheets.length}`);
      console.log(`订单数: ${result.orders.length}`);
      if (result.orders.length) {
        const first = result.orders[0];
        console.log(`第一条:`);
        console.log(`  收货门店: ${first.收货门店}`);
        console.log(`  收件人: ${first.收件人姓名} ${first.收件人电话}`);
        console.log(`  收件人地址: ${first.收件人地址.slice(0, 40)}`);
        console.log(`  外部编码: ${first.外部编码}`);
        console.log(`  明细数: ${first.details.length}`);
        if (first.details.length) {
          console.log(`  第1明细: ${first.details[0].SKU物品编码} / ${first.details[0].SKU物品名称} / ${first.details[0].SKU发货数量}`);
        }
      }
      if (result.parseErrors.length) console.log(`  错误:`, result.parseErrors);
    } catch (e: any) {
      console.error(`[ERROR] ${m.file}:`, e.message);
    }
  }
}

main().catch(console.error);
