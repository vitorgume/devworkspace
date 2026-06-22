import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'

const API = import.meta.env.VITE_API_URL || 'http://localhost:8000'

async function apiFetch(path, options) {
  const res = await fetch(`${API}${path}`, { headers: { 'Content-Type': 'application/json' }, ...options })
  if (!res.ok) throw new Error((await res.text()) || `Request failed: ${res.status}`)
  if (res.status === 204) return null
  return res.json()
}

function formatDate(value) {
  try {
    return new Date(value).toLocaleString()
  } catch {
    return String(value || '')
  }
}

function formatType(t) {
  return t === 'execution' ? 'Execution' : 'Setup'
}

export default function PromptHistory() {
  const navigate = useNavigate()
  const [items, setItems] = useState([])
  const [expandedId, setExpandedId] = useState(null)
  const [details, setDetails] = useState(null)
  const [busyId, setBusyId] = useState(null)
  const [toast, setToast] = useState(null)
  const [error, setError] = useState('')

  async function loadList() {
    setError('')
    try {
      const list = await apiFetch('/api/prompts/history')
      setItems(Array.isArray(list) ? list : [])
    } catch (e) {
      setError(e.message)
    }
  }

  useEffect(() => {
    loadList()
  }, [])

  async function toggleView(id) {
    if (expandedId === id) {
      setExpandedId(null)
      setDetails(null)
      return
    }
    setError('')
    setExpandedId(id)
    setDetails(null)
    try {
      const full = await apiFetch(`/api/prompts/history/${id}`)
      setDetails(full)
    } catch (e) {
      setError(e.message)
    }
  }

  async function repush(id) {
    setBusyId(id)
    setError('')
    try {
      await apiFetch(`/api/prompts/history/${id}/repush`, { method: 'POST', body: JSON.stringify({}) })
      setToast('✓ Re-pushed to MCP')
      setTimeout(() => setToast(null), 2500)
    } catch (e) {
      setError(e.message)
    } finally {
      setBusyId(null)
    }
  }

  async function del(id) {
    if (!window.confirm('Delete this prompt from history?')) return
    setBusyId(id)
    setError('')
    try {
      await apiFetch(`/api/prompts/history/${id}`, { method: 'DELETE' })
      if (expandedId === id) {
        setExpandedId(null)
        setDetails(null)
      }
      await loadList()
    } catch (e) {
      setError(e.message)
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="page" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h1 className="pageTitle">Prompt History</h1>
        <button type="button" className="buttonSecondary" onClick={() => navigate('/prompts')}>
          Back to Workshop
        </button>
      </div>

      {toast && <div className="bannerOk">{toast}</div>}
      {error && <div className="bannerErr">{error}</div>}

      <div className="card">
        <table className="table">
          <thead>
            <tr>
              <th className="th">Title</th>
              <th className="th">Type</th>
              <th className="th">Compression</th>
              <th className="th">Date</th>
              <th className="th">Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it) => (
              <tr key={it.id}>
                <td className="td">{it.title}</td>
                <td className="td">{formatType(it.prompt_type)}</td>
                <td className="td">{Number(it.compression_ratio || 0).toFixed(2)}x</td>
                <td className="td">{formatDate(it.created_at)}</td>
                <td className="td">
                  <div className="row">
                    <button type="button" className="buttonSecondary" onClick={() => toggleView(it.id)}>
                      👁 View
                    </button>
                    <button type="button" className="button" disabled={busyId === it.id} onClick={() => repush(it.id)}>
                      🔁 Re-push
                    </button>
                    <button type="button" className="buttonSecondary" disabled={busyId === it.id} onClick={() => del(it.id)}>
                      🗑 Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td className="td" colSpan={5}>
                  No prompts yet. Use Prompt Workshop and click Apply.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {expandedId && details && (
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <div style={{ fontWeight: 700 }}>{details.title}</div>
            <div className="hint">{formatType(details.prompt_type)} • {formatDate(details.created_at)}</div>
          </div>

          <div className="row" style={{ alignItems: 'flex-start' }}>
            <div className="field" style={{ flex: 1, minWidth: 280 }}>
              <span className="label">Sections (original)</span>
              <pre className="textarea mono" style={{ margin: 0, whiteSpace: 'pre-wrap' }}>
                {(() => {
                  try {
                    return JSON.stringify(JSON.parse(details.sections_json || '[]'), null, 2)
                  } catch {
                    return String(details.sections_json || '')
                  }
                })()}
              </pre>
            </div>
          </div>

          <div className="row" style={{ alignItems: 'flex-start' }}>
            <div className="field" style={{ flex: 1, minWidth: 280 }}>
              <span className="label">Translated</span>
              <pre className="textarea mono" style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{details.translated}</pre>
            </div>
            <div className="field" style={{ flex: 1, minWidth: 280 }}>
              <span className="label">Compressed</span>
              <pre className="textarea mono" style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{details.compressed}</pre>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

