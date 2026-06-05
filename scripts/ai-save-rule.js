// 完整流程: AI 生成 PDF 规则 → 保存到数据库 → 列出规则
const fs = require('fs');
const path = require('path');
const FormData = require('form-data');
const http = require('http');

const DEMO_DIR = 'C:\\Users\\Liguangya\\Desktop\\AI考试附件\\demos';
const PDF_FILE = '黔寨寨贵州烙锅（鞍山店）常温.pdf';
const BASE = 'http://localhost:3010';

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

function get(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let body = '';
      res.on('data', (c) => (body += c));
      res.on('end', () => resolve({ status: res.statusCode, body }));
    }).on('error', reject);
  });
}

async function main() {
  const filePath = path.join(DEMO_DIR, PDF_FILE);
  console.log('===== 第 1 步: AI 生成 PDF 解析规则 =====');
  console.log(`上传: ${PDF_FILE}`);

  const start = Date.now();
  const res = await postForm(`${BASE}/api/ai/generate-rule`, {
    file: { path: filePath, filename: PDF_FILE }
  });
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);

  const aiJson = JSON.parse(res.body);
  if (!aiJson.ok) {
    console.error('✗ AI 生成失败:', aiJson.error);
    process.exit(1);
  }
  const rule = aiJson.rule;
  console.log(`✓ DeepSeek 响应 ${elapsed}s`);
  console.log(`  规则名: ${rule.name}`);
  console.log(`  ID: ${rule.id}`);

  // 标记为 AI 来源
  rule.source = 'ai';

  console.log('\n===== 第 2 步: 保存到 Postgres 数据库 =====');
  const saveRes = await postJson(`${BASE}/api/rules`, { rule });
  const saveJson = JSON.parse(saveRes.body);
  console.log(saveJson.ok ? '✓ 已保存' : '✗ 保存失败: ' + saveJson.error);

  console.log('\n===== 第 3 步: 查询所有规则 (内置 + AI) =====');
  const listRes = await get(`${BASE}/api/rules`);
  const listJson = JSON.parse(listRes.body);
  console.log(`当前规则总数: ${listJson.rules.length}`);
  for (const r of listJson.rules) {
    const tag = r.is_builtin ? '[内置]' : r.source === 'ai' ? '[AI]' : '[自定义]';
    console.log(`  ${tag.padEnd(8)} ${r.id.padEnd(36)} | ${r.name}`);
  }

  console.log('\n===== 第 4 步: 用 AI 规则回测解析 =====');
  const FormData2 = require('form-data');
  const form2 = new FormData2();
  form2.append('file', fs.createReadStream(filePath), { filename: PDF_FILE });
  form2.append('rule', JSON.stringify(rule));
  const v = await new Promise((resolve, reject) => {
    const req = http.request(`${BASE}/api/parse`, { method: 'POST', headers: form2.getHeaders() }, (r) => {
      let b = '';
      r.on('data', (c) => (b += c));
      r.on('end', () => resolve({ status: r.statusCode, body: b }));
    });
    req.on('error', reject);
    form2.pipe(req);
  });
  const vj = JSON.parse(v.body);
  if (vj.ok) {
    console.log(`✓ 解析出 ${vj.orders.length} 条订单`);
    if (vj.orders[0]) {
      const o = vj.orders[0];
      console.log('  外部编码:', o.外部编码 || '(空)');
      console.log('  收货门店:', o.收货门店 || '(空 - 可在规则管理页调整 row 位置)');
      console.log('  收件人:', o.收件人姓名 || '(空)');
      console.log('  收件人电话:', o.收件人电话 || '(空)');
      console.log('  收件人地址:', o.收件人地址 || '(空)');
      console.log('  备注:', o.备注 || '(空)');
      console.log('  明细数:', o.details?.length);
    }
  }

  console.log('\n=========================================');
  console.log('下一步:');
  console.log('  1) 访问 http://localhost:3010/rules 查看 AI 生成的规则');
  console.log('  2) 点击"查看/编辑"手动微调 row/columnMap 等参数');
  console.log('  3) 由于 PDF 文本抽取会丢失表格列边界,可能需要:');
  console.log('     - 调整 skipTopRows / startRow');
  console.log('     - 在 columnMap 中用 regex 而非固定列号');
  console.log('=========================================');
}

main().catch(console.error);
