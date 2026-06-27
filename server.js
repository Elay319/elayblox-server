const express = require("express");
const cors = require("cors");
const fs = require("fs");
const crypto = require("crypto");
const http = require("http");
const multer = require("multer");
const path = require("path");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

const PORT = process.env.PORT || 3000;
const GAMES_FILE = "games.json";
const USERS_FILE = "users.json";

app.use(cors());
app.use(express.json({ limit: "5mb" }));
app.use("/uploads", express.static("uploads"));

if (!fs.existsSync("uploads")) fs.mkdirSync("uploads");
if (!fs.existsSync("uploads/avatars")) fs.mkdirSync("uploads/avatars");

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "uploads/avatars"),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, Date.now() + ext);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (
      file.mimetype === "image/png" ||
      file.mimetype === "image/jpeg" ||
      file.mimetype === "image/webp"
    ) cb(null, true);
    else cb(new Error("Only images allowed"));
  }
});

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

function getGames() { return readJson(GAMES_FILE, []); }
function saveGames(games) { writeJson(GAMES_FILE, games); }
function getUsers() { return readJson(USERS_FILE, []); }
function saveUsers(users) { writeJson(USERS_FILE, users); }

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
    creatorId: g.creatorId || null,
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

  shirtColor: req.body.shirtColor || "red",
  skinColor: req.body.skinColor || "peachpuff",
  pantsColor: req.body.pantsColor || "black",

  friends: [],
  friendRequests: [],
  currentGameId: null,

  createdAt: new Date().toISOString()
};
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
    avatar: user.avatar,
    shirtColor: user.shirtColor,
    skinColor: user.skinColor,
    pantsColor: user.pantsColor
  }
});

});

