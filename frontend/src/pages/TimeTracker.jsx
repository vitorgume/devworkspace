import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'

const API = import.meta.env.VITE_API_URL || 'http://localhost:8000'

async function apiFetch(path, options) {
  const res = await fetch(`${API}${path}`, { headers: { 'Content-Type': 'application/json' }, ...options })
  if (!res.ok) throw new Error((await res.text()) || `Request failed: ${res.status}`)
  if (res.status === 204) return null
  return res.json()
}

function formatMMSS(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds))
  const mm = String(Math.floor(s / 60)).padStart(2, '0')
  const ss = String(s % 60).padStart(2, '0')
  return `${mm}:${ss}`
}

function formatHMS(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  if (h === 0 && m === 0) return `${sec} s`
  return sec ? `${h} h ${m} min ${sec} s` : `${h} h ${m} min`
}

function formatHHMMSS(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds))
  const hh = String(Math.floor(s / 3600)).padStart(2, '0')
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0')
  const ss = String(s % 60).padStart(2, '0')
  return `${hh}:${mm}:${ss}`
}

function parseTimeToSeconds(input) {
  const raw = String(input || '').trim()
  if (!raw) return null

  const parts = raw.split(':').map((p) => p.trim())
  if (parts.length < 1 || parts.length > 3) return null

  const nums = parts.map((p) => (p === '' ? NaN : Number(p)))
  if (nums.some((n) => !Number.isFinite(n) || n < 0)) return null

  const ints = nums.map((n) => Math.floor(n))
  if (parts.length === 1) return ints[0]
  if (parts.length === 2) return ints[0] * 60 + ints[1]
  return ints[0] * 3600 + ints[1] * 60 + ints[2]
}

