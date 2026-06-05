import { CellValue, ParsedDocument, Sheet } from '../rule-engine/types';

/** 服务端 Excel 解析: 使用 xlsx (SheetJS) */
export async function parseXlsx(buffer: ArrayBuffer, fileName: string): Promise<ParsedDocument> {
  // 动态导入避免 SSR 问题
  const XLSX = await import('xlsx');
  const wb = XLSX.read(buffer, { type: 'array' });

  const sheets: Sheet[] = wb.SheetNames.map((name) => {
    const ws = wb.Sheets[name];
    // 转为二维数组 (header: 1 = 按行)
    const rows = XLSX.utils.sheet_to_json(ws, {
      header: 1,
      raw: false,
      defval: null
    }) as CellValue[][];
    return { name, rows };
  });

  return { fileType: 'xlsx', fileName, sheets };
}

/** 服务端 CSV 解析 */
export async function parseCsv(buffer: ArrayBuffer, fileName: string): Promise<ParsedDocument> {
  const text = new TextDecoder('utf-8').decode(buffer);
  const rows = parseCsvText(text);
  return { fileType: 'csv', fileName, sheets: [{ name: 'Sheet1', rows }] };
}

function parseCsvText(text: string): CellValue[][] {
  const lines = text.split(/\r?\n/);
  return lines.map((line) => parseCsvLine(line));
}

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuote) {
      if (c === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (c === '"') {
        inQuote = false;
      } else {
        cur += c;
      }
    } else {
      if (c === '"') inQuote = true;
      else if (c === ',') {
        out.push(cur);
        cur = '';
      } else cur += c;
    }
  }
  out.push(cur);
  return out;
}

/** 服务端 Word 解析: 使用 mammoth 提取纯文本,再按行分块 */
export async function parseDocx(buffer: ArrayBuffer, fileName: string): Promise<ParsedDocument> {
  const mammoth = await import('mammoth');
  const result = await mammoth.extractRawText({ arrayBuffer: buffer });
  const text = result.value;
  // 把纯文本按行切分为一列(便于后续策略处理)
  const lines = text.split(/\r?\n/).map((l) => [l]);
  return {
    fileType: 'docx',
    fileName,
    sheets: [{ name: 'Document', rows: lines }],
    fullText: text
  };
}

/** 服务端 PDF 解析: 使用 pdf-parse */
export async function parsePdf(buffer: ArrayBuffer, fileName: string): Promise<ParsedDocument> {
  const pdfParse = (await import('pdf-parse')).default;
  const data = await pdfParse(Buffer.from(buffer));
  const text = data.text;

  // 把 PDF 文本转为行, 模拟为单 sheet
  const lines = text.split(/\r?\n/).map((l) => [l.trim()]);
  return {
    fileType: 'pdf',
    fileName,
    sheets: [{ name: 'PDF', rows: lines }],
    fullText: text,
    pages: [{ rows: lines, text }]
  };
}

/** 入口 */
export async function parseFile(
  buffer: ArrayBuffer,
  fileName: string,
  fileType: 'xlsx' | 'csv' | 'docx' | 'pdf'
): Promise<ParsedDocument> {
  switch (fileType) {
    case 'xlsx':
      return parseXlsx(buffer, fileName);
    case 'csv':
      return parseCsv(buffer, fileName);
    case 'docx':
      return parseDocx(buffer, fileName);
    case 'pdf':
      return parsePdf(buffer, fileName);
  }
}
