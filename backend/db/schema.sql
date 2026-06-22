CREATE TABLE IF NOT EXISTS projects (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sprints (
  id INT AUTO_INCREMENT PRIMARY KEY,
  project_id INT NOT NULL,
  name VARCHAR(255) NOT NULL,
  start_date DATE NULL,
  end_date DATE NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_sprints_project_id FOREIGN KEY (project_id) REFERENCES projects (id)
);

CREATE TABLE IF NOT EXISTS tasks (
  id INT AUTO_INCREMENT PRIMARY KEY,
  sprint_id INT NOT NULL,
  project_id INT NOT NULL,
  name VARCHAR(255) NOT NULL,
  tag VARCHAR(100) NULL,
  complexity ENUM('Low', 'Medium', 'High') NOT NULL,
  optimistic INT NOT NULL,
  probable INT NOT NULL,
  pessimistic INT NOT NULL,
  pert_minutes FLOAT NULL,
  hours INT NULL,
  margin FLOAT NULL,
  total_hours FLOAT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_tasks_sprint_id FOREIGN KEY (sprint_id) REFERENCES sprints (id),
  CONSTRAINT fk_tasks_project_id FOREIGN KEY (project_id) REFERENCES projects (id)
);

CREATE TABLE IF NOT EXISTS time_entries (
  id INT AUTO_INCREMENT PRIMARY KEY,
  task_id INT NOT NULL,
  started_at DATETIME NOT NULL,
  paused_at DATETIME NULL,
  duration_seconds INT NOT NULL DEFAULT 0,
  CONSTRAINT fk_time_entries_task_id FOREIGN KEY (task_id) REFERENCES tasks (id)
);

CREATE TABLE IF NOT EXISTS prompt_history (
  id INT AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  prompt_type ENUM('setup', 'execution') NOT NULL,
  sections_json TEXT NOT NULL,
  translated TEXT NOT NULL,
  compressed TEXT NOT NULL,
  compression_ratio FLOAT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
