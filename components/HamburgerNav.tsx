'use client'

import { useState } from 'react'
import { Menu, X } from 'lucide-react'

interface Tool { id: string; label: string }

export default function HamburgerNav({ tools }: { tools: Tool[] }) {
  const [isOpen, setIsOpen] = useState(false)

  const btnStyle = {
    backgroundColor: 'rgba(34,211,238,0.12)',
    borderColor:     'rgba(34,211,238,0.45)',
    color:           '#67e8f9',
    boxShadow:       '0 0 8px rgba(34,211,238,0.1)',
  }

  return (
    <div className="relative flex-shrink-0">

      {/* Desktop — horizontal pill buttons */}
      <nav className="hidden md:flex flex-row items-center gap-2">
        {tools.map(tool => (
          <a
            key={tool.id}
            href={`#${tool.id}`}
            className="text-xs font-semibold px-4 py-1.5 rounded-full border transition-all hover:scale-105 whitespace-nowrap"
            style={btnStyle}
          >
            {tool.label}
          </a>
        ))}
      </nav>

      {/* Mobile — hamburger toggle */}
      <button
        className="md:hidden flex items-center justify-center w-8 h-8 rounded-full border transition-all"
        style={btnStyle}
        onClick={() => setIsOpen(o => !o)}
        aria-label="Toggle menu"
      >
        {isOpen ? <X size={14} /> : <Menu size={14} />}
      </button>

      {/* Mobile dropdown */}
      {isOpen && (
        <div
          className="md:hidden absolute right-0 top-10 z-50 flex flex-col gap-2 rounded-xl border p-3 backdrop-blur-xl"
          style={{ backgroundColor: 'rgba(0,0,0,0.85)', borderColor: 'rgba(34,211,238,0.3)' }}
        >
          {tools.map(tool => (
            <a
              key={tool.id}
              href={`#${tool.id}`}
              onClick={() => setIsOpen(false)}
              className="text-xs font-semibold px-4 py-2 rounded-full border transition-all hover:scale-105 whitespace-nowrap text-center"
              style={btnStyle}
            >
              {tool.label}
            </a>
          ))}
        </div>
      )}
    </div>
  )
}
