// 验证修复: 用 AI 生成的 ruleId (来自数据库) 解析 PDF
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
      if (v && v.path) form.append(k, fs.createReadStream(v.path), { filename: v.filename || path.basename(v.path) });
      else form.append(k, v);
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
  console.log('===== 1. 确认规则已入库 =====');
  const r = await get(`${BASE}/api/rules`);
  const j = JSON.parse(r.body);
  console.log(`规则总数: ${j.rules.length}`);
  for (const x of j.rules) {
    const tag = x.is_builtin ? '[内置]' : x.source === 'ai' ? '[AI]' : '[自定义]';
    console.log(`  ${tag} ${x.id}`);
  }
  const aiRule = j.rules.find((x) => x.id === 'qian-zhai-zhai-distribution-order');
  if (!aiRule) {
    console.error('✗ 找不到 AI 规则,请先运行 ai-save-rule.js');
    process.exit(1);
  }
  console.log(`✓ 找到 AI 规则: ${aiRule.name}`);

  console.log('\n===== 2. 用 AI 规则 (ruleId) 解析 PDF =====');
  const filePath = path.join(DEMO_DIR, PDF_FILE);
  const res = await postForm(`${BASE}/api/parse`, {
    ruleId: 'qian-zhai-zhai-distribution-order',
    file: { path: filePath, filename: PDF_FILE }
  });
  const pj = JSON.parse(res.body);
  console.log(`状态: ${res.status} ${pj.ok ? '✓' : '✗ ' + pj.error}`);
  if (pj.ok) {
    console.log(`订单数: ${pj.orders.length}`);
    if (pj.orders[0]) {
      const o = pj.orders[0];
      console.log(`  外部编码: ${o.外部编码 || '(空)'}`);
      console.log(`  收货门店: ${o.收货门店 || '(空)'}`);
      console.log(`  收件人: ${o.收件人姓名} ${o.收件人电话}`);
      console.log(`  地址: ${(o.收件人地址 || '').slice(0, 60) || '(空)'}`);
      console.log(`  备注: ${o.备注}`);
      console.log(`  明细数: ${o.details?.length}`);
      const validDetails = (o.details || []).filter((d) => d.SKU物品编码);
      console.log(`  含编码的有效明细: ${validDetails.length}`);
    }
  }

  console.log('\n===== ✅ 修复验证完成 =====');
  console.log('用户现在可以在前端首页的下拉框中选择 AI 规则,然后点击"开始解析"');
}

main().catch(console.error);
