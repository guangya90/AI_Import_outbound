/**
 * Neon Postgres 数据库 schema & client
 */
import { neon, neonConfig, Pool } from '@neondatabase/serverless';

const DATABASE_URL = process.env.DATABASE_URL ?? '';

if (!DATABASE_URL) {
  console.warn('[db] DATABASE_URL is empty, db features will fail');
}

export const sql = DATABASE_URL ? neon(DATABASE_URL) : null;

/**
 * 创建 schema (在初始化时执行一次)
 */
export async function initSchema() {
  if (!sql) throw new Error('DATABASE_URL is empty');
  await sql`
    CREATE TABLE IF NOT EXISTS rules (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      file_type TEXT NOT NULL,
      rule_json JSONB NOT NULL,
      source TEXT DEFAULT 'manual',
      is_builtin BOOLEAN DEFAULT false,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS orders (
      id BIGSERIAL PRIMARY KEY,
      batch_id TEXT NOT NULL,
      external_code TEXT,
      store_name TEXT,
      recipient_name TEXT,
      recipient_phone TEXT,
      recipient_address TEXT,
      remark TEXT,
      details JSONB NOT NULL,
      errors JSONB,
      source_file TEXT,
      source_sheet TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_orders_batch ON orders(batch_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_orders_external_code ON orders(external_code)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at DESC)`;
}

/** 批量插入订单 */
export async function insertOrders(batchId: string, orders: any[]) {
  if (!sql) throw new Error('DATABASE_URL is empty');
  if (!orders.length) return [];
  // 一次最多 200 条, 避免 SQL 太长
  const CHUNK = 200;
  for (let i = 0; i < orders.length; i += CHUNK) {
    const chunk = orders.slice(i, i + CHUNK);
    const values: any[] = [];
    const placeholders: string[] = [];
    let p = 1;
    for (const o of chunk) {
      placeholders.push(
        `($${p++}, $${p++}, $${p++}, $${p++}, $${p++}, $${p++}, $${p++}, $${p++}, $${p++}, $${p++}, $${p++})`
      );
      values.push(
        batchId,
        o.外部编码 || null,
        o.收货门店 || null,
        o.收件人姓名 || null,
        o.收件人电话 || null,
        o.收件人地址 || null,
        o.备注 || null,
        JSON.stringify(o.details ?? []),
        JSON.stringify(o.errors ?? []),
        o.sourceFile || null,
        o.sourceSheet || null
      );
    }
    await (sql as any)(
      `INSERT INTO orders (batch_id, external_code, store_name, recipient_name, recipient_phone, recipient_address, remark, details, errors, source_file, source_sheet) VALUES ${placeholders.join(',')}`,
      values
    );
  }
}

/** 列出已导入运单 */
export async function listOrders(opts: {
  q?: string;
  externalCode?: string;
  recipient?: string;
  page?: number;
  pageSize?: number;
}) {
  if (!sql) throw new Error('DATABASE_URL is empty');
  const page = Math.max(1, opts.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, opts.pageSize ?? 20));
  const offset = (page - 1) * pageSize;

  const where: string[] = [];
  const values: any[] = [];
  if (opts.q) {
    values.push(`%${opts.q}%`);
    where.push(`(external_code ILIKE $${values.length} OR recipient_name ILIKE $${values.length} OR recipient_phone ILIKE $${values.length})`);
  }
  if (opts.externalCode) {
    values.push(`%${opts.externalCode}%`);
    where.push(`external_code ILIKE $${values.length}`);
  }
  if (opts.recipient) {
    values.push(`%${opts.recipient}%`);
    where.push(`recipient_name ILIKE $${values.length}`);
  }
  const whereSql = where.length ? 'WHERE ' + where.join(' AND ') : '';

  const dataQuery = `SELECT * FROM orders ${whereSql} ORDER BY created_at DESC LIMIT ${pageSize} OFFSET ${offset}`;
  const countQuery = `SELECT COUNT(*) as c FROM orders ${whereSql}`;
  const data = await (sql as any)(dataQuery, values);
  const count = await (sql as any)(countQuery, values);

  return {
    data: data as any[],
    total: Number((count as any[])[0]?.c ?? 0),
    page,
    pageSize
  };
}

/* ====== 规则存储 ====== */

export async function upsertRule(rule: any) {
  if (!sql) throw new Error('DATABASE_URL is empty');
  await (sql as any)(
    `INSERT INTO rules (id, name, description, file_type, rule_json, source, is_builtin, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
     ON CONFLICT (id) DO UPDATE SET
       name = EXCLUDED.name,
       description = EXCLUDED.description,
       file_type = EXCLUDED.file_type,
       rule_json = EXCLUDED.rule_json,
       source = EXCLUDED.source,
       is_builtin = EXCLUDED.is_builtin,
       updated_at = NOW()`,
    [
      rule.id,
      rule.name,
      rule.description ?? null,
      rule.fileType,
      JSON.stringify(rule),
      rule.source ?? 'manual',
      rule.isBuiltin ?? false
    ]
  );
}

export async function listRules() {
  if (!sql) throw new Error('DATABASE_URL is empty');
  return (await sql`SELECT * FROM rules ORDER BY is_builtin DESC, updated_at DESC`) as any[];
}

export async function getRule(id: string) {
  if (!sql) throw new Error('DATABASE_URL is empty');
  const r = (await (sql as any)(`SELECT * FROM rules WHERE id = $1`, [id])) as any[];
  return r[0] ?? null;
}

export async function deleteRule(id: string) {
  if (!sql) throw new Error('DATABASE_URL is empty');
  await (sql as any)(`DELETE FROM rules WHERE id = $1 AND is_builtin = false`, [id]);
}
