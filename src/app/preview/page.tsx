'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import * as XLSX from 'xlsx';

interface OrderItem {
  外部编码: string;
  收货门店: string;
  收件人姓名: string;
  收件人电话: string;
  收件人地址: string;
  备注: string;
  details: DetailItem[];
  errors: string[];
  warnings: string[];
  sourceFile?: string;
  sourceSheet?: string;
  _invalid?: boolean;
}
interface DetailItem {
  SKU物品编码: string;
  SKU物品名称: string;
  SKU发货数量: string | number;
  SKU规格型号: string;
  errors: string[];
}

const HEADER_FIELDS = ['外部编码', '收货门店', '收件人姓名', '收件人电话', '收件人地址', '备注'] as const;

export default function PreviewPage() {
  const router = useRouter();
  const [orders, setOrders] = useState<OrderItem[]>([]);
  const [fileName, setFileName] = useState('');
  const [ruleName, setRuleName] = useState('');
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);
  const [editing, setEditing] = useState<{ row: number; field: string; val: string } | null>(null);

  useEffect(() => {
    const data = sessionStorage.getItem('parseResult');
    const name = sessionStorage.getItem('parseFileName');
    if (!data) {
      router.push('/');
      return;
    }
    const parsed = JSON.parse(data);
    setOrders(parsed.orders ?? []);
    setRuleName(parsed.ruleName ?? '');
    setFileName(name ?? '');
  }, [router]);

  const errors = useMemo(() => orders.filter((o) => hasOrderError(o)), [orders]);
  const valid = useMemo(() => orders.filter((o) => !hasOrderError(o)), [orders]);

  function updateOrder(idx: number, field: keyof OrderItem, val: string) {
    setOrders((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], [field]: val } as OrderItem;
      validate(next[idx]);
      return next;
    });
  }

  function updateDetail(orderIdx: number, detailIdx: number, field: keyof DetailItem, val: string) {
    setOrders((prev) => {
      const next = [...prev];
      const d = { ...next[orderIdx].details[detailIdx], [field]: val };
      d.errors = [];
      next[orderIdx] = {
        ...next[orderIdx],
        details: next[orderIdx].details.map((x, i) => (i === detailIdx ? d : x))
      };
      validate(next[orderIdx]);
      return next;
    });
  }

  function addRow() {
    setOrders((prev) => [
      ...prev,
      {
        外部编码: '',
        收货门店: '',
        收件人姓名: '',
        收件人电话: '',
        收件人地址: '',
        备注: '',
        details: [],
        errors: [],
        warnings: []
      }
    ]);
  }

  function removeRow(idx: number) {
    setOrders((prev) => prev.filter((_, i) => i !== idx));
  }

  async function handleImport() {
    if (errors.length > 0) {
      setToast({ type: 'error', msg: `存在 ${errors.length} 条无效订单,请先修正` });
      return;
    }
    setImporting(true);
    setProgress(0);
    const t = setInterval(() => setProgress((p) => Math.min(p + 8, 90)), 100);
    try {
      const res = await fetch('/api/orders/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orders })
      });
      const j = await res.json();
      clearInterval(t);
      if (!res.ok) throw new Error(j.error);
      setProgress(100);
      setToast({ type: 'success', msg: `成功导入 ${j.count} 条订单 (批次: ${j.batchId})` });
      setTimeout(() => router.push('/orders'), 1200);
    } catch (e: any) {
      clearInterval(t);
      setToast({ type: 'error', msg: e.message });
    } finally {
      setImporting(false);
    }
  }

  function exportXlsx() {
    // 导出明细行 (一行=一个 SKU), 头部信息平铺
    const rows = orders.flatMap((o) =>
      o.details.length
        ? o.details.map((d) => ({
            外部编码: o.外部编码,
            收货门店: o.收货门店,
            收件人姓名: o.收件人姓名,
            收件人电话: o.收件人电话,
            收件人地址: o.收件人地址,
            SKU物品编码: d.SKU物品编码,
            SKU物品名称: d.SKU物品名称,
            SKU发货数量: d.SKU发货数量,
            SKU规格型号: d.SKU规格型号,
            备注: o.备注
          }))
        : [
            {
              外部编码: o.外部编码,
              收货门店: o.收货门店,
              收件人姓名: o.收件人姓名,
              收件人电话: o.收件人电话,
              收件人地址: o.收件人地址,
              SKU物品编码: '',
              SKU物品名称: '',
              SKU发货数量: '',
              SKU规格型号: '',
              备注: o.备注
            }
          ]
    );
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Orders');
    XLSX.writeFile(wb, `orders-${Date.now()}.xlsx`);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">数据预览</h1>
          <p className="text-sm text-gray-500 mt-1">
            规则: <span className="tag">{ruleName}</span> · 文件: {fileName}
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => router.push('/')} className="btn-ghost">
            ← 返回
          </button>
          <button onClick={exportXlsx} className="btn-secondary">📥 导出 Excel</button>
          <button onClick={addRow} className="btn-secondary">+ 新增空行</button>
          <button onClick={handleImport} disabled={importing || !!errors.length} className="btn-primary">
            {importing ? '导入中...' : `提交下单 (${valid.length})`}
          </button>
        </div>
      </div>

      {/* 错误汇总 */}
      {errors.length > 0 && (
        <div className="card border-l-4 border-red-500 bg-red-50/30">
          <div className="font-semibold text-red-600 mb-1">⚠️ 存在 {errors.length} 条无效订单</div>
          <div className="text-xs text-gray-600 max-h-32 overflow-auto space-y-1">
            {errors.slice(0, 8).map((o, i) => (
              <div key={i}>
                第 {orders.indexOf(o) + 1} 行: {o.errors.join('; ')}
              </div>
            ))}
            {errors.length > 8 && <div className="text-gray-400">...还有 {errors.length - 8} 条</div>}
          </div>
        </div>
      )}

      {importing && (
        <div className="card">
          <div className="flex justify-between text-xs text-gray-500 mb-1">
            <span>正在写入数据库...</span>
            <span>{progress}%</span>
          </div>
          <div className="progress-bar">
            <div className="progress-bar-fill" style={{ width: `${progress}%` }} />
          </div>
        </div>
      )}

      {toast && (
        <div
          className={`fixed top-5 right-5 z-50 px-4 py-3 rounded-lg shadow-lg text-sm ${
            toast.type === 'success' ? 'bg-brand-500 text-white' : 'bg-red-500 text-white'
          }`}
          onAnimationEnd={() => setToast(null)}
        >
          {toast.msg}
        </div>
      )}

      <div className="table-container" style={{ maxHeight: 'calc(100vh - 320px)' }}>
        <table>
          <thead>
            <tr>
              <th className="w-12">#</th>
              {HEADER_FIELDS.map((f) => (
                <th key={f}>{f}</th>
              ))}
              <th>明细 (SKU)</th>
              <th className="w-12">操作</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((o, i) => {
              const hasErr = hasOrderError(o);
              return (
                <tr key={i} className={hasErr ? 'bg-red-50/40' : ''}>
                  <td className="text-gray-400 text-xs">{i + 1}</td>
                  {HEADER_FIELDS.map((f) => (
                    <td key={f} className={hasErr && needsField(o, f) ? 'bg-red-50' : ''}>
                      <input
                        className="cell-input"
                        value={o[f as keyof OrderItem] as string}
                        onChange={(e) => updateOrder(i, f as keyof OrderItem, e.target.value)}
                      />
                    </td>
                  ))}
                  <td>
                    <div className="space-y-1">
                      {o.details.map((d, di) => (
                        <div key={di} className="text-xs flex items-center gap-1">
                          <span className={`px-1.5 ${d.errors.length ? 'bg-red-100 text-red-600' : 'bg-gray-100'} rounded`}>
                            {d.SKU物品编码 || '?'}
                          </span>
                          <span className="text-gray-600 truncate max-w-[120px]">{d.SKU物品名称}</span>
                          <span className="text-gray-400">×{d.SKU发货数量}</span>
                          <span className="text-gray-300 truncate max-w-[80px]">{d.SKU规格型号}</span>
                        </div>
                      ))}
                    </div>
                  </td>
                  <td>
                    <button onClick={() => removeRow(i)} className="text-red-400 hover:text-red-600 text-sm" title="删除">
                      ✕
                    </button>
                  </td>
                </tr>
              );
            })}
            {orders.length === 0 && (
              <tr>
                <td colSpan={HEADER_FIELDS.length + 3} className="text-center text-gray-400 py-8">
                  暂无数据
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* 详情编辑区 (当点击某行时弹出) */}
      {orders.length > 0 && (
        <div className="card">
          <h2 className="font-semibold text-base mb-3">📦 详情编辑(所有订单的明细)</h2>
          <div className="text-xs text-gray-500 mb-3">点击单元格可编辑,系统实时校验</div>
          <div className="table-container" style={{ maxHeight: '400px' }}>
            <table>
              <thead>
                <tr>
                  <th className="w-16">订单#</th>
                  <th>SKU物品编码</th>
                  <th>SKU物品名称</th>
                  <th>SKU发货数量</th>
                  <th>SKU规格型号</th>
                  <th>错误</th>
                </tr>
              </thead>
              <tbody>
                {orders.flatMap((o, oi) =>
                  o.details.map((d, di) => (
                    <tr key={`${oi}-${di}`}>
                      <td className="text-gray-400 text-xs">#{oi + 1}.{di + 1}</td>
                      <td>
                        <input
                          className={`cell-input ${!d.SKU物品编码 ? 'error' : ''}`}
                          value={d.SKU物品编码}
                          onChange={(e) => updateDetail(oi, di, 'SKU物品编码', e.target.value)}
                        />
                      </td>
                      <td>
                        <input
                          className={`cell-input ${!d.SKU物品名称 ? 'error' : ''}`}
                          value={d.SKU物品名称}
                          onChange={(e) => updateDetail(oi, di, 'SKU物品名称', e.target.value)}
                        />
                      </td>
                      <td>
                        <input
                          className={`cell-input ${d.errors.includes('SKU发货数量异常') ? 'error' : ''}`}
                          value={String(d.SKU发货数量)}
                          onChange={(e) => updateDetail(oi, di, 'SKU发货数量', e.target.value)}
                        />
                      </td>
                      <td>
                        <input
                          className="cell-input"
                          value={d.SKU规格型号}
                          onChange={(e) => updateDetail(oi, di, 'SKU规格型号', e.target.value)}
                        />
                      </td>
                      <td>
                        {d.errors.map((e, i) => (
                          <span key={i} className="tag tag-red text-[10px] mr-1">{e}</span>
                        ))}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function hasOrderError(o: OrderItem) {
  if (o.errors.length) return true;
  if (o.details.length === 0) return true;
  return o.details.some((d) => d.errors.length > 0);
}

function needsField(o: OrderItem, field: keyof OrderItem) {
  if (field === '收货门店') return !o.收货门店.trim();
  if (field === '收件人姓名' || field === '收件人电话')
    return !o.收件人姓名.trim() && !o.收件人电话.trim();
  return false;
}

function validate(o: OrderItem) {
  o.errors = [];
  o.warnings = [];
  const hasA = !!o.收货门店?.trim();
  const hasB = !!(o.收件人姓名?.trim() || o.收件人电话?.trim() || o.收件人地址?.trim());
  if (!hasA && !hasB) o.errors.push('门店与收件人至少填一组');
  if (!o.收件人姓名?.trim() && !o.收件人电话?.trim()) {
    o.warnings.push('收件人姓名/电话为空');
  }
  for (const d of o.details) {
    d.errors = [];
    if (!d.SKU物品编码) d.errors.push('SKU编码缺失');
    if (!d.SKU物品名称) d.errors.push('SKU名称缺失');
    const n = Number(d.SKU发货数量);
    if (!d.SKU发货数量 || isNaN(n) || n <= 0) d.errors.push('数量异常');
  }
}
