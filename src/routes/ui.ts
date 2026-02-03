import { Hono } from 'hono';
import { html } from 'hono/html';

export const ui = new Hono();

const baseStyles = `
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    background: #0a0a0a;
    color: #00ff00;
    font-family: 'Courier New', Courier, monospace;
    font-size: 12px;
    min-height: 100vh;
    padding: 2rem;
  }
  body::before {
    content: '';
    position: fixed;
    top: 0; left: 0; right: 0; bottom: 0;
    background: repeating-linear-gradient(0deg, rgba(0,0,0,0.15), rgba(0,0,0,0.15) 1px, transparent 1px, transparent 2px);
    pointer-events: none;
    z-index: 1000;
  }
  a { color: #00ff00; }
  .container { max-width: 700px; margin: 0 auto; }
  h1 { font-size: 11px; letter-spacing: 0.15em; margin-bottom: 2rem; text-shadow: 0 0 5px #00ff00; }
  h2 { font-size: 11px; letter-spacing: 0.1em; margin: 1.5rem 0 1rem; color: #00aa00; }
  h3 { font-size: 10px; color: #00aa00; margin: 1rem 0 0.5rem; }
  .nav { margin-bottom: 2rem; font-size: 10px; }
  .nav a { margin-right: 1rem; text-decoration: none; }
  .nav a:hover { text-decoration: underline; }
  input, textarea {
    background: #0a0a0a;
    border: 1px solid #003300;
    color: #00ff00;
    padding: 0.5rem;
    width: 100%;
    font-family: inherit;
    font-size: 11px;
    margin-bottom: 0.5rem;
  }
  input:focus, textarea:focus { outline: none; border-color: #00ff00; box-shadow: 0 0 5px #00ff00; }
  button {
    background: #003300;
    border: 1px solid #00ff00;
    color: #00ff00;
    padding: 0.5rem 1rem;
    font-family: inherit;
    font-size: 11px;
    cursor: pointer;
    margin-top: 0.5rem;
  }
  button:hover { background: #004400; }
  .error { color: #ff0000; margin: 0.5rem 0; }
  .success { color: #00ff00; margin: 0.5rem 0; }
  .card { border: 1px solid #003300; padding: 1rem; margin-bottom: 1rem; }
  .muted { color: #006600; }
  .label { color: #006600; font-size: 10px; margin-bottom: 0.25rem; }
  .word-count { font-size: 10px; color: #006600; }
  .word-count.valid { color: #00ff00; }
  .word-count.invalid { color: #ff0000; }
  .stats { display: flex; gap: 2rem; margin: 1rem 0; flex-wrap: wrap; }
  .stat-value { font-size: 14px; text-shadow: 0 0 5px #00ff00; }
  .stat-label { font-size: 9px; color: #006600; }
  pre, code { background: #001100; padding: 0.2rem 0.4rem; font-size: 10px; }
  pre { padding: 1rem; overflow-x: auto; margin: 0.5rem 0; border: 1px solid #003300; }
`;

const publisherNav = (loggedIn: boolean) => `
  <div class="nav">
    <a href="/home">[ HOME ]</a>
    <a href="/ui/docs">[ API DOCS ]</a>
    ${loggedIn ? `
      <a href="/ui/dashboard">[ DASHBOARD ]</a>
      <a href="/ui/publish">[ PUBLISH ]</a>
      <a href="#" onclick="logout()">[ LOGOUT ]</a>
    ` : `
      <a href="/ui/login">[ PUBLISHER LOGIN ]</a>
    `}
  </div>
`;

const authScript = `
  function getToken() { return localStorage.getItem('token'); }
  function setToken(t) { localStorage.setItem('token', t); }
  function setAccount(a) { localStorage.setItem('account', JSON.stringify(a)); }
  function getAccount() { try { return JSON.parse(localStorage.getItem('account')); } catch { return null; } }
  function logout() { localStorage.clear(); window.location.href = '/ui/login'; }
  function requireAuth() { if (!getToken()) window.location.href = '/ui/login'; }
`;

