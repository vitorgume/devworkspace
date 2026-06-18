import { useEffect, useMemo, useState } from 'react'

const API = import.meta.env.VITE_API_URL || 'http://localhost:8000'

async function apiFetch(path, options) {
  const res = await fetch(`${API}${path}`, { headers: { 'Content-Type': 'application/json' }, ...options })
  if (!res.ok) throw new Error((await res.text()) || `Request failed: ${res.status}`)
  if (res.status === 204) return null
  return res.json()
}

function Field({ label, children, minWidth = 220 }) {
  return (
    <div className="field" style={{ minWidth }}>
      <span className="label">{label}</span>
      {children}
    </div>
  )
}

export default function TaskEstimation() {
  const [projects, setProjects] = useState([])
  const [sprints, setSprints] = useState([])
  const [tasks, setTasks] = useState([])

  const [projectId, setProjectId] = useState('')
  const [sprintId, setSprintId] = useState('')

  const [newProjectName, setNewProjectName] = useState('')
  const [newSprintName, setNewSprintName] = useState('')
  const [newSprintStart, setNewSprintStart] = useState('')
  const [newSprintEnd, setNewSprintEnd] = useState('')

  const [taskName, setTaskName] = useState('')
  const [tag, setTag] = useState('')
  const [complexity, setComplexity] = useState('Low')
  const [optimistic, setOptimistic] = useState('')
  const [probable, setProbable] = useState('')
  const [pessimistic, setPessimistic] = useState('')

  const [result, setResult] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const sprintTotalHours = useMemo(
    () => tasks.reduce((sum, t) => sum + (Number(t.total_hours) || 0), 0),
    [tasks]
  )

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
    if (!projectId || projectId === '__new__') {
      setSprints([])
      setSprintId('')
      return
    }
    let cancelled = false
    apiFetch(`/api/sprints?project_id=${encodeURIComponent(projectId)}`)
      .then((data) => !cancelled && setSprints(Array.isArray(data) ? data : []))
      .catch((e) => !cancelled && setError(e.message))
    return () => {
      cancelled = true
    }
  }, [projectId])

  useEffect(() => {
    if (!sprintId || sprintId === '__new__') {
      setTasks([])
      return
    }
    let cancelled = false
    apiFetch(`/api/tasks?sprint_id=${encodeURIComponent(sprintId)}`)
      .then((data) => !cancelled && setTasks(Array.isArray(data) ? data : []))
      .catch((e) => !cancelled && setError(e.message))
    return () => {
      cancelled = true
    }
  }, [sprintId])

  async function createProject() {
    setBusy(true)
    setError('')
    try {
      const created = await apiFetch('/api/projects', { method: 'POST', body: JSON.stringify({ name: newProjectName.trim() }) })
      setProjects(await apiFetch('/api/projects'))
      setProjectId(String(created.id))
      setNewProjectName('')
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  async function createSprint() {
    setBusy(true)
    setError('')
    try {
      const body = { project_id: Number(projectId), name: newSprintName.trim(), start_date: newSprintStart || null, end_date: newSprintEnd || null }
      const created = await apiFetch('/api/sprints', { method: 'POST', body: JSON.stringify(body) })
      setSprints(await apiFetch(`/api/sprints?project_id=${encodeURIComponent(projectId)}`))
      setSprintId(String(created.id))
      setNewSprintName('')
      setNewSprintStart('')
      setNewSprintEnd('')
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  async function saveTask() {
    setBusy(true)
    setError('')
    setResult(null)
    try {
      const payload = {
        sprint_id: Number(sprintId),
        project_id: Number(projectId),
        name: taskName.trim(),
        tag: tag.trim() || null,
        complexity,
        optimistic: Number(optimistic),
        probable: Number(probable),
        pessimistic: Number(pessimistic),
      }
      const created = await apiFetch('/api/tasks', { method: 'POST', body: JSON.stringify(payload) })
      setResult(created)
      setTasks(await apiFetch(`/api/tasks?sprint_id=${encodeURIComponent(sprintId)}`))
      setTaskName('')
      setTag('')
      setOptimistic('')
      setProbable('')
      setPessimistic('')
      setComplexity('Low')
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  const canSaveTask =
    projectId && sprintId && projectId !== '__new__' && sprintId !== '__new__' && taskName.trim() && optimistic !== '' && probable !== '' && pessimistic !== ''

  return (
    <div className="page">
      <h1 className="pageTitle">Task Estimation</h1>

      <div className="card">
        <div className="row" style={{ marginBottom: 12 }}>
          <Field label="Project">
            <select className="select" value={projectId} onChange={(e) => (setProjectId(e.target.value), setResult(null), setError(''))}>
              <option value="">Select...</option>
              {projects.map((p) => (
                <option key={p.id} value={String(p.id)}>{p.name}</option>
              ))}
              <option value="__new__">+ New</option>
            </select>
            {projectId === '__new__' && (
              <div className="row">
                <input className="input" placeholder="Project name" value={newProjectName} onChange={(e) => setNewProjectName(e.target.value)} />
                <button type="button" className="button" disabled={busy || !newProjectName.trim()} onClick={createProject}>Create</button>
              </div>
            )}
          </Field>

          <Field label="Sprint">
            <select className="select" value={sprintId} disabled={!projectId || projectId === '__new__'} onChange={(e) => (setSprintId(e.target.value), setResult(null), setError(''))}>
              <option value="">Select...</option>
              {sprints.map((s) => (
                <option key={s.id} value={String(s.id)}>{s.name}</option>
              ))}
              <option value="__new__">+ New</option>
            </select>
            {sprintId === '__new__' && (
              <div style={{ display: 'grid', gap: 8 }}>
                <input className="input" placeholder="Sprint name" value={newSprintName} onChange={(e) => setNewSprintName(e.target.value)} />
                <div className="row">
                  <div className="field" style={{ minWidth: 220 }}>
                    <span className="hint">Start date</span>
                    <input className="input" type="date" value={newSprintStart} onChange={(e) => setNewSprintStart(e.target.value)} />
                  </div>
                  <div className="field" style={{ minWidth: 220 }}>
                    <span className="hint">End date</span>
                    <input className="input" type="date" value={newSprintEnd} onChange={(e) => setNewSprintEnd(e.target.value)} />
                  </div>
                </div>
                <button type="button" className="button" disabled={busy || !newSprintName.trim()} onClick={createSprint}>Create</button>
              </div>
            )}
          </Field>
        </div>

        <div className="row" style={{ marginBottom: 12 }}>
          <Field label="Task name" minWidth={320}>
            <input className="input" value={taskName} onChange={(e) => setTaskName(e.target.value)} />
          </Field>
          <Field label="Tag">
            <input className="input" placeholder="v0.6.0" value={tag} onChange={(e) => setTag(e.target.value)} />
          </Field>
          <Field label="Complexity">
            <select className="select" value={complexity} onChange={(e) => setComplexity(e.target.value)}>
              <option value="Low">Low</option>
              <option value="Medium">Medium</option>
              <option value="High">High</option>
            </select>
          </Field>
        </div>

        <div className="row">
          <Field label="Optimistic">
            <input className="input" type="number" min="0" value={optimistic} onChange={(e) => setOptimistic(e.target.value)} />
            <span className="hint">minutes</span>
          </Field>
          <Field label="Probable">
            <input className="input" type="number" min="0" value={probable} onChange={(e) => setProbable(e.target.value)} />
            <span className="hint">minutes</span>
          </Field>
          <Field label="Pessimistic">
            <input className="input" type="number" min="0" value={pessimistic} onChange={(e) => setPessimistic(e.target.value)} />
            <span className="hint">minutes</span>
          </Field>
          <div style={{ display: 'flex', alignItems: 'flex-end' }}>
            <button type="button" className="button" disabled={busy || !canSaveTask} onClick={saveTask}>
              Calculate &amp; Save
            </button>
          </div>
        </div>

        {result && (
          <div style={{ marginTop: 12, color: 'var(--muted)' }}>
            PERT: {Number(result.pert_minutes).toFixed(2)} min | Hours: {result.hours} h | Margin: {Number(result.margin).toFixed(2)} h | Total: {Number(result.total_hours).toFixed(2)} h
          </div>
        )}
        {error && <div className="bannerErr" style={{ marginTop: 12 }}>{error}</div>}
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <h2 style={{ margin: 0, fontSize: 18 }}>Tasks</h2>
        <table className="table" style={{ marginTop: 12 }}>
          <thead>
            <tr>
              <th className="th">Task</th>
              <th className="th">Tag</th>
              <th className="th">Complexity</th>
              <th className="th">Hours</th>
              <th className="th">Margin</th>
              <th className="th">Total</th>
            </tr>
          </thead>
          <tbody>
            {tasks.map((t) => (
              <tr key={t.id}>
                <td className="td">{t.name}</td>
                <td className="td">{t.tag || ''}</td>
                <td className="td">{t.complexity}</td>
                <td className="td">{t.hours}</td>
                <td className="td">{Number(t.margin).toFixed(2)}</td>
                <td className="td">{Number(t.total_hours).toFixed(2)}</td>
              </tr>
            ))}
            <tr>
              <td className="td" style={{ fontWeight: 700 }} colSpan={5}>Sprint total estimated hours</td>
              <td className="td" style={{ fontWeight: 700 }}>{sprintTotalHours.toFixed(2)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}
