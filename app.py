import random
import string
from flask import Flask, render_template, request, redirect, url_for
from flask_socketio import SocketIO, join_room, emit

app = Flask(__name__)
app.config['SECRET_KEY'] = "clave_segura"
socketio = SocketIO(app, cors_allowed_origins="*")

CANVAS_WIDTH = 700
CANVAS_HEIGHT = 650

def gen_room_id(n=6):
    return ''.join(random.choices(string.ascii_lowercase + string.digits, k=n))

def generate_points(n=20):
    pts = []
    margin = 40
    for _ in range(n):
        pts.append({
            'x': random.uniform(margin, CANVAS_WIDTH - margin),
            'y': random.uniform(margin, CANVAS_HEIGHT - margin)
        })
    return pts

games = {}

# ----------------- Rutas -----------------

@app.route('/')
def index():
    return render_template("index.html")

@app.route('/create_room')
def create_room():
    name = request.args.get('name', '').strip()
    symbol = request.args.get('symbol', '').strip()
    color = request.args.get('color', '').strip()

    if not name or not symbol:
        return redirect(url_for("index"))

    room = gen_room_id()
    games[room] = {
        'players': {},
        'state': {'moves': [], 'triangles': [], 'squares': [], 'turnIndex': 0},
        'points': generate_points(20)
    }

    return redirect(url_for("index") +
                    f"?room={room}&name={name}&symbol={symbol}&color={color}")

@app.route('/join_room')
def join_room_route():
    room = request.args.get('room', '').strip()
    name = request.args.get('name', '').strip()
    symbol = request.args.get('symbol', '').strip()
    color = request.args.get('color', '').strip()

    if not room or not name or not symbol:
        return redirect(url_for("index"))

    if room not in games:
        return render_template("index.html", error=f"Sala {room} no encontrada")

    return redirect(url_for("index") +
                    f"?room={room}&name={name}&symbol={symbol}&color={color}")

# ----------------- Juegos Triángulos y Cuadrados -----------------

@app.route('/game/<room>/triangles')
def game_triangles(room):
    if room not in games:
        return "Sala no encontrada", 404

    name = request.args.get('name', '')
    symbol = request.args.get('symbol', '')
    color = request.args.get('color', '#000')

    return render_template("triangles.html",
                           room=room,
                           name=name,
                           symbol=symbol,
                           color=color)

@app.route('/game/<room>/squares')
def game_squares(room):
    if room not in games:
        return "Sala no encontrada", 404

    name = request.args.get('name', '')
    symbol = request.args.get('symbol', '')
    color = request.args.get('color', '#000')

    return render_template("squares.html",
                           room=room,
                           name=name,
                           symbol=symbol,
                           color=color)

# ----------------- STOP (Chocolatito Stop) -----------------

STOP_CATEGORIES = ["Nombre","Apellido","Color","Cosa","Animal","Fruta/Verdura","País/Ciudad"]

@app.route('/game/<room>/stop')
def game_stop(room):
    name = request.args.get('name','Anon')
    if room not in games:
        return "Sala no encontrada",404
    return render_template("stop.html", room=room, name=name, categories=STOP_CATEGORIES)

# ----------------- SocketIO Stop -----------------

@socketio.on("join_stop")
def join_stop(data):
    room = data.get("room")
    name = data.get("name","Anon")
    sid = request.sid

    if room not in games:
        emit("error", {"message":"Sala no existe"})
        return

    join_room(room)
    games[room].setdefault('stop', {
        'players': {},
        'current_letter':'',
        'round_active': False
    })

    games[room]['stop']['players'][sid] = {'name': name,'answers': {}, 'total': 0}

    emit("stop_state", {
        'players': list(games[room]['stop']['players'].values()),
        'current_letter': games[room]['stop']['current_letter'],
        'round_active': games[room]['stop']['round_active']
    }, room=sid)

@socketio.on("generate_letter_stop")
def generate_letter_stop(data):
    room = data.get("room")
    if room not in games: return

    letter = random.choice(string.ascii_uppercase)
    stop_data = games[room]['stop']
    stop_data['current_letter'] = letter
    stop_data['round_active'] = True

    for p in stop_data['players'].values():
        p['answers'] = {}

    emit("new_letter_stop", {'letter': letter}, room=room)

