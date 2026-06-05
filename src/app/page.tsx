'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

interface Rule {
  id: string;
  name: string;
  description?: string;
  fileType: string;
  is_builtin?: boolean;
}

const DEMO_FILES = [
  { name: '黎明屯配送发货单', size: '7KB' },
  { name: '湖南仓发货明细', size: '20KB' },
  { name: '欢乐牧场模板', size: '20KB' },
  { name: '多门店分Sheet出库单', size: '10KB' },
  { name: '门店调拨单(卡片式)', size: '6KB' },
  { name: '黔寨寨配送单(PDF)', size: '228KB' }
];

export default function HomePage() {
  const router = useRouter();
  const [rules, setRules] = useState<Rule[]>([]);
  const [selectedRule, setSelectedRule] = useState<string>('');
  const [file, setFile] = useState<File | null>(null);
  const [parsing, setParsing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [aiGenerating, setAiGenerating] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  useEffect(() => {
    fetch('/api/rules')
      .then((r) => r.json())
      .then((j) => {
        setRules(j.rules ?? []);
        if (j.rules?.[0]) setSelectedRule(j.rules[0].id);
      })
      .catch((e) => setError(e.message));
  }, []);

  async function handleParse() {
    if (!file) {
      setError('请先选择文件');
      return;
    }
    if (!selectedRule && !aiGenerating) {
      setError('请选择规则或先由 AI 生成');
      return;
    }
    setError(null);
    setParsing(true);
    setProgress(0);
    const t = setInterval(() => setProgress((p) => Math.min(p + 5, 90)), 80);

    try {
      const form = new FormData();
      form.append('file', file);
      form.append('ruleId', selectedRule);
      const res = await fetch('/api/parse', { method: 'POST', body: form });
      const json = await res.json();
      clearInterval(t);
      if (!res.ok) throw new Error(json.error ?? '解析失败');
      setProgress(100);
      // 存入 sessionStorage 后跳转到预览
      sessionStorage.setItem('parseResult', JSON.stringify(json));
      sessionStorage.setItem('parseFileName', file.name);
      setTimeout(() => router.push('/preview'), 200);
    } catch (e: any) {
      clearInterval(t);
      setError(e.message);
    } finally {
      setParsing(false);
    }
  }

  async function handleAiGenerate() {
    if (!file) {
      setError('请先选择文件');
      return;
    }
    setError(null);
    setAiGenerating(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch('/api/ai/generate-rule', { method: 'POST', body: form });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'AI 生成失败');
      // 让用户去规则页确认
      sessionStorage.setItem('aiDraftRule', JSON.stringify(json.rule));
      alert('AI 已生成推荐规则,请到"规则管理"页确认并保存');
      router.push('/rules?draft=1');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setAiGenerating(false);
    }
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) setFile(f);
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">导入文件</h1>
        <p className="text-sm text-gray-500 mt-1">
          支持 Excel / Word / PDF / CSV,大模型辅助生成解析规则
        </p>
      </div>

      {/* Step 1: Upload */}
      <div className="card">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-6 h-6 rounded-full bg-brand-500 text-white text-xs flex items-center justify-center font-bold">
            1
          </div>
          <h2 className="font-semibold text-base">选择文件</h2>
        </div>
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition ${
            dragOver ? 'border-brand-500 bg-brand-50/30' : 'border-gray-200 hover:border-brand-300'
          }`}
          onClick={() => document.getElementById('file-input')?.click()}
        >
          <input
            id="file-input"
            type="file"
            accept=".xlsx,.xls,.csv,.docx,.doc,.pdf"
            className="hidden"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
          {file ? (
            <div>
              <div className="text-3xl mb-2">📄</div>
              <div className="font-medium text-gray-800">{file.name}</div>
              <div className="text-xs text-gray-400 mt-1">{(file.size / 1024).toFixed(1)} KB</div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setFile(null);
                }}
                className="mt-3 text-xs text-red-500 hover:underline"
              >
                移除
              </button>
            </div>
          ) : (
            <div>
              <div className="text-4xl mb-2 text-gray-300">⬆</div>
              <div className="text-gray-600">点击或拖拽文件到这里</div>
              <div className="text-xs text-gray-400 mt-2">支持 .xlsx / .csv / .docx / .pdf</div>
            </div>
          )}
        </div>
      </div>

      {/* Step 2: Rule */}
      <div className="card">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-6 h-6 rounded-full bg-brand-500 text-white text-xs flex items-center justify-center font-bold">
            2
          </div>
          <h2 className="font-semibold text-base">选择解析规则</h2>
          <span className="text-xs text-gray-400 ml-2">或由 AI 辅助生成新规则</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {rules.map((r) => (
            <label
              key={r.id}
              className={`p-3 border rounded-lg cursor-pointer transition flex items-start gap-2 ${
                selectedRule === r.id ? 'border-brand-500 bg-brand-50/30' : 'border-gray-200 hover:border-brand-300'
              }`}
            >
              <input
                type="radio"
                name="rule"
                checked={selectedRule === r.id}
                onChange={() => setSelectedRule(r.id)}
                className="mt-1"
              />
              <div className="flex-1">
                <div className="font-medium text-sm flex items-center gap-2">
                  {r.name}
                  {r.is_builtin && <span className="tag">内置</span>}
                </div>
                {r.description && <div className="text-xs text-gray-500 mt-0.5">{r.description}</div>}
                <div className="text-xs text-gray-400 mt-1">支持: {r.fileType}</div>
              </div>
            </label>
          ))}
        </div>
        <div className="mt-4 flex items-center gap-3">
          <button
            onClick={handleAiGenerate}
            disabled={!file || aiGenerating}
            className="btn-secondary disabled:opacity-50"
          >
            {aiGenerating ? <><span className="spinner inline-block align-middle mr-2"></span>AI 分析中...</> : '✨ AI 辅助生成规则'}
          </button>
          <span className="text-xs text-gray-400">分析文件结构并推荐规则,需在"规则管理"确认保存</span>
        </div>
      </div>

      {/* Step 3: Parse */}
      <div className="card">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-6 h-6 rounded-full bg-brand-500 text-white text-xs flex items-center justify-center font-bold">
            3
          </div>
          <h2 className="font-semibold text-base">执行解析</h2>
        </div>
        {error && (
          <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
            ❌ {error}
          </div>
        )}
        {parsing && (
          <div className="mb-3">
            <div className="flex justify-between text-xs text-gray-500 mb-1">
              <span>正在解析...</span>
              <span>{progress}%</span>
            </div>
            <div className="progress-bar">
              <div className="progress-bar-fill" style={{ width: `${progress}%` }} />
            </div>
          </div>
        )}
        <button
          onClick={handleParse}
          disabled={!file || !selectedRule || parsing}
          className="btn-primary disabled:opacity-50"
        >
          {parsing ? '解析中...' : '开始解析 →'}
        </button>
      </div>

      {/* Demo Files Quick Test */}
      <div className="card bg-gradient-to-br from-brand-50/40 to-white">
        <h2 className="font-semibold text-base mb-3">演示文件快速测试</h2>
        <p className="text-xs text-gray-500 mb-3">内置 6 份真实出库单,可直接拖入测试</p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
          {DEMO_FILES.map((d) => (
            <div
              key={d.name}
              className="px-3 py-2 bg-white border border-gray-100 rounded-lg text-xs flex items-center justify-between"
            >
              <span>📄 {d.name}</span>
              <span className="text-gray-400">{d.size}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
