// 全流程 E2E 测试
// 1. init-db 建表
// 2. 拉取规则
// 3. 上传演示文件并解析
// 4. 校验订单数据
// 5. 导入到数据库
// 6. 从数据库查询

const fs = require('fs');
const path = require('path');
const FormData = require('form-data');
const http = require('http');

const DEMO_DIR = 'C:\\Users\\Liguangya\\Desktop\\AI考试附件\\demos';
const BASE = 'http://localhost:3010';

function get(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let body = '';
      res.on('data', (c) => (body += c));
      res.on('end', () => resolve({ status: res.statusCode, body }));
    }).on('error', reject);
  });
}

function postForm(url, fields) {
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

function postJson(url, data) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(data);
    const req = http.request(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
    }, (res) => {
      let d = '';
      res.on('data', (c) => (d += c));
      res.on('end', () => resolve({ status: res.statusCode, body: d }));
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function main() {
  console.log('===== 1. 初始化数据库 =====');
  const init = await get(`${BASE}/api/init-db`);
  console.log(init.body);

  console.log('\n===== 2. 拉取内置规则 =====');
  const rulesRes = await get(`${BASE}/api/rules`);
  const rulesJson = JSON.parse(rulesRes.body);
  console.log(`内置规则数: ${rulesJson.rules.length}`);
  for (const r of rulesJson.rules) {
    console.log(`  - [${r.id}] ${r.name} (${r.fileType})`);
  }

  // 选 湖南仓 作为大样本测试
  const testFile = '湖南仓.xlsx';
  const filePath = path.join(DEMO_DIR, testFile);
  console.log(`\n===== 3. 解析文件: ${testFile} =====`);
  const parseRes = await postForm(`${BASE}/api/parse`, {
    ruleId: 'hunan-cang',
    file: { path: filePath, filename: testFile }
  });
  const parseJson = JSON.parse(parseRes.body);
  if (!parseJson.ok) {
    console.error('解析失败:', parseJson.error);
    process.exit(1);
  }
  console.log(`订单数: ${parseJson.orders.length}`);
  console.log(`解析错误: ${parseJson.parseErrors?.length ?? 0}`);

  // 取前 5 条做样例
  console.log('前 5 条订单:');
  for (let i = 0; i < Math.min(5, parseJson.orders.length); i++) {
    const o = parseJson.orders[i];
    const d0 = o.details?.[0] || {};
    console.log(`  [${i+1}] ${o.收货门店} | ${o.收件人姓名} ${o.收件人电话} | ${o.外部编码} | 明细 ${o.details?.length} 条 | 首明细: ${d0.SKU物品编码}/${d0.SKU物品名称} x${d0.SKU发货数量}`);
  }

  // 校验: 数量异常和必填项
  console.log('\n===== 4. 校验订单数据 =====');
  let validCount = 0;
  let invalidCount = 0;
  for (const o of parseJson.orders) {
    const hasA = !!o.收货门店?.trim();
    const hasB = !!(o.收件人姓名?.trim() || o.收件人电话?.trim() || o.收件人地址?.trim());
    const hasHeader = hasA || hasB;
    const hasDetails = (o.details ?? []).length > 0;
    const detailsValid = (o.details ?? []).every(
      (d) => d.SKU物品编码 && d.SKU物品名称 && Number(d.SKU发货数量) > 0
    );
    if (hasHeader && hasDetails && detailsValid) validCount++;
    else invalidCount++;
  }
  console.log(`有效订单: ${validCount} / 无效: ${invalidCount}`);

  // 导入前 10 条到数据库 (避免一次导入太多)
  console.log('\n===== 5. 导入到数据库 (前 10 条) =====');
  const ordersToImport = parseJson.orders.slice(0, 10);
  const importRes = await postJson(`${BASE}/api/orders/import`, {
    orders: ordersToImport,
    batchId: `E2E-TEST-${Date.now()}`
  });
  const importJson = JSON.parse(importRes.body);
  console.log(`导入结果: ${importJson.ok ? '✓' : '✗'} ${importJson.batchId} 写入 ${importJson.count} 条`);

  // 查询
  console.log('\n===== 6. 从数据库查询 =====');
  const listRes = await get(`${BASE}/api/orders?page=1&pageSize=5`);
  const listJson = JSON.parse(listRes.body);
  console.log(`总记录数: ${listJson.total}`);
  console.log('前 3 条:');
  for (const o of (listJson.data || []).slice(0, 3)) {
    console.log(`  [#${o.id}] ${o.external_code} | ${o.store_name} | ${o.recipient_name} ${o.recipient_phone} | 来源: ${o.source_file} · ${o.source_sheet || ''}`);
  }

  console.log('\n===== ✅ E2E 测试完成 =====');
}

main().catch(console.error);
