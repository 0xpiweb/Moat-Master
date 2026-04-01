'use client'

import { useState } from 'react'
import MoatOptimizer from './MoatOptimizer'

interface Tool { id: string; label: string }

export default function CommunityTools({
  tools,
  colorRgb,
}: {
  tools: Tool[]
  colorRgb: string
}) {
  const [activeTab, setActiveTab] = useState(tools[0]?.id ?? '')

  return (
    <div>
      {/* ── Tab nav ── bare buttons, no container box ──────────────── */}
      <div className="flex flex-row justify-center space-x-4 mb-8">
        {tools.map(tool => {
          const isActive = activeTab === tool.id
          return (
            <button
              key={tool.id}
              onClick={() => setActiveTab(tool.id)}
              className="px-5 py-2 rounded-lg text-sm font-semibold whitespace-nowrap transition-all"
              style={
                isActive
                  ? { backgroundColor: '#2563eb', color: '#fff', boxShadow: '0 0 14px rgba(37,99,235,0.55)' }
                  : { backgroundColor: 'transparent', color: '#52525b' }
              }
            >
              {tool.label}
            </button>
          )
        })}
      </div>

      {/* ── Tab panels ─────────────────────────────────────────────── */}
      {activeTab === 'calculator' && <MoatOptimizer />}

      {activeTab === 'rewards-checker' && (
        <div
          className="bg-zinc-900/50 backdrop-blur-xl border rounded-2xl p-6 min-h-[180px] flex items-center justify-center"
          style={{ borderColor: `rgba(${colorRgb},0.35)` }}
        >
          <span className="text-zinc-600 text-sm">Reward Checker — Coming soon</span>
        </div>
      )}

      {activeTab === 'moat-explorer' && (
        <div
          className="bg-zinc-900/50 backdrop-blur-xl border rounded-2xl p-6 min-h-[180px] flex items-center justify-center"
          style={{ borderColor: `rgba(${colorRgb},0.35)` }}
        >
          <span className="text-zinc-600 text-sm">Moat Explorer — Coming soon</span>
        </div>
      )}
    </div>
  )
}
