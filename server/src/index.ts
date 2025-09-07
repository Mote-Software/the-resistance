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

// Socket.io connection handling
io.on('connection', (socket) => {
  console.log(`Player connected: ${socket.id}`);
  
  // Send welcome message
  socket.emit('welcome', {
    message: 'Welcome to The Resistance',
    playerId: socket.id
  });

  // Handle player disconnect
  socket.on('disconnect', () => {
    console.log(`Player disconnected: ${socket.id}`);
  });

  // Basic player movement sync (placeholder)
  socket.on('player-move', (data) => {
    // Broadcast movement to other players
    socket.broadcast.emit('player-moved', {
      playerId: socket.id,
      position: data.position,
      rotation: data.rotation
    });
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