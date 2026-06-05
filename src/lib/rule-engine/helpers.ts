import { CANONICAL_FIELDS, CellValue, FieldAlias } from './types';

/** 把单元格值安全转为字符串 (trim, NaN -> '') */
export function cv(v: CellValue | undefined): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'number') {
    if (Number.isNaN(v)) return '';
    return String(v);
  }
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  return String(v).trim();
}

/** 转为数字;失败返回 null */
export function toNumber(v: CellValue | undefined): number | null {
  const s = cv(v);
  if (!s) return null;
  // 去除 "20kg/箱" 这种单位
  const num = parseFloat(s.replace(/[^\d.\-]/g, ''));
  if (Number.isNaN(num)) return null;
  return num;
}

/** 匹配别名: 在 alias 集合中找到首个匹配,返回 canonical */
export function matchAlias(value: string, fieldGroup: Record<string, string[]>): string | null {
  const v = value.trim();
  for (const [canonical, aliases] of Object.entries(fieldGroup)) {
    for (const alias of aliases) {
      if (v === alias) return canonical;
      if (v.includes(alias)) return canonical;
    }
  }
  return null;
}

/** 匹配多个字段 (例如 "外部编码/单据号") - 返回找到的 canonical */
export function matchMultiAlias(value: string, candidates: string[]): string | null {
  const v = value.trim();
  for (const c of candidates) {
    if (v === c) return c;
    if (v.includes(c)) return c;
  }
  return null;
}

/** 给定别名集合, 在该行中查找第一个非空值 */
export function findInRow(row: CellValue[], aliases: string[]): string {
  for (let i = 0; i < row.length; i++) {
    const cell = cv(row[i]);
    if (!cell) continue;
    for (const alias of aliases) {
      if (cell === alias || cell.startsWith(alias + ':') || cell.startsWith(alias + '：')) {
        // 找右侧 (左右排布) - 找下一非空
        if (cell.startsWith(alias + ':') || cell.startsWith(alias + '：')) {
          return cell.substring(alias.length + 1).trim();
        }
        if (cv(row[i + 1])) return cv(row[i + 1]);
      }
    }
  }
  return '';
}

/** 解析 key:value 格式 (例如 "收货人:张三") */
export function parseKvLine(text: string): { key: string; value: string } | null {
  const m = text.match(/^([^:：\s]{1,30})[:：]\s*(.*)$/);
  if (!m) return null;
  return { key: m[1].trim(), value: m[2].trim() };
}

/** 检查文本是否为合计/小计/总计行 */
export function isTotalRow(text: string): boolean {
  return /^(合计|小计|总计|共|sum|total)\s*[：:]?\s*\d*/i.test(text.trim());
}

/** 校验手机号 (宽松) */
export function isPhone(s: string): boolean {
  if (!s) return false;
  return /^(?:\+?86)?1[3-9]\d{9}$|^\d{7,15}$/.test(s.replace(/[\s-]/g, ''));
}

/** 去除可能的展开行号 (例如 "20 袋") */
export function normalizeNumber(v: CellValue): number | null {
  return toNumber(v);
}

export { CANONICAL_FIELDS };