// API Documentation
ui.get('/docs', (c) => {
  return c.html(html`
    <!DOCTYPE html>
    <html><head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>API Docs - The Office</title>
      <style>${baseStyles}</style>
    </head><body>
      <div class="container">
        <h1>THE INTERNATIONAL OFFICE<br>FOR THE EXCHANGE OF INTELLIGENCE</h1>
        ${publisherNav(false)}

        <h2>> API DOCUMENTATION</h2>
        <p class="muted">Base URL: <code>https://iofteoi-production.up.railway.app</code></p>

        <h2>> FOR AI AGENTS (CALLERS)</h2>

        <h3>1. Register an Account</h3>
        <pre>POST /auth/register
Content-Type: application/json

{
  "email": "agent@example.com",
  "password": "your-password"
}

Response: { "account": {...}, "token": "jwt-token" }</pre>

        <h3>2. Browse Available Protocols</h3>
        <pre>GET /protocols
GET /protocols?q=search-term

Response: { "protocols": [...] }</pre>

        <h3>3. Invoke a Protocol</h3>
        <pre>POST /invoke/:protocolId
Authorization: Bearer YOUR_TOKEN
Content-Type: application/json

{
  "input": { "your": "data" },
  "debugSharing": false
}

Response:
  Success: { "invocationId": "...", "status": "SUCCESS", "output": {...} }
  Failure: { "invocationId": "...", "status": "FAILURE", "error": "..." }
  Refused: { "invocationId": "...", "status": "REFUSED", "refusalMessage": "..." }</pre>

        <h3>4. Check Balance</h3>
        <pre>GET /balance
Authorization: Bearer YOUR_TOKEN

Response: { "balance": { "cents": 1000, "dollars": "10.00" } }</pre>

        <h3>5. Report Unusable Output</h3>
        <pre>POST /invoke/invocations/:invocationId/report
Authorization: Bearer YOUR_TOKEN

{ "reason": "Output was malformed" }

Response: { "reported": true, "refunded": true }</pre>

        <h2>> FOR PUBLISHERS</h2>

        <h3>1. Register & Login</h3>
        <p class="muted">Use the <a href="/ui/login">Publisher Portal</a> or the API above.</p>

        <h3>2. Publish a Protocol</h3>
        <pre>POST /protocols
Authorization: Bearer YOUR_TOKEN
Content-Type: application/json

{
  "name": "my-protocol",
  "version": "1.0.0",
  "description": "Exactly seven words describing your protocol",
  "handlerUrl": "https://your-server.com/handler",
  "pricePerInvocationCents": 10,
  "declaredKeywords": ["keyword1", "keyword2"]
}</pre>

        <h3>3. Your Handler Receives</h3>
        <pre>POST https://your-server.com/handler
Content-Type: application/json

{
  "input": { ... },
  "invocationId": "uuid"
}

Your handler should return:
  Success: 200 + JSON output
  Refuse:  422 + { "code": "REASON", "message": "..." }
  Failure: Any other status code</pre>

        <h3>4. View Your Stats</h3>
        <pre>GET /protocols/:id/stats
Authorization: Bearer YOUR_TOKEN

Response: {
  "invocationCount": 150,
  "successRate": "94.5%",
  "refundRate": "2.1%"
}</pre>

        <h2>> RESPONSE CODES</h2>
        <div class="card">
          <code>200</code> Success<br>
          <code>400</code> Bad request / validation error<br>
          <code>401</code> Unauthorized (missing/invalid token)<br>
          <code>402</code> Insufficient balance<br>
          <code>404</code> Not found<br>
          <code>409</code> Conflict (already exists)<br>
          <code>429</code> Rate limited<br>
          <code>502</code> Protocol handler failed
        </div>

        <h2>> RATE LIMITS</h2>
        <div class="card">
          Auth endpoints: 10 requests / 15 min<br>
          Invocations: 200 requests / min<br>
          Other endpoints: 100 requests / min
        </div>

      </div>
    </body></html>
  `);
});

// Publisher Login
ui.get('/login', (c) => {
  return c.html(html`
    <!DOCTYPE html>
    <html><head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Publisher Login - The Office</title>
      <style>${baseStyles}</style>
    </head><body>
      <div class="container">
        <h1>THE INTERNATIONAL OFFICE<br>FOR THE EXCHANGE OF INTELLIGENCE</h1>
        ${publisherNav(false)}
        <h2>> PUBLISHER LOGIN</h2>
        <div id="error" class="error"></div>
        <form id="loginForm">
          <div class="label">EMAIL</div>
          <input type="email" id="email" required>
          <div class="label">PASSWORD</div>
          <input type="password" id="password" required>
          <button type="submit">[ AUTHENTICATE ]</button>
        </form>
        <p style="margin-top:1rem" class="muted">No account? <a href="/ui/register">Register as Publisher</a></p>
      </div>
      <script>
        ${authScript}
        document.getElementById('loginForm').onsubmit = async (e) => {
          e.preventDefault();
          document.getElementById('error').textContent = '';
          try {
            const res = await fetch('/auth/login', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                email: document.getElementById('email').value,
                password: document.getElementById('password').value
              })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            setToken(data.token);
            setAccount(data.account);
            window.location.href = '/ui/dashboard';
          } catch (err) {
            document.getElementById('error').textContent = err.message;
          }
        };
      </script>
    </body></html>
  `);
});

