const express = require("express");
const cors = require("cors");
const fs = require("fs");
const crypto = require("crypto");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

const PORT = process.env.PORT || 3000;
const GAMES_FILE = "games.json";
const USERS_FILE = "users.json";

app.use(cors());
app.use(express.json({ limit: "5mb" }));

function readJson(file, fallback) {
  if (!fs.existsSync(file)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(file, "utf8") || JSON.stringify(fallback));
  } catch {
    return fallback;
  }
}

function writeJson(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

function getGames() {
  return readJson(GAMES_FILE, []);
}

function saveGames(games) {
  writeJson(GAMES_FILE, games);
}

function getUsers() {
  return readJson(USERS_FILE, []);
}

function saveUsers(users) {
  writeJson(USERS_FILE, users);
}

function hashPassword(password) {
  return crypto.createHash("sha256").update(password).digest("hex");
}

app.get("/", (req, res) => {
  res.send("ElayBlox server is running!");
});

app.get("/games", (req, res) => {
  res.json(getGames().map(g => ({
    id: g.id,
    name: g.name,
    description: g.description,
    image: g.image,
    creator: g.creator || "Unknown",
    link: `https://elayblox-server.onrender.com/play/${g.id}`
  })));
});

app.post("/register", (req, res) => {
  const { username, password } = req.body;

  if (!username || username.length < 3 || username.length > 20) {
    return res.status(400).json({ error: "Username must be 3-20 characters" });
  }

  if (!password || password.length < 4) {
    return res.status(400).json({ error: "Password too short" });
  }

  const users = getUsers();

  if (users.find(u => u.username.toLowerCase() === username.toLowerCase())) {
    return res.status(400).json({ error: "Username already exists" });
  }

  const newUser = {
    id: Date.now().toString(),
    username,
    passwordHash: hashPassword(password),
    avatar: null,
    createdAt: new Date().toISOString()
  };

  users.push(newUser);
  saveUsers(users);

  res.json({
    success: true,
    user: {
      id: newUser.id,
      username: newUser.username,
      avatar: newUser.avatar
    }
  });
});

app.post("/login", (req, res) => {
  const { username, password } = req.body;

  const user = getUsers().find(
    u => u.username.toLowerCase() === username.toLowerCase()
  );

  if (!user || user.passwordHash !== hashPassword(password)) {
    return res.status(400).json({ error: "Wrong username or password" });
  }

  res.json({
    success: true,
    user: {
      id: user.id,
      username: user.username,
      avatar: user.avatar
    }
  });
});

app.post("/publish-block-game", (req, res) => {
  const { name, description, blocks, creator } = req.body;

  if (!name || name.length > 40) {
    return res.status(400).json({ error: "Bad game name" });
  }

  if (!description || description.length > 200) {
    return res.status(400).json({ error: "Bad description" });
  }

  if (!Array.isArray(blocks) || blocks.length === 0) {
    return res.status(400).json({ error: "Add at least 1 block" });
  }

  const safeBlocks = blocks.slice(0, 300).map(b => ({
    type: "block",
    x: Number(b.x) || 0,
    y: Number(b.y) || 0,
    z: Number(b.z) || 0,
    w: Math.max(1, Math.min(50, Number(b.w) || 4)),
    h: Math.max(1, Math.min(50, Number(b.h) || 1)),
    d: Math.max(1, Math.min(50, Number(b.d) || 4)),
    color: String(b.color || "green").slice(0, 20),
    script: ["normal", "bounce", "win", "damage"].includes(b.script)
      ? b.script
      : "normal"
  }));

  const games = getGames();

  const newGame = {
    id: Date.now().toString(),
    name,
    description,
    creator: creator || "Unknown",
    image: "https://picsum.photos/300/180",
    blocks: safeBlocks
  };

  games.push(newGame);
  saveGames(games);

  res.json({
    success: true,
    game: newGame,
    playUrl: `https://elayblox-server.onrender.com/play/${newGame.id}`
  });
});

app.get("/play/:id", (req, res) => {
  const game = getGames().find(g => g.id === req.params.id);

  if (!game) return res.status(404).send("Game not found");

  const safeName = String(game.name).replaceAll("<", "&lt;").replaceAll(">", "&gt;");
  const safeDesc = String(game.description).replaceAll("<", "&lt;").replaceAll(">", "&gt;");

  res.send(`
<!DOCTYPE html>
<html>
<head>
<title>${safeName}</title>
<style>
body{margin:0;overflow:hidden;font-family:Arial;background:#111827;color:white}
#ui{position:fixed;top:10px;left:10px;background:rgba(0,0,0,.5);padding:12px;border-radius:10px;z-index:10}
#mobileControls{position:fixed;bottom:20px;left:20px;right:20px;display:flex;gap:10px;z-index:20}
#mobileControls button{flex:1;padding:18px;font-size:20px;border:none;border-radius:12px;background:rgba(255,255,255,.85);font-weight:bold}
</style>
</head>
<body>

<div id="ui">
  <h2>${safeName}</h2>
  <p>${safeDesc}</p>
  <p>By ${game.creator || "Unknown"}</p>
  <p>WASD move | Space jump</p>
  <p id="status">HP: 100</p>
  <p id="players">Players: 1</p>
</div>

<div id="mobileControls">
  <button id="left">⬅</button>
  <button id="right">➡</button>
  <button id="forward">⬆</button>
  <button id="back">⬇</button>
  <button id="jump">Jump</button>
</div>

<script src="https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.min.js"></script>
<script src="/socket.io/socket.io.js"></script>

<script>
const blocks = ${JSON.stringify(game.blocks)};
const gameId = "${game.id}";
const socket = io();

const params = new URLSearchParams(window.location.search);
const username = params.get("username") || "Guest";

let hp = 100;
let won = false;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87ceeb);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({antialias:true});
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

window.addEventListener("resize", () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
});

const light = new THREE.DirectionalLight(0xffffff, 1);
light.position.set(10,20,10);
scene.add(light);
scene.add(new THREE.AmbientLight(0xffffff,.5));

const blockMeshes = [];

for (const b of blocks) {
  const geo = new THREE.BoxGeometry(b.w,b.h,b.d);
  const mat = new THREE.MeshStandardMaterial({color:b.color});
  const mesh = new THREE.Mesh(geo,mat);
  mesh.position.set(b.x,b.y,b.z);
  mesh.userData.block = b;
  scene.add(mesh);
  blockMeshes.push(mesh);
}

const playerGeo = new THREE.BoxGeometry(1,2,1);
const playerMat = new THREE.MeshStandardMaterial({color:"red"});
const player = new THREE.Mesh(playerGeo, playerMat);
player.position.set(0,5,0);
scene.add(player);

const otherPlayers = {};

function makeNameLabel(name) {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 64;

  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "white";
  ctx.font = "28px Arial";
  ctx.textAlign = "center";
  ctx.fillText(name || "Player", 128, 40);

  const texture = new THREE.CanvasTexture(canvas);
  const mat = new THREE.SpriteMaterial({map:texture});
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(3, .75, 1);
  return sprite;
}

function createOtherPlayer(id, name) {
  if (id === socket.id) return;
  if (otherPlayers[id]) return;

  const geo = new THREE.BoxGeometry(1,2,1);
  const mat = new THREE.MeshStandardMaterial({color:"blue"});
  const mesh = new THREE.Mesh(geo,mat);
  mesh.position.set(0,5,0);
  scene.add(mesh);

  const label = makeNameLabel(name);
  label.position.set(0,7,0);
  scene.add(label);

  otherPlayers[id] = {mesh,label};
  updatePlayerCount();
}

function updatePlayerCount() {
  document.getElementById("players").textContent =
    "Players: " + (Object.keys(otherPlayers).length + 1);
}

socket.emit("joinGame", {gameId, username});

socket.on("currentPlayers", players => {
  for (const id in players) {
    if (id !== socket.id) {
      createOtherPlayer(id, players[id].username);
      otherPlayers[id].mesh.position.set(players[id].x, players[id].y, players[id].z);
      otherPlayers[id].label.position.set(players[id].x, players[id].y + 1.7, players[id].z);
    }
  }
});

socket.on("playerJoined", data => {
  createOtherPlayer(data.id, data.username);
});

socket.on("playerMove", data => {
  if (data.id === socket.id) return;

  createOtherPlayer(data.id, data.username);

  otherPlayers[data.id].mesh.position.set(data.x, data.y, data.z);
  otherPlayers[data.id].label.position.set(data.x, data.y + 1.7, data.z);
});

socket.on("playerLeft", id => {
  if (!otherPlayers[id]) return;

  scene.remove(otherPlayers[id].mesh);
  scene.remove(otherPlayers[id].label);
  delete otherPlayers[id];
  updatePlayerCount();
});

const keys = {};
let velY = 0;
let grounded = false;

document.addEventListener("keydown", e => keys[e.key.toLowerCase()] = true);
document.addEventListener("keyup", e => keys[e.key.toLowerCase()] = false);

function holdButton(id,key){
  const btn = document.getElementById(id);

  btn.addEventListener("touchstart", e => {
    e.preventDefault();
    keys[key] = true;
  });

  btn.addEventListener("touchend", e => {
    e.preventDefault();
    keys[key] = false;
  });

  btn.addEventListener("mousedown", e => {
    e.preventDefault();
    keys[key] = true;
  });

  btn.addEventListener("mouseup", e => {
    e.preventDefault();
    keys[key] = false;
  });

  btn.addEventListener("mouseleave", () => keys[key] = false);
}

holdButton("left","a");
holdButton("right","d");
holdButton("forward","w");
holdButton("back","s");
holdButton("jump"," ");

function intersects(a,b){
  const A = new THREE.Box3().setFromObject(a);
  const B = new THREE.Box3().setFromObject(b);
  return A.intersectsBox(B);
}

let lastSent = 0;

function update(){
  if (won) return;

  const speed = .12;

  if (keys["w"]) player.position.z -= speed;
  if (keys["s"]) player.position.z += speed;
  if (keys["a"]) player.position.x -= speed;
  if (keys["d"]) player.position.x += speed;

  if (keys[" "] && grounded) {
    velY = .28;
    grounded = false;
  }

  velY -= .012;
  player.position.y += velY;
  grounded = false;

  for (const mesh of blockMeshes) {
    const b = mesh.userData.block;

    if (intersects(player, mesh) && velY <= 0) {
      player.position.y = mesh.position.y + b.h / 2 + 1;
      velY = 0;
      grounded = true;

      if (b.script === "bounce") velY = .45;

      if (b.script === "damage") {
        hp -= 1;
        document.getElementById("status").textContent = "HP: " + hp;

        if (hp <= 0) {
          player.position.set(0,5,0);
          hp = 100;
          document.getElementById("status").textContent = "HP: 100";
        }
      }

      if (b.script === "win") {
        won = true;
        document.getElementById("status").textContent = "YOU WIN!";
        alert("You win!");
      }
    }
  }

  if (player.position.y < -20) {
    player.position.set(0,5,0);
    velY = 0;
  }

  camera.position.set(player.position.x + 8, player.position.y + 6, player.position.z + 10);
  camera.lookAt(player.position);

  const now = Date.now();
  if (now - lastSent > 50) {
    socket.emit("playerMove", {
      gameId,
      username,
      x: player.position.x,
      y: player.position.y,
      z: player.position.z
    });
    lastSent = now;
  }
}

function loop(){
  update();
  renderer.render(scene,camera);
  requestAnimationFrame(loop);
}

loop();
</script>
</body>
</html>
  `);
});

const gameRooms = {};

io.on("connection", socket => {
  socket.on("joinGame", data => {
    const gameId = data.gameId || "default";
    const username = data.username || "Guest";

    socket.join(gameId);
    socket.gameId = gameId;

    if (!gameRooms[gameId]) gameRooms[gameId] = {};

    gameRooms[gameId][socket.id] = {
      username,
      x: 0,
      y: 5,
      z: 0
    };

    socket.emit("currentPlayers", gameRooms[gameId]);

    socket.to(gameId).emit("playerJoined", {
      id: socket.id,
      username
    });
  });

  socket.on("playerMove", data => {
    const gameId = data.gameId || socket.gameId;
    if (!gameId || !gameRooms[gameId] || !gameRooms[gameId][socket.id]) return;

    gameRooms[gameId][socket.id] = {
      username: data.username || "Guest",
      x: Number(data.x) || 0,
      y: Number(data.y) || 0,
      z: Number(data.z) || 0
    };

    socket.to(gameId).emit("playerMove", {
      id: socket.id,
      username: data.username || "Guest",
      x: Number(data.x) || 0,
      y: Number(data.y) || 0,
      z: Number(data.z) || 0
    });
  });

  socket.on("disconnect", () => {
    const gameId = socket.gameId;

    if (gameId && gameRooms[gameId]) {
      delete gameRooms[gameId][socket.id];
      socket.to(gameId).emit("playerLeft", socket.id);
    }
  });
});

server.listen(PORT, () => {
  console.log("Server running on port " + PORT);
});
