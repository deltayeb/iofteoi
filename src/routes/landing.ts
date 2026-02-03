import { Hono } from 'hono';
import { html } from 'hono/html';

export const landing = new Hono();

const landingPage = html`
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>The International Office for the Exchange of Intelligence</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    body {
      background: #0a0a0a;
      color: #00ff00;
      font-family: 'Courier New', Courier, monospace;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      user-select: none;
      position: relative;
      overflow: hidden;
    }
    body::before {
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background:
        repeating-linear-gradient(
          0deg,
          rgba(0, 0, 0, 0.15),
          rgba(0, 0, 0, 0.15) 1px,
          transparent 1px,
          transparent 2px
        );
      pointer-events: none;
      z-index: 1;
    }
    .container {
      text-align: center;
      padding: 2rem;
      max-width: 600px;
      z-index: 2;
    }
    h1 {
      font-size: 11px;
      font-weight: 400;
      letter-spacing: 0.15em;
      line-height: 1.8;
      text-transform: uppercase;
      text-shadow: 0 0 5px #00ff00, 0 0 10px #00ff00;
    }
    .cursor {
      display: inline-block;
      width: 8px;
      height: 12px;
      background: #00ff00;
      margin-left: 2px;
      animation: blink 1s step-end infinite;
    }
    .status {
      display: none;
      margin-top: 2rem;
      font-size: 10px;
      color: #00aa00;
      animation: fadeIn 0.3s ease;
    }
    .status.visible {
      display: block;
    }
    .status pre {
      text-align: left;
      display: inline-block;
      background: transparent;
      padding: 1rem;
      border: 1px solid #003300;
      color: #00ff00;
      text-shadow: 0 0 3px #00ff00;
    }
    .prompt {
      color: #006600;
      font-size: 9px;
      margin-top: 2rem;
    }
    @keyframes fadeIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }
    @keyframes blink {
      50% { opacity: 0; }
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>The International Office<br>for the Exchange of<br>Intelligence<span class="cursor"></span></h1>
    <div class="prompt">[ click anywhere ]</div>
    <div class="status" id="status">
      <pre id="statusContent"></pre>
    </div>
  </div>
  <script>
    let clicked = false;
    document.body.addEventListener('click', async () => {
      if (clicked) {
        document.getElementById('status').classList.remove('visible');
        document.querySelector('.prompt').style.display = 'block';
        clicked = false;
        return;
      }
      try {
        document.querySelector('.prompt').style.display = 'none';
        const res = await fetch('/api');
        const data = await res.json();
        const manifest = \`> SYSTEM STATUS: \${data.status.toUpperCase()}

The Office is a marketplace for callable intelligence.

Publishers register protocols.
Callers invoke them.
Reliability determines success.

No marketing. No gatekeepers.
Just protocols that work, and those that don't.

[ v\${data.version} ]\`;
        document.getElementById('statusContent').textContent = manifest;
        document.getElementById('status').classList.add('visible');
        clicked = true;
      } catch (e) {
        document.getElementById('statusContent').textContent = '> error: connection failed';
        document.getElementById('status').classList.add('visible');
        clicked = true;
      }
    });
  </script>
</body>
</html>
`;

landing.get('/', (c) => {
  return c.html(landingPage);
});
