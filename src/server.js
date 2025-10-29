require("dotenv").config();
const connectDB = require("./config/db");
const app = require("./app");
const http = require("http");
const { Server } = require("socket.io");

connectDB();

const PORT = process.env.PORT || 5000;

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: [process.env.FRONTEND_URL],
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true,
  },
  transports: ["websocket", "polling"],
  pingTimeout: 60000,
  pingInterval: 25000,
});

io.on("connection", (socket) => {
  socket.on("disconnect", () => {});
});

app.set("io", io);

server.listen(PORT, () => {});
