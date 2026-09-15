const express = require("express");

const app = express();
const PORT = 3000;

app.get("/", (req, res) => {
  res.send(`
    <h1>🌿 CloverSpace</h1>
    <p>Bem-vindo à nossa nova plataforma!</p>
  `);
});

app.listen(PORT, () => {
  console.log(`CloverSpace rodando em http://localhost:${PORT}`);
});
