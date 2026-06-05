'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

interface Rule {
  id: string;
  name: string;
  description?: string;
  fileType: string;
  is_builtin?: boolean;
  is_builtIn?: boolean;
  source?: string;
  rule_json?: any;
}

export default function RulesPage() {
  return (
    <Suspense fallback={<div>加载中...</div>}>
      <RulesInner />
    </Suspense>
  );
}

function RulesInner() {
  const router = useRouter();
  const sp = useSearchParams();
  const [rules, setRules] = useState<Rule[]>([]);
  const [editing, setEditing] = useState<Rule | null>(null);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  useEffect(() => {
    load();
    if (sp.get('draft') === '1') {
      const raw = sessionStorage.getItem('aiDraftRule');
      if (raw) {
        try {
          setEditing(JSON.parse(raw));
        } catch {}
      }
    }
  }, []);

  async function load() {
    const res = await fetch('/api/rules');
    const j = await res.json();
    if (j.ok) setRules(j.rules);
  }

  async function saveRule() {
    if (!editing) return;
    const res = await fetch('/api/rules', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rule: editing })
    });
    const j = await res.json();
    if (j.ok) {
      setToast({ type: 'success', msg: '规则已保存' });
      sessionStorage.removeItem('aiDraftRule');
      setEditing(null);
      load();
    } else {
      setToast({ type: 'error', msg: j.error });
    }
  }

  async function deleteRule(id: string) {
    if (!confirm('确定删除此规则?')) return;
    const res = await fetch(`/api/rules?id=${id}`, { method: 'DELETE' });
    const j = await res.json();
    if (j.ok) {
      setToast({ type: 'success', msg: '已删除' });
      load();
    } else {
      setToast({ type: 'error', msg: j.error });
    }
  }

  function newRule() {
    setEditing({
      id: `custom-${Date.now()}`,
      name: '新自定义规则',
      description: '',
      fileType: 'xlsx',
      is_builtin: false,
      source: 'manual'
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">规则管理</h1>
          <p className="text-sm text-gray-500 mt-1">管理解析规则,可由 AI 辅助生成</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => router.push('/')} className="btn-ghost">← 返回</button>
          <button onClick={newRule} className="btn-primary">+ 新建规则</button>
        </div>
      </div>

      {toast && (
        <div className={`p-3 rounded-lg text-sm ${toast.type === 'success' ? 'bg-brand-50 text-brand-700' : 'bg-red-50 text-red-600'}`}>
          {toast.msg}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {rules.map((r) => (
          <div key={r.id} className="card flex flex-col gap-2">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="font-semibold flex items-center gap-2">
                  {r.name}
                  {r.is_builtin && <span className="tag">内置</span>}
                  {!r.is_builtin && r.source === 'ai' && <span className="tag tag-orange">AI 生成</span>}
                </div>
                <div className="text-xs text-gray-500 mt-1">{r.description || '-'}</div>
                <div className="text-xs text-gray-400 mt-1">id: {r.id} · 支持: {r.fileType}</div>
              </div>
              <div className="flex gap-1">
                <button
                  onClick={() => setEditing(r)}
                  className="text-brand-600 hover:underline text-xs"
                >
                  查看/编辑
                </button>
                {!r.is_builtin && (
                  <button onClick={() => deleteRule(r.id)} className="text-red-500 hover:underline text-xs">
                    删除
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {editing && (
        <RuleEditor
          rule={editing}
          onChange={setEditing}
          onCancel={() => setEditing(null)}
          onSave={saveRule}
        />
      )}
    </div>
  );
}

function RuleEditor({
  rule,
  onChange,
  onCancel,
  onSave
}: {
  rule: Rule;
  onChange: (r: Rule) => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  const [json, setJson] = useState(() => JSON.stringify(rule, null, 2));
  const [parseError, setParseError] = useState<string | null>(null);

  function updateFromJson(text: string) {
    setJson(text);
    try {
      const parsed = JSON.parse(text);
      onChange(parsed);
      setParseError(null);
    } catch (e: any) {
      setParseError(e.message);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col">
        <div className="p-4 border-b flex items-center justify-between">
          <h2 className="font-semibold">规则编辑 - {rule.name}</h2>
          <div className="flex gap-2">
            <button onClick={onCancel} className="btn-ghost">取消</button>
            <button
              onClick={onSave}
              disabled={!!parseError || rule.is_builtin}
              className="btn-primary disabled:opacity-50"
            >
              保存
            </button>
          </div>
        </div>
        <div className="p-4 flex-1 overflow-auto">
          <div className="text-xs text-gray-500 mb-2">
            此处编辑规则 JSON。AI 生成的规则会标黄,请确认每个字段的映射是否符合预期。
          </div>
          {parseError && (
            <div className="mb-2 p-2 bg-red-50 border border-red-200 text-xs text-red-600 rounded">
              JSON 解析错误: {parseError}
            </div>
          )}
          <textarea
            className="input font-mono text-xs"
            style={{ height: '60vh', resize: 'none' }}
            value={json}
            onChange={(e) => updateFromJson(e.target.value)}
            disabled={rule.is_builtin}
          />
        </div>
      </div>
    </div>
  );
}
