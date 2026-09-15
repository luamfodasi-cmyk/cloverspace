const express = require("express");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const initSqlJs = require("sql.js");

const app = express();
const PORT = process.env.PORT || 3000;
const DB_FILE = path.join(__dirname, "cloverspace.db");

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

function hashPassword(password) {
  return crypto.createHash("sha256").update(password).digest("hex");
}

async function start() {
  const SQL = await initSqlJs({
    locateFile: file => require.resolve("sql.js/dist/" + file)
  });

  let db;

  if (fs.existsSync(DB_FILE)) {
    db = new SQL.Database(fs.readFileSync(DB_FILE));
  } else {
    db = new SQL.Database();
  }

  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  function saveDB() {
    fs.writeFileSync(DB_FILE, Buffer.from(db.export()));
  }

  app.post("/api/register", (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({
        error: "Preencha usuário e senha."
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        error: "A senha precisa ter pelo menos 6 caracteres."
      });
    }

    try {
      const stmt = db.prepare(
        "INSERT INTO users (username, password) VALUES (?, ?)"
      );

      stmt.run([username.trim(), hashPassword(password)]);
      stmt.free();

      saveDB();

      res.json({
        success: true,
        message: "Conta criada com sucesso!"
      });
    } catch {
      res.status(400).json({
        error: "Esse usuário já existe."
      });
    }
  });

  app.post("/api/login", (req, res) => {
    const { username, password } = req.body;

    const stmt = db.prepare(
      "SELECT id, username FROM users WHERE username = ? AND password = ?"
    );

    stmt.bind([username, hashPassword(password)]);

    if (stmt.step()) {
      const user = stmt.getAsObject();
      stmt.free();

      return res.json({
        success: true,
        user
      });
    }

    stmt.free();

    res.status(401).json({
      error: "Usuário ou senha incorretos."
    });
  });

  app.get("/api/status", (req, res) => {
    res.json({
      online: true,
      platform: "CloverSpace"
    });
  });

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`🌿 CloverSpace online na porta ${PORT}`);
  });
}

start().catch(console.error);
