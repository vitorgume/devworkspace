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

function shareOf(entry) {
  return Math.max(1, Number(entry?.share_count) || 1)
}

const FILTERS_KEY = 'devworkspace.timeTracker.filters.v1'

function loadSavedFilters() {
  try {
    const raw = localStorage.getItem(FILTERS_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return null
    return {
      projectId: typeof parsed.projectId === 'string' ? parsed.projectId : '',
      tag: typeof parsed.tag === 'string' ? parsed.tag : '',
    }
  } catch {
    return null
  }
}

function saveFilters(filters) {
  try {
    localStorage.setItem(FILTERS_KEY, JSON.stringify(filters))
  } catch {
    // storage indisponível: nada a salvar
  }
}

export default function TimeTracker() {
  const [projects, setProjects] = useState([])
  const [projectId, setProjectId] = useState(() => loadSavedFilters()?.projectId || '')
  const [tags, setTags] = useState([])
  const [tag, setTag] = useState(() => loadSavedFilters()?.tag || '')
  const [summary, setSummary] = useState(null)
  const [activeEntries, setActiveEntries] = useState([])
  const [entriesByTaskId, setEntriesByTaskId] = useState({})
  const [expandedTaskIds, setExpandedTaskIds] = useState(() => new Set())
  const [selectedTaskIds, setSelectedTaskIds] = useState(() => new Set())
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

  useEffect(() => {
    saveFilters({ projectId, tag })
  }, [projectId, tag])

  const refreshSummary = useCallback(async () => {
    if (!projectId) return
    const qs = new URLSearchParams()
    qs.set('project_id', projectId)
    if (tag) qs.set('tag', tag)
    setSummary(await apiFetch(`/api/timetracker/tag-summary?${qs.toString()}`))
  }, [projectId, tag])

  const refreshEntriesFor = useCallback(
    async (taskIds) => {
      const ids = [...new Set(taskIds.map(Number))].filter((id) => expandedTaskIds.has(id))
      if (ids.length === 0) return
      const lists = await Promise.all(
        ids.map((id) => apiFetch(`/api/timetracker/task/${encodeURIComponent(id)}/entries`))
      )
      setEntriesByTaskId((prev) => {
        const next = { ...prev }
        ids.forEach((id, i) => {
          next[id] = Array.isArray(lists[i]) ? lists[i] : []
        })
        return next
      })
    },
    [expandedTaskIds]
  )

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
      const share = shareOf(active)
      // Wall clock burned by the current open segment, and the slice of it that
      // belongs to this task once the parallel session is split.
      const rawElapsed = active ? elapsedSecondsSince(active.started_at, 'all') : 0
      const rawTodayElapsed = active ? elapsedSecondsSince(active.started_at, 'today') : 0
      return {
        ...t,
        share_count: share,
        live_active_seconds: rawElapsed,
        live_active_effective_seconds: rawElapsed / share,
        live_today_seconds: rawTodayElapsed / share,
        live_worked_seconds: Number(t.worked_seconds || 0) + rawElapsed / share,
        live_worked_today_seconds: Number(t.worked_today_seconds || 0) + rawTodayElapsed / share,
        live_raw_worked_today_seconds: Number(t.raw_worked_today_seconds || 0) + rawTodayElapsed,
      }
    })
    const totalWorkedSeconds = tasksWithLive.reduce((sum, t) => sum + (Number(t.live_worked_seconds) || 0), 0)
    const totalEstimatedHours = Number(summary?.total_estimated_hours || 0)
    const totalEstimatedSeconds = totalEstimatedHours * 3600
    const remainingSeconds = Math.max(0, totalEstimatedSeconds - totalWorkedSeconds)
    return { tasks: tasksWithLive, totalWorkedSeconds, totalEstimatedHours, totalEstimatedSeconds, remainingSeconds }
  }, [summary, activeByTaskId, elapsedSecondsSince])

  const taskNameById = useMemo(() => {
    const map = new Map()
    for (const t of computed.tasks) map.set(Number(t.task_id), t.task_name)
    return map
  }, [computed.tasks])

  const session = useMemo(() => {
    const count = activeEntries.length
    if (count === 0) return { count: 0 }
    // Every open segment starts at the same instant, so any of them measures the
    // session's wall clock.
    const clockSeconds = Math.max(
      ...activeEntries.map((e) => elapsedSecondsSince(e.started_at, 'all'))
    )
    return {
      count,
      clockSeconds,
      perTaskSeconds: clockSeconds / count,
      taskIds: activeEntries.map((e) => Number(e.task_id)),
    }
  }, [activeEntries, elapsedSecondsSince])

  const selectedCount = selectedTaskIds.size
  const visibleTaskIds = useMemo(() => computed.tasks.map((t) => Number(t.task_id)), [computed.tasks])
  const allVisibleSelected = visibleTaskIds.length > 0 && visibleTaskIds.every((id) => selectedTaskIds.has(id))

  function toggleSelected(taskId) {
    const id = Number(taskId)
    setSelectedTaskIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleSelectAllVisible() {
    setSelectedTaskIds((prev) => {
      if (visibleTaskIds.every((id) => prev.has(id))) {
        const next = new Set(prev)
        visibleTaskIds.forEach((id) => next.delete(id))
        return next
      }
      return new Set([...prev, ...visibleTaskIds])
    })
  }

  async function runTracking(fn, touchedTaskIds) {
    setBusy(true)
    setError('')
    try {
      const state = await fn()
      const nextActive = Array.isArray(state?.active) ? state.active : []
      setActiveEntries(nextActive)
      await refreshSummary()
      // Re-segmenting closes the old entries of every task in the session, so
      // refresh the expanded ones too, not only the task that was clicked.
      const previouslyActive = activeEntries.map((e) => Number(e.task_id))
      await refreshEntriesFor([
        ...touchedTaskIds.map(Number),
        ...previouslyActive,
        ...nextActive.map((e) => Number(e.task_id)),
      ])
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  async function startTask(taskId) {
    await runTracking(
      () =>
        apiFetch('/api/timetracker/start', {
          method: 'POST',
          body: JSON.stringify({ task_id: Number(taskId) }),
        }),
      [taskId]
    )
  }

  async function startSelected() {
    const ids = [...selectedTaskIds]
    if (ids.length === 0) return
    await runTracking(
      () =>
        apiFetch('/api/timetracker/start-batch', {
          method: 'POST',
          body: JSON.stringify({ task_ids: ids.map(Number) }),
        }),
      ids
    )
  }

  async function pauseEntry(entry) {
    await runTracking(
      () =>
        apiFetch('/api/timetracker/pause', {
          method: 'POST',
          body: JSON.stringify({ entry_id: Number(entry.id) }),
        }),
      [entry.task_id]
    )
  }

  async function pauseAll() {
    await runTracking(() => apiFetch('/api/timetracker/pause-all', { method: 'POST' }), session.taskIds || [])
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

  async function saveEntry(entryId, taskId, startedAtValue, pausedAtValue, shareCountValue) {
    const share = Math.max(1, Math.floor(Number(shareCountValue) || 1))
    setBusy(true)
    setError('')
    try {
      await apiFetch(`/api/timetracker/entry/${encodeURIComponent(entryId)}`, {
        method: 'PATCH',
        body: JSON.stringify({
          started_at: datetimeLocalToIso(startedAtValue),
          paused_at: datetimeLocalToIso(pausedAtValue),
          share_count: share,
        }),
      })
      setActiveEntries(await apiFetch('/api/timetracker/active'))
      await refreshSummary()
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
      await refreshSummary()
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
                setSelectedTaskIds(new Set())
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
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span className="label">Parallel session</span>
            {session.count === 0 ? (
              <span className="hint">
                Nenhum timer rodando. Selecione as tasks que você está tocando em paralelo (worktrees) e inicie todas de uma vez.
              </span>
            ) : (
              <>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
                  <span className="mono" style={{ fontSize: 22 }}>{formatHHMMSS(session.clockSeconds)}</span>
                  <span className="splitBadge">{session.count} task{session.count > 1 ? 's' : ''}</span>
                  {session.count > 1 && (
                    <span className="hint">
                      cada uma recebe 1/{session.count} do relógio &rarr; {formatHHMMSS(session.perTaskSeconds)} até agora
                    </span>
                  )}
                </div>
                <div className="hint">
                  Rodando: {session.taskIds.map((id) => taskNameById.get(id) || `#${id}`).join(' · ')}
                </div>
              </>
            )}
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              type="button"
              className="button"
              disabled={busy || selectedCount === 0}
              onClick={startSelected}
            >
              ▶ Start {selectedCount || ''} selected
            </button>
            <button
              type="button"
              className="buttonSecondary"
              disabled={busy || selectedCount === 0}
              onClick={() => setSelectedTaskIds(new Set())}
            >
              Clear selection
            </button>
            <button
              type="button"
              className="buttonSecondary"
              disabled={busy || session.count === 0}
              onClick={pauseAll}
            >
              ⏸ Pause all
            </button>
          </div>
        </div>
      </div>

      <div className="card">
        <table className="table">
          <thead>
            <tr>
              <th className="th" style={{ width: 36 }}>
                <input
                  type="checkbox"
                  aria-label="Select all tasks"
                  checked={allVisibleSelected}
                  disabled={visibleTaskIds.length === 0}
                  onChange={toggleSelectAllVisible}
                />
              </th>
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
              const rawWorkedToday = Number(t.live_raw_worked_today_seconds || 0)
              const isExpanded = expandedTaskIds.has(Number(t.task_id))
              const isSelected = selectedTaskIds.has(Number(t.task_id))
              const entries = entriesByTaskId[Number(t.task_id)] || []
              return (
                <Fragment key={t.task_id}>
                  <tr key={t.task_id}>
                    <td className="td">
                      <input
                        type="checkbox"
                        aria-label={`Select ${t.task_name}`}
                        checked={isSelected}
                        onChange={() => toggleSelected(t.task_id)}
                      />
                    </td>
                    <td className="td">{t.task_name}</td>
                    <td className="td">{Number(t.estimated_hours || 0).toFixed(2)} h</td>
                    <td className="td">
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <span>{formatHMS(workedToday)}</span>
                        <button
                          type="button"
                          className="button"
                          disabled={busy}
                          onClick={() => editWorkedToday(t.task_id, workedToday, Number(t.live_today_seconds || 0))}
                        >
                          Edit
                        </button>
                      </div>
                      {Math.round(rawWorkedToday) !== Math.round(workedToday) && (
                        <div className="hint">{formatHMS(rawWorkedToday)} de relógio compartilhado</div>
                      )}
                    </td>
                    <td className="td mono">
                      {active ? (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                          {formatMMSS(t.live_active_seconds)}
                          {t.share_count > 1 && <span className="splitBadge">÷{t.share_count}</span>}
                        </span>
                      ) : (
                        '00:00'
                      )}
                    </td>
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
                        <button type="button" className="buttonSecondary" disabled={busy} onClick={() => toggleEntries(t.task_id)}>
                          {isExpanded ? 'Hide entries' : 'Entries'}
                        </button>
                      </div>
                    </td>
                  </tr>
                  {isExpanded && (
                    <tr key={`${t.task_id}-entries`}>
                      <td className="td" colSpan={6}>
                        <div style={{ display: 'grid', gap: 10 }}>
                          {entries.length === 0 ? (
                            <div style={{ color: 'var(--muted)' }}>No entries yet.</div>
                          ) : (
                            entries.map((e) => {
                              const share = shareOf(e)
                              const raw = Number(e.duration_seconds || 0)
                              return (
                                <div
                                  key={e.id}
                                  style={{
                                    display: 'grid',
                                    gridTemplateColumns: '1fr 1fr 90px auto auto',
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
                                  <div className="field" style={{ minWidth: 90 }}>
                                    <span className="hint">Split by</span>
                                    <input
                                      className="input"
                                      type="number"
                                      min="1"
                                      step="1"
                                      defaultValue={share}
                                      id={`share-${e.id}`}
                                    />
                                  </div>
                                  <div className="field" style={{ minWidth: 150 }}>
                                    <span className="hint">Duration (effective)</span>
                                    <div className="mono">
                                      {formatHHMMSS(raw / share)}
                                      {share > 1 && (
                                        <span className="hint"> &nbsp;de {formatHHMMSS(raw)}</span>
                                      )}
                                    </div>
                                  </div>
                                  <button
                                    type="button"
                                    className="button"
                                    disabled={busy}
                                    onClick={() => {
                                      const startEl = document.getElementById(`start-${e.id}`)
                                      const endEl = document.getElementById(`end-${e.id}`)
                                      const shareEl = document.getElementById(`share-${e.id}`)
                                      saveEntry(
                                        e.id,
                                        t.task_id,
                                        startEl?.value || '',
                                        endEl?.value || '',
                                        shareEl?.value || share
                                      )
                                    }}
                                  >
                                    Save
                                  </button>
                                </div>
                              )
                            })
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
                <td className="td" colSpan={6}>
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
        <div className="hint" style={{ marginTop: 8 }}>
          "Worked" já é o tempo rateado: em sessões paralelas a soma das tasks equivale ao relógio real.
        </div>
      </div>

      {error && <div className="bannerErr">{error}</div>}
    </div>
  )
}
