# 万能导入 V2 · 智能多格式批量下单系统

> AI 考试项目 - 通过大模型 + 规则引擎实现任意格式出库单 (Excel/Word/PDF) 的智能解析与批量导入

## ✨ 核心特性

### 1. 通用规则引擎 (Rule DSL)
- **7 种解析策略**,覆盖所有演示文件及任意新格式:
  - `kv-rows` - 行内 key-value (左右/上下排布),如黎明屯配送单尾部的收货信息
  - `inline` - 每行都含完整 header,按 groupBy 跨行聚合,如湖南仓发货明细
  - `matrix` - SKU×门店 矩阵转置,如欢乐牧场模板
  - `card` - 卡片式堆叠,按 "▶ 调拨记录 #N" 边界拆分,如门店调拨单
  - `multi-sheet-footer` - 多 Sheet 合并,Sheet 名作为门店,如多门店分Sheet出库单
  - `pdf-text` - PDF 抽出的纯文本,正则切分明细行,如黔寨寨配送单
  - `static` - 静态字段
- 规则 JSON 持久化到 Postgres,可由用户手动配置或 AI 自动生成
- AI 生成的规则会自动经过 `normalizeRule` 兜底修复(字段名/类型/必填项)

### 2. AI 辅助生成规则
- 上传任意新格式文件,DeepSeek 大模型分析后输出一套推荐规则
- AI 标注推测字段,用户确认后保存 (零硬编码逻辑)

### 3. 数据预览与编辑
- 类 Excel 表格,行内错误实时校验 (必填/电话/数量异常标红)
- 支持单元格点击编辑、删除行、新增空行
- 全部错误一次性展示
- 外部编码重复检测
- 一键导出为 .xlsx

### 4. 订单拆分规则
严格遵循考试要求:
- 收货门店 / 收件人地址 至少填一组
- 收件人姓名 / 收件人电话 二选一必填
- SKU 编码/名称/数量 三项必填,缺失自动标红并填充「缺失必填」
- 数量 ≤ 0 或非数字,标红并填充「【数量异常】」
- 自动识别字段别名(订单号→外部编码、门店名称→收货门店 等)

### 5. 已导入运单管理
- 数据库存储,支持按外部编码/收件人/电话搜索
- 分页、来源追踪 (文件+Sheet名)

## 🏗 技术栈
- **前端**: Next.js 14 (App Router) + TypeScript + TailwindCSS
- **后端**: Next.js API Routes (Node.js runtime)
- **数据库**: Neon Serverless Postgres
- **大模型**: DeepSeek (兼容 OpenAI 协议)
- **文件解析**:
  - Excel: SheetJS (xlsx)
  - Word: mammoth
  - PDF: pdf-parse

## 🚀 部署到 Vercel

### 1. 准备环境变量
复制 `.env.example` 为 `.env.local`,填入真实值:
```
DATABASE_URL = postgresql://USER:PASSWORD@HOST/DB?sslmode=require
DEEPSEEK_API_KEY = sk-...    (可选,用于 AI 规则生成)
DEEPSEEK_BASE_URL = https://api.deepseek.com/v1
DEEPSEEK_MODEL = deepseek-chat
```

### 2. 一键部署
```bash
# 安装 Vercel CLI
npm i -g vercel

# 登录
vercel login

# 部署
vercel --prod
```

部署完成后,首次访问会提示"数据库表未初始化",访问:
```
https://your-domain.vercel.app/api/init-db
```
即可创建 schema。

### 3. 本地开发
```bash
# 安装依赖
npm install

# 启动开发服务器
DATABASE_URL="..." DEEPSEEK_API_KEY="..." npm run dev

# 初始化数据库
curl http://localhost:3000/api/init-db
```

## 📁 项目结构
```
src/
├── app/
│   ├── api/
│   │   ├── parse/                # 文件解析入口
│   │   ├── ai/generate-rule/     # AI 规则生成
│   │   ├── rules/                # 规则 CRUD
│   │   ├── orders/               # 订单列表/导入
│   │   └── init-db/              # schema 初始化
│   ├── page.tsx                  # 首页(上传/选规则)
│   ├── preview/page.tsx          # 预览/编辑
│   ├── rules/page.tsx            # 规则管理
│   └── orders/page.tsx           # 已导入运单
├── components/
│   └── Sidebar.tsx
└── lib/
    ├── rule-engine/
    │   ├── types.ts              # 规则类型定义
    │   ├── engine.ts             # 规则引擎核心
    │   ├── helpers.ts            # 工具函数
    │   └── builtin-rules.ts      # 6 份演示文件预置规则
    ├── parsers/
    │   └── server-parsers.ts     # Excel/Word/PDF 解析
    ├── ai/
    │   └── deepseek.ts           # 大模型客户端
    └── db.ts                     # Neon Postgres 封装
```

## 📋 内置规则清单

| 文件 | 格式 | 规则 ID | 策略 | 订单数 |
|------|------|---------|------|--------|
| 黎明屯配送发货单 | Excel | `liming-tun-fenghuang` | `kv-rows` (尾部收货信息) | 1 |
| 湖南仓发货明细 | Excel | `hunan-cang` | `inline` (跨行聚合) | 60 |
| 欢乐牧场模板 | Excel | `huanle-muchang-matrix` | `matrix` (矩阵转置) | 15 |
| 多门店分Sheet出库单 | Excel | `multi-sheet-yingtai` | `multi-sheet-footer` | 3 |
| 门店调拨单(卡片式) | Excel | `diao-card` | `card` (▶ 调拨记录 #N) | 3 |
| 黔寨寨配送单 | PDF | `qianzhai-pdf` | `pdf-text` (正则切分) | 1 |

> 上传**任意新格式**文件时,可走 AI 辅助生成规则(输出经 `normalizeRule` 兜底修复,与内置规则结构保持一致)。

## 🔑 关键设计理念

> **不是为每种文件写 if-else,而是设计一套通用规则描述语言。**
> 新增第 N 种格式,只需配置一条规则即可适配,代码零改动。
