const http = require("http");
const fs = require("fs");
const path = require("path");
const { Server } = require("socket.io");

const PORT = 3001;
const DATA = path.join(__dirname, "rooms.json");

let rooms = {};
if (fs.existsSync(DATA)) {
  try { rooms = JSON.parse(fs.readFileSync(DATA, "utf8")); } catch {}
}

function save() {
  fs.writeFileSync(DATA, JSON.stringify(rooms, null, 2));
}

const server = http.createServer();
const io = new Server(server, {
  cors: { origin: "*" }
});

io.on("connection", socket => {

  socket.on("join-room", ({ roomId, username }) => {
    if (!roomId || !username) return;

    socket.join(roomId);

    socket.data.roomId = roomId;
    socket.data.username = username;

    if (!rooms[roomId]) {
      rooms[roomId] = {
        id: roomId,
        messages: [],
        users: {}
      };
    }

    rooms[roomId].users[socket.id] = {
      id: socket.id,
      username
    };

    socket.emit("room-data", {
      messages: rooms[roomId].messages.slice(-100),
      users: Object.values(rooms[roomId].users)
    });

    socket.to(roomId).emit("user-joined", {
      id: socket.id,
      username
    });

    io.to(roomId).emit(
      "users",
      Object.values(rooms[roomId].users)
    );

    save();
  });

  socket.on("message", text => {
    const roomId = socket.data.roomId;
    const username = socket.data.username;

    if (!roomId || !username || !text || !text.trim()) return;

    const message = {
      id: Date.now(),
      username,
      text: text.trim(),
      time: new Date().toISOString()
    };

    rooms[roomId].messages.push(message);
    rooms[roomId].messages =
      rooms[roomId].messages.slice(-200);

    io.to(roomId).emit("message", message);

    save();
  });

  socket.on("signal", data => {
    if (!data || !data.to) return;

    io.to(data.to).emit("signal", {
      from: socket.id,
      type: data.type,
      data: data.data
    });
  });

  socket.on("disconnect", () => {
    const roomId = socket.data.roomId;

    if (!roomId || !rooms[roomId]) return;

    delete rooms[roomId].users[socket.id];

    socket.to(roomId).emit("user-left", {
      id: socket.id
    });

    io.to(roomId).emit(
      "users",
      Object.values(rooms[roomId].users)
    );

    save();
  });
});

server.listen(PORT, () => {
  console.log("CloverSpace realtime online: " + PORT);
});
