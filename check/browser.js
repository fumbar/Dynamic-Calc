// Drives the real page in headless Chrome over the DevTools protocol, with no
// package install. Serves the repo over HTTP because the app fetches ./backups/*.js.
//
// Unlike the inherited Cypress suite, this fails on any uncaught page exception or
// console error, and it clears storage between pages unless a check asks otherwise.
const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const ROOT = path.join(__dirname, '..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.gif': 'image/gif',
  '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };

const CHROMES = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
];

function serve() {
  const server = http.createServer((req, res) => {
    let rel;
    try {
      rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html';
    } catch (e) {
      // A page can ask for a path that is not valid percent-encoding; answer 400
      // rather than taking the check server down with it.
      res.writeHead(400).end('bad request');
      return;
    }
    const file = path.join(ROOT, rel);
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404).end('not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise(r => server.listen(0, '127.0.0.1', () => r(server)));
}

function launch() {
  const exe = CHROMES.find(fs.existsSync);
  if (!exe) throw new Error('no Chrome or Edge found; see check/browser.js');
  const profile = fs.mkdtempSync(path.join(require('os').tmpdir(), 'calc-check-'));
  const proc = spawn(exe, ['--headless=new', '--disable-gpu', '--no-first-run',
    '--no-default-browser-check', '--remote-debugging-port=0',
    `--user-data-dir=${profile}`, 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
  return new Promise((resolve, reject) => {
    let buf = '';
    const timer = setTimeout(() => reject(new Error('browser did not start')), 30000);
    proc.stderr.on('data', d => {
      buf += d;
      const m = buf.match(/DevTools listening on (ws:\S+)/);
      if (m) { clearTimeout(timer); resolve({ proc, wsUrl: m[1], profile }); }
    });
    proc.on('exit', c => { clearTimeout(timer); reject(new Error('browser exited ' + c)); });
  });
}

class Session {
  constructor(ws) { this.ws = ws; this.id = 0; this.pending = new Map(); this.problems = []; }

  static async attach(wsUrl) {
    const ws = new WebSocket(wsUrl);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
    const s = new Session(ws);
    ws.onmessage = e => s.onMessage(JSON.parse(e.data));
    await s.send('Runtime.enable');
    await s.send('Log.enable');
    await s.send('Page.enable');
    return s;
  }

  onMessage(msg) {
    if (msg.id && this.pending.has(msg.id)) {
      const { resolve, reject } = this.pending.get(msg.id);
      this.pending.delete(msg.id);
      msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
      return;
    }
    if (msg.method === 'Runtime.exceptionThrown') {
      const d = msg.params.exceptionDetails;
      this.problems.push('uncaught: ' + (d.exception && d.exception.description || d.text));
    }
    if (msg.method === 'Log.entryAdded' && msg.params.entry.level === 'error') {
      this.problems.push('console error: ' + msg.params.entry.text + (msg.params.entry.url ? ' <' + msg.params.entry.url + '>' : ''));
    }
  }

  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  // Navigates and waits until `readyExpr` evaluates truthy. Page scripts load data
  // asynchronously, so a load event alone is not enough to start checking.
  async open(url, readyExpr = 'true', timeoutMs = 20000) {
    this.problems = [];
    await this.send('Page.navigate', { url });
    // The previous document keeps answering until the new one commits, and its
    // globals would satisfy readyExpr, so pin the wait to this url.
    await this.waitFor('location.href === ' + JSON.stringify(url) + ' && (' + readyExpr + ')',
      timeoutMs);
  }

  async waitFor(expression, timeoutMs = 20000) {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      try {
        if (await this.eval(expression)) return;
      } catch (e) { /* page still navigating */ }
      if (Date.now() > deadline) throw new Error('timed out waiting for: ' + expression);
      await new Promise(r => setTimeout(r, 100));
    }
  }

  async eval(expression) {
    const r = await this.send('Runtime.evaluate', {
      expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) {
      throw new Error(r.exceptionDetails.exception
        ? r.exceptionDetails.exception.description : r.exceptionDetails.text);
    }
    return r.result.value;
  }

  async clearStorage(origin) {
    await this.send('Storage.clearDataForOrigin',
      { origin, storageTypes: 'local_storage,indexeddb,websql,cookies' });
  }
}

// The stderr URL is the browser-level target, which does not speak Runtime/Page.
// Ask the HTTP endpoint on the same port for a fresh page target instead.
async function pageTarget(browserWsUrl) {
  const port = new URL(browserWsUrl).port;
  const res = await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' });
  const target = await res.json();
  return target.webSocketDebuggerUrl;
}

async function withBrowser(fn) {
  const server = await serve();
  const base = `http://127.0.0.1:${server.address().port}`;
  const { proc, wsUrl, profile } = await launch();
  const session = await Session.attach(await pageTarget(wsUrl));
  try {
    return await fn({ session, base });
  } finally {
    session.ws.close();
    proc.kill();
    server.close();
    try { fs.rmSync(profile, { recursive: true, force: true }); } catch {}
  }
}

module.exports = { withBrowser };
