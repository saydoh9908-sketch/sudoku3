document.addEventListener('DOMContentLoaded', () => {
    // --- DOM Elements ---
    const startScreen = document.getElementById('start-screen');
    const gameScreen = document.getElementById('game-screen');
    const endScreen = document.getElementById('end-screen');
    const createBtn = document.getElementById('create-game-btn');
    const joinBtn = document.getElementById('join-game-btn');
    const gameIdInput = document.getElementById('game-id-input');
    const statusMessage = document.getElementById('status-message');
    const gameIdDisplay = document.getElementById('game-id-display');
    const connectionStatus = document.getElementById('connection-status');
    const boardElement = document.getElementById('sudoku-board');
    const myProgress = document.getElementById('my-progress');
    const opponentProgress = document.getElementById('opponent-progress');
    const endTitle = document.getElementById('end-title');
    const endMessage = document.getElementById('end-message');
    const playAgainBtn = document.getElementById('play-again-btn');

    // --- Game State ---
    let socket;
    let gameId;
    let solution = [];
    let playerCells = [];

    // --- WebSocket Connection ---
    // *** IMPORTANT: CHANGE THIS URL TO YOUR DEPLOYED SERVER URL ***
    // For local testing, use: ws://localhost:8080
    // For production, use: wss://your-app-name.onrender.com
    const WS_URL = 'ws://localhost:8080'; 

    function connectWebSocket() {
        socket = new WebSocket(WS_URL);

        socket.onopen = () => {
            connectionStatus.textContent = 'Connected';
            connectionStatus.style.color = 'green';
        };

        socket.onmessage = (event) => {
            const data = JSON.parse(event.data);
            handleServerMessage(data);
        };

        socket.onclose = () => {
            connectionStatus.textContent = 'Disconnected';
            connectionStatus.style.color = 'red';
            showScreen('start-screen');
            statusMessage.textContent = 'Connection lost. Please try again.';
        };

        socket.onerror = (error) => {
            console.error('WebSocket Error:', error);
            statusMessage.textContent = 'Could not connect to server.';
        };
    }

    // --- UI Logic ---
    function showScreen(screenId) {
        document.querySelectorAll('.screen').forEach(screen => screen.classList.remove('active'));
        document.getElementById(screenId).classList.add('active');
    }

    function createBoard(puzzle) {
        boardElement.innerHTML = '';
        playerCells = [];
        for (let i = 0; i < 9; i++) {
            for (let j = 0; j < 9; j++) {
                const cell = document.createElement('input');
                cell.type = 'text';
                cell.className = 'sudoku-cell';
                cell.maxLength = 1;
                cell.dataset.row = i;
                cell.dataset.col = j;

                const value = puzzle[i][j];
                if (value !== 0) {
                    cell.value = value;
                    cell.classList.add('fixed');
                    cell.readOnly = true;
                } else {
                    playerCells.push(cell);
                    cell.addEventListener('input', handleCellInput);
                }
                boardElement.appendChild(cell);
            }
        }
    }

    function handleCellInput(e) {
        const cell = e.target;
        const value = parseInt(cell.value, 10) || 0;
        const row = parseInt(cell.dataset.row, 10);
        const col = parseInt(cell.dataset.col, 10);

        if (isNaN(value) || value < 1 || value > 9) {
            cell.value = '';
            return;
        }

        // Check if correct
        if (value === solution[row][col]) {
            cell.classList.remove('incorrect');
            cell.classList.add('correct');
        } else {
            cell.classList.remove('correct');
            cell.classList.add('incorrect');
        }

        updateProgress();
        checkWin();
    }

    function updateProgress() {
        const totalCells = playerCells.length;
        const filledCorrectCells = playerCells.filter(cell => {
            const row = parseInt(cell.dataset.row, 10);
            const col = parseInt(cell.dataset.col, 10);
            const value = parseInt(cell.value, 10);
            return value === solution[row][col];
        }).length;
        const progressPercent = (filledCorrectCells / totalCells) * 100;
        myProgress.style.width = `${progressPercent}%`;

        socket.send(JSON.stringify({ type: 'progress', gameId, progress: progressPercent }));
    }

    function checkWin() {
        const isComplete = playerCells.every(cell => {
            const row = parseInt(cell.dataset.row, 10);
            const col = parseInt(cell.dataset.col, 10);
            const value = parseInt(cell.value, 10);
            return value === solution[row][col];
        });

        if (isComplete) {
            socket.send(JSON.stringify({ type: 'win', gameId }));
        }
    }

    // --- Server Message Handling ---
    function handleServerMessage(data) {
        switch (data.type) {
            case 'waiting':
                statusMessage.textContent = 'Waiting for an opponent...';
                break;
            case 'start':
                solution = data.solution;
                createBoard(data.puzzle);
                showScreen('game-screen');
                break;
            case 'opponentProgress':
                opponentProgress.style.width = `${data.progress}%`;
                break;
            case 'win':
                endTitle.textContent = 'You Win! 🎉';
                endMessage.textContent = 'Congratulations!';
                showScreen('end-screen');
                break;
            case 'lose':
                endTitle.textContent = 'You Lose 😔';
                endMessage.textContent = `Your opponent finished in ${data.time} seconds.`;
                showScreen('end-screen');
                break;
            case 'opponentLeft':
                statusMessage.textContent = 'Your opponent has left the game.';
                setTimeout(() => showScreen('start-screen'), 3000);
                break;
            case 'error':
                statusMessage.textContent = data.message;
                break;
        }
    }

    // --- Event Listeners ---
    createBtn.addEventListener('click', () => {
        gameId = Math.random().toString(36).substr(2, 9);
        const difficulty = document.getElementById('difficulty').value;
        statusMessage.textContent = `Share this Game ID: ${gameId}`;
        connectWebSocket();
        socket.onopen = () => {
            socket.send(JSON.stringify({ type: 'join', gameId, difficulty }));
            gameIdDisplay.textContent = gameId;
        };
    });

    joinBtn.addEventListener('click', () => {
        gameId = gameIdInput.value.trim();
        if (!gameId) {
            statusMessage.textContent = 'Please enter a Game ID.';
            return;
        }
        const difficulty = 'medium'; // Difficulty is set by the creator
        connectWebSocket();
        socket.onopen = () => {
            socket.send(JSON.stringify({ type: 'join', gameId, difficulty }));
            gameIdDisplay.textContent = gameId;
        };
    });

    playAgainBtn.addEventListener('click', () => {
        location.reload(); // Simplest way to reset everything
    });

    // Initial connection check
    showScreen('start-screen');
});
