const express = require("express");
const cors = require("cors");
const fs = require("fs");

const app = express();
const PORT = process.env.PORT || 3000;
const GAMES_FILE = "games.json";

app.use(cors());
app.use(express.json({ limit: "2mb" }));

function getGames() {
  if (!fs.existsSync(GAMES_FILE)) return [];
  return JSON.parse(fs.readFileSync(GAMES_FILE, "utf8") || "[]");
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

  if (!Array.isArray(blocks)) {
    return res.status(400).json({ error: "Blocks must be an array" });
  }

  const safeBlocks = blocks.slice(0, 200).map(b => ({
    x: Number(b.x) || 0,
    y: Number(b.y) || 0,
    w: Number(b.w) || 50,
    h: Number(b.h) || 50,
    color: String(b.color || "green")
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
  const games = getGames();
  const game = games.find(g => g.id === req.params.id);

  if (!game) {
    return res.status(404).send("Game not found");
  }

  res.send(`
<!DOCTYPE html>
<html>
<head>
  <title>${game.name}</title>
  <style>
    body {
      margin: 0;
      background: #111;
      color: white;
      font-family: Arial;
      text-align: center;
    }

    canvas {
      background: skyblue;
      display: block;
      margin: 20px auto;
      border: 3px solid white;
    }
  </style>
</head>
<body>
  <h1>${game.name}</h1>
  <p>${game.description}</p>
  <canvas id="game" width="800" height="450"></canvas>

  <script>
    const blocks = ${JSON.stringify(game.blocks)};
    const canvas = document.getElementById("game");
    const ctx = canvas.getContext("2d");

    const keys = {};
    const player = {
      x: 50,
      y: 50,
      w: 30,
      h: 40,
      vx: 0,
      vy: 0,
      grounded: false
    };

    document.addEventListener("keydown", e => keys[e.key.toLowerCase()] = true);
    document.addEventListener("keyup", e => keys[e.key.toLowerCase()] = false);

    function hit(a, b) {
      return a.x < b.x + b.w &&
             a.x + a.w > b.x &&
             a.y < b.y + b.h &&
             a.y + a.h > b.y;
    }

    function update() {
      player.vx = 0;

      if (keys["a"] || keys["arrowleft"]) player.vx = -5;
      if (keys["d"] || keys["arrowright"]) player.vx = 5;

      if ((keys["w"] || keys[" "] || keys["arrowup"]) && player.grounded) {
        player.vy = -12;
        player.grounded = false;
      }

      player.vy += 0.6;
      player.x += player.vx;
      player.y += player.vy;

      player.grounded = false;

      for (const b of blocks) {
        if (hit(player, b) && player.vy > 0) {
          player.y = b.y - player.h;
          player.vy = 0;
          player.grounded = true;
        }
      }

      if (player.y > 600) {
        player.x = 50;
        player.y = 50;
        player.vy = 0;
      }
    }

    function draw() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      for (const b of blocks) {
        ctx.fillStyle = b.color;
        ctx.fillRect(b.x, b.y, b.w, b.h);
      }

      ctx.fillStyle = "red";
      ctx.fillRect(player.x, player.y, player.w, player.h);
    }

    function loop() {
      update();
      draw();
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
