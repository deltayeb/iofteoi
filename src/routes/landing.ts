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
      background: #000;
      color: #fff;
      font-family: 'Times New Roman', Times, serif;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      user-select: none;
    }
    .container {
      text-align: center;
      padding: 2rem;
      max-width: 800px;
    }
    h1 {
      font-size: clamp(1.5rem, 5vw, 3rem);
      font-weight: 400;
      letter-spacing: 0.1em;
      line-height: 1.4;
      text-transform: uppercase;
    }
    .status {
      display: none;
      margin-top: 3rem;
      font-family: monospace;
      font-size: 0.9rem;
      color: #888;
      animation: fadeIn 0.3s ease;
    }
    .status.visible {
      display: block;
    }
    .status pre {
      text-align: left;
      display: inline-block;
      background: #111;
      padding: 1.5rem;
      border: 1px solid #333;
    }
    @keyframes fadeIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>The International Office<br>for the Exchange<br>of Intelligence</h1>
    <div class="status" id="status">
      <pre id="statusContent"></pre>
    </div>
  </div>
  <script>
    let clicked = false;
    document.body.addEventListener('click', async () => {
      if (clicked) {
        document.getElementById('status').classList.remove('visible');
        clicked = false;
        return;
      }
      try {
        const res = await fetch('/');
        const data = await res.json();
        document.getElementById('statusContent').textContent = JSON.stringify(data, null, 2);
        document.getElementById('status').classList.add('visible');
        clicked = true;
      } catch (e) {
        document.getElementById('statusContent').textContent = 'Error fetching status';
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
