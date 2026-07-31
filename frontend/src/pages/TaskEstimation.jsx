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
  const [tasks, setTasks] = useState([])
  const [tags, setTags] = useState([])

  const [projectId, setProjectId] = useState('')
  const [filterTag, setFilterTag] = useState('')

  const [newProjectName, setNewProjectName] = useState('')

  const [taskName, setTaskName] = useState('')
  const [tag, setTag] = useState('')
  const [complexity, setComplexity] = useState('Low')
  const [optimistic, setOptimistic] = useState('')
  const [probable, setProbable] = useState('')
  const [pessimistic, setPessimistic] = useState('')

  const [editingTaskId, setEditingTaskId] = useState(null)
  const [editName, setEditName] = useState('')
  const [editTag, setEditTag] = useState('')
  const [editComplexity, setEditComplexity] = useState('Low')
  const [editOptimistic, setEditOptimistic] = useState('')
  const [editProbable, setEditProbable] = useState('')
  const [editPessimistic, setEditPessimistic] = useState('')

  const [result, setResult] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const totalHours = useMemo(
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
    let cancelled = false
    if (!projectId || projectId === '__new__') return
    Promise.all([
      apiFetch(`/api/tasks?project_id=${encodeURIComponent(projectId)}`),
      apiFetch(`/api/tasks/tags?project_id=${encodeURIComponent(projectId)}`),
    ])
      .then(([tasksData, tagsData]) => {
        if (cancelled) return
        setTasks(Array.isArray(tasksData) ? tasksData : [])
        setTags(Array.isArray(tagsData) ? tagsData : [])
      })
      .catch((e) => !cancelled && setError(e.message))
    return () => {
      cancelled = true
    }
  }, [projectId])

  useEffect(() => {
    if (!projectId || projectId === '__new__') return
    let cancelled = false
    const qs = new URLSearchParams()
    qs.set('project_id', projectId)
    if (filterTag) qs.set('tag', filterTag)
    apiFetch(`/api/tasks?${qs.toString()}`)
      .then((data) => !cancelled && setTasks(Array.isArray(data) ? data : []))
      .catch((e) => !cancelled && setError(e.message))
    return () => {
      cancelled = true
    }
  }, [projectId, filterTag])

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

  async function saveTask() {
    setBusy(true)
    setError('')
    setResult(null)
    try {
      const payload = {
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
      const qs = new URLSearchParams()
      qs.set('project_id', projectId)
      if (filterTag) qs.set('tag', filterTag)
      setTasks(await apiFetch(`/api/tasks?${qs.toString()}`))
      setTags(await apiFetch(`/api/tasks/tags?project_id=${encodeURIComponent(projectId)}`))
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

  async function beginEditTask(task) {
    setEditingTaskId(task.id)
    setEditName(task.name || '')
    setEditTag(task.tag || '')
    setEditComplexity(task.complexity || 'Low')
    setEditOptimistic(String(task.optimistic ?? ''))
    setEditProbable(String(task.probable ?? ''))
    setEditPessimistic(String(task.pessimistic ?? ''))
    setResult(null)
    setError('')
  }

  function cancelEditTask() {
    setEditingTaskId(null)
    setEditName('')
    setEditTag('')
    setEditComplexity('Low')
    setEditOptimistic('')
    setEditProbable('')
    setEditPessimistic('')
  }

  async function saveEditTask() {
    if (!editingTaskId) return
    setBusy(true)
    setError('')
    try {
      const payload = {
        name: editName.trim(),
        tag: editTag.trim() || null,
        complexity: editComplexity,
        optimistic: Number(editOptimistic),
        probable: Number(editProbable),
        pessimistic: Number(editPessimistic),
      }
      await apiFetch(`/api/tasks/${encodeURIComponent(editingTaskId)}`, { method: 'PATCH', body: JSON.stringify(payload) })
      const qs = new URLSearchParams()
      qs.set('project_id', projectId)
      if (filterTag) qs.set('tag', filterTag)
      setTasks(await apiFetch(`/api/tasks?${qs.toString()}`))
      setTags(await apiFetch(`/api/tasks/tags?project_id=${encodeURIComponent(projectId)}`))
      cancelEditTask()
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  const canSaveTask = projectId && projectId !== '__new__' && taskName.trim() && optimistic !== '' && probable !== '' && pessimistic !== ''

  return (
    <div className="page">
      <h1 className="pageTitle">Task Estimation</h1>

      <div className="card">
        <div className="row" style={{ marginBottom: 12 }}>
          <Field label="Project">
            <select
              className="select"
              value={projectId}
              onChange={(e) => {
                const next = e.target.value
                setProjectId(next)
                setResult(null)
                setError('')
                cancelEditTask()
                if (!next || next === '__new__') {
                  setTasks([])
                  setTags([])
                  setFilterTag('')
                } else {
                  setFilterTag('')
                }
              }}
            >
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

          <Field label="Filter tag">
            <select
              className="select"
              value={filterTag}
              disabled={!projectId || projectId === '__new__'}
              onChange={(e) => (setFilterTag(e.target.value), setResult(null), setError(''))}
            >
              <option value="">All</option>
              {tags.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
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

      {editingTaskId && (
        <div className="card" style={{ marginTop: 16 }}>
          <h2 style={{ margin: 0, fontSize: 18 }}>Edit task</h2>
          <div className="row" style={{ marginTop: 12 }}>
            <Field label="Task name" minWidth={320}>
              <input className="input" value={editName} onChange={(e) => setEditName(e.target.value)} />
            </Field>
            <Field label="Tag">
              <input className="input" value={editTag} onChange={(e) => setEditTag(e.target.value)} />
            </Field>
            <Field label="Complexity">
              <select className="select" value={editComplexity} onChange={(e) => setEditComplexity(e.target.value)}>
                <option value="Low">Low</option>
                <option value="Medium">Medium</option>
                <option value="High">High</option>
              </select>
            </Field>
          </div>
          <div className="row" style={{ marginTop: 12 }}>
            <Field label="Optimistic">
              <input className="input" type="number" min="0" value={editOptimistic} onChange={(e) => setEditOptimistic(e.target.value)} />
              <span className="hint">minutes</span>
            </Field>
            <Field label="Probable">
              <input className="input" type="number" min="0" value={editProbable} onChange={(e) => setEditProbable(e.target.value)} />
              <span className="hint">minutes</span>
            </Field>
            <Field label="Pessimistic">
              <input className="input" type="number" min="0" value={editPessimistic} onChange={(e) => setEditPessimistic(e.target.value)} />
              <span className="hint">minutes</span>
            </Field>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}>
              <button
                type="button"
                className="button"
                disabled={
                  busy ||
                  !editName.trim() ||
                  editOptimistic === '' ||
                  editProbable === '' ||
                  editPessimistic === ''
                }
                onClick={saveEditTask}
              >
                Save
              </button>
              <button type="button" className="button" disabled={busy} onClick={cancelEditTask}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

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
              <th className="th"></th>
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
                <td className="td">
                  <button type="button" className="button" disabled={busy} onClick={() => beginEditTask(t)}>
                    Edit
                  </button>
                </td>
              </tr>
            ))}
            <tr>
              <td className="td" style={{ fontWeight: 700 }} colSpan={5}>
                Total estimated hours{filterTag ? ` (${filterTag})` : ''}
              </td>
              <td className="td" style={{ fontWeight: 700 }}>{totalHours.toFixed(2)}</td>
              <td className="td"></td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}
