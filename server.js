const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');
const { WebSocketServer } = require('ws');

// Use the port provided by the environment (e.g., Render) or a default for local development.
const port = process.env.PORT || 8080;

// --- HTTP File Server (Unchanged) ---
const httpServer = http.createServer((req, res) => {
    const parsedUrl = url.parse(req.url);
    let filePath = parsedUrl.pathname === '/' ? '/index.html' : parsedUrl.pathname;
    const fullPath = path.join(__dirname, 'public', filePath); // Assumes client files are in a 'public' folder

    const extname = String(path.extname(fullPath)).toLowerCase();
    const mimeTypes = {
        '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
        '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpg',
        '.gif': 'image/gif', '.svg': 'image/svg+xml',
    };
    const contentType = mimeTypes[extname] || 'application/octet-stream';

    fs.readFile(fullPath, (error, content) => {
        if (error) {
            if (error.code == 'ENOENT') {
                res.writeHead(404, { 'Content-Type': 'text/html' });
                res.end('<h1>404 Not Found</h1>', 'utf-8');
            } else {
                res.writeHead(500);
                res.end('Sorry, check with the site admin for error: ' + error.code + ' ..\n');
            }
        } else {
            res.writeHead(200, { 'Content-Type': contentType });
            res.end(content, 'utf-8');
        }
    });
});

// --- WebSocket Game Server ---
const wss = new WebSocketServer({ server: httpServer });
const games = {};

// --- Puzzle Generation Logic (Unchanged) ---
const N = 9;
const DIFFICULTY_LEVELS = { trivial: 1, beginner: 35, medium: 45, hard: 52, expert: 57, master: 61, legendary: 63, insane: 64 };
function isSafe(board, row, col, num) { /* ... */ }
function solveSudoku(board) { /* ... */ }
function countSolutions(board) { /* ... */ }
function generatePuzzle(difficulty) { /* ... */ }
// (Pasting the full logic here for completeness)
function isSafe(board, row, col, num) {
    for (let x = 0; x < N; x++) if (board[row][x] === num) return false;
    for (let x = 0; x < N; x++) if (board[x][col] === num) return false;
    const startRow = row - row % 3, startCol = col - col % 3;
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) if (board[i + startRow][j + startCol] === num) return false;
    return true;
}
function solveSudoku(board) {
    for (let i = 0; i < N; i++) {
        for (let j = 0; j < N; j++) {
            if (board[i][j] === 0) {
                const numbers = [1, 2, 3, 4, 5, 6, 7, 8, 9].sort(() => Math.random() - 0.5);
                for (let num of numbers) {
                    if (isSafe(board, i, j, num)) { board[i][j] = num; if (solveSudoku(board)) return true; board[i][j] = 0; }
                }
                return false;
            }
        }
    }
    return true;
}
function countSolutions(board) {
    let count = 0;
    function solve() { if (count > 1) return; for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) { if (board[i][j] === 0) { for (let num = 1; num <= 9; num++) { if (isSafe(board, i, j, num)) { board[i][j] = num; solve(); board[i][j] = 0; } } return; } } count++; }
    solve(); return count;
}
function generatePuzzle(difficulty) {
    const cellsToRemove = DIFFICULTY_LEVELS[difficulty] || 45;
    let board = Array(N).fill(0).map(() => Array(N).fill(0));
    solveSudoku(board);
    const solution = JSON.parse(JSON.stringify(board));
    let positions = []; for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) positions.push([i, j]);
    positions.sort(() => Math.random() - 0.5);
    let puzzle = JSON.parse(JSON.stringify(solution));
    let removedCount = 0;
    for (const [row, col] of positions) {
        if (removedCount >= cellsToRemove) break;
        const temp = puzzle[row][col]; puzzle[row][col] = 0;
        const tempBoard = JSON.parse(JSON.stringify(puzzle));
        if (countSolutions(tempBoard) !== 1) { puzzle[row][col] = temp; } else { removedCount++; }
    }
    return { puzzle, solution };
}

// --- WebSocket Connection Logic ---
wss.on('connection', (ws, req) => {
    // *** NEW: CORS CHECK FOR WEBSOCKETS ***
    // This ensures only your GitHub Pages site can connect.
    const origin = req.headers.origin;
    const allowedOrigins = ['https://saydoh9908-sketch.github.io'];
    // Allow localhost for easy local testing
    if (process.env.NODE_ENV !== 'production') {
        allowedOrigins.push('http://localhost:8080');
    }

    if (!allowedOrigins.includes(origin)) {
        console.log(`Connection rejected from origin: ${origin}`);
        ws.close(1008, 'Origin not allowed');
        return;
    }
    console.log(`Client connected from origin: ${origin}`);

    let currentGameId = null;

    ws.on('message', (message) => {
        // *** NEW: ROBUST ERROR HANDLING FOR INCOMING MESSAGES ***
        let data;
        try {
            data = JSON.parse(message);
        } catch (e) {
            console.error('Invalid JSON received, ignoring message:', message);
            return;
        }

        currentGameId = data.gameId;

        switch (data.type) {
            case 'join':
                if (!games[data.gameId]) {
                    games[data.gameId] = { players: [ws], difficulty: data.difficulty, winner: null, startTime: Date.now() };
                    ws.send(JSON.stringify({ type: 'waiting' }));
                } else if (games[data.gameId].players.length === 1) {
                    games[data.gameId].players.push(ws);
                    const difficulty = games[data.gameId].difficulty;
                    const { puzzle, solution } = generatePuzzle(difficulty);
                    games[data.gameId].players.forEach(player => {
                        player.send(JSON.stringify({ type: 'start', puzzle, solution }));
                    });
                } else {
                    ws.send(JSON.stringify({ type: 'error', message: 'Game is full.' }));
                }
                break;

            case 'progress':
                if (games[data.gameId]) {
                    const otherPlayer = games[data.gameId].players.find(p => p !== ws);
                    if (otherPlayer) {
                        otherPlayer.send(JSON.stringify({ type: 'opponentProgress', progress: data.progress }));
                    }
                }
                break;

            case 'win':
                if (games[data.gameId] && !games[data.gameId].winner) {
                    games[data.gameId].winner = ws;
                    ws.send(JSON.stringify({ type: 'win' }));
                    const otherPlayer = games[data.gameId].players.find(p => p !== ws);
                    if (otherPlayer) {
                        otherPlayer.send(JSON.stringify({ type: 'lose', time: data.time }));
                    }
                }
                break;
        }
    });

    ws.on('close', () => {
        console.log('Client disconnected');
        if (currentGameId && games[currentGameId]) {
            games[currentGameId].players = games[currentGameId].players.filter(p => p !== ws);
            if (games[currentGameId].players.length > 0) {
                games[currentGameId].players[0].send(JSON.stringify({ type: 'opponentLeft' }));
            }
            if (games[currentGameId].players.length === 0) {
                delete games[currentGameId];
            }
        }
    });
});

httpServer.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});