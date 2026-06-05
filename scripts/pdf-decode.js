// Decode PDF as UTF-8 (pdf-parse returns the raw text buffer; need to re-decode as GBK)
const fs = require('fs');
const path = require('path');
const pdfParse = require('pdf-parse');

const file = 'C:\\Users\\Liguangya\\Desktop\\AI考试附件\\demos\\黔寨寨贵州烙锅（鞍山店）常温.pdf';

(async () => {
  const buf = fs.readFileSync(file);
  const data = await pdfParse(buf);
  // pdf-parse internally decodes, but original may be GBK; re-decode raw stream
  console.log('页数:', data.numpages);
  console.log('===========================================');
  // Try to read the raw PDF and re-decode text
  const rawText = data.text;
  console.log('--- raw (data.text) ---');
  console.log(rawText);
  console.log('--- 字节级再解码 ---');
  // If raw text is garbled, try iconv-lite for GBK
  let iconv;
  try {
    iconv = require('iconv-lite');
  } catch {
    console.log('(no iconv-lite installed, skipping)');
    return;
  }
  // pdf-parse stores internal raw buffers in data.metadata or we need to re-parse raw
  // Instead, dump Buffer of each "text run"
  // Use the underlying buffer from pdf-parse
  const alt = await pdfParse(buf, { max: 0 });
  // Re-extract via raw buffer manipulation
  // Simpler: just output hex of first text run if any
  if (data.text !== alt.text) console.log('text differs between calls');
})();
