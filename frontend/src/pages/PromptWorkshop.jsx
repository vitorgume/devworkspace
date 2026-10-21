import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'

const API = import.meta.env.VITE_API_URL || 'http://localhost:8000'

async function apiFetch(path, options) {
  const res = await fetch(`${API}${path}`, { headers: { 'Content-Type': 'application/json' }, ...options })
  if (!res.ok) throw new Error((await res.text()) || `Request failed: ${res.status}`)
  if (res.status === 204) return null
  return res.json()
}

const SETUP_SECTIONS = ['Atue como', 'Projeto', 'Task Geral', 'Ação Imediata']
const EXEC_SECTIONS = [
  'Atue como',
  'Projeto',
  'Contexto Base',
  'Objetivo',
  'Regras de Negócio',
  'Restrições',
  'Output',
]

function sectionsForType(promptType) {
  return promptType === 'setup' ? SETUP_SECTIONS : EXEC_SECTIONS
}

const PLACEHOLDERS = {
  'Atue como': 'Ex: Você é um agente de software senior focado em FastAPI + React',
  Projeto: 'Ex: DevWorkspace',
  'Task Geral': 'Ex: Criar módulo de estimativas e time tracker',
  'Ação Imediata': 'Ex: Leia o contexto e confirme entendimento; não codifique ainda',
  'Contexto Base': 'Ex: Referencie arquivos e trechos relevantes (paths, funções, classes)',
  Objetivo: 'Ex: Implementar endpoints + UI conforme especificação',
  'Regras de Negócio': 'Ex: Cálculo PERT, arredondar horas para cima, margens por complexidade',
  Restrições: 'Ex: Sem framework UI, manter simples, sem websocket',
  Output: 'Ex: Código final + endpoints + instruções de execução',
}

const DEFAULT_SETUP_VALUES = {
  'Atue como':
    'Desenvolvedor Sênior Especialista em Backend Java, Spring Boot, Desenvolvedor Sênior Especialista em React, TypeScript, Tailwind ou Desenvolvedor Sênior Especialista em Wordpress, Wordpress Headless, Astro, Tailwind',
  Projeto:
    'Estamos atuando no Sonar, uma ferramenta que fará analise de call de vendedores e pré-vendedores, utiliza como arquitetura o Clean Architecture. , Estamos atuando no Brightdash, uma ferramenta integrada ao seu CRM e traz métricas importantes para a operação de vendas, no caso estamos no backend desse projeto, que utiliza como arquitetura Clean Architecture. ou Estamos atuando no Site Gume, esse projeto é o site oficial da Gume (a empresa dos projetos que fazemos), ela foi feita em Astro e Tailwind com o Wordpress Headless de arquitetura e backend.',
  'Ação Imediata':
    'Apenas leia os arquivos de contexto que enviarei a seguir e diga "Contexto absorvido". Não gere código ainda.',
}

const DEFAULT_EXEC_VALUES = {
  'Atue como':
    'Desenvolvedor Sênior Especialista em Backend Java, Spring Boot ou Desenvolvedor Sênior Especialista em React, TypeScript, Tailwind',
  Projeto: 'Sonar, Brightdash ou Site Gume',
  Restrições:
    '- Mantenha o padrão Clean Architecture.\n- Siga o padrão das outras classes. ou Mantenha o padrão Layer Architecture.',
  Output: 'Implemente o código',
}

function defaultsForType(promptType) {
  return promptType === 'setup' ? DEFAULT_SETUP_VALUES : DEFAULT_EXEC_VALUES
}

function mergeDefaults(sections, prev, defaults) {
  const next = { ...prev }
  for (const label of sections) {
    const current = (prev[label] || '').trim()
    if (!current && defaults[label]) next[label] = defaults[label]
  }
  return next
}

function makeId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return `w${Date.now()}${Math.random().toString(36).slice(2)}`
}

function newWindowState(promptType = 'setup') {
  return {
    id: makeId(),
    promptType,
    title: '',
    values: mergeDefaults(sectionsForType(promptType), {}, defaultsForType(promptType)),
  }
}

function hasWindowContent(w) {
  if (!w) return false
  if ((w.title || '').trim()) return true
  return Object.values(w.values || {}).some((v) => typeof v === 'string' && v.trim())
}

// Múltiplas "janelas" permitem editar prompts de tasks/projetos diferentes em paralelo
// (uso pensado para multitask com git worktree: um contexto por aba).
const WINDOWS_KEY = 'devworkspace.promptWorkshop.windows.v1'
// Chave usada antes das janelas existirem — mantida só para migração de rascunhos antigos.
const LEGACY_DRAFT_KEY = 'devworkspace.promptWorkshop.draft.v1'

