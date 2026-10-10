require("dotenv").config();
const connectDB = require("./config/db");
const app = require("./app");
const http = require("http");
const { Server } = require("socket.io");
const ensureAdminUser = require("./utils/createAdmin");
const { getAllowedOrigins } = require("./middlewares/security");
const socketAuth = require("./middlewares/socketAuth");
const { assertRuntimeConfiguration } = require("./config/runtimeConfig");

const PORT = process.env.PORT || 5000;

assertRuntimeConfiguration();

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: getAllowedOrigins(),
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
    credentials: true,
  },
  transports: ["websocket", "polling"],
  pingTimeout: 60000,
  pingInterval: 25000,
  connectTimeout: 10000,
  maxHttpBufferSize: 1e6,
});

io.use(socketAuth);

io.on("connection", (socket) => {
  // Rooms are ready for progressively narrowing broadcasts by role or user
  // without changing the existing event contract.
  socket.join(`role:${socket.user.rol}`);
  socket.join(`user:${socket.user.id}`);
  socket.on("disconnect", () => {});
});

app.set("io", io);

(async () => {
  await connectDB();

  try {
    await ensureAdminUser();
  } catch (error) {
    console.error("⚠️ No se pudo asegurar el administrador inicial:", error);
  }

  server.listen(PORT, () => {});
})();
