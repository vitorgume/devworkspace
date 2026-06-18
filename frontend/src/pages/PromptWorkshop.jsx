import { useMemo, useState } from 'react'

const API = import.meta.env.VITE_API_URL || 'http://localhost:8000'

async function apiFetch(path, options) {
  const res = await fetch(`${API}${path}`, { headers: { 'Content-Type': 'application/json' }, ...options })
  if (!res.ok) throw new Error((await res.text()) || `Request failed: ${res.status}`)
  if (res.status === 204) return null
  return res.json()
}

const SETUP_SECTIONS = ['Context', 'Current State', 'Goal', 'Constraints', 'Next Steps']
const EXEC_SECTIONS = ['Task', 'Detailed Steps', 'File Targets', 'Constraints', 'Expected Output']

export default function PromptWorkshop() {
  const [promptType, setPromptType] = useState('setup')
  const [title, setTitle] = useState('')
  const [values, setValues] = useState({})

  const [busy, setBusy] = useState(false)
  const [banner, setBanner] = useState(null)

  const sections = useMemo(() => (promptType === 'setup' ? SETUP_SECTIONS : EXEC_SECTIONS), [promptType])

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
      })
    } catch (e) {
      setBanner({ type: 'err', text: e.message })
    } finally {
      setBusy(false)
    }
  }

  function clearAll() {
    setTitle('')
    setValues({})
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
                <option value="setup">Setup Prompt</option>
                <option value="execution">Execution Prompt</option>
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
              <textarea className="textarea" rows={4} value={values[label] || ''} onChange={(e) => setSection(label, e.target.value)} />
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