// Publisher Register
ui.get('/register', (c) => {
  return c.html(html`
    <!DOCTYPE html>
    <html><head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Register as Publisher - The Office</title>
      <style>${baseStyles}</style>
    </head><body>
      <div class="container">
        <h1>THE INTERNATIONAL OFFICE<br>FOR THE EXCHANGE OF INTELLIGENCE</h1>
        ${publisherNav(false)}
        <h2>> REGISTER AS PUBLISHER</h2>
        <div id="error" class="error"></div>
        <form id="registerForm">
          <div class="label">EMAIL</div>
          <input type="email" id="email" required>
          <div class="label">PASSWORD (min 8 characters)</div>
          <input type="password" id="password" minlength="8" required>
          <button type="submit">[ CREATE PUBLISHER ACCOUNT ]</button>
        </form>
        <p style="margin-top:1rem" class="muted">Have an account? <a href="/ui/login">Login</a></p>
      </div>
      <script>
        ${authScript}
        document.getElementById('registerForm').onsubmit = async (e) => {
          e.preventDefault();
          document.getElementById('error').textContent = '';
          try {
            const res = await fetch('/auth/register', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                email: document.getElementById('email').value,
                password: document.getElementById('password').value
              })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            setToken(data.token);
            setAccount(data.account);
            window.location.href = '/ui/dashboard';
          } catch (err) {
            document.getElementById('error').textContent = err.message;
          }
        };
      </script>
    </body></html>
  `);
});

// Publisher Dashboard
ui.get('/dashboard', (c) => {
  return c.html(html`
    <!DOCTYPE html>
    <html><head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Publisher Dashboard - The Office</title>
      <style>${baseStyles}</style>
    </head><body>
      <div class="container">
        <h1>THE INTERNATIONAL OFFICE<br>FOR THE EXCHANGE OF INTELLIGENCE</h1>
        ${publisherNav(true)}
        <h2>> PUBLISHER DASHBOARD</h2>
        <div class="stats">
          <div><div class="stat-value" id="earnings">$0.00</div><div class="stat-label">TOTAL EARNINGS</div></div>
          <div><div class="stat-value" id="protocols">0</div><div class="stat-label">PROTOCOLS</div></div>
          <div><div class="stat-value" id="invocations">0</div><div class="stat-label">TOTAL INVOCATIONS</div></div>
        </div>

        <h2>> YOUR PROTOCOLS</h2>
        <div id="protocolList"><span class="muted">Loading...</span></div>
        <p style="margin-top:1rem"><a href="/ui/publish">[ + PUBLISH NEW PROTOCOL ]</a></p>

        <h2>> API TOKEN</h2>
        <div class="card">
          <p class="muted">Use this token to publish protocols via API:</p>
          <pre id="token" style="word-break:break-all"></pre>
        </div>
      </div>
      <script>
        ${authScript}
        requireAuth();

        document.getElementById('token').textContent = getToken();

        async function loadDashboard() {
          const token = getToken();

          const balRes = await fetch('/balance', { headers: { Authorization: 'Bearer ' + token } });
          const balData = await balRes.json();
          document.getElementById('earnings').textContent = '$' + balData.publisherBalance.dollars;

          const protRes = await fetch('/protocols', { headers: { Authorization: 'Bearer ' + token } });
          const protData = await protRes.json();

          const account = getAccount();
          const myProtocols = protData.protocols.filter(p => p.publisherId === account?.id);

          document.getElementById('protocols').textContent = myProtocols.length;

          const totalInvocations = myProtocols.reduce((sum, p) => sum + p.invocationCount, 0);
          document.getElementById('invocations').textContent = totalInvocations;

          if (myProtocols.length === 0) {
            document.getElementById('protocolList').innerHTML = '<span class="muted">No protocols yet. <a href="/ui/publish">Publish your first one.</a></span>';
          } else {
            document.getElementById('protocolList').innerHTML = myProtocols.map(p => \`
              <div class="card">
                <strong>\${p.name}</strong> <span class="muted">v\${p.version}</span><br>
                <span>\${p.description}</span><br>
                <div class="stats" style="margin-top:0.5rem">
                  <div><div class="stat-value">\${p.invocationCount}</div><div class="stat-label">CALLS</div></div>
                  <div><div class="stat-value">$\${(p.pricePerInvocationCents/100).toFixed(2)}</div><div class="stat-label">PRICE</div></div>
                  <div><div class="stat-value">\${p.status}</div><div class="stat-label">STATUS</div></div>
                </div>
                <p class="muted" style="margin-top:0.5rem;font-size:10px">ID: \${p.id}</p>
              </div>
            \`).join('');
          }
        }

        loadDashboard();
      </script>
    </body></html>
  `);
});

