'use client';

import { useEffect, useState } from 'react';
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

export default function OrdersPage() {
  const [data, setData] = useState<OrderRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(false);

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

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">已导入运单</h1>
          <p className="text-sm text-gray-500 mt-1">共 {total} 条记录</p>
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
        </div>
      </div>

      <div className="table-container">
        <table>
          <thead>
            <tr>
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
            {data.map((o) => (
              <tr key={o.id}>
                <td className="font-mono text-xs">{o.external_code || '-'}</td>
                <td>{o.store_name || '-'}</td>
                <td>{o.recipient_name || '-'}</td>
                <td>{o.recipient_phone || '-'}</td>
                <td className="max-w-[260px] truncate" title={o.recipient_address}>
                  {o.recipient_address || '-'}
                </td>
                <td className="text-xs">
                  <span className="tag">{o.details?.length ?? 0} 条</span>
                </td>
                <td className="text-xs text-gray-500">
                  {o.source_file} {o.source_sheet ? `· ${o.source_sheet}` : ''}
                </td>
                <td className="text-xs text-gray-500">{new Date(o.created_at).toLocaleString()}</td>
              </tr>
            ))}
            {data.length === 0 && !loading && (
              <tr>
                <td colSpan={8} className="text-center text-gray-400 py-12">
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
