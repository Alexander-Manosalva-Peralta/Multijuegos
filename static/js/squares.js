let squareSocket;
let squareCanvas, squareCtx;
let grid = [];
let size = 4; // cuadrícula 4x4
let lines = [];
let squares = [];
let selected = null;
let roomId, playerName, playerSymbol, playerColor;

function initSquareGame(room, name, symbol, color) {
    roomId = room;
    playerName = name || 'Anon';
    playerSymbol = symbol || 'X';
    playerColor = color || '#ff6f91';

    squareSocket = io();

    squareCanvas = document.getElementById('board');
    squareCtx = squareCanvas.getContext('2d');

    const offset = 60;
    const step = (squareCanvas.width - offset*2) / (size-1);
    for(let r=0; r<size; r++){
        grid[r] = [];
        for(let c=0; c<size; c++){
            grid[r][c] = {x: offset + c*step, y: offset + r*step};
        }
    }

    drawAll();
    squareCanvas.addEventListener('click', onClick);

    squareSocket.emit('join_room', {room: roomId, name: playerName, symbol: playerSymbol, color: playerColor});

    squareSocket.on('room_state', data => {
        lines = data.state.moves || [];
        squares = data.state.squares || [];
        drawAll();
        updateTurn(data);
    });
}

function drawAll() {
    squareCtx.clearRect(0,0,squareCanvas.width,squareCanvas.height);
    drawGrid();
    drawLines();
    drawSquares();
}

function drawGrid() {
    squareCtx.fillStyle = '#333';
    for(let r=0; r<size; r++){
        for(let c=0; c<size; c++){
            const p = grid[r][c];
            squareCtx.beginPath();
            squareCtx.arc(p.x,p.y,7,0,Math.PI*2);
            squareCtx.fill();
        }
    }
}

function drawLines() {
    squareCtx.lineWidth = 4;
    lines.forEach(l => {
        squareCtx.strokeStyle = l.color || '#333';
        const a = grid[l.start.r][l.start.c];
        const b = grid[l.end.r][l.end.c];
        squareCtx.beginPath();
        squareCtx.moveTo(a.x,a.y);
        squareCtx.lineTo(b.x,b.y);
        squareCtx.stroke();
    });
}

function drawSquares() {
    squares.forEach(sq => {
        squareCtx.fillStyle = sq.color || '#ff6f91';
        squareCtx.font = '32px sans-serif';
        squareCtx.textAlign = 'center';
        squareCtx.textBaseline = 'middle';
        squareCtx.fillText(sq.symbol, sq.center.x, sq.center.y);
    });
}

function onClick(e) {
    const rect = squareCanvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    for(let r=0;r<size;r++){
        for(let c=0;c<size;c++){
            const p = grid[r][c];
            if(Math.hypot(p.x-x,p.y-y) < 12){
                if(!selected){
                    selected = {r,c};
                } else {
                    const dr = Math.abs(selected.r - r);
                    const dc = Math.abs(selected.c - c);
                    if((dr===1 && dc===0) || (dr===0 && dc===1)){
                        const move = {
                            start: selected,
                            end: {r,c},
                            player: playerName,
                            symbol: playerSymbol,
                            color: playerColor
                        };
                        squareSocket.emit('make_move', {room: roomId, move});
                    }
                    selected = null;
                }
                return;
            }
        }
    }
}

function updateTurn(data) {
    const turnIndex = data.state.turnIndex || 0;
    const players = data.players;
    if(players[turnIndex]){
        document.getElementById('turnBox').innerText = "Turno: " + players[turnIndex].name;
    }
}
