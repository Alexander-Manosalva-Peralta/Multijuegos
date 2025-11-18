let socket = io();
let canvas = document.getElementById("board");
let ctx = canvas.getContext("2d");

let POINTS = [];
let MOVES = [];
let TRIANGLES = [];
let PLAYERS = [];
let state = {};

let P1 = null;
let mouseX = 0;
let mouseY = 0;

// --- Conectarse a la sala ---
socket.emit("join_room", {
    room: ROOM,
    name: PLAYER_NAME,
    symbol: PLAYER_SYMBOL,
    color: PLAYER_COLOR
});

// --- Recibir estado inicial ---
socket.on("room_init", data => {
    POINTS = data.points;
    MOVES = data.state.moves || [];
    TRIANGLES = data.state.triangles || [];
    PLAYERS = data.players || [];
    state = data.state || {};
    redraw();
    updateTurnBox();
});

// --- Actualizar estado cada vez que hay cambio ---
socket.on("room_state", data => {
    MOVES = data.state.moves || [];
    TRIANGLES = data.state.triangles || [];
    PLAYERS = data.players || [];
    state = data.state || {};
    redraw();
    updateTurnBox();
});

// --- Actualizar HUD ---
function isMyTurn() {
    if (!PLAYERS.length) return true;
    let idx = state.turnIndex % PLAYERS.length;
    return PLAYERS[idx].sid === socket.id;
}

function updateTurnBox() {
    let box = document.getElementById("turnBox");
    if (!box) return;
    if (!PLAYERS.length) {
        box.innerText = "Esperando jugadores...";
    } else {
        let idx = state.turnIndex % PLAYERS.length;
        box.innerText = "Turno: " + PLAYERS[idx].name;
    }
}

// --- MOUSE ---
canvas.addEventListener("mousemove", e => {
    let r = canvas.getBoundingClientRect();
    mouseX = e.clientX - r.left;
    mouseY = e.clientY - r.top;
    if (P1 !== null && isMyTurn()) redraw();
});

canvas.addEventListener("click", e => {
    if (!isMyTurn()) return;

    let rect = canvas.getBoundingClientRect();
    let x = e.clientX - rect.left;
    let y = e.clientY - rect.top;

    let idx = findClosestPoint(x, y);
    if (idx === -1) return;

    if (P1 === null) {
        P1 = idx;
    } else {
        if (P1 !== idx) tryMakeMove(P1, idx);
        P1 = null;
    }
    redraw();
});

// --- Buscar punto cercano ---
function findClosestPoint(x, y) {
    const R = 20;
    for (let i = 0; i < POINTS.length; i++) {
        let dx = POINTS[i].x - x;
        let dy = POINTS[i].y - y;
        if (Math.sqrt(dx*dx + dy*dy) <= R) return i;
    }
    return -1;
}

// --- Intentar crear línea ---
function tryMakeMove(a, b) {
    if (isDuplicate(a, b)) return; // evita duplicados
    // Eliminamos restricción de cruce para que sea libre

    socket.emit("make_move", {
        room: ROOM,
        p1: a,
        p2: b,
        player: PLAYER_NAME,
        symbol: PLAYER_SYMBOL,
        color: PLAYER_COLOR
    });

    detectTriangle(a, b);
}

// --- Evitar duplicados ---
function isDuplicate(a, b) {
    return MOVES.some(m => (m.p1 === a && m.p2 === b) || (m.p1 === b && m.p2 === a));
}

// --- Detección de triángulos ---
function detectTriangle(a, b) {
    for (let m of MOVES) {
        let c1 = m.p1, c2 = m.p2;
        if (c1!==a && c1!==b && c2!==a && c2!==b) continue;
        let c = (c1!==a && c1!==b)?c1:c2;
        if (isDuplicate(a,c) && isDuplicate(b,c)) {
            let tri = {a,b,c,symbol:PLAYER_SYMBOL};
            TRIANGLES.push(tri);
            socket.emit("add_triangle",{room:ROOM,triangle:tri});
        }
    }
}

// --- Redibujar todo ---
function redraw() {
    ctx.clearRect(0,0,canvas.width,canvas.height);

    // puntos
    ctx.fillStyle = "#000";
    for (let p of POINTS) {
        ctx.beginPath();
        ctx.arc(p.x,p.y,6,0,Math.PI*2);
        ctx.fill();
    }

    // líneas
    for (let m of MOVES) {
        let A = POINTS[m.p1];
        let B = POINTS[m.p2];
        ctx.strokeStyle = m.color;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(A.x,A.y);
        ctx.lineTo(B.x,B.y);
        ctx.stroke();
    }

    // línea fantasma
    if (P1 !== null && isMyTurn()) {
        let A = POINTS[P1];
        ctx.strokeStyle = "rgba(0,0,0,0.4)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(A.x,A.y);
        ctx.lineTo(mouseX,mouseY);
        ctx.stroke();
    }

    // símbolos en triángulos
    ctx.fillStyle = "black";
    ctx.font = "22px Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (let t of TRIANGLES) {
        let A=POINTS[t.a],B=POINTS[t.b],C=POINTS[t.c];
        let x=(A.x+B.x+C.x)/3;
        let y=(A.y+B.y+C.y)/3;
        ctx.fillText(t.symbol,x,y);
    }
}
