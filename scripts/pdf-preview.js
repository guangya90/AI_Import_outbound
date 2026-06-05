// 查看 PDF 文本内容
const fs = require('fs');
const path = require('path');
const pdfParse = require('pdf-parse');

const file = 'C:\\Users\\Liguangya\\Desktop\\AI考试附件\\demos\\黔寨寨贵州烙锅（鞍山店）常温.pdf';

(async () => {
  const buf = fs.readFileSync(file);
  const data = await pdfParse(buf);
  console.log('页数:', data.numpages);
  console.log('===========================================');
  console.log(data.text);
})();
