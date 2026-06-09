const express = require("express");
const cors = require("cors");
const fs = require("fs");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

const GAMES_FILE = "games.json";

function getGames() {
  if (!fs.existsSync(GAMES_FILE)) return [];
  return JSON.parse(fs.readFileSync(GAMES_FILE, "utf8"));
}

function saveGames(games) {
  fs.writeFileSync(GAMES_FILE, JSON.stringify(games, null, 2));
}

app.get("/", (req, res) => {
  res.send("ElayBlox server is running!");
});

app.get("/games", (req, res) => {
  res.json(getGames());
});

app.post("/publish", (req, res) => {
  const { name, description, image, link } = req.body;

  if (!name || name.length > 40) {
    return res.status(400).json({ error: "Bad game name" });
  }

  if (!description || description.length > 200) {
    return res.status(400).json({ error: "Bad description" });
  }

  if (!image || !image.startsWith("https://")) {
    return res.status(400).json({ error: "Image must be https" });
  }

  if (!link || !link.startsWith("https://")) {
    return res.status(400).json({ error: "Game link must be https" });
  }

  const games = getGames();

  const newGame = {
    id: Date.now(),
    name,
    description,
    image,
    link
  };

  games.push(newGame);
  saveGames(games);

  res.json({ success: true, game: newGame });
});

app.listen(PORT, () => {
  console.log("Server running on port " + PORT);
});
