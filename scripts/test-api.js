// 通过 Node.js 直接调用本地 API
const fs = require('fs');
const path = require('path');
const FormData = require('form-data');
const http = require('http');

const DEMO_DIR = 'C:\\Users\\Liguangya\\Desktop\\AI考试附件\\demos';

async function postForm(url, fields) {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    for (const [k, v] of Object.entries(fields)) {
      if (v && v.path) {
        form.append(k, fs.createReadStream(v.path), { filename: v.filename || path.basename(v.path) });
      } else {
        form.append(k, v);
      }
    }
    const req = http.request(url, { method: 'POST', headers: form.getHeaders() }, (res) => {
      let body = '';
      res.on('data', (c) => (body += c));
      res.on('end', () => resolve({ status: res.statusCode, body }));
    });
    req.on('error', reject);
    form.pipe(req);
  });
}

async function main() {
  const tests = [
    { rule: 'liming-tun-fenghuang', file: '12.25海口龙湖天街-配送发货单PS2512220005001(1).xlsx' },
    { rule: 'hunan-cang', file: '湖南仓.xlsx' },
    { rule: 'huanle-muchang-matrix', file: '欢乐牧场模板0430.xlsx' },
    { rule: 'multi-sheet-yingtai', file: '多门店分Sheet出库单.xlsx' },
    { rule: 'diao-card', file: '门店调拨单-卡片式.xlsx' }
  ];

  for (const t of tests) {
    const filePath = path.join(DEMO_DIR, t.file);
    if (!fs.existsSync(filePath)) {
      console.log(`[SKIP] ${t.file} 不存在`);
      continue;
    }
    try {
      const { status, body } = await postForm('http://localhost:3010/api/parse', {
        ruleId: t.rule,
        file: { path: filePath, filename: t.file }
      });
      const j = JSON.parse(body);
      if (j.ok) {
        const o = j.orders?.[0] || {};
        const det = o.details?.[0] || {};
        console.log(`[OK] ${t.rule}`);
        console.log(`     orders=${j.orders?.length}, 第一条:`);
        console.log(`       门店=${o.收货门店} | ${o.收件人姓名} ${o.收件人电话} | 编码=${o.外部编码}`);
        console.log(`       明细数=${o.details?.length}, 示例: ${det.SKU物品编码}/${det.SKU物品名称} x${det.SKU发货数量}`);
      } else {
        console.log(`[ERR] ${t.rule}: ${j.error}`);
      }
    } catch (e) {
      console.error(`[EXC] ${t.rule}:`, e.message);
    }
  }
}

main().catch(console.error);
