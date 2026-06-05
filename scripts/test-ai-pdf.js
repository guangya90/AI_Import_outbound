// 调用 DeepSeek 为 PDF 生成解析规则
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

async function main() {
  const filePath = path.join(DEMO_DIR, PDF_FILE);
  if (!fs.existsSync(filePath)) {
    console.error('文件不存在:', filePath);
    process.exit(1);
  }

  console.log('===========================================');
  console.log('调用 DeepSeek 分析 PDF 结构');
  console.log('===========================================');
  console.log('文件:', PDF_FILE);
  console.log('大小:', (fs.statSync(filePath).size / 1024).toFixed(1), 'KB');
  console.log('模型: deepseek-chat (DeepSeek-V3)');
  console.log('');
  console.log('等待 AI 响应 (可能 10-30 秒)...');
  console.log('');

  const start = Date.now();
  const res = await postForm(`${BASE}/api/ai/generate-rule`, {
    file: { path: filePath, filename: PDF_FILE }
  });
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);

  const j = JSON.parse(res.body);
  if (!j.ok) {
    console.error('✗ AI 生成失败:', j.error);
    process.exit(1);
  }

  console.log(`✓ 响应耗时 ${elapsed}s`);
  console.log(`  文件类型识别: ${j.fileType}`);
  console.log(`  Sheet 数: ${j.sheetCount}`);
  console.log('');
  console.log('===========================================');
  console.log('AI 生成的解析规则 (ParseRule JSON)');
  console.log('===========================================');
  console.log(JSON.stringify(j.rule, null, 2));

  // 保存到本地,供后续保存到数据库
  fs.writeFileSync(
    path.join(__dirname, '..', 'ai-generated-rule.json'),
    JSON.stringify(j.rule, null, 2)
  );
  console.log('');
  console.log('已保存到: ai-generated-rule.json');

  // 用 AI 生成的规则回测
  console.log('');
  console.log('===========================================');
  console.log('回测: 用 AI 规则解析同一文件');
  console.log('===========================================');
  const FormData2 = require('form-data');
  const form2 = new FormData2();
  form2.append('file', fs.createReadStream(filePath), { filename: PDF_FILE });
  form2.append('rule', JSON.stringify(j.rule));
  const verifyRes = await new Promise((resolve, reject) => {
    const req = http.request(`${BASE}/api/parse`, { method: 'POST', headers: form2.getHeaders() }, (r) => {
      let b = '';
      r.on('data', (c) => (b += c));
      r.on('end', () => resolve({ status: r.statusCode, body: b }));
    });
    req.on('error', reject);
    form2.pipe(req);
  });
  const vj = JSON.parse(verifyRes.body);
  if (vj.ok) {
    console.log(`✓ 解析出 ${vj.orders.length} 条订单`);
    if (vj.orders[0]) {
      const o = vj.orders[0];
      console.log('第一条订单:');
      console.log('  外部编码:', o.外部编码);
      console.log('  收货门店:', o.收货门店);
      console.log('  收件人:', o.收件人姓名, o.收件人电话);
      console.log('  地址:', (o.收件人地址 || '').slice(0, 60));
      console.log('  备注:', o.备注);
      console.log('  明细数:', o.details?.length);
      if (o.details?.[0]) {
        const d = o.details[0];
        console.log('  首明细:', d.SKU物品编码, '/', d.SKU物品名称, '/', d.SKU规格型号, 'x', d.SKU发货数量);
      }
    }
  } else {
    console.log('✗ 回测失败:', vj.error);
  }
}

main().catch(console.error);
