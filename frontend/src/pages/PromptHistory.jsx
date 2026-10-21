import { Fragment, useEffect, useState } from 'react'
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

// Local calendar day as YYYY-MM-DD, comparable with <input type="date"> values.
function toDateKey(value) {
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function formatType(t) {
  return t === 'execution' ? 'Execution' : 'Setup'
}

function PromptDetails({ details }) {
  return (
    <div className="detailPanel">
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
  )
}

export default function PromptHistory() {
  const navigate = useNavigate()
  const [items, setItems] = useState([])
  const [expandedId, setExpandedId] = useState(null)
  const [details, setDetails] = useState(null)
  const [busyId, setBusyId] = useState(null)
  const [toast, setToast] = useState(null)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  const query = search.trim().toLowerCase()
  const hasFilters = Boolean(query || dateFrom || dateTo)
  const filteredItems = items.filter((it) => {
    if (query && !String(it.title || '').toLowerCase().includes(query)) return false
    if (dateFrom || dateTo) {
      const day = toDateKey(it.created_at)
      if (!day) return false
      if (dateFrom && day < dateFrom) return false
      if (dateTo && day > dateTo) return false
    }
    return true
  })

  function clearFilters() {
    setSearch('')
    setDateFrom('')
    setDateTo('')
  }

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
        <div className="row" style={{ alignItems: 'flex-end', marginBottom: 12 }}>
          <div className="field" style={{ flex: 1 }}>
            <span className="label">Search</span>
            <input
              type="search"
              className="input"
              placeholder="Search by title…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="field" style={{ minWidth: 160 }}>
            <span className="label">From</span>
            <input type="date" className="input" value={dateFrom} max={dateTo || undefined} onChange={(e) => setDateFrom(e.target.value)} />
          </div>
          <div className="field" style={{ minWidth: 160 }}>
            <span className="label">To</span>
            <input type="date" className="input" value={dateTo} min={dateFrom || undefined} onChange={(e) => setDateTo(e.target.value)} />
          </div>
          <button type="button" className="buttonSecondary" disabled={!hasFilters} onClick={clearFilters}>
            Clear
          </button>
        </div>
        {hasFilters && (
          <div className="hint" style={{ marginBottom: 8 }}>
            Showing {filteredItems.length} of {items.length}
          </div>
        )}
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
            {filteredItems.map((it) => {
              const expanded = expandedId === it.id
              return (
                <Fragment key={it.id}>
                  <tr className={expanded ? 'rowExpanded' : undefined}>
                    <td className="td">{it.title}</td>
                    <td className="td">{formatType(it.prompt_type)}</td>
                    <td className="td">{Number(it.compression_ratio || 0).toFixed(2)}x</td>
                    <td className="td">{formatDate(it.created_at)}</td>
                    <td className="td">
                      <div className="row">
                        <button type="button" className="buttonSecondary" onClick={() => toggleView(it.id)}>
                          {expanded ? '▲ Hide' : '👁 View'}
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
                  {expanded && (
                    <tr>
                      <td className="detailCell" colSpan={5}>
                        {details ? <PromptDetails details={details} /> : <div className="hint">Loading…</div>}
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
            {filteredItems.length === 0 && (
              <tr>
                <td className="td" colSpan={5}>
                  {items.length === 0
                    ? 'No prompts yet. Use Prompt Workshop and click Apply.'
                    : 'No prompts match the current filters.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

    </div>
  )
}

