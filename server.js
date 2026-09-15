const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const multer = require("multer");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const fs = require("fs");
const path = require("path");
const db = require("./database");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;
const JWT_SECRET =
  process.env.JWT_SECRET || "cloverspace-dev-secret";

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

const uploadDir = path.join(
  __dirname,
  "public",
  "uploads"
);

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: uploadDir,
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);

    cb(
      null,
      `${Date.now()}-${Math.random()
        .toString(36)
        .slice(2)}${ext}`
    );
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024
  }
});

/* =========================
   USUÁRIO PÚBLICO
========================= */

function publicUser(user) {
  return {
    id: user.id,
    username: user.username,
    bio: user.bio || "",
    avatar: user.avatar || "",
    verified: !!user.verified,
    admin: !!user.admin,
    created_at: user.created_at
  };
}

/* =========================
   AUTENTICAÇÃO
========================= */

function auth(req, res, next) {
  const header =
    req.headers.authorization || "";

  if (!header.startsWith("Bearer ")) {
    return res.status(401).json({
      error: "Não autenticado"
    });
  }

  try {
    const token = header.slice(7);
    const decoded =
      jwt.verify(token, JWT_SECRET);

    const user = db
      .prepare(
        "SELECT * FROM users WHERE id = ?"
      )
      .get(decoded.id);

    if (!user) {
      return res.status(401).json({
        error: "Usuário não encontrado"
      });
    }

    req.user = user;
    next();

  } catch {
    res.status(401).json({
      error: "Token inválido"
    });
  }
}

function adminOnly(req, res, next) {
  if (!req.user || !req.user.admin) {
    return res.status(403).json({
      error: "Acesso restrito ao administrador"
    });
  }

  next();
}

/* =========================
   STATUS
========================= */

app.get("/api/status", (req, res) => {
  res.json({
    ok: true,
    name: "CloverSpace",
    server: "online",
    database: "online"
  });
});

/* =========================
   REGISTRO
========================= */

