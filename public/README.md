# Multiplayer Sudoku

A browser-based Sudoku game with single-player and multiplayer race modes.

This repository contains static HTML/CSS/JS files. The single-player game runs entirely in the browser. Multiplayer requires a WebSocket server (see below).

## Quick Start (Local)

1. Open `index.html` in your browser (double-click). This works for quick testing.

2. Recommended (serve over HTTP to avoid some browser restrictions):

- Using Python 3 (Windows PowerShell):

```powershell
# From the project root (where index.html is located)
python -m http.server 8000
# Open http://localhost:8000 in your browser
```

- Or using a quick Node static server (if you have Node installed):

```powershell
npx http-server . -p 8000
# Open http://localhost:8000
```

3. Click "Start Game" on the homepage to play.

## Deploy (GitHub Pages)

1. Push this repository to GitHub.
2. In your repository on GitHub: Settings → Pages.
3. Under "Build and deployment" choose the branch (usually `master` or `main`) and folder `/ (root)` then Save.
4. After a minute the site will be available at:

```
https://<your-github-username>.github.io/<repo-name>/
```

Notes:
- `index.html` must be at the repository root (it is).
- If CSS/JS assets appear missing on the live site, check the browser DevTools Network tab for 404s and confirm the files are referenced with relative paths (they are by default).

## Multiplayer (requires server)

The client expects a WebSocket server for multiplayer. GitHub Pages only serves static files and cannot host a real-time server. To enable multiplayer online you must host a WebSocket server somewhere (free options: Glitch, Render, Railway, Replit, etc.).

Key points:
- The client uses `WS_URL` in `sudoku-script.js` (currently `ws://${window.location.hostname}:8080`).
- If you host a server at `wss://your-server.example`, change `WS_URL` accordingly and use `wss://` for secure connections when the site is served over HTTPS.

Example change in `sudoku-script.js`:
```js
const WS_URL = 'wss://your-server-domain.example';
```

Recommended quick server (Glitch):
1. Create a new project on Glitch.
2. Add a small Node.js server using `ws` (WebSocket) library that implements the same message protocol your client expects (join, start, progress, win, lose).
3. Use the Glitch project domain (e.g. `wss://your-glitch-name.glitch.me`) as `WS_URL` in the client (use `wss://` if the page is HTTPS).

If you want, I can provide a minimal example WebSocket server implementation you can paste into Glitch.

## Notes & Troubleshooting

- Single-player mode will work right away on GitHub Pages.
- Multiplayer requires a server; without it the multiplayer controls will show connection errors or won't function.
- If you see `NaN:NaN` or timing issues in multiplayer, make sure the server sends and echoes time values as integers (seconds) and that the client uses `formatTime()` to display them.

## License

This project is provided AS-IS. Add a LICENSE file if you want to publish under a specific license.
