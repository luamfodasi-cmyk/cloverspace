// COLE ESTE CÓDIGO NO ARQUIVO: server.js

const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

app.get("/api/status", (req, res) => {
  res.json({
    online: true,
    platform: "CloverSpace"
  });
});

io.on("connection", socket => {
  console.log("Usuário conectado:", socket.id);

  socket.on("join-party", partyId => {
    socket.join("party-" + partyId);
  });

  socket.on("party-message", data => {
    io.to("party-" + data.partyId).emit("party-message", {
      username: data.username,
      message: data.message
    });
  });

  socket.on("disconnect", () => {
    console.log("Usuário saiu:", socket.id);
  });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log("🌌 CloverSpace online na porta " + PORT);
});