// Publish Protocol
ui.get('/publish', (c) => {
  return c.html(html`
    <!DOCTYPE html>
    <html><head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Publish Protocol - The Office</title>
      <style>${baseStyles}</style>
    </head><body>
      <div class="container">
        <h1>THE INTERNATIONAL OFFICE<br>FOR THE EXCHANGE OF INTELLIGENCE</h1>
        ${publisherNav(true)}
        <h2>> PUBLISH PROTOCOL</h2>
        <div id="error" class="error"></div>
        <div id="success" class="success"></div>
        <form id="publishForm">
          <div class="label">NAME</div>
          <input type="text" id="name" required placeholder="my-protocol">

          <div class="label">VERSION</div>
          <input type="text" id="version" required placeholder="1.0.0">

          <div class="label">DESCRIPTION (exactly 7 words - be precise)</div>
          <input type="text" id="description" required placeholder="Converts PDF invoices to structured JSON">
          <div id="wordCount" class="word-count">0/7 words</div>

          <div class="label">LONG DESCRIPTION (optional - for humans)</div>
          <textarea id="longDescription" rows="3" placeholder="Detailed explanation of what your protocol does..."></textarea>

          <div class="label">HANDLER URL (your server endpoint)</div>
          <input type="url" id="handlerUrl" required placeholder="https://your-server.com/handler">
          <p class="muted" style="font-size:9px">We'll POST { input, invocationId } to this URL. Return 200+JSON for success, 422 to refuse.</p>

          <div class="label">PRICE PER INVOCATION (in cents)</div>
          <input type="number" id="price" required min="1" value="10">
          <p class="muted" style="font-size:9px">You receive 85% ($0.085 per call at 10¢). The Office takes 15%.</p>

          <div class="label">KEYWORDS (comma separated, max 10)</div>
          <input type="text" id="keywords" placeholder="pdf, extraction, invoices, json">

          <button type="submit">[ PUBLISH PROTOCOL ]</button>
        </form>
      </div>
      <script>
        ${authScript}
        requireAuth();

        const descInput = document.getElementById('description');
        const wordCountEl = document.getElementById('wordCount');

        descInput.oninput = () => {
          const words = descInput.value.trim().split(/\\s+/).filter(w => w.length > 0).length;
          wordCountEl.textContent = words + '/7 words';
          wordCountEl.className = 'word-count ' + (words === 7 ? 'valid' : 'invalid');
        };

        document.getElementById('publishForm').onsubmit = async (e) => {
          e.preventDefault();
          document.getElementById('error').textContent = '';
          document.getElementById('success').textContent = '';

          const keywords = document.getElementById('keywords').value
            .split(',').map(k => k.trim()).filter(k => k.length > 0);

          try {
            const res = await fetch('/protocols', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + getToken()
              },
              body: JSON.stringify({
                name: document.getElementById('name').value,
                version: document.getElementById('version').value,
                description: document.getElementById('description').value,
                longDescription: document.getElementById('longDescription').value || undefined,
                handlerUrl: document.getElementById('handlerUrl').value,
                pricePerInvocationCents: parseInt(document.getElementById('price').value),
                declaredKeywords: keywords
              })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || data.details?.[0]?.message);
            document.getElementById('success').innerHTML = 'Protocol published!<br>ID: <code>' + data.protocol.id + '</code>';
            document.getElementById('publishForm').reset();
            wordCountEl.textContent = '0/7 words';
          } catch (err) {
            document.getElementById('error').textContent = err.message;
          }
        };
      </script>
    </body></html>
  `);
});
