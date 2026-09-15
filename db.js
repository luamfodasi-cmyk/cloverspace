const initSqlJs = require("sql.js");
const fs = require("fs");

async function iniciarBanco() {
  const SQL = await initSqlJs();

  let db;

  if (fs.existsSync("cloverspace.db")) {
    const arquivo = fs.readFileSync("cloverspace.db");
    db = new SQL.Database(arquivo);
  } else {
    db = new SQL.Database();
  }

  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      senha TEXT NOT NULL,
      criado_em TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  fs.writeFileSync(
    "cloverspace.db",
    Buffer.from(db.export())
  );

  console.log("🌿 Banco CloverSpace criado com sucesso!");
}

iniciarBanco();
