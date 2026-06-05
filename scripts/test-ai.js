// 测试 AI 规则生成 - 用一个未在预置规则中对应的格式触发
// 上传黔寨寨配送单 PDF, 让 AI 分析生成新规则
const fs = require('fs');
const path = require('path');
const FormData = require('form-data');
const http = require('http');

const DEMO_DIR = 'C:\\Users\\Liguangya\\Desktop\\AI考试附件\\demos';
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
  if (!process.env.DEEPSEEK_API_KEY) {
    console.error('⚠️  DEEPSEEK_API_KEY 未配置');
    console.error('   1. 运行: node scripts/setup-ai-key.js <your-key>');
    console.error('   2. 或手动编辑 .env.local 添加 DEEPSEEK_API_KEY=sk-xxx');
    console.error('   3. 重启 dev server');
    process.exit(1);
  }

  const file = process.argv[2] || '黔寨寨配送单(九龄童黔山店)出库.pdf';
  const filePath = path.join(DEMO_DIR, file);
  if (!fs.existsSync(filePath)) {
    console.error(`文件不存在: ${filePath}`);
    process.exit(1);
  }

  console.log(`上传文件: ${file} (${(fs.statSync(filePath).size / 1024).toFixed(1)} KB)`);
  console.log('调用 DeepSeek 分析中 (可能需要 10-30 秒)...\n');

  const res = await postForm(`${BASE}/api/ai/generate-rule`, {
    file: { path: filePath, filename: file }
  });
  const j = JSON.parse(res.body);
  if (!j.ok) {
    console.error('✗ AI 生成失败:', j.error);
    process.exit(1);
  }

  console.log('✓ DeepSeek 响应成功');
  console.log(`  文件类型: ${j.fileType}`);
  console.log(`  Sheet 数: ${j.sheetCount}`);
  console.log('\n=== AI 推荐的规则 ===');
  console.log(JSON.stringify(j.rule, null, 2));

  // 可选: 直接用 AI 生成的规则再解析一次
  console.log('\n=== 验证: 用 AI 规则回测 ===');
  const FormData2 = require('form-data');
  const form2 = new FormData2();
  form2.append('file', fs.createReadStream(filePath), { filename: file });
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
    console.log(`✓ AI 规则解析出 ${vj.orders.length} 条订单`);
    if (vj.orders[0]) {
      const o = vj.orders[0];
      console.log(`  第一条: ${o.收货门店} | ${o.收件人姓名} | 明细 ${o.details?.length} 条`);
    }
  } else {
    console.log('✗ 回测失败:', vj.error);
  }
}

main().catch(console.error);
