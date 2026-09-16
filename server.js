const express = require("express");
const http = require("http");
const WebSocket = require("ws");

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const salas = new Map();

app.use(express.static(__dirname));

app.get("/api/salas", (req, res) => {
  res.json([...salas].map(([id, sala]) => ({
    id,
    nome: sala.nome,
    dono: sala.dono,
    usuarios: sala.usuarios.size
  })));
});

wss.on("connection", ws => {
  let salaAtual = null;
  let usuario = null;

  ws.on("message", raw => {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }

    if (msg.tipo === "criar_sala") {
      const id = Math.random().toString(36).slice(2, 10);

      salas.set(id, {
        nome: msg.nome || "Sala",
        dono: msg.usuario || "Usuário",
        usuarios: new Set([ws])
      });

      salaAtual = id;
      usuario = msg.usuario || "Usuário";

      ws.send(JSON.stringify({
        tipo: "sala_criada",
        id,
        nome: salas.get(id).nome
      }));

      atualizar(id);
    }

    if (msg.tipo === "entrar_sala") {
      const sala = salas.get(msg.id);

      if (!sala) {
        ws.send(JSON.stringify({
          tipo: "erro",
          mensagem: "Sala não encontrada"
        }));
        return;
      }

      salaAtual = msg.id;
      usuario = msg.usuario || "Usuário";
      sala.usuarios.add(ws);

      atualizar(salaAtual);
    }

    if (msg.tipo === "sair_sala") {
      sair();
    }

    if (msg.tipo === "sinal" && salaAtual) {
      const sala = salas.get(salaAtual);
      if (!sala) return;

      for (const cliente of sala.usuarios) {
        if (cliente !== ws && cliente.readyState === WebSocket.OPEN) {
          cliente.send(JSON.stringify({
            tipo: "sinal",
            de: usuario,
            dados: msg.dados
          }));
        }
      }
    }
  });

  ws.on("close", sair);

  function sair() {
    if (!salaAtual) return;

    const sala = salas.get(salaAtual);

    if (sala) {
      sala.usuarios.delete(ws);

      if (sala.usuarios.size === 0) {
        salas.delete(salaAtual);
      } else {
        atualizar(salaAtual);
      }
    }

    salaAtual = null;
  }
});

function atualizar(id) {
  const sala = salas.get(id);
  if (!sala) return;

  const mensagem = JSON.stringify({
    tipo: "sala_atualizada",
    id,
    nome: sala.nome,
    dono: sala.dono,
    usuarios: sala.usuarios.size
  });

  for (const cliente of sala.usuarios) {
    if (cliente.readyState === WebSocket.OPEN) {
      cliente.send(mensagem);
    }
  }
}

server.listen(8080, "0.0.0.0", () => {
  console.log("CloverSpace rodando em http://localhost:8080");
});