function todayStartMs() {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

function toDatetimeLocalValue(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function datetimeLocalToIso(value) {
  const raw = String(value || '').trim()
  if (!raw) return null
  return raw.length === 16 ? `${raw}:00` : raw
}

export default function TimeTracker() {
  const [projects, setProjects] = useState([])
  const [projectId, setProjectId] = useState('')
  const [tags, setTags] = useState([])
  const [tag, setTag] = useState('')
  const [summary, setSummary] = useState(null)
  const [activeEntries, setActiveEntries] = useState([])
  const [entriesByTaskId, setEntriesByTaskId] = useState({})
  const [expandedTaskIds, setExpandedTaskIds] = useState(() => new Set())
  const [nowTick, setNowTick] = useState(() => Date.now())
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const intervalRef = useRef(null)

  const activeByTaskId = useMemo(() => {
    const map = new Map()
    for (const e of activeEntries) map.set(Number(e.task_id), e)
    return map
  }, [activeEntries])

  useEffect(() => {
    let cancelled = false
    apiFetch('/api/projects')
      .then((data) => !cancelled && setProjects(Array.isArray(data) ? data : []))
      .catch((e) => !cancelled && setError(e.message))
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    if (!projectId) {
      return
    }
    apiFetch(`/api/tasks/tags?project_id=${encodeURIComponent(projectId)}`)
      .then((data) => !cancelled && setTags(Array.isArray(data) ? data : []))
      .catch((e) => !cancelled && setError(e.message))
    return () => {
      cancelled = true
    }
  }, [projectId])

  useEffect(() => {
    let cancelled = false
    apiFetch('/api/timetracker/active')
      .then((data) => !cancelled && setActiveEntries(Array.isArray(data) ? data : []))
      .catch((e) => !cancelled && setError(e.message))
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!projectId) return
    let cancelled = false
    const qs = new URLSearchParams()
    qs.set('project_id', projectId)
    if (tag) qs.set('tag', tag)
    apiFetch(`/api/timetracker/tag-summary?${qs.toString()}`)
      .then((data) => !cancelled && setSummary(data))
      .catch((e) => !cancelled && setError(e.message))
    return () => {
      cancelled = true
    }
  }, [projectId, tag])

  useEffect(() => {
    if (intervalRef.current) clearInterval(intervalRef.current)
    intervalRef.current = setInterval(() => setNowTick(Date.now()), 1000)
    return () => intervalRef.current && clearInterval(intervalRef.current)
  }, [])

  const elapsedSecondsSince = useCallback(
    (startedAtIso, mode) => {
      const startMs = new Date(startedAtIso).getTime()
      const endMs = nowTick
      if (mode === 'today') return Math.max(0, Math.floor((endMs - Math.max(startMs, todayStartMs())) / 1000))
      return Math.max(0, Math.floor((endMs - startMs) / 1000))
    },
    [nowTick]
  )

  const computed = useMemo(() => {
    const tasks = Array.isArray(summary?.tasks) ? summary.tasks : []
    const tasksWithLive = tasks.map((t) => {
      const active = activeByTaskId.get(Number(t.task_id))
      const activeElapsed = active ? elapsedSecondsSince(active.started_at, 'all') : 0
      const activeTodayElapsed = active ? elapsedSecondsSince(active.started_at, 'today') : 0
      return {
        ...t,
        live_active_seconds: activeElapsed,
        live_today_seconds: activeTodayElapsed,
        live_worked_seconds: Number(t.worked_seconds || 0) + activeElapsed,
        live_worked_today_seconds: Number(t.worked_today_seconds || 0) + activeTodayElapsed,
      }
    })
    const totalWorkedSeconds = tasksWithLive.reduce((sum, t) => sum + (Number(t.live_worked_seconds) || 0), 0)
    const totalEstimatedHours = Number(summary?.total_estimated_hours || 0)
    const totalEstimatedSeconds = totalEstimatedHours * 3600
    const remainingSeconds = Math.max(0, totalEstimatedSeconds - totalWorkedSeconds)
    return { tasks: tasksWithLive, totalWorkedSeconds, totalEstimatedHours, totalEstimatedSeconds, remainingSeconds }
  }, [summary, activeByTaskId, elapsedSecondsSince])

  async function startTask(taskId) {
    setBusy(true)
    setError('')
    try {
      await apiFetch('/api/timetracker/start', { method: 'POST', body: JSON.stringify({ task_id: Number(taskId) }) })
      setActiveEntries(await apiFetch('/api/timetracker/active'))
      if (expandedTaskIds.has(Number(taskId))) {
        const entries = await apiFetch(`/api/timetracker/task/${encodeURIComponent(taskId)}/entries`)
        setEntriesByTaskId((prev) => ({ ...prev, [Number(taskId)]: Array.isArray(entries) ? entries : [] }))
      }
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  async function pauseEntry(entry) {
    setBusy(true)
    setError('')
    try {
      await apiFetch('/api/timetracker/pause', { method: 'POST', body: JSON.stringify({ entry_id: Number(entry.id) }) })
      setActiveEntries(await apiFetch('/api/timetracker/active'))
      if (projectId) {
        const qs = new URLSearchParams()
        qs.set('project_id', projectId)
        if (tag) qs.set('tag', tag)
        setSummary(await apiFetch(`/api/timetracker/tag-summary?${qs.toString()}`))
      }
      if (expandedTaskIds.has(Number(entry.task_id))) {
        const entries = await apiFetch(`/api/timetracker/task/${encodeURIComponent(entry.task_id)}/entries`)
        setEntriesByTaskId((prev) => ({ ...prev, [Number(entry.task_id)]: Array.isArray(entries) ? entries : [] }))
      }
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  async function toggleEntries(taskId) {
    const id = Number(taskId)
    const next = new Set(expandedTaskIds)
    if (next.has(id)) {
      next.delete(id)
      setExpandedTaskIds(next)
      return
    }
    next.add(id)
    setExpandedTaskIds(next)
    try {
      const entries = await apiFetch(`/api/timetracker/task/${encodeURIComponent(id)}/entries`)
      setEntriesByTaskId((prev) => ({ ...prev, [id]: Array.isArray(entries) ? entries : [] }))
    } catch (e) {
      setError(e.message)
    }
  }

  async function saveEntry(entryId, taskId, startedAtValue, pausedAtValue) {
    setBusy(true)
    setError('')
    try {
      await apiFetch(`/api/timetracker/entry/${encodeURIComponent(entryId)}`, {
        method: 'PATCH',
        body: JSON.stringify({
          started_at: datetimeLocalToIso(startedAtValue),
          paused_at: datetimeLocalToIso(pausedAtValue),
        }),
      })
      setActiveEntries(await apiFetch('/api/timetracker/active'))
      if (projectId) {
        const qs = new URLSearchParams()
        qs.set('project_id', projectId)
        if (tag) qs.set('tag', tag)
        setSummary(await apiFetch(`/api/timetracker/tag-summary?${qs.toString()}`))
      }
      const entries = await apiFetch(`/api/timetracker/task/${encodeURIComponent(taskId)}/entries`)
      setEntriesByTaskId((prev) => ({ ...prev, [Number(taskId)]: Array.isArray(entries) ? entries : [] }))
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  async function editWorkedToday(taskId, currentLiveTodaySeconds, activeTodaySeconds) {
    const value = window.prompt(
      'Defina o tempo trabalhado hoje (HH:MM:SS ou MM:SS):',
      formatHHMMSS(currentLiveTodaySeconds)
    )
    if (value === null) return
    const desiredTotalSeconds = parseTimeToSeconds(value)
    if (desiredTotalSeconds === null) {
      setError('Formato inválido. Use HH:MM:SS ou MM:SS.')
      return
    }

    const targetPersistedSeconds = Math.max(0, Math.floor(desiredTotalSeconds - Math.max(0, activeTodaySeconds || 0)))

    setBusy(true)
    setError('')
    try {
      await apiFetch(`/api/timetracker/task/${encodeURIComponent(taskId)}/worked-today`, {
        method: 'PATCH',
        body: JSON.stringify({ worked_today_seconds: Number(targetPersistedSeconds) }),
      })
      if (projectId) {
        const qs = new URLSearchParams()
        qs.set('project_id', projectId)
        if (tag) qs.set('tag', tag)
        setSummary(await apiFetch(`/api/timetracker/tag-summary?${qs.toString()}`))
      }
      setActiveEntries(await apiFetch('/api/timetracker/active'))
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  const progress = computed.totalEstimatedSeconds > 0 ? Math.min(1, computed.totalWorkedSeconds / computed.totalEstimatedSeconds) : 0

  return (
    <div className="page" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <h1 className="pageTitle">Time Tracker</h1>

      <div className="card">
        <div className="row">
          <div className="field" style={{ minWidth: 320 }}>
            <span className="label">Project</span>
            <select
              className="select"
              value={projectId}
              onChange={(e) => {
                const next = e.target.value
                setProjectId(next)
                setError('')
                setTag('')
                setTags([])
                setSummary(null)
                setEntriesByTaskId({})
                setExpandedTaskIds(new Set())
              }}
            >
              <option value="">Select...</option>
              {projects.map((p) => (
                <option key={p.id} value={String(p.id)}>{p.name}</option>
              ))}
            </select>
          </div>

          <div className="field" style={{ minWidth: 260 }}>
            <span className="label">Tag</span>
            <select className="select" value={tag} disabled={!projectId} onChange={(e) => setTag(e.target.value)}>
              <option value="">All</option>
              {tags.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="card">
        <table className="table">
          <thead>
            <tr>
              <th className="th">Task</th>
              <th className="th">Estimated</th>
              <th className="th">Worked today</th>
              <th className="th">Timer</th>
              <th className="th"></th>
            </tr>
          </thead>
          <tbody>
            {computed.tasks.map((t) => {
              const active = activeByTaskId.get(Number(t.task_id))
              const workedToday = Number(t.live_worked_today_seconds || 0)
              const isExpanded = expandedTaskIds.has(Number(t.task_id))
              const entries = entriesByTaskId[Number(t.task_id)] || []
              return (
                <Fragment key={t.task_id}>
                  <tr key={t.task_id}>
                    <td className="td">{t.task_name}</td>
                    <td className="td">{Number(t.estimated_hours || 0).toFixed(2)} h</td>
                    <td className="td">
                      <span>{formatHMS(workedToday)}</span>{' '}
                      <button
                        type="button"
                        className="button"
                        disabled={busy}
                        onClick={() => editWorkedToday(t.task_id, workedToday, Number(t.live_today_seconds || 0))}
                      >
                        Edit
                      </button>
                    </td>
                    <td className="td mono">{active ? formatMMSS(t.live_active_seconds) : '00:00'}</td>
                    <td className="td">
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        {active ? (
                          <button type="button" className="button" disabled={busy} onClick={() => pauseEntry(active)}>
                            ⏸ Pause
                          </button>
                        ) : (
                          <button type="button" className="button" disabled={busy} onClick={() => startTask(t.task_id)}>
                            ▶ Play
                          </button>
                        )}
                        <button type="button" className="button" disabled={busy} onClick={() => toggleEntries(t.task_id)}>
                          {isExpanded ? 'Hide entries' : 'Entries'}
                        </button>
                      </div>
                    </td>
                  </tr>
                  {isExpanded && (
                    <tr key={`${t.task_id}-entries`}>
                      <td className="td" colSpan={5}>
                        <div style={{ display: 'grid', gap: 10 }}>
                          {entries.length === 0 ? (
                            <div style={{ color: 'var(--muted)' }}>No entries yet.</div>
                          ) : (
                            entries.map((e) => (
                              <div
                                key={e.id}
                                style={{
                                  display: 'grid',
                                  gridTemplateColumns: '1fr 1fr auto auto',
                                  gap: 8,
                                  alignItems: 'end',
                                }}
                              >
                                <div className="field">
                                  <span className="hint">Start</span>
                                  <input
                                    className="input"
                                    type="datetime-local"
                                    defaultValue={toDatetimeLocalValue(e.started_at)}
                                    id={`start-${e.id}`}
                                  />
                                </div>
                                <div className="field">
                                  <span className="hint">End</span>
                                  <input
                                    className="input"
                                    type="datetime-local"
                                    defaultValue={toDatetimeLocalValue(e.paused_at)}
                                    id={`end-${e.id}`}
                                  />
                                </div>
                                <div className="field" style={{ minWidth: 140 }}>
                                  <span className="hint">Duration</span>
                                  <div className="mono">{formatHHMMSS(Number(e.duration_seconds || 0))}</div>
                                </div>
                                <button
                                  type="button"
                                  className="button"
                                  disabled={busy}
                                  onClick={() => {
                                    const startEl = document.getElementById(`start-${e.id}`)
                                    const endEl = document.getElementById(`end-${e.id}`)
                                    saveEntry(e.id, t.task_id, startEl?.value || '', endEl?.value || '')
                                  }}
                                >
                                  Save
                                </button>
                              </div>
                            ))
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
            {computed.tasks.length === 0 && (
              <tr>
                <td className="td" colSpan={5}>
                  {projectId ? 'No tasks found for this filter.' : 'Select a project to see tasks.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="card">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <div style={{ color: 'var(--muted)' }}>
            Estimated: {computed.totalEstimatedHours.toFixed(2)} h | Worked: {formatHMS(computed.totalWorkedSeconds)} | Remaining: {formatHMS(computed.remainingSeconds)}
          </div>
        </div>
        <div style={{ marginTop: 10 }} className="progressWrap">
          <div className="progressFill" style={{ width: `${Math.round(progress * 100)}%` }}></div>
        </div>
      </div>

      {error && <div className="bannerErr">{error}</div>}
    </div>
  )
}
