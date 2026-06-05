// 验证 6 个内置规则的 schema 与 strategy 类型
import { BUILTIN_RULES } from '../src/lib/rule-engine/builtin-rules';
import { applyRule } from '../src/lib/rule-engine/engine';
import type { ParseRule, ParsedDocument } from '../src/lib/rule-engine/types';

console.log('=== 验证 6 个内置规则的 schema 与 strategy 类型 ===');
const got = BUILTIN_RULES.map((r) => r.header.type);
console.log('BUILTIN_RULES strategy types:', got);
const builtins = ['kv-rows', 'inline', 'matrix', 'multi-sheet-footer', 'pdf-text', 'card'];
const missing = builtins.filter((s) => !got.includes(s as any));
if (missing.length) {
  console.error('❌ 缺失内置规则:', missing);
  process.exit(1);
}
console.log('✅ 6 个内置 strategy 规则都已就位 (static 引擎支持但无内置示例)');

function mockSheet(name: string, rows: any[][]) {
  return { name, rows };
}

const cases: Array<{ rule: ParseRule; doc: ParsedDocument }> = [
  {
    rule: BUILTIN_RULES[0],
    doc: {
      fileName: 'liming.xlsx',
      fileType: 'xlsx',
      sheets: [mockSheet('Sheet1', [
        ['黎明屯店', '2026-04-21', ''],
        ['机构备注: 测试'],
        ['单据号', '上游单据', '...'],
        ['商品编码', '商品名称', '规格', '数量'],
        ['ZB001', '可乐', '500ml', 10],
        ['ZB002', '雪碧', '500ml', 5],
        ['合计', '', '', 15],
        ['收货人: 张三', '电话: 13800000000', '地址: 北京'],
        ['备注: 测试备注'],
      ])]
    }
  },
  {
    rule: BUILTIN_RULES[1],
    doc: {
      fileName: 'hunan.xlsx',
      fileType: 'xlsx',
      sheets: [mockSheet('Sheet1', [
        ['标题行'],
        ['配送单号', '收货机构', '收货人', '电话', '地址', '商品编码', '名称', '规格', '数量'],
        ['DH001', '湖南店', '李四', '13900000000', '长沙', 'ZB001', '可乐', '500ml', 5],
        ['DH001', '湖南店', '李四', '13900000000', '长沙', 'ZB002', '雪碧', '500ml', 3],
        ['DH002', '湖南店2', '王五', '13811111111', '株洲', 'ZB001', '可乐', '500ml', 2],
        ['合计', '', '', '', '', '', '', '', 10],
      ])]
    }
  },
  {
    rule: BUILTIN_RULES[2],
    doc: {
      fileName: 'matrix.xlsx',
      fileType: 'xlsx',
      sheets: [mockSheet('Sheet1', [
        ['商品编码', '商品名称', '规格', '', '', '', '', '', '', '', '', '', '', '银泰店', '金银潭店', '金桥店', '门店B', '门店D'],
        ['ZB001', '可乐', '500ml', '', '', '', '', '', '', '', '', '', '', 5, 3, 2, 0, 1],
        ['ZB002', '雪碧', '500ml', '', '', '', '', '', '', '', '', '', '', 0, 2, 1, 3, 0],
        ['合计', '', '', '', '', '', '', '', '', '', '', '', '', 5, 5, 3, 3, 1],
      ])]
    }
  },
  {
    rule: BUILTIN_RULES[3],
    doc: {
      fileName: 'multi.xlsx',
      fileType: 'xlsx',
      sheets: [
        mockSheet('银泰店', [
          ['标题'], ['说明'], [''],
          ['商品编码', '名称', '规格', '单位', '数量'],
          ['ZB001', '可乐', '500ml', '瓶', 10],
          ['ZB002', '雪碧', '500ml', '瓶', 5],
          ['合计', '', '', '', 15],
          ['收货门店: 银泰店', '联系人: 张三'],
          ['联系电话: 13800000000', '收货地址: 北京'],
        ]),
        mockSheet('金桥店', [
          ['标题'], ['说明'], [''],
          ['商品编码', '名称', '规格', '单位', '数量'],
          ['ZB001', '可乐', '500ml', '瓶', 3],
          ['合计', '', '', '', 3],
          ['收货门店: 金桥店', '联系人: 李四'],
          ['联系电话: 13900000000', '收货地址: 上海'],
        ])
      ]
    }
  },
  {
    rule: BUILTIN_RULES[4],
    doc: {
      fileName: 'qianzhai.pdf',
      fileType: 'pdf',
      sheets: [mockSheet('first', [
        ['黔寨寨贵州烙锅(鞍山首店)-配送单'],
        ['单据编号:PS2604210007单据状态:已发货'],
        ['收货机构:黔寨寨贵州烙锅(鞍山首店)订货机构:黔寨寨贵州烙锅(鞍山首店)'],
        ['收货人:荣丽收货电话:13130093946'],
        ['收货地址:辽宁省鞍山市铁东区建国大道700号万象汇'],
        ['1饮品类ZBWP0001茶语柠听紫苏风味糖浆750ml*6瓶/件件2'],
        ['2饮品类ZBWP0002茶语柠听石榴复合果汁1L*12瓶/件件2'],
        ['3熟烙类ZBWP0015寨寨香肠片2.5kg*6包/件件2'],
      ])]
    }
  },
  {
    rule: BUILTIN_RULES[5],
    doc: {
      fileName: 'diao.xlsx',
      fileType: 'xlsx',
      sheets: [mockSheet('Sheet1', [
        ['调拨单号: DH202604210001'],
        ['调拨日期: 2026-04-21'],
        ['▶ 调拨记录 #1'],
        ['调入门店: 银泰店', '收货人: 张三', '电话: 13800000000', '收货地址: 北京'],
        ['商品编码', '名称', '规格', '数量'],
        ['ZB001', '可乐', '500ml', 5],
        ['ZB002', '雪碧', '500ml', 3],
        ['▶ 调拨记录 #2'],
        ['调入门店: 金桥店', '收货人: 李四', '电话: 13900000000', '收货地址: 上海'],
        ['商品编码', '名称', '规格', '数量'],
        ['ZB001', '可乐', '500ml', 2],
      ])]
    }
  },
];

let allPassed = true;
for (let i = 0; i < cases.length; i++) {
  const c = cases[i];
  try {
    const r = applyRule(c.doc, c.rule);
    const status = r.parseErrors.length > 0 ? '⚠️ with errors' : '✅';
    const orders = r.orders.length;
    const details = r.orders.reduce((s, o) => s + o.details.length, 0);
    console.log(`${status} [${i + 1}] ${c.rule.id}: ${orders} orders, ${details} details, ${r.parseErrors.length} errors`);
    if (r.parseErrors.length) {
      console.log('   errors:', r.parseErrors.slice(0, 2));
      allPassed = false;
    }
  } catch (e: any) {
    console.error(`❌ [${i + 1}] ${c.rule.id} 抛错:`, e.message);
    allPassed = false;
  }
}

console.log(allPassed ? '\n🎉 全部内置规则验证通过' : '\n❌ 有规则验证失败');
process.exit(allPassed ? 0 : 1);
