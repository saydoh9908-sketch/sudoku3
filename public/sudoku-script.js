document.addEventListener('DOMContentLoaded', () => {
    const gridElement = document.getElementById('sudoku-grid');
    const newGameBtn = document.getElementById('new-game-btn');
    const solveBtn = document.getElementById('solve-btn');
    const resetBtn = document.getElementById('reset-btn');
    const pauseBtn = document.getElementById('pause-btn');
    const printBtn = document.getElementById('print-btn');
    const timerElement = document.getElementById('timer');
    const mistakesElement = document.getElementById('mistakes');
    const alertOverlay = document.getElementById('alert-overlay');
    const customAlert = document.getElementById('custom-alert');

    let board = [];
    let initialBoard = [];
    let solutionBoard = [];

    // Game state variables
    let timerInterval;
    let seconds = 0;
    let isPaused = false;
    let mistakes = 0;
    const MAX_MISTAKES = 3;
    let isGameOver = false;
    let currentDifficulty = 'medium';

    // Multiplayer state variables
    let gameMode = 'single';
    let gameId = null;
    let ws = null;
    const WS_URL = `ws://${window.location.hostname}:8080`; // Dynamically set the WebSocket URL



    const N = 9; // Size of the grid

    // Map difficulty names to the number of cells to remove.
    const DIFFICULTY_LEVELS = {
        trivial: 1,
        beginner: 35,
        medium: 45,
        hard: 52,
        expert: 57,
        master: 61, // Removing more can lead to very long generation times
        legendary: 63, // Very difficult, leaves only 18 clues.
        insane: 64 // WARNING: Puzzles with this few clues can take a very long time to generate.
    };

    // --- Board Generation ---

    function createGrid() {
        gridElement.innerHTML = '';
        for (let i = 0; i < N * N; i++) {
            const cell = document.createElement('div');
            cell.classList.add('cell');
            cell.dataset.row = Math.floor(i / N);
            cell.dataset.col = i % N;
            gridElement.appendChild(cell);
        }
    }

    function generateFullBoard() {
        board = Array(N).fill(0).map(() => Array(N).fill(0));
        solveSudoku(board);
    }

    function createPuzzle(cellsToRemove) {
        generateFullBoard();
        solutionBoard = JSON.parse(JSON.stringify(board)); // Store the complete solution

        // Create a list of all cell positions and shuffle them
        let positions = [];
        for (let i = 0; i < N; i++) {
            for (let j = 0; j < N; j++) {
                positions.push([i, j]);
            }
        }
        positions.sort(() => Math.random() - 0.5);

        const puzzle = JSON.parse(JSON.stringify(solutionBoard));
        let removedCount = 0;
        for (const [row, col] of positions) {
            if (removedCount >= cellsToRemove) break;

            const temp = puzzle[row][col];
            puzzle[row][col] = 0;

            // Check if the puzzle still has a unique solution
            const tempBoard = JSON.parse(JSON.stringify(puzzle));
            if (countSolutions(tempBoard) !== 1) {
                // If not unique, put the number back
                puzzle[row][col] = temp;
            } else {
                removedCount++;
            }
        }
        
        initialBoard = JSON.parse(JSON.stringify(puzzle));
        // Make a copy for the user to play on
        board = JSON.parse(JSON.stringify(initialBoard));
    }

    function displayBoard() {
        for (let i = 0; i < N; i++) {
            for (let j = 0; j < N; j++) {
                const cell = gridElement.querySelector(`[data-row='${i}'][data-col='${j}']`);
                cell.innerHTML = ''; // Clear previous content
                if (board[i][j] !== 0) {
                    if (initialBoard[i][j] !== 0 || board[i][j] === solutionBoard[i][j]) {
                        // Given number or a correct user-entered number
                        cell.textContent = board[i][j];
                        cell.classList.add('given');
                        cell.classList.toggle('correct-user-entry', initialBoard[i][j] === 0);
                    } else {
                        // User input number
                        const input = document.createElement('input');
                        input.type = 'number';
                        input.min = 1;
                        input.max = 9;
                        input.value = board[i][j];
                        input.addEventListener('input', (e) => handleInput(e, i, j));
                        cell.appendChild(input);
                        cell.classList.remove('given');
                    }
                } else {
                    // Empty cell for user input
                    const input = document.createElement('input');
                    input.type = 'number';
                    input.min = 1;
                    input.max = 9;
                    input.addEventListener('input', (e) => handleInput(e, i, j));
                    cell.appendChild(input);
                    cell.classList.remove('given', 'correct-user-entry');
                }
            }
        }
    }

    function handleInput(e, row, col) {
        if (isPaused || isGameOver) return;
        const inputElement = e.target;
        const value = parseInt(e.target.value);

        if (value >= 1 && value <= 9) {
            board[row][col] = value;
        } else {
            board[row][col] = 0;
            if (e.target.value !== '') {
                inputElement.value = ''; // Clear invalid input
            }
        }
        validateAllUserInput();
        
        const enteredValue = board[row][col];
        if (enteredValue !== 0) {
            if (enteredValue === solutionBoard[row][col]) {
                // Correct number
                clearHighlights();
                displayBoard();
                if (checkWin()) {
                    if (gameMode === 'multiplayer' && ws) {
                        // Send the win notification to server with current time
                        ws.send(JSON.stringify({ 
                            type: 'win', 
                            time: seconds,
                            gameId: gameId
                        }));

                        // Lock the board and stop the timer
                        gridElement.classList.add('game-over');
                        gridElement.querySelectorAll('input').forEach(input => {
                            input.disabled = true;
                        });
                        stopTimer();
                        isGameOver = true;
                        
                        // Show win message
                        const winHTML = `
                            <div>Congratulations! You won in ${formatTime(seconds)}!</div>
                            <button id="return-to-menu-btn">Return to Menu</button>
                        `;
                        showAlert(winHTML, 'success', 0);
                        
                        // Add event listener for the return button
                        document.getElementById('return-to-menu-btn').addEventListener('click', () => {
                            window.location.href = 'index.html';
                        });
                    } else {
                        // In single player, handle the win immediately.
                        handleWin();
                    }
                }
            } else {
                // Incorrect number
                mistakes++;
                updateMistakes();
                if (mistakes >= MAX_MISTAKES) {
                    gameOver();
                }
            }
        }

        // If in multiplayer, send progress update
        if (gameMode === 'multiplayer' && ws) {
            sendProgressUpdate();
        }
    }

    // --- Timer Functions ---

    function formatTime(timeInSeconds) {
        const minutes = Math.floor(timeInSeconds / 60);
        const seconds = timeInSeconds % 60;
        return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }

    function startTimer() {
        if (timerInterval) clearInterval(timerInterval);
        timerInterval = setInterval(() => {
            seconds++;
            timerElement.textContent = formatTime(seconds);
        }, 1000);
    }

    function stopTimer() {
        clearInterval(timerInterval);
    }

    function resetTimer() {
        stopTimer();
        seconds = 0;
        timerElement.textContent = '00:00';
    }

    function checkWin() {
        for (let r = 0; r < N; r++) {
            for (let c = 0; c < N; c++) {
                if (board[r][c] === 0 || board[r][c] !== solutionBoard[r][c]) return false;
            }
        }
        return true;
    }

    function handleWin() {
        stopTimer();
        isGameOver = true; // The game is over, prevent further input
        gridElement.classList.add('game-over'); // Visually lock the board

        let winHTML;
        if (gameMode === 'multiplayer') {
            winHTML = `
                <div>Congratulations! You won in ${formatTime(seconds)}!</div>
                <button id="return-to-menu-btn">Return to Menu</button>
            `;
        } else {
            winHTML = `
                <div>Congratulations! You solved it in ${formatTime(seconds)}.</div>
                <div class="prompt-text">Enter your name to save your score:</div>
                <input type="text" id="player-name-input" placeholder="Your Name" maxlength="15">
                <button id="save-score-btn">Save Score</button>
            `;
        }

        showAlert(winHTML, 'success', 0); // Persistent success alert

        if (gameMode === 'multiplayer') {
            const returnBtn = document.getElementById('return-to-menu-btn');
            returnBtn.addEventListener('click', () => {
                window.location.href = 'index.html';
            });
        } else {
            const playerNameInput = document.getElementById('player-name-input');
            const saveScoreBtn = document.getElementById('save-score-btn');

            // Focus the input field for immediate typing
            playerNameInput.focus();

            saveScoreBtn.addEventListener('click', () => {
                const playerName = playerNameInput.value.trim() || 'Anonymous';
                saveScore(playerName, currentDifficulty, seconds, mistakes);
                // Hide the prompt and show a simple confirmation that auto-hides
                showAlert(`Score saved for ${playerName}!`, 'success', 3000);
            });
        }
    }

    function clearHighlights() {
        const highlightedCells = document.querySelectorAll('.highlighted, .selected');
        highlightedCells.forEach(cell => {
            cell.classList.remove('highlighted', 'selected');
        });
    }

    function handleCellClick(event) {
        if (isPaused || isGameOver) return;
        const cell = event.target.closest('.cell');
        if (!cell) return;

        clearHighlights();

        const clickedRow = parseInt(cell.dataset.row);
        const clickedCol = parseInt(cell.dataset.col);

        // Add 'selected' class to the clicked cell
        cell.classList.add('selected');

        // Highlight row and column
        for (let i = 0; i < N; i++) {
            gridElement.querySelector(`[data-row='${clickedRow}'][data-col='${i}']`).classList.add('highlighted');
            gridElement.querySelector(`[data-row='${i}'][data-col='${clickedCol}']`).classList.add('highlighted');
        }

        // Get the number in the clicked cell
        let numberToMatch = 0;
        if (cell.classList.contains('given')) {
            numberToMatch = parseInt(cell.textContent);
        } else {
            const input = cell.querySelector('input');
            if (input && input.value) {
                numberToMatch = parseInt(input.value);
            }
        }

        // If there's a number, highlight all matching numbers
        if (numberToMatch >= 1 && numberToMatch <= 9) {
            for (let r = 0; r < N; r++) {
                for (let c = 0; c < N; c++) {
                    if (board[r][c] === numberToMatch) {
                        gridElement.querySelector(`[data-row='${r}'][data-col='${c}']`).classList.add('selected');
                    }
                }
            }
        }
    }

    function validateAllUserInput() {
        for (let r = 0; r < N; r++) {
            for (let c = 0; c < N; c++) {
                // We only validate user-editable cells
                if (initialBoard[r][c] === 0) {
                    const cell = gridElement.querySelector(`[data-row='${r}'][data-col='${c}']`);
                    const input = cell.querySelector('input');

                    // If there's no input, it means the cell is locked (correctly answered), so skip it.
                    if (!input) continue;

                    if (board[r][c] !== 0) {
                        // If the cell has a number, validate it
                        const num = board[r][c];
                        board[r][c] = 0; // Temporarily remove for validation
                        const isNumSafe = isSafe(board, r, c, num);
                        board[r][c] = num; // Restore the number
                        input.classList.toggle('invalid', !isNumSafe);
                    } else {
                        // If the cell is empty, ensure it's not marked as invalid
                        input.classList.remove('invalid');
                    }
                }
            }
        }
    }

    // --- Sudoku Solver (Backtracking) ---

    function isSafe(board, row, col, num) {
        // Check row
        for (let x = 0; x < N; x++) {
            if (board[row][x] === num) {
                return false;
            }
        }

        // Check column
        for (let x = 0; x < N; x++) {
            if (board[x][col] === num) {
                return false;
            }
        }

        // Check 3x3 subgrid
        const startRow = row - row % 3;
        const startCol = col - col % 3;
        for (let i = 0; i < 3; i++) {
            for (let j = 0; j < 3; j++) {
                if (board[i + startRow][j + startCol] === num) {
                    return false;
                }
            }
        }

        return true;
    }

    function countSolutions(board) {
        let count = 0;

        function solve() {
            if (count > 1) return; // Optimization: stop if we already found more than one

            for (let i = 0; i < N; i++) {
                for (let j = 0; j < N; j++) {
                    if (board[i][j] === 0) {
                        for (let num = 1; num <= 9; num++) {
                            if (isSafe(board, i, j, num)) {
                                board[i][j] = num;
                                solve();
                                board[i][j] = 0; // Backtrack
                            }
                        }
                        return;
                    }
                }
            }
            // If we reach here, a solution is found
            count++;
        }

        solve();
        return count;
    }



    function solveSudoku(board) {
        for (let i = 0; i < N; i++) {
            for (let j = 0; j < N; j++) {
                if (board[i][j] === 0) {
                    const numbers = [1, 2, 3, 4, 5, 6, 7, 8, 9];
                    // Shuffle numbers for random board generation
                    for (let k = numbers.length - 1; k > 0; k--) {
                        const l = Math.floor(Math.random() * (k + 1));
                        [numbers[k], numbers[l]] = [numbers[l], numbers[k]];
                    }

                    for (let num of numbers) {
                        if (isSafe(board, i, j, num)) {
                            board[i][j] = num;
                            if (solveSudoku(board)) {
                                return true;
                            }
                            board[i][j] = 0; // Backtrack
                        }
                    }
                    return false; // No valid number found
                }
            }
        }
        return true; // Solved
    }

    // --- Control Functions ---

    function startNewGame() {
        if (gameMode === 'multiplayer') {
            // In multiplayer, the server will trigger the game start.
            // We just reset the UI and wait.
            return;
        }
        // Single player mode:
        const urlParams = new URLSearchParams(window.location.search);
        currentDifficulty = urlParams.get('difficulty') || 'medium';
        const cellsToRemove = DIFFICULTY_LEVELS[currentDifficulty];

        // Reset game state
        isPaused = false;
        isGameOver = false;
        gridElement.classList.remove('game-over');
        mistakes = 0;
        updateMistakes();
        pauseBtn.textContent = 'Pause';
        gridElement.classList.remove('paused');
        clearHighlights();
        createPuzzle(cellsToRemove);
        displayBoard();
        validateAllUserInput();
        resetTimer();
        startTimer();
    }

    function solveGame() {
        if (gameMode === 'multiplayer') {
            showAlert('Solve is disabled in multiplayer mode.', 'info');
            return;
        }
        // If paused, resume first
        if (isPaused) togglePause();
        isGameOver = true;
        gridElement.classList.add('game-over');
        clearHighlights();

        // Use the initial board state to solve, not the user's current state
        board = JSON.parse(JSON.stringify(solutionBoard));
        stopTimer();
        isPaused = false;
        pauseBtn.textContent = 'Pause';
        gridElement.classList.remove('paused');
        displayBoard();
    }

    function resetGame() {
        if (gameMode === 'multiplayer') {
            showAlert('Reset is disabled in multiplayer mode.', 'info');
            return;
        }
        if (isGameOver) return; // Don't allow reset if game is over, force new game
        board = JSON.parse(JSON.stringify(initialBoard));
        mistakes = 0;
        updateMistakes();
        clearHighlights();
        displayBoard();
        // Clear any invalid states from previous attempts
        validateAllUserInput();
    }

    function printGame() {
        window.print();
    }

    function togglePause() {
        if (isGameOver) return;
        isPaused = !isPaused;
        if (isPaused) {
            stopTimer();
            gridElement.classList.add('paused');
            pauseBtn.textContent = 'Resume';
        } else {
            startTimer();
            gridElement.classList.remove('paused');
            pauseBtn.textContent = 'Pause';
        }
    }

    function saveScore(name, difficulty, time, mistakes) {
        try {
            const scores = JSON.parse(localStorage.getItem('sudokuScores')) || [];
            const newScore = {
                name,
                difficulty,
                time,
                mistakes,
                date: new Date().toISOString()
            };
            scores.push(newScore);
            localStorage.setItem('sudokuScores', JSON.stringify(scores));
        } catch (error) {
            console.error("Could not save score to localStorage:", error);
        }
    }

    /**
     * Displays a custom in-page alert message.
     * @param {string} message - The message to display.
     * @param {string} type - The type of alert ('success', 'error', etc.) for styling.
     * @param {number} duration - How long the alert should be visible in milliseconds.
     */
    function showAlert(message, type = 'info', duration = 3000) {
        customAlert.innerHTML = message;
        customAlert.className = 'alert-message'; // Reset classes
        customAlert.classList.add(type);

        alertOverlay.classList.remove('hidden'); // Show the overlay

        // If duration is a positive number, hide the alert after the duration.
        // If duration is 0 or null, the alert will be persistent.
        if (duration) {
            setTimeout(() => alertOverlay.classList.add('hidden'), duration);
        }
    }

    function updateMistakes() {
        mistakesElement.textContent = `Mistakes: ${mistakes} / ${MAX_MISTAKES}`;
    }

    function gameOver() {
        isGameOver = true;
        stopTimer();
        gridElement.classList.add('game-over');
        const gameOverHTML = `
            Game Over! You've made 3 mistakes.
            <button id="new-game-from-alert-btn">Start New Game</button>
        `;
        // Disable all input fields on the board
        gridElement.querySelectorAll('input').forEach(input => {
            input.disabled = true;
        });

        // Show a persistent alert (duration = 0)
        showAlert(gameOverHTML, 'error', 0);

        // Add an event listener to the new button
        document.getElementById('new-game-from-alert-btn').addEventListener('click', () => {
            window.location.href = 'index.html';
        });
    }

    // --- Multiplayer Functions ---

    function initMultiplayer() {
        const opponentContainer = document.getElementById('opponent-container');
        opponentContainer.classList.remove('hidden');

        // Disable single-player controls
        solveBtn.disabled = true;
        resetBtn.disabled = true;
        newGameBtn.textContent = 'Leave Game';
        newGameBtn.onclick = () => { window.location.href = 'index.html'; };

        showAlert('Connecting to server...', 'info', 0);

        ws = new WebSocket(WS_URL);

        ws.onopen = () => {
            console.log('Connected to WebSocket server.');
            // Join the game room
            ws.send(JSON.stringify({ type: 'join', gameId, difficulty: currentDifficulty }));
        };

        ws.onmessage = (event) => {
            const message = JSON.parse(event.data);
            console.log('Message from server:', message);

            switch (message.type) {
                case 'waiting':
                    showAlert(`Game ID: ${gameId}<br>Waiting for opponent...`, 'info', 0);
                    break;
                case 'gameState':
                    // Update game state based on server message
                    isGameOver = message.isGameOver;
                    if (isGameOver) {
                        stopTimer();
                        gridElement.classList.add('game-over');
                        gridElement.querySelectorAll('input').forEach(input => {
                            input.disabled = true;
                        });
                    }
                    break;
                case 'start':
                    // Server provides the puzzle for both players
                    initialBoard = message.puzzle;
                    solutionBoard = message.solution;
                    board = JSON.parse(JSON.stringify(initialBoard));
                    
                    // Reset and start the game
                    isPaused = false;
                    isGameOver = false;
                    gridElement.classList.remove('game-over');
                    mistakes = 0;
                    updateMistakes();
                    displayBoard();
                    validateAllUserInput();
                    resetTimer();
                    startTimer();
                    showAlert('Game started! Good luck!', 'success', 3000);

                    // Send initial progress to opponent and update own progress bar
                    sendProgressUpdate();
                    updateOpponentProgress(calculateProgress());
                    break;
                case 'opponentProgress':
                    updateOpponentProgress(message.progress);
                    break;
                case 'opponentLeft':
                    showAlert('Your opponent has left the game. You win!', 'success', 0);
                    stopTimer();
                    isGameOver = true;
                    break;
                case 'win':
                    stopTimer();
                    isGameOver = true;
                    gridElement.classList.add('game-over');
                    gridElement.querySelectorAll('input').forEach(input => {
                        input.disabled = true;
                    });
                    
                    // Show win/lose message based on who won
                    if (message.winner === gameId) {
                        const winHTML = `
                            <div>Congratulations! You won in ${formatTime(seconds)}!</div>
                            <button id="return-to-menu-btn">Return to Menu</button>
                        `;
                        showAlert(winHTML, 'success', 0);
                    }
                    break;
                
                case 'lose':
                    // Stop everything when we lose
                    stopTimer();
                    isGameOver = true;
                    gridElement.classList.add('game-over');
                    
                    // Disable all input fields
                    gridElement.querySelectorAll('input').forEach(input => {
                        input.disabled = true;
                    });
                    
                    // Show lose message
                    const loseHTML = `
                        <div>Game Over! Your opponent finished first in ${formatTime(message.time)}!</div>
                        <button id="return-to-menu-btn">Return to Menu</button>
                    `;
                    showAlert(loseHTML, 'error', 0);
                    
                    document.getElementById('return-to-menu-btn').addEventListener('click', () => {
                        window.location.href = 'index.html';
                    });
                    break;
                case 'error':
                    showAlert(`Error: ${message.message}`, 'error', 5000);
                    break;
            }
        };

        ws.onclose = () => {
            console.log('Disconnected from WebSocket server.');
            if (!isGameOver) {
                showAlert('Connection lost to the server.', 'error', 0);
            }
        };

        ws.onerror = (error) => {
            console.error('WebSocket error:', error);
            showAlert('Could not connect to the game server.', 'error', 0);
        };
    }

    function calculateProgress() {
        let correctCells = 0;
        for (let r = 0; r < N; r++) {
            for (let c = 0; c < N; c++) {
                // Count initial numbers and correctly filled user numbers
                if (initialBoard[r][c] !== 0 || (board[r][c] !== 0 && board[r][c] === solutionBoard[r][c])) {
                    correctCells++;
                }
            }
        }
        return correctCells;
    }

    function sendProgressUpdate() {
        ws.send(JSON.stringify({ type: 'progress', progress: calculateProgress() }));
    }

    function updateOpponentProgress(progress) {
        const totalCells = N * N;
        const percentage = (progress / totalCells) * 100;
        document.getElementById('opponent-progress').style.width = `${percentage}%`;
        document.getElementById('opponent-progress-text').textContent = `${progress} / ${totalCells}`;
    }

    // --- Event Listeners ---

    newGameBtn.addEventListener('click', startNewGame);
    solveBtn.addEventListener('click', solveGame);
    resetBtn.addEventListener('click', resetGame);
    pauseBtn.addEventListener('click', togglePause);
    printBtn.addEventListener('click', printGame);
    gridElement.addEventListener('click', handleCellClick);

    // --- Initial Setup ---

    function initializeGame() {
        createGrid();
        startNewGame();
    }

    // Check URL parameters to determine game mode
    const urlParams = new URLSearchParams(window.location.search);
    gameMode = urlParams.get('mode') || 'single';
    gameId = urlParams.get('gameId');
    currentDifficulty = urlParams.get('difficulty') || 'medium';

    initializeGame();

    if (gameMode === 'multiplayer' && gameId) {
        initMultiplayer();
    }
});