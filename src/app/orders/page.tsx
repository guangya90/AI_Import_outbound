'use client';

import { Fragment, useEffect, useState } from 'react';
import Link from 'next/link';

interface OrderRow {
  id: number;
  batch_id: string;
  external_code: string;
  store_name: string;
  recipient_name: string;
  recipient_phone: string;
  recipient_address: string;
  remark: string;
  details: any[];
  source_file: string;
  source_sheet: string;
  created_at: string;
}

// 明细行常用字段 (按这个顺序展示, 缺失自动跳过)
const DETAIL_FIELDS = [
  { key: 'SKU物品编码', label: 'SKU 编码' },
  { key: 'SKU物品名称', label: '物品名称' },
  { key: 'SKU规格型号', label: '规格' },
  { key: '物品类别', label: '类别' },
  { key: '订货单位', label: '单位' },
  { key: 'SKU发货数量', label: '发货数量' },
  { key: '数量', label: '数量' }
];

export default function OrdersPage() {
  const [data, setData] = useState<OrderRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(false);
  // 展开的行 id 集合
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  async function load() {
    setLoading(true);
    try {
      const sp = new URLSearchParams();
      if (q) sp.set('q', q);
      sp.set('page', String(page));
      sp.set('pageSize', String(pageSize));
      const res = await fetch(`/api/orders?${sp}`);
      const j = await res.json();
      if (j.ok) {
        setData(j.data);
        setTotal(j.total);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [page]);

  // 切页时折叠状态要清掉, 避免指向不存在的 id
  useEffect(() => {
    setExpanded(new Set());
  }, [page, q]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  function toggleExpand(id: number) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function expandAll() {
    setExpanded(new Set(data.filter((o) => (o.details?.length ?? 0) > 0).map((o) => o.id)));
  }

  function collapseAll() {
    setExpanded(new Set());
  }

  // 取出明细对象里存在的字段, 保持展示顺序
  function getDetailColumns(detail: any) {
    return DETAIL_FIELDS.filter((f) => detail && detail[f.key] != null && detail[f.key] !== '');
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">已导入运单</h1>
          <p className="text-sm text-gray-500 mt-1">
            共 {total} 条记录 · 点击行或「明细」列可展开/收起
          </p>
        </div>
        <div className="flex gap-2">
          <input
            className="input"
            placeholder="搜索外部编码 / 收件人 / 电话"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && (setPage(1), load())}
            style={{ width: 280 }}
          />
          <button onClick={() => { setPage(1); load(); }} className="btn-primary">查询</button>
          {data.length > 0 && (
            <>
              <button onClick={expandAll} className="btn-secondary">全部展开</button>
              <button onClick={collapseAll} className="btn-secondary">全部收起</button>
            </>
          )}
        </div>
      </div>

      <div className="table-container">
        <table>
          <thead>
            <tr>
              <th style={{ width: 36 }}></th>
              <th>外部编码</th>
              <th>收货门店</th>
              <th>收件人</th>
              <th>电话</th>
              <th>收件地址</th>
              <th>明细</th>
              <th>来源</th>
              <th>导入时间</th>
            </tr>
          </thead>
          <tbody>
            {data.map((o) => {
              const isOpen = expanded.has(o.id);
              const hasDetails = (o.details?.length ?? 0) > 0;
              return (
                <Fragment key={o.id}>
                  <tr
                    onClick={() => hasDetails && toggleExpand(o.id)}
                    className={hasDetails ? 'cursor-pointer' : ''}
                    style={{ background: isOpen ? '#f0fafa' : undefined }}
                  >
                    <td onClick={(e) => e.stopPropagation()}>
                      {hasDetails ? (
                        <button
                          onClick={() => toggleExpand(o.id)}
                          className="text-gray-500 hover:text-brand-600 text-sm w-6 h-6 inline-flex items-center justify-center"
                          aria-label={isOpen ? '收起' : '展开'}
                          style={{ transform: isOpen ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }}
                        >
                          ▶
                        </button>
                      ) : null}
                    </td>
                    <td className="font-mono text-xs">{o.external_code || '-'}</td>
                    <td>{o.store_name || '-'}</td>
                    <td>{o.recipient_name || '-'}</td>
                    <td>{o.recipient_phone || '-'}</td>
                    <td className="max-w-[260px] truncate" title={o.recipient_address}>
                      {o.recipient_address || '-'}
                    </td>
                    <td className="text-xs">
                      <span
                        className={`tag ${hasDetails ? 'cursor-pointer hover:bg-brand-100' : ''}`}
                        onClick={(e) => { if (hasDetails) { e.stopPropagation(); toggleExpand(o.id); } }}
                      >
                        {o.details?.length ?? 0} 条
                      </span>
                    </td>
                    <td className="text-xs text-gray-500">
                      {o.source_file} {o.source_sheet ? `· ${o.source_sheet}` : ''}
                    </td>
                    <td className="text-xs text-gray-500">{new Date(o.created_at).toLocaleString()}</td>
                  </tr>
                  {isOpen && hasDetails && (
                    <tr className="bg-brand-50/40">
                      <td></td>
                      <td colSpan={8} className="!py-3">
                        <div className="text-xs text-gray-500 mb-2 px-1">
                          共 {o.details.length} 条明细 · 外部编码 <span className="font-mono">{o.external_code || '-'}</span>
                          {o.remark ? <> · 备注: {o.remark}</> : null}
                        </div>
                        <div className="overflow-auto border border-gray-200 rounded-md bg-white">
                          <table className="w-full text-xs">
                            <thead>
                              <tr>
                                <th className="bg-gray-50 text-gray-600 font-medium px-2 py-1.5 text-left" style={{ width: 50 }}>#</th>
                                {(() => {
                                  // 从第一条明细里取字段, 保证列名稳定
                                  const first = o.details[0] ?? {};
                                  const cols = getDetailColumns(first);
                                  return cols.map((c) => (
                                    <th key={c.key} className="bg-gray-50 text-gray-600 font-medium px-2 py-1.5 text-left whitespace-nowrap">
                                      {c.label}
                                    </th>
                                  ));
                                })()}
                                <th className="bg-gray-50 text-gray-600 font-medium px-2 py-1.5 text-left whitespace-nowrap">原始键</th>
                              </tr>
                            </thead>
                            <tbody>
                              {o.details.map((d: any, idx: number) => {
                                const cols = getDetailColumns(d);
                                return (
                                  <tr key={idx} className="hover:bg-brand-50/30">
                                    <td className="px-2 py-1.5 text-gray-400 border-t border-gray-100">{idx + 1}</td>
                                    {cols.map((c) => (
                                      <td key={c.key} className="px-2 py-1.5 border-t border-gray-100 whitespace-nowrap">
                                        {String(d[c.key])}
                                      </td>
                                    ))}
                                    <td className="px-2 py-1.5 border-t border-gray-100 text-gray-400 text-[10px] font-mono">
                                      {Object.keys(d).filter((k) => k !== 'errors').join(', ')}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
            {data.length === 0 && !loading && (
              <tr>
                <td colSpan={9} className="text-center text-gray-400 py-12">
                  暂无数据 · <Link href="/" className="text-brand-600 hover:underline">去导入文件</Link>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button
            disabled={page === 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="btn-secondary disabled:opacity-50"
          >
            ← 上一页
          </button>
          <span className="text-sm text-gray-500">
            第 {page} / {totalPages} 页
          </span>
          <button
            disabled={page >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            className="btn-secondary disabled:opacity-50"
          >
            下一页 →
          </button>
        </div>
      )}
    </div>
  );
}
