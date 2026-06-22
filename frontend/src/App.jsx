import PromptHistory from './pages/PromptHistory'
import PromptWorkshop from './pages/PromptWorkshop'
import TaskEstimation from './pages/TaskEstimation'
import TimeTracker from './pages/TimeTracker'
import { NavLink, Navigate, Route, Routes } from 'react-router-dom'

function App() {
  return (
    <div className="appShell">
      <aside className="sidebar">
        <div className="sidebarHeader">DevWorkspace</div>
        <nav className="sidebarNav">
          <NavLink className={({ isActive }) => (isActive ? 'navItem navItemActive' : 'navItem')} to="/prompts">
            🧠 Prompt Workshop
          </NavLink>
          <NavLink className={({ isActive }) => (isActive ? 'navItem navItemActive' : 'navItem')} to="/history">
            📜 Prompt History
          </NavLink>
          <NavLink className={({ isActive }) => (isActive ? 'navItem navItemActive' : 'navItem')} to="/tasks">
            📋 Task Estimation
          </NavLink>
          <NavLink className={({ isActive }) => (isActive ? 'navItem navItemActive' : 'navItem')} to="/tracker">
            ⏱ Time Tracker
          </NavLink>
        </nav>
      </aside>

      <main className="mainContent">
        <Routes>
          <Route path="/" element={<Navigate to="/prompts" replace />} />
          <Route path="/prompts" element={<PromptWorkshop />} />
          <Route path="/history" element={<PromptHistory />} />
          <Route path="/tasks" element={<TaskEstimation />} />
          <Route path="/tracker" element={<TimeTracker />} />
          <Route path="*" element={<Navigate to="/prompts" replace />} />
        </Routes>
      </main>
    </div>
  )
}

export default App