@socketio.on("submit_answers")
def submit_answers(data):
    room = data.get("room")
    answers = data.get("answers",{})
    sid = request.sid

    if room not in games or sid not in games[room]['stop']['players']:
        return
    if not games[room]['stop']['round_active']:
        return

    # Guardar respuestas del jugador
    games[room]['stop']['players'][sid]['answers'] = answers

@socketio.on("end_round")
def end_round(data):
    room = data.get("room")
    if room not in games or 'stop' not in games[room]:
        return

    stop_data = games[room]['stop']
    players = stop_data['players']
    stop_data['round_active'] = False

    # Calcular puntajes comparando respuestas
    for sid, pdata in players.items():
        total = 0
        for cat in STOP_CATEGORIES:
            word = pdata['answers'].get(cat, "").strip().lower()
            if not word:
                pts = 0
            else:
                # Cuántos jugadores escribieron lo mismo
                same_count = sum(
                    1 for other in players.values()
                    if other['answers'].get(cat,"").strip().lower() == word
                )
                pts = 5 if same_count > 1 else 10
            pdata['answers'][cat + "_score"] = pts
            total += pts
        pdata['total'] = total

    # Emitir resultados a todos
    emit("round_result", {
        'players': players,
        'letter': stop_data['current_letter']
    }, room=room)

# ====================== SocketIO Triángulos y Cuadrados ======================

@socketio.on("join_room")
def handle_join(data):
    room = data.get("room")
    if not room:
        emit("error", {"message": "Sala no especificada"})
        return

    sid = request.sid
    join_room(room)

    games.setdefault(room, {
        'players': {},
        'state': {'moves': [], 'triangles': [], 'squares': [], 'turnIndex': 0},
        'points': generate_points(20)
    })

    name = data.get("name", "Anon")
    symbol = data.get("symbol", "X")
    color = data.get("color", "#000")

    games[room]['players'][sid] = {'sid': sid, 'name': name, 'symbol': symbol, 'color': color}

    emit("room_init", {
        'points': games[room]['points'],
        'state': games[room]['state'],
        'players': list(games[room]['players'].values())
    }, room=sid)

    emit("room_state", {
        'state': games[room]['state'],
        'players': list(games[room]['players'].values())
    }, room=room)

@socketio.on("make_move")
def handle_move(data):
    room = data.get("room")
    if not room: return

    p1 = data.get("p1")
    p2 = data.get("p2")
    move_data = data.get("move", None)
    player = data.get("player", "Anon")
    symbol = data.get("symbol", "?")
    color = data.get("color")

    if not color or color.strip() == "":
        color = games[room]["players"][request.sid]["color"]

    players_sids = list(games[room]['players'].keys())
    turnIndex = games[room]['state'].get('turnIndex', 0)
    if request.sid != players_sids[turnIndex]:
        emit("error", {"message": "No es tu turno"})
        return

    move = move_data if move_data else {"p1": p1, "p2": p2, "player": player, "symbol": symbol, "color": color}

    games[room]['state']['moves'].append(move)
    games[room]['state']['turnIndex'] = (turnIndex + 1) % len(players_sids)

    emit("room_state", {
        'state': games[room]['state'],
        'players': list(games[room]['players'].values())
    }, room=room)

@socketio.on("add_triangle")
def handle_triangle(data):
    room = data.get("room")
    tri = data.get("triangle")

    games[room]['state'].setdefault('triangles', [])
    games[room]['state']['triangles'].append(tri)

    emit("room_state", {
        'state': games[room]['state'],
        'players': list(games[room]['players'].values())
    }, room=room)

@socketio.on("add_square")
def handle_square(data):
    room = data.get("room")
    sq = data.get("square")

    games[room]['state'].setdefault('squares', [])
    games[room]['state']['squares'].append(sq)

    emit("room_state", {
        'state': games[room]['state'],
        'players': list(games[room]['players'].values())
    }, room=room)

@socketio.on("disconnect")
def handle_disconnect():
    sid = request.sid
    for room, info in list(games.items()):
        if sid in info['players']:
            del info['players'][sid]
            emit("room_state", {
                'state': info['state'],
                'players': list(info['players'].values())
            }, room=room)
        if not info['players']:
            del games[room]

# ----------------- RUN -----------------

if __name__ == "__main__":
    socketio.run(app, host="0.0.0.0", port=5000, debug=True)
