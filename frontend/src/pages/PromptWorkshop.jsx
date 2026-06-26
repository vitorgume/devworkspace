import { useEffect, useMemo, useState } from 'react'
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
    'Desenvolvedor Sênior Especialista em Backend Java, Spring Boot ou Desenvolvedor Sênior Especialista em React, TypeScript, Tailwind',
  Projeto:
    'Estamos atuando no Sonar, uma ferramenta que fará analise de call de vendedores e pré-vendedores, utiliza como arquitetura o Clean Architecture. ou Estamos atuando no Brightdash, uma ferramenta integrada ao seu CRM e traz métricas importantes para a operação de vendas, no caso estamos no backend desse projeto, que utiliza como arquitetura Clean Architecture.',
  'Ação Imediata':
    'Apenas leia os arquivos de contexto que enviarei a seguir e diga "Contexto absorvido". Não gere código ainda.',
}

const DEFAULT_EXEC_VALUES = {
  'Atue como':
    'Desenvolvedor Sênior Especialista em Backend Java, Spring Boot ou Desenvolvedor Sênior Especialista em React, TypeScript, Tailwind',
  Projeto: 'Sonar" ou "Brightdash',
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

export default function PromptWorkshop() {
  const navigate = useNavigate()
  const [promptType, setPromptType] = useState('setup')
  const [title, setTitle] = useState('')
  const [values, setValues] = useState({})

  const [busy, setBusy] = useState(false)
  const [banner, setBanner] = useState(null)

  const sections = useMemo(() => (promptType === 'setup' ? SETUP_SECTIONS : EXEC_SECTIONS), [promptType])

  useEffect(() => {
    setValues((prev) => mergeDefaults(sections, prev, defaultsForType(promptType)))
  }, [promptType, sections])

  function setSection(label, content) {
    setValues((prev) => ({ ...prev, [label]: content }))
  }

  async function apply() {
    setBusy(true)
    setBanner(null)
    try {
      const payload = {
        title: title.trim(),
        prompt_type: promptType,
        sections: sections.map((label) => ({ label, content: values[label] || '' })),
      }
      const res = await apiFetch('/api/prompts/apply', { method: 'POST', body: JSON.stringify(payload) })
      const originalChars = String(res.translated || '').length
      const compressedChars = String(res.compressed || '').length
      const reductionPct = originalChars > 0 ? Math.max(0, Math.round((1 - compressedChars / originalChars) * 100)) : 0
      setBanner({
        type: 'ok',
        text: `✓ Prompt pushed to MCP — ready for Trae`,
        meta: `Compressed from ${originalChars} to ${compressedChars} chars (${reductionPct}% reduction)`,
        showHistoryLink: true,
      })
    } catch (e) {
      setBanner({ type: 'err', text: e.message })
    } finally {
      setBusy(false)
    }
  }

  function clearAll() {
    setTitle('')
    setValues(mergeDefaults(sections, {}, defaultsForType(promptType)))
    setBanner(null)
  }

  const canApply = title.trim() && sections.some((s) => (values[s] || '').trim())

  return (
    <div className="page" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <h1 className="pageTitle">Prompt Workshop</h1>

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
              <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="CRUD de metas - setup" />
            </div>
          </div>
          <div style={{ minWidth: 260 }}>
            <div className="field" style={{ minWidth: 260 }}>
              <span className="label">Prompt type</span>
              <select className="select" value={promptType} onChange={(e) => setPromptType(e.target.value)}>
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
                value={values[label] || ''}
                placeholder={PLACEHOLDERS[label] || ''}
                onChange={(e) => setSection(label, e.target.value)}
              />
            </div>
          ))}
        </div>
      </div>

      <div className="card" style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
        <button type="button" className="buttonSecondary" onClick={clearAll} disabled={busy}>
          Clear
        </button>
        <button type="button" className="button" onClick={apply} disabled={busy || !canApply}>
          {busy ? 'Applying...' : 'Apply'}
        </button>
      </div>
    </div>
  )
}
