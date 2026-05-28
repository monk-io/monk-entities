/**
 * Cloud Run Multi-Service Demo — Frontend Service
 *
 * Lightweight Express server that renders a task-management SPA.
 * The API_URL env var is wired at deploy time from the API Cloud Run
 * service's state.url — demonstrating service-to-service URL wiring.
 *
 * Env vars (wired from entity state in YAML):
 *   API_URL  — HTTPS endpoint of the API Cloud Run service
 *   PORT     — defaults to 3000 (Cloud Run sets this automatically)
 */

'use strict';

const express = require('express');

const app = express();
const PORT = parseInt(process.env.PORT || '3000', 10);
const API_URL = process.env.API_URL || '';

app.get('/health', (_req, res) => res.json({ ok: true, api_url: API_URL || '(not set)' }));

app.get('/', (_req, res) => {
  // Embed API_URL in the HTML so browser JS can reach it directly.
  // This is the Cloud Run service-to-service URL wiring pattern:
  //   frontend Cloud Run → entity-state get-member("url") → API Cloud Run
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(/* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Task Manager · GCP Cloud Run Demo</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; }
    body { font: 15px/1.5 system-ui, sans-serif; max-width: 700px; margin: 2rem auto; padding: 0 1.2rem; background: #f9fafb; color: #111; }
    h1 { font-size: 1.4rem; margin-bottom: .2rem; }
    .meta { font-size: .8rem; color: #666; margin-bottom: 1.5rem; }
    .meta code { background: #eee; padding: .1em .4em; border-radius: 3px; }
    .card { background: #fff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 1rem 1.2rem; margin-bottom: 1rem; }
    h2 { font-size: 1rem; margin: 0 0 .8rem; }
    .row { display: flex; gap: .5rem; margin-bottom: .8rem; }
    input[type=text] { flex: 1; padding: .4rem .6rem; border: 1px solid #cbd5e1; border-radius: 5px; font-size: 14px; }
    button { padding: .4rem .9rem; border: none; border-radius: 5px; font-size: 13px; cursor: pointer; }
    .btn-primary { background: #2563eb; color: #fff; }
    .btn-primary:hover { background: #1d4ed8; }
    .btn-secondary { background: #e2e8f0; }
    .btn-secondary:hover { background: #cbd5e1; }
    .btn-danger { background: #fee2e2; color: #b91c1c; }
    .btn-danger:hover { background: #fecaca; }
    ul { list-style: none; padding: 0; margin: 0; }
    li { display: flex; align-items: center; gap: .6rem; padding: .35rem 0; border-bottom: 1px solid #f1f5f9; }
    li:last-child { border-bottom: none; }
    .task-title { flex: 1; }
    .task-title.done { text-decoration: line-through; color: #94a3b8; }
    pre { background: #f1f5f9; padding: .6rem .8rem; border-radius: 5px; font-size: 12px; overflow: auto; max-height: 200px; margin: 0; }
    .status { font-size: .8rem; padding: .2rem .5rem; border-radius: 4px; }
    .ok { background: #dcfce7; color: #166534; }
    .err { background: #fee2e2; color: #991b1b; }
  </style>
</head>
<body>
  <h1>📋 Task Manager</h1>
  <p class="meta">GCP Cloud Run multi-service demo · API: <code id="api-url">${API_URL || '(loading…)'}</code> · <span id="health-badge"></span></p>

  <div class="card">
    <h2>Tasks</h2>
    <div class="row">
      <input type="text" id="new-task" placeholder="New task title…" />
      <button class="btn-primary" onclick="createTask()">Add</button>
      <button class="btn-secondary" onclick="loadTasks()">Refresh</button>
    </div>
    <ul id="task-list"></ul>
  </div>

  <div class="card">
    <h2>Batch Export (Cloud Run Job)</h2>
    <p style="font-size:.85rem;color:#555;margin:.3rem 0 .8rem">
      The export job reads all tasks from Cloud SQL and writes a CSV to the Cloud Storage bucket.
      Trigger it via Monk CLI: <code>sudo monk do gcp-cloudrun-multi-service/batch-export-job/execute</code>
    </p>
    <div class="row">
      <button class="btn-primary" onclick="exportNow()">Quick Export (via API)</button>
      <button class="btn-secondary" onclick="loadExports()">List Exports</button>
    </div>
    <pre id="exports">(click List Exports)</pre>
  </div>

  <script>
    const API = ${JSON.stringify(API_URL)};

    async function apiFetch(path, opts = {}) {
      const res = await fetch(API + path, opts);
      if (res.status === 204) return null;
      return res.json();
    }

    async function checkHealth() {
      try {
        const h = await apiFetch('/api/health');
        const badge = document.getElementById('health-badge');
        badge.textContent = h.ok ? '✅ API healthy' : '❌ API unhealthy';
        badge.className = 'status ' + (h.ok ? 'ok' : 'err');
      } catch (e) {
        document.getElementById('health-badge').innerHTML = '<span class="status err">❌ unreachable</span>';
      }
    }

    async function loadTasks() {
      try {
        const tasks = await apiFetch('/api/tasks');
        const ul = document.getElementById('task-list');
        if (!tasks.length) { ul.innerHTML = '<li style="color:#94a3b8">No tasks yet.</li>'; return; }
        ul.innerHTML = tasks.map(t => \`
          <li>
            <input type="checkbox" \${t.done ? 'checked' : ''} onchange="toggleTask(\${t.id})" />
            <span class="task-title \${t.done ? 'done' : ''}">\${escHtml(t.title)}</span>
            <small style="color:#94a3b8">#\${t.id}</small>
            <button class="btn-danger" style="font-size:11px;padding:.2rem .5rem" onclick="deleteTask(\${t.id})">del</button>
          </li>
        \`).join('');
      } catch (e) { console.error(e); }
    }

    async function createTask() {
      const inp = document.getElementById('new-task');
      const title = inp.value.trim();
      if (!title) return;
      await apiFetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title }),
      });
      inp.value = '';
      loadTasks();
    }

    async function toggleTask(id) {
      await apiFetch('/api/tasks/' + id, { method: 'PATCH' });
      loadTasks();
    }

    async function deleteTask(id) {
      await apiFetch('/api/tasks/' + id, { method: 'DELETE' });
      loadTasks();
    }

    async function exportNow() {
      document.getElementById('exports').textContent = 'Exporting…';
      try {
        const r = await apiFetch('/api/exports', { method: 'POST' });
        document.getElementById('exports').textContent = JSON.stringify(r, null, 2);
      } catch (e) {
        document.getElementById('exports').textContent = 'Error: ' + e.message;
      }
    }

    async function loadExports() {
      try {
        const files = await apiFetch('/api/exports');
        document.getElementById('exports').textContent =
          files.length ? JSON.stringify(files, null, 2) : '(no exports yet)';
      } catch (e) {
        document.getElementById('exports').textContent = 'Error: ' + e.message;
      }
    }

    function escHtml(str) {
      return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    }

    document.getElementById('new-task').addEventListener('keydown', e => { if (e.key === 'Enter') createTask(); });

    checkHealth();
    loadTasks();
  </script>
</body>
</html>`);
});

app.listen(PORT, () => console.log(`Frontend listening on :${PORT} — API_URL=${API_URL || '(not set)'}`));

process.on('SIGTERM', () => process.exit(0));
process.on('SIGINT',  () => process.exit(0));
