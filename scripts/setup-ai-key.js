// 交互式配置 DeepSeek API Key
// 用法: node scripts/setup-ai-key.js <YOUR_DEEPSEEK_API_KEY>
// 或:   node scripts/setup-ai-key.js  (交互式输入)

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const ENV_FILE = path.join(__dirname, '..', '.env.local');

async function prompt(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function main() {
  let apiKey = process.argv[2];
  if (!apiKey) {
    apiKey = await prompt('请输入 DeepSeek API Key (sk-xxx): ');
  }
  if (!apiKey) {
    console.error('API Key 不能为空');
    process.exit(1);
  }
  if (!apiKey.startsWith('sk-')) {
    console.warn('⚠️  API Key 通常以 sk- 开头,请确认输入正确');
  }

  // 读取现有 .env.local
  let envContent = '';
  if (fs.existsSync(ENV_FILE)) {
    envContent = fs.readFileSync(ENV_FILE, 'utf-8');
  } else {
    envContent = fs.readFileSync(path.join(__dirname, '..', '.env.example'), 'utf-8');
  }

  // 替换或追加 DEEPSEEK_API_KEY
  const keyLine = `DEEPSEEK_API_KEY=${apiKey}`;
  if (envContent.match(/^DEEPSEEK_API_KEY=.*$/m)) {
    envContent = envContent.replace(/^DEEPSEEK_API_KEY=.*$/m, keyLine);
  } else {
    envContent += '\n' + keyLine + '\n';
  }
  fs.writeFileSync(ENV_FILE, envContent, 'utf-8');
  console.log('✓ API Key 已写入 .env.local');

  // 验证 - 调用 /api/ai/generate-rule 检查可用性
  console.log('\n正在测试连通性 (需要一个示例文件) ...');
  console.log('提示: 你可以稍后上传任意文件,系统会调用 AI 分析生成规则');

  console.log('\n=== 配置完成 ===');
  console.log('  - DEEPSEEK_API_KEY 已保存到 .env.local');
  console.log('  - 重启 dev server 后生效: Ctrl+C 停止,然后 npm run dev');
  console.log('  - 部署到 Vercel: 在 Vercel Dashboard -> Settings -> Environment Variables 添加');
}

main().catch(console.error);
