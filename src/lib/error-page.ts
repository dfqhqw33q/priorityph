export function renderErrorPage(): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>This page didn't load — Priority Handling Logistics, Inc.</title>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      :root {
        --bg: #F8FAFC;
        --card-bg: #FFFFFF;
        --text: #080B3D;
        --text-muted: #64748B;
        --primary: #0000FE;
        --primary-text: #FFFFFF;
        --border: #E2E8F0;
      }
      @media (prefers-color-scheme: dark) {
        :root {
          --bg: #05081E;
          --card-bg: #090E38;
          --text: #F8FAFC;
          --text-muted: #94A3B8;
          --primary: #0000FE;
          --primary-text: #FFFFFF;
          --border: #1A2568;
        }
      }
      body {
        font: 15px/1.5 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        background: var(--bg);
        color: var(--text);
        display: grid;
        place-items: center;
        min-height: 100vh;
        margin: 0;
        padding: 1.5rem;
      }
      .card {
        max-width: 28rem;
        width: 100%;
        text-align: center;
        padding: 2.5rem 2rem;
        background: var(--card-bg);
        border: 1px solid var(--border);
        border-radius: 0.75rem;
        box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
      }
      h1 { font-size: 1.25rem; font-weight: 700; margin: 0 0 0.5rem; color: var(--text); }
      p { color: var(--text-muted); margin: 0 0 1.5rem; font-size: 0.875rem; }
      .actions { display: flex; gap: 0.75rem; justify-content: center; flex-wrap: wrap; }
      a, button {
        padding: 0.5rem 1.25rem;
        border-radius: 0.5rem;
        font: inherit;
        font-size: 0.875rem;
        font-weight: 500;
        cursor: pointer;
        text-decoration: none;
        transition: opacity 0.15s ease;
      }
      a:hover, button:hover { opacity: 0.9; }
      .primary { background: var(--primary); color: var(--primary-text); border: none; }
      .secondary { background: transparent; color: var(--text); border: 1px solid var(--border); }
    </style>
  </head>
  <body>
    <div class="card">
      <h1>This page didn't load</h1>
      <p>Something went wrong on our end. You can try refreshing or head back home.</p>
      <div class="actions">
        <button class="primary" onclick="location.reload()">Try again</button>
        <a class="secondary" href="/">Go home</a>
      </div>
    </div>
  </body>
</html>`;
}
