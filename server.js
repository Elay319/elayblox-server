const express = require("express");
const cors = require("cors");
const fs = require("fs");

const app = express();
const PORT = process.env.PORT || 3000;
const GAMES_FILE = "games.json";

app.use(cors());
app.use(express.json({ limit: "5mb" }));

function getGames() {
  if (!fs.existsSync(GAMES_FILE)) return [];
  try {
    return JSON.parse(fs.readFileSync(GAMES_FILE, "utf8") || "[]");
  } catch {
    return [];
  }
}

function saveGames(games) {
  fs.writeFileSync(GAMES_FILE, JSON.stringify(games, null, 2));
}

app.get("/", (req, res) => {
  res.send("ElayBlox server is running!");
});

app.get("/games", (req, res) => {
  const games = getGames().map(g => ({
    id: g.id,
    name: g.name,
    description: g.description,
    image: g.image,
    link: `https://elayblox-server.onrender.com/play/${g.id}`
  }));

  res.json(games);
});

app.post("/publish-block-game", (req, res) => {
  const { name, description, blocks } = req.body;

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

  if (!game) {
    return res.status(404).send("Game not found");
  }

  const safeName = String(game.name).replaceAll("<", "&lt;").replaceAll(">", "&gt;");
  const safeDesc = String(game.description).replaceAll("<", "&lt;").replaceAll(">", "&gt;");

  res.send(`
<!DOCTYPE html>
<html>
<head>
  <title>${safeName}</title>
  <style>
    body {
      margin: 0;
      overflow: hidden;
      font-family: Arial;
      background: #111827;
      color: white;
    }

    #ui {
      position: fixed;
      top: 10px;
      left: 10px;
      background: rgba(0,0,0,0.5);
      padding: 12px;
      border-radius: 10px;
      z-index: 10;
    }

    #mobileControls {
      position: fixed;
      bottom: 20px;
      left: 20px;
      right: 20px;
      display: flex;
      gap: 10px;
      z-index: 20;
    }

    #mobileControls button {
      flex: 1;
      padding: 18px;
      font-size: 20px;
      border: none;
      border-radius: 12px;
      background: rgba(255,255,255,0.85);
      font-weight: bold;
    }
  </style>
</head>
<body>
  <div id="ui">
    <h2>${safeName}</h2>
    <p>${safeDesc}</p>
    <p>WASD move | Space jump</p>
    <p id="status">HP: 100</p>
  </div>

  <div id="mobileControls">
    <button id="left">⬅</button>
    <button id="right">➡</button>
    <button id="forward">⬆</button>
    <button id="back">⬇</button>
    <button id="jump">Jump</button>
  </div>

  <script src="https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.min.js"></script>

  <script>
    const blocks = ${JSON.stringify(game.blocks)};
    let hp = 100;
    let won = false;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87ceeb);

    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    const renderer = new THREE.WebGLRenderer({ antialias: true });

    renderer.setSize(window.innerWidth, window.innerHeight);
    document.body.appendChild(renderer.domElement);

    window.addEventListener("resize", () => {
      renderer.setSize(window.innerWidth, window.innerHeight);
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
    });

    const light = new THREE.DirectionalLight(0xffffff, 1);
    light.position.set(10, 20, 10);
    scene.add(light);
    scene.add(new THREE.AmbientLight(0xffffff, 0.5));

    const blockMeshes = [];

    for (const b of blocks) {
      const geo = new THREE.BoxGeometry(b.w, b.h, b.d);
      const mat = new THREE.MeshStandardMaterial({ color: b.color });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(b.x, b.y, b.z);
      mesh.userData.block = b;
      scene.add(mesh);
      blockMeshes.push(mesh);
    }

    const playerGeo = new THREE.BoxGeometry(1, 2, 1);
    const playerMat = new THREE.MeshStandardMaterial({ color: "red" });
    const player = new THREE.Mesh(playerGeo, playerMat);
    player.position.set(0, 5, 0);
    scene.add(player);

    const keys = {};
    let velY = 0;
    let grounded = false;

    document.addEventListener("keydown", e => keys[e.key.toLowerCase()] = true);
    document.addEventListener("keyup", e => keys[e.key.toLowerCase()] = false);

    function holdButton(id, key) {
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

      btn.addEventListener("mouseleave", () => {
        keys[key] = false;
      });
    }

    holdButton("left", "a");
    holdButton("right", "d");
    holdButton("forward", "w");
    holdButton("back", "s");
    holdButton("jump", " ");

    function intersects(a, b) {
      const A = new THREE.Box3().setFromObject(a);
      const B = new THREE.Box3().setFromObject(b);
      return A.intersectsBox(B);
    }

    function update() {
      if (won) return;

      let speed = 0.12;

      if (keys["w"]) player.position.z -= speed;
      if (keys["s"]) player.position.z += speed;
      if (keys["a"]) player.position.x -= speed;
      if (keys["d"]) player.position.x += speed;

      if (keys[" "] && grounded) {
        velY = 0.28;
        grounded = false;
      }

      velY -= 0.012;
      player.position.y += velY;

      grounded = false;

      for (const mesh of blockMeshes) {
        const b = mesh.userData.block;

        if (intersects(player, mesh) && velY <= 0) {
          player.position.y = mesh.position.y + b.h / 2 + 1;
          velY = 0;
          grounded = true;

          if (b.script === "bounce") {
            velY = 0.45;
          }

          if (b.script === "damage") {
            hp -= 1;
            document.getElementById("status").textContent = "HP: " + hp;

            if (hp <= 0) {
              player.position.set(0, 5, 0);
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
        player.position.set(0, 5, 0);
        velY = 0;
      }

      camera.position.set(
        player.position.x + 8,
        player.position.y + 6,
        player.position.z + 10
      );
      camera.lookAt(player.position);
    }

    function loop() {
      update();
      renderer.render(scene, camera);
      requestAnimationFrame(loop);
    }

    loop();
  </script>
</body>
</html>
  `);
});

app.listen(PORT, () => {
  console.log("Server running on port " + PORT);
});
