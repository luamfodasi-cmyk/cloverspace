const http = require("http");
const { Server } = require("socket.io");

const PORT = 3001;
const rooms = {};

const server = http.createServer((req, res) => {
  res.writeHead(200, {
    "Content-Type": "text/plain; charset=utf-8"
  });
  res.end("CloverSpace realtime online");
});

const io = new Server(server, {
  cors: {
    origin: "*"
  }
});

io.on("connection", (socket) => {

  socket.on("join-room", ({ roomId, username }) => {

    if (!roomId || !username) return;

    if (!rooms[roomId]) {
      rooms[roomId] = {};
    }

    const existingUsers = Object.values(rooms[roomId]);

    socket.join(roomId);

    socket.data.roomId = roomId;
    socket.data.username = username;

    rooms[roomId][socket.id] = {
      id: socket.id,
      username: username
    };

    socket.emit("existing-peers", existingUsers);

    io.to(roomId).emit(
      "room-users",
      Object.values(rooms[roomId])
    );
  });

  socket.on("signal", ({ to, type, data }) => {

    if (!to) return;

    io.to(to).emit("signal", {
      from: socket.id,
      type: type,
      data: data
    });
  });

  socket.on("message", (text) => {

    const roomId = socket.data.roomId;
    const username = socket.data.username;

    if (!roomId || !text) return;

    io.to(roomId).emit("message", {
      username: username,
      text: String(text),
      time: Date.now()
    });
  });

  socket.on("disconnect", () => {

    const roomId = socket.data.roomId;

    if (!roomId || !rooms[roomId]) return;

    delete rooms[roomId][socket.id];

    io.to(roomId).emit(
      "peer-left",
      socket.id
    );

    io.to(roomId).emit(
      "room-users",
      Object.values(rooms[roomId])
    );

    if (Object.keys(rooms[roomId]).length === 0) {
      delete rooms[roomId];
    }
  });
});

server.listen(PORT, () => {
  console.log("================================");
  console.log("CLOVERSPACE REALTIME ONLINE");
  console.log("Porta: " + PORT);
  console.log("Voz/WebRTC: habilitado");
  console.log("================================");
});
