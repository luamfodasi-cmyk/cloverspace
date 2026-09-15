const express = require("express");

const app = express();
const PORT = process.env.PORT || 3000;

app.get("/", (req, res) => {
  res.send(`
    <h1>🌿 CloverSpace</h1>
    <p>Bem-vindo à nossa nova plataforma!</p>
  `);
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`CloverSpace rodando na porta ${PORT}`);
});