app.post("/api/register", async (req, res) => {
  try {
    const username =
      String(req.body.username || "").trim();

    const password =
      String(req.body.password || "");

    if (!username || !password) {
      return res.status(400).json({
        error:
          "Usuário e senha são obrigatórios"
      });
    }

    if (username.length < 3) {
      return res.status(400).json({
        error:
          "Usuário precisa ter pelo menos 3 caracteres"
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        error:
          "Senha precisa ter pelo menos 6 caracteres"
      });
    }

    const exists = db
      .prepare(
        "SELECT id FROM users WHERE username = ?"
      )
      .get(username);

    if (exists) {
      return res.status(409).json({
        error: "Usuário já existe"
      });
    }

    const total = db
      .prepare(
        "SELECT COUNT(*) AS total FROM users"
      )
      .get().total;

    const hash =
      await bcrypt.hash(password, 10);

    const result = db.prepare(`
      INSERT INTO users
      (
        username,
        password,
        bio,
        avatar,
        verified,
        admin
      )
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      username,
      hash,
      "",
      "",
      total === 0 ? 1 : 0,
      total === 0 ? 1 : 0
    );

    const user = db
      .prepare(
        "SELECT * FROM users WHERE id = ?"
      )
      .get(
        Number(result.lastInsertRowid)
      );

    const token = jwt.sign(
      { id: user.id },
      JWT_SECRET,
      {
        expiresIn: "30d"
      }
    );

    res.json({
      ok: true,
      token,
      user: publicUser(user)
    });

  } catch (err) {
    console.error(err);

    res.status(500).json({
      error: "Erro ao criar conta"
    });
  }
});

/* =========================
   LOGIN
========================= */

app.post("/api/login", async (req, res) => {
  try {
    const username =
      String(req.body.username || "").trim();

    const password =
      String(req.body.password || "");

    const user = db
      .prepare(
        "SELECT * FROM users WHERE username = ?"
      )
      .get(username);

    if (!user) {
      return res.status(401).json({
        error:
          "Usuário ou senha incorretos"
      });
    }

    const valid =
      await bcrypt.compare(
        password,
        user.password
      );

    if (!valid) {
      return res.status(401).json({
        error:
          "Usuário ou senha incorretos"
      });
    }

    const token = jwt.sign(
      { id: user.id },
      JWT_SECRET,
      {
        expiresIn: "30d"
      }
    );

    res.json({
      ok: true,
      token,
      user: publicUser(user)
    });

  } catch (err) {
    console.error(err);

    res.status(500).json({
      error: "Erro no login"
    });
  }
});

/* =========================
   ME
========================= */

app.get("/api/me", auth, (req, res) => {
  res.json({
    ok: true,
    user: publicUser(req.user)
  });
});

/* =========================
   PERFIL
========================= */

app.put("/api/profile", auth, (req, res) => {
  const bio =
    String(req.body.bio || "")
      .slice(0, 500);

  db.prepare(`
    UPDATE users
    SET bio = ?
    WHERE id = ?
  `).run(
    bio,
    req.user.id
  );

  const user = db
    .prepare(
      "SELECT * FROM users WHERE id = ?"
    )
    .get(req.user.id);

  res.json({
    ok: true,
    user: publicUser(user)
  });
});

/* =========================
   AVATAR
========================= */

app.post(
  "/api/profile/avatar",
  auth,
  upload.single("avatar"),
  (req, res) => {

    if (!req.file) {
      return res.status(400).json({
        error: "Nenhuma imagem enviada"
      });
    }

    const avatar =
      `/uploads/${req.file.filename}`;

    db.prepare(`
      UPDATE users
      SET avatar = ?
      WHERE id = ?
    `).run(
      avatar,
      req.user.id
    );

    res.json({
      ok: true,
      avatar
    });
  }
);

/* =========================
   BUSCA
========================= */

app.get(
  "/api/users/search",
  auth,
  (req, res) => {

    const q =
      String(req.query.q || "").trim();

    if (!q) return res.json([]);

    const users = db.prepare(`
      SELECT
        id,
        username,
        bio,
        avatar,
        verified,
        admin,
        created_at
      FROM users
      WHERE username LIKE ?
      ORDER BY username
      LIMIT 50
    `).all(`%${q}%`);

    res.json(
      users.map(publicUser)
    );
  }
);

/* =========================
   PERFIL DE USUÁRIO
========================= */

app.get(
  "/api/users/:id",
  auth,
  (req, res) => {

    const user = db.prepare(`
      SELECT
        id,
        username,
        bio,
        avatar,
        verified,
        admin,
        created_at
      FROM users
      WHERE id = ?
    `).get(req.params.id);

    if (!user) {
      return res.status(404).json({
        error: "Usuário não encontrado"
      });
    }

    res.json(
      publicUser(user)
    );
  }
);

/* =========================
   FOLLOW
========================= */

app.post(
  "/api/users/:id/follow",
  auth,
  (req, res) => {

    const targetId =
      Number(req.params.id);

    if (targetId === req.user.id) {
      return res.status(400).json({
        error:
          "Você não pode seguir você mesmo"
      });
    }

    const target = db
      .prepare(
        "SELECT id FROM users WHERE id = ?"
      )
      .get(targetId);

    if (!target) {
      return res.status(404).json({
        error: "Usuário não encontrado"
      });
    }

    const exists = db.prepare(`
      SELECT id
      FROM follows
      WHERE follower_id = ?
      AND following_id = ?
    `).get(
      req.user.id,
      targetId
    );

    if (exists) {

      db.prepare(`
        DELETE FROM follows
        WHERE follower_id = ?
        AND following_id = ?
      `).run(
        req.user.id,
        targetId
      );

      return res.json({
        ok: true,
        following: false
      });
    }

    db.prepare(`
      INSERT INTO follows
      (
        follower_id,
        following_id
      )
      VALUES (?, ?)
    `).run(
      req.user.id,
      targetId
    );

    res.json({
      ok: true,
      following: true
    });
  }
);

/* =========================
   POSTS
========================= */

app.post(
  "/api/posts",
  auth,
  (req, res) => {

    const content =
      String(req.body.content || "")
        .trim()
        .slice(0, 5000);

    if (!content) {
      return res.status(400).json({
        error: "Post vazio"
      });
    }

    const result = db.prepare(`
      INSERT INTO posts
      (
        user_id,
        content
      )
      VALUES (?, ?)
    `).run(
      req.user.id,
      content
    );

    res.json({
      ok: true,
      id:
        Number(result.lastInsertRowid)
    });
  }
);

app.get(
  "/api/posts",
  auth,
  (req, res) => {

    const posts = db.prepare(`
      SELECT
        posts.id,
        posts.content,
        posts.created_at,
        users.id AS user_id,
        users.username,
        users.avatar,
        users.verified
      FROM posts
      JOIN users
      ON users.id = posts.user_id
      ORDER BY posts.id DESC
      LIMIT 100
    `).all();

    res.json(posts);
  }
);

/* =========================
   LIKE
========================= */

app.post(
  "/api/posts/:id/like",
  auth,
  (req, res) => {

    const postId =
      Number(req.params.id);

    const exists = db.prepare(`
      SELECT id
      FROM likes
      WHERE post_id = ?
      AND user_id = ?
    `).get(
      postId,
      req.user.id
    );

    if (exists) {

      db.prepare(`
        DELETE FROM likes
        WHERE post_id = ?
        AND user_id = ?
      `).run(
        postId,
        req.user.id
      );

      return res.json({
        ok: true,
        liked: false
      });
    }

    db.prepare(`
      INSERT INTO likes
      (
        post_id,
        user_id
      )
      VALUES (?, ?)
    `).run(
      postId,
      req.user.id
    );

    res.json({
      ok: true,
      liked: true
    });
  }
);

/* =========================
   COMENTÁRIOS
========================= */

app.get(
  "/api/posts/:id/comments",
  auth,
  (req, res) => {

    const comments = db.prepare(`
      SELECT
        comments.id,
        comments.content,
        comments.created_at,
        users.id AS user_id,
        users.username,
        users.avatar
      FROM comments
      JOIN users
      ON users.id = comments.user_id
      WHERE comments.post_id = ?
      ORDER BY comments.id ASC
    `).all(req.params.id);

    res.json(comments);
  }
);

app.post(
  "/api/posts/:id/comments",
  auth,
  (req, res) => {

    const content =
      String(req.body.content || "")
        .trim()
        .slice(0, 2000);

    if (!content) {
      return res.status(400).json({
        error: "Comentário vazio"
      });
    }

    const result = db.prepare(`
      INSERT INTO comments
      (
        post_id,
        user_id,
        content
      )
      VALUES (?, ?, ?)
    `).run(
      req.params.id,
      req.user.id,
      content
    );

    res.json({
      ok: true,
      id:
        Number(result.lastInsertRowid)
    });
  }
);

/* =========================
   MENSAGENS PRIVADAS
========================= */

app.get(
  "/api/messages/:userId",
  auth,
  (req, res) => {

    const otherId =
      Number(req.params.userId);

    const messages = db.prepare(`
      SELECT
        messages.id,
        messages.sender_id,
        messages.receiver_id,
        messages.content,
        messages.created_at,
        users.username AS sender_username
      FROM messages
      JOIN users
      ON users.id = messages.sender_id
      WHERE
        (
          messages.sender_id = ?
          AND messages.receiver_id = ?
        )
        OR
        (
          messages.sender_id = ?
          AND messages.receiver_id = ?
        )
      ORDER BY messages.id ASC
      LIMIT 500
    `).all(
      req.user.id,
      otherId,
      otherId,
      req.user.id
    );

    res.json(messages);
  }
);

app.post(
  "/api/messages/:userId",
  auth,
  (req, res) => {

    const receiverId =
      Number(req.params.userId);

    const content =
      String(req.body.content || "")
        .trim()
        .slice(0, 5000);

    if (!content) {
      return res.status(400).json({
        error: "Mensagem vazia"
      });
    }

    const receiver = db
      .prepare(
        "SELECT id FROM users WHERE id = ?"
      )
      .get(receiverId);

    if (!receiver) {
      return res.status(404).json({
        error: "Usuário não encontrado"
      });
    }

    const result = db.prepare(`
      INSERT INTO messages
      (
        sender_id,
        receiver_id,
        content
      )
      VALUES (?, ?, ?)
    `).run(
      req.user.id,
      receiverId,
      content
    );

    const message = db.prepare(`
      SELECT
        messages.id,
        messages.sender_id,
        messages.receiver_id,
        messages.content,
        messages.created_at,
        users.username AS sender_username
      FROM messages
      JOIN users
      ON users.id = messages.sender_id
      WHERE messages.id = ?
    `).get(
      Number(result.lastInsertRowid)
    );

    const targets =
      userSockets.get(receiverId);

    if (targets) {
      for (const socketId of targets) {
        io.to(socketId).emit(
          "private_message",
          message
        );
      }
    }

    res.json({
      ok: true,
      message
    });
  }
);

/* =========================
   SALAS
========================= */

const rooms = new Map();

app.get(
  "/api/rooms",
  auth,
  (req, res) => {

    res.json(
      [...rooms.values()].map(room => ({
        id: room.id,
        name: room.name,
        ownerId: room.ownerId,
        ownerUsername:
          room.ownerUsername,
        participants:
          room.participants.size
      }))
    );
  }
);

app.post(
  "/api/rooms",
  auth,
  (req, res) => {

    const name =
      String(req.body.name || "")
        .trim()
        .slice(0, 100);

    if (!name) {
      return res.status(400).json({
        error: "Nome da sala obrigatório"
      });
    }

    const id =
      Date.now().toString(36) +
      Math.random()
        .toString(36)
        .slice(2, 8);

    const room = {
      id,
      name,
      ownerId: req.user.id,
      ownerUsername:
        req.user.username,
      participants: new Map()
    };

    rooms.set(id, room);

    res.json({
      ok: true,
      room: {
        id,
        name,
        ownerId: req.user.id,
        ownerUsername:
          req.user.username
      }
    });
  }
);

app.delete(
  "/api/rooms/:id",
  auth,
  (req, res) => {

    const room =
      rooms.get(req.params.id);

    if (!room) {
      return res.status(404).json({
        error: "Sala não encontrada"
      });
    }

    if (
      room.ownerId !== req.user.id &&
      !req.user.admin
    ) {
      return res.status(403).json({
        error: "Sem permissão"
      });
    }

    io.to(room.id).emit(
      "room_closed"
    );

    rooms.delete(room.id);

    res.json({
      ok: true
    });
  }
);

/* =========================
   PAINEL ADMIN
========================= */

app.get(
  "/api/admin/stats",
  auth,
  adminOnly,
  (req, res) => {

    const users = db
      .prepare(
        "SELECT COUNT(*) AS total FROM users"
      )
      .get().total;

    const posts = db
      .prepare(
        "SELECT COUNT(*) AS total FROM posts"
      )
      .get().total;

    const messages = db
      .prepare(
        "SELECT COUNT(*) AS total FROM messages"
      )
      .get().total;

    const groups = db
      .prepare(
        "SELECT COUNT(*) AS total FROM groups"
      )
      .get().total;

    res.json({
      ok: true,
      users,
      posts,
      messages,
      groups,
      roomsOnline: rooms.size
    });
  }
);

app.get(
  "/api/admin/users",
  auth,
  adminOnly,
  (req, res) => {

    const users = db.prepare(`
      SELECT
        id,
        username,
        bio,
        avatar,
        verified,
        admin,
        created_at
      FROM users
      ORDER BY id DESC
    `).all();

    res.json({
      ok: true,
      total: users.length,
      users:
        users.map(publicUser)
    });
  }
);

/* PROMOVER ADMIN / VERIFICAR */

app.put(
  "/api/admin/users/:id",
  auth,
  adminOnly,
  (req, res) => {

    const userId =
      Number(req.params.id);

    if (userId === req.user.id) {
      return res.status(400).json({
        error:
          "Você não pode alterar suas próprias permissões"
      });
    }

    const user = db
      .prepare(
        "SELECT * FROM users WHERE id = ?"
      )
      .get(userId);

    if (!user) {
      return res.status(404).json({
        error: "Usuário não encontrado"
      });
    }

    if (
      req.body.admin !== undefined
    ) {
      db.prepare(`
        UPDATE users
        SET admin = ?
        WHERE id = ?
      `).run(
        req.body.admin ? 1 : 0,
        userId
      );
    }

    if (
      req.body.verified !== undefined
    ) {
      db.prepare(`
        UPDATE users
        SET verified = ?
        WHERE id = ?
      `).run(
        req.body.verified ? 1 : 0,
        userId
      );
    }

    const updated = db
      .prepare(
        "SELECT * FROM users WHERE id = ?"
      )
      .get(userId);

    res.json({
      ok: true,
      user:
        publicUser(updated)
    });
  }
);

/* BANIR */

app.put(
  "/api/admin/users/:id/ban",
  auth,
  adminOnly,
  (req, res) => {

    const userId =
      Number(req.params.id);

    if (userId === req.user.id) {
      return res.status(400).json({
        error:
          "Você não pode banir sua própria conta"
      });
    }

    const banned =
      !!req.body.banned;

    const user = db
      .prepare(
        "SELECT id FROM users WHERE id = ?"
      )
      .get(userId);

    if (!user) {
      return res.status(404).json({
        error: "Usuário não encontrado"
      });
    }

    const exists = db.prepare(`
      SELECT id
      FROM blocks
      WHERE blocker_id = ?
      AND blocked_id = ?
    `).get(
      req.user.id,
      userId
    );

    if (banned && !exists) {

      db.prepare(`
        INSERT INTO blocks
        (
          blocker_id,
          blocked_id
        )
        VALUES (?, ?)
      `).run(
        req.user.id,
        userId
      );
    }

    if (!banned && exists) {

      db.prepare(`
        DELETE FROM blocks
        WHERE blocker_id = ?
        AND blocked_id = ?
      `).run(
        req.user.id,
        userId
      );
    }

    res.json({
      ok: true,
      banned
    });
  }
);

/* APAGAR POST */

app.delete(
  "/api/admin/posts/:id",
  auth,
  adminOnly,
  (req, res) => {

    const postId =
      Number(req.params.id);

    db.prepare(
      "DELETE FROM comments WHERE post_id = ?"
    ).run(postId);

    db.prepare(
      "DELETE FROM likes WHERE post_id = ?"
    ).run(postId);

    db.prepare(
      "DELETE FROM posts WHERE id = ?"
    ).run(postId);

    res.json({
      ok: true
    });
  }
);

/* =========================
   SOCKET.IO
========================= */

const userSockets = new Map();

io.use((socket, next) => {

  try {

    const token =
      socket.handshake.auth?.token;

    if (!token) {
      return next(
        new Error("Não autenticado")
      );
    }

    const decoded =
      jwt.verify(
        token,
        JWT_SECRET
      );

    const user = db
      .prepare(
        "SELECT * FROM users WHERE id = ?"
      )
      .get(decoded.id);

    if (!user) {
      return next(
        new Error(
          "Usuário não encontrado"
        )
      );
    }

    socket.user =
      publicUser(user);

    socket.userId =
      user.id;

    next();

  } catch {
    next(
      new Error("Token inválido")
    );
  }
});

io.on("connection", socket => {

  const userId =
    socket.userId;

  if (!userSockets.has(userId)) {
    userSockets.set(
      userId,
      new Set()
    );
  }

  userSockets
    .get(userId)
    .add(socket.id);

  socket.emit(
    "connected",
    {
      user: socket.user
    }
  );

  /* ENTRAR NA SALA */

  socket.on(
    "join_room",
    ({ roomId }) => {

      const room =
        rooms.get(roomId);

      if (!room) {
        return socket.emit(
          "room_error",
          {
            error:
              "Sala não encontrada"
          }
        );
      }

      room.participants.set(
        userId,
        {
          id: userId,
          username:
            socket.user.username,
          avatar:
            socket.user.avatar,
          verified:
            socket.user.verified,
          admin:
            socket.user.admin
        }
      );

      socket.join(roomId);

      io.to(roomId).emit(
        "room_updated",
        [
          ...room.participants.values()
        ]
      );
    }
  );

  /* SAIR */

  socket.on(
    "leave_room",
    ({ roomId }) => {

      const room =
        rooms.get(roomId);

      if (!room) return;

      room.participants.delete(
        userId
      );

      socket.leave(roomId);

      io.to(roomId).emit(
        "room_updated",
        [
          ...room.participants.values()
        ]
      );
    }
  );

  /* CHAT DA SALA */

  socket.on(
    "room_message",
    ({ roomId, content }) => {

      const room =
        rooms.get(roomId);

      if (
        !room ||
        !room.participants.has(userId)
      ) {
        return;
      }

      const text =
        String(content || "")
          .trim()
          .slice(0, 2000);

      if (!text) return;

      io.to(roomId).emit(
        "room_message",
        {
          id: Date.now(),
          userId,
          username:
            socket.user.username,
          content: text,
          created_at:
            new Date().toISOString()
        }
      );
    }
  );

  /* =====================
     VOZ 1x1
  ===================== */

  socket.on(
    "voice_call",
    ({ targetUserId, offer }) => {

      const targets =
        userSockets.get(
          Number(targetUserId)
        );

      if (!targets) {
        return socket.emit(
          "voice_error",
          {
            error:
              "Usuário está offline"
          }
        );
      }

      for (const socketId of targets) {

        io.to(socketId).emit(
          "voice_incoming",
          {
            fromUserId:
              userId,
            fromUsername:
              socket.user.username,
            offer
          }
        );
      }
    }
  );

  socket.on(
    "voice_answer",
    ({ targetUserId, answer }) => {

      const targets =
        userSockets.get(
          Number(targetUserId)
        );

      if (!targets) return;

      for (const socketId of targets) {

        io.to(socketId).emit(
          "voice_answer",
          {
            fromUserId:
              userId,
            answer
          }
        );
      }
    }
  );

  socket.on(
    "voice_ice",
    ({ targetUserId, candidate }) => {

      const targets =
        userSockets.get(
          Number(targetUserId)
        );

      if (!targets) return;

      for (const socketId of targets) {

        io.to(socketId).emit(
          "voice_ice",
          {
            fromUserId:
              userId,
            candidate
          }
        );
      }
    }
  );

  socket.on(
    "voice_reject",
    ({ targetUserId }) => {

      const targets =
        userSockets.get(
          Number(targetUserId)
        );

      if (!targets) return;

      for (const socketId of targets) {

        io.to(socketId).emit(
          "voice_rejected",
          {
            fromUserId:
              userId
          }
        );
      }
    }
  );

  socket.on(
    "voice_end",
    ({ targetUserId }) => {

      const targets =
        userSockets.get(
          Number(targetUserId)
        );

      if (!targets) return;

      for (const socketId of targets) {

        io.to(socketId).emit(
          "voice_ended",
          {
            fromUserId:
              userId
          }
        );
      }
    }
  );

  /* =====================
     VOZ EM GRUPO
  ===================== */

  socket.on(
    "group_voice_offer",
    ({
      roomId,
      targetUserId,
      offer
    }) => {

      const room =
        rooms.get(roomId);

      if (
        !room ||
        !room.participants.has(userId)
      ) {
        return;
      }

      const targets =
        userSockets.get(
          Number(targetUserId)
        );

      if (!targets) return;

      for (const socketId of targets) {

        io.to(socketId).emit(
          "group_voice_offer",
          {
            roomId,
            fromUserId:
              userId,
            offer
          }
        );
      }
    }
  );

  socket.on(
    "group_voice_answer",
    ({
      roomId,
      targetUserId,
      answer
    }) => {

      const room =
        rooms.get(roomId);

      if (
        !room ||
        !room.participants.has(userId)
      ) {
        return;
      }

      const targets =
        userSockets.get(
          Number(targetUserId)
        );

      if (!targets) return;

      for (const socketId of targets) {

        io.to(socketId).emit(
          "group_voice_answer",
          {
            roomId,
            fromUserId:
              userId,
            answer
          }
        );
      }
    }
  );

  socket.on(
    "group_voice_ice",
    ({
      roomId,
      targetUserId,
      candidate
    }) => {

      const room =
        rooms.get(roomId);

      if (
        !room ||
        !room.participants.has(userId)
      ) {
        return;
      }

      const targets =
        userSockets.get(
          Number(targetUserId)
        );

      if (!targets) return;

      for (const socketId of targets) {

        io.to(socketId).emit(
          "group_voice_ice",
          {
            roomId,
            fromUserId:
              userId,
            candidate
          }
        );
      }
    }
  );

  /* =====================
     DESCONEXÃO
  ===================== */

  socket.on(
    "disconnect",
    () => {

      const sockets =
        userSockets.get(userId);

      if (sockets) {

        sockets.delete(
          socket.id
        );

        if (sockets.size === 0) {
          userSockets.delete(
            userId
          );
        }
      }

      for (
        const room of rooms.values()
      ) {

        if (
          room.participants.has(
            userId
          )
        ) {

          room.participants.delete(
            userId
          );

          io.to(room.id).emit(
            "room_updated",
            [
              ...room.participants.values()
            ]
          );
        }
      }
    }
  );
});

/* =========================
   SERVIDOR
========================= */


io.on("connection", (socket) => {
  // CLOVERSPACE VOICE SIGNALING
  socket.on("voice:join", ({roomId, username}) => {
    if(!roomId || !username) return;
    socket.join("voice:"+roomId);
    socket.data.voiceRoom=roomId;
    socket.data.voiceUsername=username;
    socket.to("voice:"+roomId).emit("voice:user-joined",{
      id:socket.id, username
    });
  });

  socket.on("voice:offer", ({to,offer}) => {
    if(to && offer) io.to(to).emit("voice:offer",{
      from:socket.id,offer
    });
  });

  socket.on("voice:answer", ({to,answer}) => {
    if(to && answer) io.to(to).emit("voice:answer",{
      from:socket.id,answer
    });
  });

  socket.on("voice:ice", ({to,candidate}) => {
    if(to && candidate) io.to(to).emit("voice:ice",{
      from:socket.id,candidate
    });
  });

  socket.on("voice:leave", () => {
    const r=socket.data.voiceRoom;
    if(r) socket.to("voice:"+r).emit("voice:user-left",{id:socket.id});
    if(r) socket.leave("voice:"+r);
    socket.data.voiceRoom=null;
  });

  // CLOVERSPACE VOICE WEBRTC
  socket.on("voice:join", ({ roomId, username }) => {
    if (!roomId || !username) return;

    socket.join("voice:" + roomId);
    socket.data.voiceRoom = roomId;
    socket.data.voiceUsername = username;

    socket.to("voice:" + roomId).emit("voice:user-joined", {
      id: socket.id,
      username
    });
  });

  socket.on("voice:offer", ({ to, offer }) => {
    if (!to || !offer) return;
    io.to(to).emit("voice:offer", {
      from: socket.id,
      offer
    });
  });

  socket.on("voice:answer", ({ to, answer }) => {
    if (!to || !answer) return;
    io.to(to).emit("voice:answer", {
      from: socket.id,
      answer
    });
  });

  socket.on("voice:ice", ({ to, candidate }) => {
    if (!to || !candidate) return;
    io.to(to).emit("voice:ice", {
      from: socket.id,
      candidate
    });
  });

  socket.on("voice:leave", () => {
    const roomId = socket.data.voiceRoom;
    if (roomId) {
      socket.to("voice:" + roomId).emit("voice:user-left", {
        id: socket.id
      });
      socket.leave("voice:" + roomId);
    }
    socket.data.voiceRoom = null;
  });

  socket.on("join-room", ({ roomId, username }) => {
    if (!roomId || !username) return;
    socket.join(roomId);
    socket.data.roomId = roomId;
    socket.data.username = username;
    socket.emit("existing-peers",
      [...(io.sockets.adapter.rooms.get(roomId) || [])]
        .filter(id => id !== socket.id)
        .map(id => ({ id }))
    );
    socket.to(roomId).emit("room-users", {
      id: socket.id,
      username
    });
  });

  socket.on("signal", ({ to, type, data }) => {
    if (to) io.to(to).emit("signal", {
      from: socket.id,
      type,
      data
    });
  });

  socket.on("message", (text) => {
    const roomId = socket.data.roomId;
    if (roomId && text) {
      io.to(roomId).emit("message", {
        username: socket.data.username,
        text: String(text),
        time: Date.now()
      });
    }
  });

  socket.on("disconnect", () => {
    if (socket.data.roomId) {
      socket.to(socket.data.roomId).emit("peer-left", socket.id);
    }
  });
});

server.listen(
  PORT,
  "0.0.0.0",
  () => {

    console.log("");
    console.log(
      "================================="
    );
    console.log(
      "       CLOVERSPACE ONLINE"
    );
    console.log(
      "================================="
    );
    console.log(
      `Porta: ${PORT}`
    );
    console.log(
      "Banco: SQLite"
    );
    console.log(
      "Admin: habilitado"
    );
    console.log(
      "Mensagens privadas: habilitadas"
    );
    console.log(
      "Voz 1x1: habilitada"
    );
    console.log(
      "Voz em grupo: habilitada"
    );
    console.log(
      "================================="
    );
  }
);