function loadLegacyDraft() {
  try {
    const raw = localStorage.getItem(LEGACY_DRAFT_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return null
    return {
      promptType: parsed.promptType === 'execution' ? 'execution' : 'setup',
      title: typeof parsed.title === 'string' ? parsed.title : '',
      values: parsed.values && typeof parsed.values === 'object' ? parsed.values : {},
    }
  } catch {
    return null
  }
}

function loadWindowsState() {
  try {
    const raw = localStorage.getItem(WINDOWS_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      const rawWindows = Array.isArray(parsed?.windows) ? parsed.windows : []
      const windows = rawWindows
        .filter((w) => w && typeof w === 'object' && typeof w.id === 'string')
        .map((w) => ({
          id: w.id,
          promptType: w.promptType === 'execution' ? 'execution' : 'setup',
          title: typeof w.title === 'string' ? w.title : '',
          values: w.values && typeof w.values === 'object' ? w.values : {},
        }))
      if (windows.length) {
        const activeId = windows.some((w) => w.id === parsed.activeId) ? parsed.activeId : windows[0].id
        return { windows, activeId }
      }
    }
  } catch {
    // estado corrompido: ignora e recomeça com uma janela nova
  }

  // Migração: rascunho antigo (sem abas) vira a primeira janela.
  const legacy = loadLegacyDraft()
  if (hasWindowContent(legacy)) {
    const win = { id: makeId(), promptType: legacy.promptType, title: legacy.title, values: legacy.values }
    try {
      localStorage.removeItem(LEGACY_DRAFT_KEY)
    } catch {
      // nada a fazer
    }
    return { windows: [win], activeId: win.id }
  }

  const fresh = newWindowState('setup')
  return { windows: [fresh], activeId: fresh.id }
}

function saveWindowsState(state) {
  try {
    localStorage.setItem(WINDOWS_KEY, JSON.stringify(state))
  } catch {
    return null
  }
  return Date.now()
}

export default function PromptWorkshop() {
  const navigate = useNavigate()
  const [initial] = useState(loadWindowsState)
  const [windows, setWindows] = useState(initial.windows)
  const [activeId, setActiveId] = useState(initial.activeId)
  const [savedAt, setSavedAt] = useState(null)
  const [busyIds, setBusyIds] = useState(() => new Set())
  const [banners, setBanners] = useState({})

  const active = windows.find((w) => w.id === activeId) || windows[0]
  const sections = sectionsForType(active.promptType)
  const busy = busyIds.has(active.id)
  const banner = banners[active.id] || null

  // Autosave: grava todas as janelas com debounce curto para não escrever a cada tecla.
  const stateRef = useRef({ windows, activeId })
  stateRef.current = { windows, activeId }

  useEffect(() => {
    const timer = setTimeout(() => {
      const at = saveWindowsState({ windows, activeId })
      if (at) setSavedAt(at)
    }, 400)
    return () => clearTimeout(timer)
  }, [windows, activeId])

  // Se a máquina adormece ou a aba é fechada, o debounce pendente é descartado:
  // grava imediatamente ao esconder a página.
  useEffect(() => {
    function flush() {
      if (document.visibilityState === 'hidden') saveWindowsState(stateRef.current)
    }
    function flushNow() {
      saveWindowsState(stateRef.current)
    }
    document.addEventListener('visibilitychange', flush)
    window.addEventListener('pagehide', flushNow)
    return () => {
      document.removeEventListener('visibilitychange', flush)
      window.removeEventListener('pagehide', flushNow)
      flushNow()
    }
  }, [])

  function updateActive(patch) {
    setWindows((prev) => prev.map((w) => (w.id === active.id ? { ...w, ...patch } : w)))
  }

  function setSection(label, content) {
    updateActive({ values: { ...active.values, [label]: content } })
  }

  function changePromptType(nextType) {
    updateActive({
      promptType: nextType,
      values: mergeDefaults(sectionsForType(nextType), active.values, defaultsForType(nextType)),
    })
  }

  function addWindow() {
    const w = newWindowState(active.promptType)
    setWindows((prev) => [...prev, w])
    setActiveId(w.id)
  }

  function closeWindow(id) {
    const target = windows.find((w) => w.id === id)
    if (hasWindowContent(target)) {
      const ok = window.confirm('Esta janela tem conteúdo. Fechar mesmo assim?')
      if (!ok) return
    }
    const idx = windows.findIndex((w) => w.id === id)
    let next = windows.filter((w) => w.id !== id)
    if (next.length === 0) next = [newWindowState('setup')]
    setWindows(next)
    setBanners((prev) => {
      const rest = { ...prev }
      delete rest[id]
      return rest
    })
    if (id === activeId) {
      const fallback = next[idx] || next[idx - 1] || next[0]
      setActiveId(fallback.id)
    }
  }

  async function apply(windowId) {
    const win = windows.find((w) => w.id === windowId)
    if (!win) return
    setBusyIds((prev) => new Set(prev).add(windowId))
    setBanners((prev) => ({ ...prev, [windowId]: null }))
    try {
      const secs = sectionsForType(win.promptType)
      const payload = {
        title: win.title.trim(),
        prompt_type: win.promptType,
        sections: secs.map((label) => ({ label, content: win.values[label] || '' })),
      }
      const res = await apiFetch('/api/prompts/apply', { method: 'POST', body: JSON.stringify(payload) })
      const originalChars = String(res.translated || '').length
      const compressedChars = String(res.compressed || '').length
      const reductionPct = originalChars > 0 ? Math.max(0, Math.round((1 - compressedChars / originalChars) * 100)) : 0
      setBanners((prev) => ({
        ...prev,
        [windowId]: {
          type: 'ok',
          text: `✓ Prompt pushed to MCP — ready for Trae`,
          meta: `Compressed from ${originalChars} to ${compressedChars} chars (${reductionPct}% reduction)`,
          showHistoryLink: true,
        },
      }))
    } catch (e) {
      setBanners((prev) => ({ ...prev, [windowId]: { type: 'err', text: e.message } }))
    } finally {
      setBusyIds((prev) => {
        const next = new Set(prev)
        next.delete(windowId)
        return next
      })
    }
  }

  function clearActive() {
    updateActive({ title: '', values: mergeDefaults(sections, {}, defaultsForType(active.promptType)) })
    setBanners((prev) => ({ ...prev, [active.id]: null }))
  }

  const canApply = active.title.trim() && sections.some((s) => (active.values[s] || '').trim())

  return (
    <div className="page" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <h1 className="pageTitle">Prompt Workshop</h1>

      <div className="tabBar">
        {windows.map((w, i) => {
          const label = w.title.trim() || `Sem título ${i + 1}`
          const isActive = w.id === active.id
          return (
            <div
              key={w.id}
              className={isActive ? 'tab tabActive' : 'tab'}
              onClick={() => setActiveId(w.id)}
              title={label}
            >
              <span className="tabLabel">
                {label}
                {busyIds.has(w.id) ? ' …' : ''}
              </span>
              <button
                type="button"
                className="tabClose"
                title="Fechar janela"
                onClick={(e) => {
                  e.stopPropagation()
                  closeWindow(w.id)
                }}
              >
                ×
              </button>
            </div>
          )
        })}
        <button type="button" className="tabAdd" onClick={addWindow}>
          + Nova janela
        </button>
      </div>

      {banner && (
        <div className={banner.type === 'ok' ? 'bannerOk' : 'bannerErr'}>
          <div>{banner.text}</div>
          {banner.meta && <div className="hint" style={{ marginTop: 6 }}>{banner.meta}</div>}
          {banner.type === 'ok' && banner.showHistoryLink && (
            <div style={{ marginTop: 10 }}>
              <button type="button" className="buttonSecondary" onClick={() => navigate('/history')}>
                View in History
              </button>
            </div>
          )}
        </div>
      )}

      <div className="card">
        <div className="row">
          <div style={{ flex: 1, minWidth: 280 }}>
            <div className="field" style={{ minWidth: 280 }}>
              <span className="label">Title</span>
              <input
                className="input"
                value={active.title}
                onChange={(e) => updateActive({ title: e.target.value })}
                placeholder="CRUD de metas - setup"
              />
            </div>
          </div>
          <div style={{ minWidth: 260 }}>
            <div className="field" style={{ minWidth: 260 }}>
              <span className="label">Prompt type</span>
              <select className="select" value={active.promptType} onChange={(e) => changePromptType(e.target.value)}>
                <option value="setup">Prompt Setup Inicial</option>
                <option value="execution">Prompt Execução fatiada</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="scrollArea">
          {sections.map((label) => (
            <div key={label} className="field" style={{ minWidth: 'auto' }}>
              <span className="label">{label}</span>
              <textarea
                className="textarea"
                rows={4}
                value={active.values[label] || ''}
                placeholder={PLACEHOLDERS[label] || ''}
                onChange={(e) => setSection(label, e.target.value)}
              />
            </div>
          ))}
        </div>
      </div>

      <div className="card" style={{ display: 'flex', gap: 10, alignItems: 'center', justifyContent: 'flex-end' }}>
        <span className="hint" style={{ marginRight: 'auto' }}>
          {savedAt
            ? `Rascunho salvo automaticamente às ${new Date(savedAt).toLocaleTimeString()}`
            : 'Rascunho salvo automaticamente neste navegador'}
        </span>
        <button type="button" className="buttonSecondary" onClick={clearActive} disabled={busy}>
          Clear
        </button>
        <button type="button" className="button" onClick={() => apply(active.id)} disabled={busy || !canApply}>
          {busy ? 'Applying...' : 'Apply'}
        </button>
      </div>
    </div>
  )
}