app.post("/publish-block-game", (req, res) => {
  const { name, description, blocks, creator, creatorId } = req.body;

  if (!name || name.length > 40) {
    return res.status(400).json({ error: "Bad game name" });
  }

  if (!description || description.length > 200) {
    return res.status(400).json({ error: "Bad description" });
  }

  if (!Array.isArray(blocks) || blocks.length === 0) {
    return res.status(400).json({ error: "Add at least 1 block" });
  }

  const safeBlocks = blocks.slice(0, 1000).map(b => ({
  id: String(b.id || ""),
  type: String(b.type || "block"),
  name: String(b.name || "Object"),

  x: Number(b.x) || 0,
  y: Number(b.y) || 0,
  z: Number(b.z) || 0,

  w: Math.max(1, Math.min(50, Number(b.w) || 4)),
  h: Math.max(0.2, Math.min(50, Number(b.h) || 1)),
  d: Math.max(1, Math.min(50, Number(b.d) || 4)),

  color: String(b.color || "green").slice(0,20),

  script: String(b.script || "normal"),

  scripts: Array.isArray(b.scripts)
    ? b.scripts.slice(0,20)
    : [],

  tpTarget: b.tpTarget || null
}));
const games = getGames();
const newGame = {
  id: Date.now().toString(),
  name,
  description,
  creator: creator || "Unknown",
  creatorId: creatorId || null,
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

app.post("/upload-avatar", upload.single("avatar"), (req, res) => {
  const { userId } = req.body;

  if (!userId) return res.status(400).json({ error: "Missing userId" });
  if (!req.file) return res.status(400).json({ error: "Missing avatar file" });

  const users = getUsers();
  const user = users.find(u => u.id === userId);

  if (!user) return res.status(404).json({ error: "User not found" });

  const avatarUrl =
    "https://elayblox-server.onrender.com/uploads/avatars/" +
    req.file.filename;

  user.avatar = avatarUrl;
  saveUsers(users);

  res.json({
    success: true,
    avatar: avatarUrl,
    user: {
      id: user.id,
      username: user.username,
      avatar: user.avatar
    }
  });
});

app.get("/game/:id", (req, res) => {
  const game = getGames().find(g => g.id === req.params.id);

  if (!game) {
    return res.status(404).json({ error: "Game not found" });
  }

  res.json(game);
});

app.post("/update-avatar-style", (req, res) => {
  const { userId, shirtColor, skinColor, pantsColor } = req.body;

  const users = getUsers();
  const user = users.find(u => u.id === userId);

  if (!user) return res.status(404).json({ error: "User not found" });

  user.shirtColor = shirtColor || user.shirtColor || "red";
  user.skinColor = skinColor || user.skinColor || "peachpuff";
  user.pantsColor = pantsColor || user.pantsColor || "black";

  saveUsers(users);

  res.json({
    success: true,
    user: {
      id: user.id,
      username: user.username,
      avatar: user.avatar,
      shirtColor: user.shirtColor,
      skinColor: user.skinColor,
      pantsColor: user.pantsColor
    }
  });
});

app.post("/delete-game", (req, res) => {
  const { gameId, userId } = req.body;

  const games = getGames();
  const game = games.find(g => g.id === gameId);

  if (!game) {
    return res.status(404).json({ error: "Game not found" });
  }

  if (game.creatorId !== userId) {
    return res.status(403).json({ error: "You do not own this game" });
  }

  saveGames(games.filter(g => g.id !== gameId));

  res.json({ success: true });
});

app.post("/update-game", (req, res) => {
  const { gameId, userId, name, description, blocks } = req.body;

  const games = getGames();
  const game = games.find(g => g.id === gameId);

  if (!game) {
    return res.status(404).json({ error: "Game not found" });
  }

  if (game.creatorId !== userId) {
    return res.status(403).json({ error: "You do not own this game" });
  }

  game.name = name;
  game.description = description;
  game.blocks = blocks;

  saveGames(games);

  res.json({
    success: true,
    game,
    playUrl: `https://elayblox-server.onrender.com/play/${game.id}`
  });
});

app.post("/send-friend-request", (req, res) => {
  const { fromUserId, toUsername } = req.body;

  const users = getUsers();
  const fromUser = users.find(u => u.id === fromUserId);
  const toUser = users.find(u => u.username.toLowerCase() === String(toUsername).toLowerCase());

  if (!fromUser) return res.status(404).json({ error: "Your user was not found" });
  if (!toUser) return res.status(404).json({ error: "User not found" });
  if (fromUser.id === toUser.id) return res.status(400).json({ error: "You cannot friend yourself" });

  fromUser.friends = fromUser.friends || [];
  toUser.friendRequests = toUser.friendRequests || [];

  if (fromUser.friends.includes(toUser.id)) {
    return res.status(400).json({ error: "Already friends" });
  }

  if (!toUser.friendRequests.includes(fromUser.id)) {
    toUser.friendRequests.push(fromUser.id);
  }

  saveUsers(users);
  res.json({ success: true });
});

app.post("/accept-friend-request", (req, res) => {
  const { userId, fromUserId } = req.body;

  const users = getUsers();
  const user = users.find(u => u.id === userId);
  const fromUser = users.find(u => u.id === fromUserId);

  if (!user || !fromUser) return res.status(404).json({ error: "User not found" });

  user.friends = user.friends || [];
  fromUser.friends = fromUser.friends || [];
  user.friendRequests = user.friendRequests || [];

  user.friendRequests = user.friendRequests.filter(id => id !== fromUserId);

  if (!user.friends.includes(fromUserId)) user.friends.push(fromUserId);
  if (!fromUser.friends.includes(userId)) fromUser.friends.push(userId);

  saveUsers(users);
  res.json({ success: true });
});

app.get("/friends/:userId", (req, res) => {
  const users = getUsers();
  const user = users.find(u => u.id === req.params.userId);

  if (!user) return res.status(404).json({ error: "User not found" });

  const friends = (user.friends || []).map(id => users.find(u => u.id === id)).filter(Boolean);
  const requests = (user.friendRequests || []).map(id => users.find(u => u.id === id)).filter(Boolean);

  res.json({
    success: true,
    friends: friends.map(u => ({
      id: u.id,
      username: u.username,
      avatar: u.avatar,
      currentGameId: u.currentGameId || null
    })),
    requests: requests.map(u => ({
      id: u.id,
      username: u.username,
      avatar: u.avatar
    }))
  });
});

app.post("/set-current-game", (req, res) => {
  const { userId, gameId } = req.body;

  const users = getUsers();
  const user = users.find(u => u.id === userId);

  if (!user) return res.status(404).json({ error: "User not found" });

  user.currentGameId = gameId || null;
  saveUsers(users);

  res.json({ success: true });
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
#chatBox{position:fixed;right:10px;bottom:100px;width:260px;height:220px;background:rgba(0,0,0,.55);border-radius:10px;padding:10px;z-index:30}
#chatMessages{height:170px;overflow-y:auto;font-size:14px}
#chatInput{width:100%;box-sizing:border-box;padding:8px}
</style>
</head>
<body>

<div id="ui">
  <h2>${safeName}</h2>
  <p>${safeDesc}</p>
  <p>By ${game.creator || "Unknown"}</p>
  <p>WASD move | Space jump</p>

  <p id="status">HP: 100 | Coins: 0</p>
  <p id="camlockStatus">CamLock: OFF</p>

  <p id="players">Players: 1</p>

  <p>
    <a style="color:white;background:#ef4444;padding:8px 12px;border-radius:8px;text-decoration:none;display:inline-block"
       href="https://elay319.github.io/elayblox/play.html">
      🚪 Exit Game
    </a>
  </p>
</div>

<div id="mobileControls">
  <button id="left">⬅</button>
  <button id="right">➡</button>
  <button id="forward">⬆</button>
  <button id="back">⬇</button>
  <button id="jump">Jump</button>
</div>

<div id="chatBox">
  <div id="chatMessages"></div>
  <input id="chatInput" placeholder="Type chat and press Enter">
</div>

<script src="https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.min.js"></script>
<script src="/socket.io/socket.io.js"></script>

<script>
const blocks = ${JSON.stringify(game.blocks)};
const gameId = "${game.id}";
const socket = io();

const params = new URLSearchParams(window.location.search);
const username = params.get("username") || "Guest";
const avatar = params.get("avatar") || "";
const shirtColor = params.get("shirtColor") || "red";
const skinColor = params.get("skinColor") || "peachpuff";
const pantsColor = params.get("pantsColor") || "black";

let hp = 100;
let coins = 0;
let won = false;
let checkpoint = { x: 0, y: 5, z: 0 };
let speedBoostUntil = 0;
const collectedCoins = new Set();

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

function createAvatar(shirtColor, skinColor, pantsColor){
  const group = new THREE.Group();

  shirtColor = shirtColor || "red";
  skinColor = skinColor || "peachpuff";
  pantsColor = pantsColor || "black";

  function part(w,h,d,color,x,y,z){
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(w,h,d),
      new THREE.MeshStandardMaterial({color})
    );
    mesh.position.set(x,y,z);
    group.add(mesh);
    return mesh;
  }

  const torso = part(1,1.1,0.45,shirtColor,0,0.2,0);
  const head = part(0.7,0.7,0.7,skinColor,0,1.15,0);

  const leftArm = part(0.3,1,0.3,skinColor,-0.75,0.15,0);
  const rightArm = part(0.3,1,0.3,skinColor,0.75,0.15,0);

  const leftLeg = part(0.35,0.9,0.35,pantsColor,-0.25,-0.85,0);
  const rightLeg = part(0.35,0.9,0.35,pantsColor,0.25,-0.85,0);

  const faceCanvas = document.createElement("canvas");
  faceCanvas.width = 128;
  faceCanvas.height = 128;
  const ctx = faceCanvas.getContext("2d");

  ctx.fillStyle = skinColor;
  ctx.fillRect(0,0,128,128);

  ctx.fillStyle = "black";
  ctx.fillRect(35,45,12,12);
  ctx.fillRect(80,45,12,12);

  ctx.fillRect(45,85,38,8);

  const faceTexture = new THREE.CanvasTexture(faceCanvas);
  const faceMat = new THREE.MeshStandardMaterial({map:faceTexture});

  const face = new THREE.Mesh(
    new THREE.PlaneGeometry(0.62,0.62),
    faceMat
  );

  face.position.set(0,1.15,0.356);
  group.add(face);

  group.userData.parts = {
    torso,
    head,
    leftArm,
    rightArm,
    leftLeg,
    rightLeg,
    face
  };

  return group;
}

function animateAvatar(model, moving, jumping){
  if (!model || !model.userData.parts) return;

  const p = model.userData.parts;
  const t = Date.now() * 0.012;

  if (jumping) {
    p.leftArm.rotation.x = -0.9;
    p.rightArm.rotation.x = -0.9;
    p.leftLeg.rotation.x = 0.25;
    p.rightLeg.rotation.x = 0.25;
    return;
  }

  if (moving) {
    p.leftArm.rotation.x = Math.sin(t) * 0.8;
    p.rightArm.rotation.x = -Math.sin(t) * 0.8;

    p.leftLeg.rotation.x = -Math.sin(t) * 0.7;
    p.rightLeg.rotation.x = Math.sin(t) * 0.7;

    p.torso.rotation.y = Math.sin(t) * 0.05;
  } else {
    p.leftArm.rotation.x *= 0.75;
    p.rightArm.rotation.x *= 0.75;
    p.leftLeg.rotation.x *= 0.75;
    p.rightLeg.rotation.x *= 0.75;
    p.torso.rotation.y *= 0.75;
  }
}

const player = createAvatar(
    shirtColor,
    skinColor,
    pantsColor
);

if (avatar) {
    const loader = new THREE.TextureLoader();

    loader.load(
        avatar,
        texture => {
            player.userData.parts.face.material.map = texture;
            player.userData.parts.face.material.needsUpdate = true;
        },
        undefined,
        () => console.log("Avatar failed to load.")
    );
}

player.position.set(0, 5, 0);
scene.add(player);
let camYaw = 0;
let camPitch = 0.35;
let camDistance = 10;
let camLock = false;
let rightMouseDown = false;

document.addEventListener("contextmenu", e => e.preventDefault());

document.addEventListener("mousedown", e => {
    if (e.button === 2) rightMouseDown = true;
});

document.addEventListener("mouseup", e => {
    if (e.button === 2) rightMouseDown = false;
});
document.addEventListener("mousemove", e => {
  if (!rightMouseDown && !camLock) return;

  camYaw -= e.movementX * 0.005;
  camPitch -= e.movementY * 0.005;

  camPitch = Math.max(-0.2, Math.min(1.2, camPitch));
});

document.addEventListener("wheel", e => {
    camDistance += e.deltaY * 0.01;
    camDistance = Math.max(4, Math.min(18, camDistance));
});


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

function createOtherPlayer(
    id,
    name,
    avatarUrl,
    shirtColor,
    skinColor,
    pantsColor
) {

    if (id === socket.id) return;
    if (otherPlayers[id]) return;

    const mesh = createAvatar(
        shirtColor,
        skinColor,
        pantsColor
    );

    if (avatarUrl) {
        const loader = new THREE.TextureLoader();

        loader.load(avatarUrl, texture => {
            mesh.userData.parts.face.material.map = texture;
            mesh.userData.parts.face.material.needsUpdate = true;
        });
    }

    mesh.position.set(0,5,0);
    scene.add(mesh);

    const label = makeNameLabel(name);
    label.position.set(0,7,0);
    scene.add(label);

otherPlayers[id] = {
    mesh,
    label,
    lastX: 0,
    lastY: 5,
    lastZ: 0
};

    updatePlayerCount();
}
function updatePlayerCount() {
  document.getElementById("players").textContent =
    "Players: " + (Object.keys(otherPlayers).length + 1);
}

socket.emit("joinGame", {gameId, username, avatar,shirtColor,skinColor,pantsColor});

fetch("https://elayblox-server.onrender.com/set-current-game", {
  method: "POST",
  headers: {"Content-Type":"application/json"},
  body: JSON.stringify({
    userId: new URLSearchParams(window.location.search).get("userId"),
    gameId
  })
});

const chatInput = document.getElementById("chatInput");
const chatMessages = document.getElementById("chatMessages");

chatInput.addEventListener("keydown", e => {
  e.stopPropagation();

  if (e.key === "Enter") {
    const text = chatInput.value.trim();

    if (text.length > 0 && text.length <= 100) {
      socket.emit("chatMessage", { gameId, username, text });
      chatInput.value = "";
    }
  }
});

socket.on("chatMessage", data => {
  const div = document.createElement("div");
  div.textContent = data.username + ": " + data.text;
  chatMessages.appendChild(div);
  chatMessages.scrollTop = chatMessages.scrollHeight;
});

socket.on("currentPlayers", players => {
  for (const id in players) {
    if (id !== socket.id) {
      createOtherPlayer(
    id,
    players[id].username,
    players[id].avatar,
    players[id].shirtColor,
    players[id].skinColor,
    players[id].pantsColor
);
      otherPlayers[id].mesh.position.set(players[id].x, players[id].y, players[id].z);
      otherPlayers[id].label.position.set(players[id].x, players[id].y + 1.7, players[id].z);

      if (otherPlayers[id].avatar) {
        otherPlayers[id].avatar.position.set(players[id].x, players[id].y + 2.8, players[id].z);
      }
    }
  }
});

socket.on("playerJoined", data => {
    createOtherPlayer(
        data.id,
        data.username,
        data.avatar,
        data.shirtColor,
        data.skinColor,
        data.pantsColor
    );
});

socket.on("playerMove", data => {
  if (data.id === socket.id) return;

  createOtherPlayer(
    data.id,
    data.username,
    data.avatar,
    data.shirtColor,
    data.skinColor,
    data.pantsColor
);
const op = otherPlayers[data.id];

const dx = Math.abs(data.x - op.lastX);
const dy = Math.abs(data.y - op.lastY);
const dz = Math.abs(data.z - op.lastZ);

animateAvatar(
    op.mesh,
    dx > 0.01 || dz > 0.01,
    dy > 0.05
);

op.mesh.position.set(data.x, data.y, data.z);

op.label.position.set(
    data.x,
    data.y + 3.2,
    data.z
);

op.lastX = data.x;
op.lastY = data.y;
op.lastZ = data.z;

if (otherPlayers[data.id].avatar) {
    otherPlayers[data.id].avatar.position.set(
        data.x,
        data.y + 3.3,
        data.z
    );
}
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


document.addEventListener("keydown", e => {
  if (document.activeElement === chatInput) return;
  keys[e.key.toLowerCase()] = true;
});
document.addEventListener("keydown", e => {
    if (e.code !== "ShiftLeft") return;

    camLock = !camLock;

    if (camLock) {
        document.body.requestPointerLock();
        document.body.style.cursor = "none";
    } else {
        document.exitPointerLock();
        document.body.style.cursor = "default";
    }

    document.getElementById("camlockStatus").textContent =
        "CamLock: " + (camLock ? "ON" : "OFF");
});
document.addEventListener("keyup", e => {
  if (document.activeElement === chatInput) return;
  keys[e.key.toLowerCase()] = false;
});

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

document.addEventListener("pointerlockchange", () => {
    if (document.pointerLockElement !== document.body) {
        camLock = false;
        document.body.style.cursor = "default";
        document.getElementById("camlockStatus").textContent =
            "CamLock: OFF";
    }
});

  btn.addEventListener("mouseleave", () => keys[key] = false);
}

holdButton("left","a");
holdButton("right","d");
holdButton("forward","w");
holdButton("back","s");
holdButton("jump"," ");

const playerBox = new THREE.Box3();
const blockBox = new THREE.Box3();
const PLAYER_HEIGHT = 2.8;

function intersectsBlock(mesh){
  playerBox.setFromCenterAndSize(
    player.position,
    new THREE.Vector3(1, PLAYER_HEIGHT, 1)
  );

  blockBox.setFromObject(mesh);
  return playerBox.intersectsBox(blockBox);
}

let lastSent = 0;

function update(){
  if (won) return;
  
const moving =
  keys["w"] ||
  keys["s"] ||
  keys["a"] ||
  keys["d"];

animateAvatar(player, moving, !grounded);

  const speed = Date.now() < speedBoostUntil ? .8 : .12;

if (keys["w"]) {
  player.position.x += Math.sin(camYaw) * speed;
  player.position.z += Math.cos(camYaw) * speed;
}

if (keys["s"]) {
  player.position.x -= Math.sin(camYaw) * speed;
  player.position.z -= Math.cos(camYaw) * speed;
}

if (keys["d"]) {
  player.position.x -= Math.cos(camYaw) * speed;
  player.position.z += Math.sin(camYaw) * speed;
}

if (keys["a"]) {
  player.position.x += Math.cos(camYaw) * speed;
  player.position.z -= Math.sin(camYaw) * speed;
}

if (camLock) {
    player.rotation.y = camYaw;
}
  

  if (keys[" "] && grounded) {
    velY = .28;
    grounded = false;
  }

  if (!grounded) {
  velY -= .012;
}

player.position.y += velY;
grounded = false;

  for (const mesh of blockMeshes) {
    const b = mesh.userData.block;

    if (intersectsBlock(mesh) && velY <= 0) {
      player.position.y = mesh.position.y + b.h / 2 + PLAYER_HEIGHT / 2;
      velY = 0;
      grounded = true;

      if (b.script === "bounce") {
        velY = .45;
      }

      if (b.script === "speed") {
        speedBoostUntil = Date.now() + 3000;
      }

      if (b.script === "teleport") {
        player.position.set(checkpoint.x, checkpoint.y, checkpoint.z);
        velY = 0;
      }

      if (b.script === "checkpoint") {
        checkpoint = {
          x: mesh.position.x,
          y: mesh.position.y + b.h / 2 + 2,
          z: mesh.position.z
        };
      }

      if (b.script === "coin") {
        const coinId = mesh.uuid;

        if (!collectedCoins.has(coinId)) {
          collectedCoins.add(coinId);
          coins += 1;
          scene.remove(mesh);

          document.getElementById("status").textContent =
            "HP: " + hp + " | Coins: " + coins;
        }
      }

      if (b.script === "kill") {
        player.position.set(checkpoint.x, checkpoint.y, checkpoint.z);
        velY = 0;
      }

      if (b.script === "damage") {
        hp -= 1;
        document.getElementById("status").textContent =
          "HP: " + hp + " | Coins: " + coins;

        if (hp <= 0) {
          player.position.set(checkpoint.x, checkpoint.y, checkpoint.z);
          hp = 100;
          document.getElementById("status").textContent =
            "HP: 100 | Coins: " + coins;
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
    player.position.set(checkpoint.x, checkpoint.y, checkpoint.z);
    velY = 0;
  }

const camX =
  player.position.x -
  Math.sin(camYaw) * Math.cos(camPitch) * camDistance;

const camY =
  player.position.y +
  2 +
  Math.sin(camPitch) * camDistance;

const camZ =
  player.position.z -
  Math.cos(camYaw) * Math.cos(camPitch) * camDistance;

camera.position.set(camX, camY, camZ);

camera.lookAt(
  player.position.x,
  player.position.y + 1.4,
  player.position.z
);

camera.lookAt(
    player.position.x,
    player.position.y + 1.5,
    player.position.z
);

  const now = Date.now();

  if (now - lastSent > 50) {
    socket.emit("playerMove", {
      gameId,
      username,
      avatar,
      x: player.position.x,
      y: player.position.y,
      z: player.position.z,
      shirtColor,
      skinColor,
      pantsColor
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
    const avatar = data.avatar || "";
    const shirtColor = data.shirtColor || "red";
    const skinColor = data.skinColor || "peachpuff";
    const pantsColor = data.pantsColor || "black";

    socket.join(gameId);
    socket.gameId = gameId;

    if (!gameRooms[gameId]) gameRooms[gameId] = {};

gameRooms[gameId][socket.id] = {
    username,
    avatar,

    shirtColor,
    skinColor,
    pantsColor,

    x:0,
    y:5,
    z:0
};

    socket.emit("currentPlayers", gameRooms[gameId]);

socket.to(gameId).emit("playerJoined", {
    id: socket.id,
    username,
    avatar,
    shirtColor,
    skinColor,
    pantsColor
});
  });

  socket.on("playerMove", data => {
    const gameId = data.gameId || socket.gameId;
    if (!gameId || !gameRooms[gameId] || !gameRooms[gameId][socket.id]) return;

    gameRooms[gameId][socket.id] = {
    username: data.username || "Guest",
    avatar: data.avatar || "",

    shirtColor: data.shirtColor || "red",
    skinColor: data.skinColor || "peachpuff",
    pantsColor: data.pantsColor || "black",

    x: Number(data.x) || 0,
    y: Number(data.y) || 0,
    z: Number(data.z) || 0
};

    socket.to(gameId).emit("playerMove", {
    id: socket.id,
    username: data.username || "Guest",
    avatar: data.avatar || "",

    shirtColor: data.shirtColor || "red",
    skinColor: data.skinColor || "peachpuff",
    pantsColor: data.pantsColor || "black",

    x: Number(data.x) || 0,
    y: Number(data.y) || 0,
    z: Number(data.z) || 0
});
});
  socket.on("chatMessage", data => {
    const gameId = data.gameId || socket.gameId;
    if (!gameId) return;

    const username = String(data.username || "Guest").slice(0, 20);
    const text = String(data.text || "").slice(0, 100);

    if (!text.trim()) return;

    io.to(gameId).emit("chatMessage", {
      username,
      text
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
