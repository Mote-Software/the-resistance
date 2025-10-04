import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';

const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: "http://localhost:5173", // Vite's default port
    methods: ["GET", "POST"]
  }
});

const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Basic health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'The Resistance server is running' });
});

// Store player data
const players: { [id: string]: { position: any; rotation: any } } = {};

// Socket.io connection handling
io.on('connection', (socket) => {
  console.log(`Player connected: ${socket.id}`);

  // Initialize player with default position
  players[socket.id] = {
    position: { x: 0, y: 2.5, z: 5 },
    rotation: { y: 0 }
  };

  // Send current players to the newly connected player
  socket.emit('currentPlayers', players);

  // Notify all other players about the new player
  socket.broadcast.emit('playerJoined', {
    id: socket.id,
    position: players[socket.id].position
  });

  // Handle player disconnect
  socket.on('disconnect', () => {
    console.log(`Player disconnected: ${socket.id}`);
    delete players[socket.id];
    socket.broadcast.emit('playerLeft', socket.id);
  });

  // Handle player movement
  socket.on('playerMove', (data) => {
    if (players[socket.id]) {
      players[socket.id].position = data.position;
      players[socket.id].rotation = data.rotation;

      // Broadcast movement to other players
      socket.broadcast.emit('playerMoved', {
        id: socket.id,
        position: data.position,
        rotation: data.rotation
      });
    }
  });

  // Handle player join team
  socket.on('join-team', (team: 'resistance' | 'nazi') => {
    socket.join(team);
    console.log(`Player ${socket.id} joined team: ${team}`);

    socket.emit('team-joined', { team });
    io.to(team).emit('team-update', {
      message: `New player joined ${team}`,
      playerCount: io.sockets.adapter.rooms.get(team)?.size || 0
    });
  });
});

server.listen(PORT, () => {
  console.log(`🚀 The Resistance server running on http://localhost:${PORT}`);
  console.log(`📡 Socket.io server ready for connections`);
});