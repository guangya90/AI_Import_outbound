// 测试 import endpoint
const http = require('http');

const orders = [
  {
    外部编码: 'TEST001',
    收货门店: '测试门店',
    收件人姓名: '张三',
    收件人电话: '13800000000',
    收件人地址: '北京市朝阳区',
    备注: '',
    details: [
      { SKU物品编码: 'SKU001', SKU物品名称: '测试商品A', SKU发货数量: 5, SKU规格型号: '1kg', errors: [] },
      { SKU物品编码: 'SKU002', SKU物品名称: '测试商品B', SKU发货数量: 3, SKU规格型号: '2kg', errors: [] }
    ],
    errors: [],
    warnings: []
  }
];

const body = JSON.stringify({ orders, batchId: 'TEST-BATCH-001' });

const req = http.request('http://localhost:3010/api/orders/import', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
}, (res) => {
  let data = '';
  res.on('data', (c) => (data += c));
  res.on('end', () => {
    console.log(`Status: ${res.statusCode}`);
    console.log(`Body: ${data}`);
  });
});
req.on('error', console.error);
req.write(body);
req.end();
