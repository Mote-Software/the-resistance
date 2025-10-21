import Peer, { DataConnection } from "peerjs";

export type PlayerData = {
  position: { x: number; y: number; z: number };
  rotation: { x: number; y: number };
};

export type MessageType =
  | { type: "playerMove"; data: PlayerData }
  | { type: "playerMoved"; data: { id: string } & PlayerData }
  | { type: "playerFired"; data: { position: { x: number; y: number; z: number } } }
  | { type: "playerFiredRemote"; data: { id: string; position: { x: number; y: number; z: number } } }
  | { type: "playerJoined"; data: { id: string; position: any } }
  | { type: "playerLeft"; data: { id: string } }
  | { type: "currentPlayers"; data: { [id: string]: PlayerData } };

export class P2PManager {
  private peer: Peer | null = null;
  private connections: Map<string, DataConnection> = new Map();
  private isHost: boolean = false;
  private roomCode: string = "";
  private localPlayerId: string = "";
  private players: Map<string, PlayerData> = new Map();

  // Event callbacks
  public onPlayerJoined: ((playerId: string, data: PlayerData) => void) | null = null;
  public onPlayerLeft: ((playerId: string) => void) | null = null;
  public onPlayerMoved: ((playerId: string, data: PlayerData) => void) | null = null;
  public onPlayerFired: ((playerId: string, position: any) => void) | null = null;
  public onConnected: (() => void) | null = null;
  public onError: ((error: string) => void) | null = null;

  /**
   * Create a new room as host
   */
  async createRoom(): Promise<string> {
    return new Promise((resolve, reject) => {
      // Generate a random room code
      this.roomCode = this.generateRoomCode();
      this.isHost = true;

      // Create peer with room code as ID
      this.peer = new Peer(this.roomCode, {
        debug: 2, // Enable debug logs
      });

      this.peer.on("open", (id) => {
        console.log("Room created with code:", id);
        this.localPlayerId = id;

        // Initialize local player
        this.players.set(this.localPlayerId, {
          position: { x: 0, y: 2.5, z: 5 },
          rotation: { x: 0, y: 0 },
        });

        if (this.onConnected) this.onConnected();
        resolve(this.roomCode);
      });

      this.peer.on("connection", (conn) => {
        console.log("New player connecting:", conn.peer);
        this.handleConnection(conn);
      });

      this.peer.on("error", (err) => {
        console.error("Peer error:", err);
        if (this.onError) this.onError(err.message);
        reject(err);
      });
    });
  }

  /**
   * Join an existing room as guest
   */
  async joinRoom(roomCode: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.roomCode = roomCode.toUpperCase();
      this.isHost = false;

      // Create peer with random ID
      this.peer = new Peer({
        debug: 2,
      });

      this.peer.on("open", (id) => {
        console.log("My peer ID:", id);
        this.localPlayerId = id;

        // Connect to host
        const conn = this.peer!.connect(this.roomCode, {
          reliable: true,
        });

        this.handleConnection(conn);

        conn.on("open", () => {
          console.log("Connected to host");
          if (this.onConnected) this.onConnected();
          resolve();
        });

        conn.on("error", (err) => {
          console.error("Connection error:", err);
          if (this.onError) this.onError("Failed to connect to room");
          reject(err);
        });
      });

      this.peer.on("error", (err) => {
        console.error("Peer error:", err);
        if (this.onError) this.onError(err.message);
        reject(err);
      });
    });
  }

  /**
   * Handle incoming connections
   */
  private handleConnection(conn: DataConnection) {
    const peerId = conn.peer;

    // Store connection
    this.connections.set(peerId, conn);

    // Initialize player data
    this.players.set(peerId, {
      position: { x: 0, y: 2.5, z: 5 },
      rotation: { x: 0, y: 0 },
    });

    conn.on("open", () => {
      console.log("Connection opened with:", peerId);

      // If we're the host, send current players to new player
      if (this.isHost) {
        const playersData: { [id: string]: PlayerData } = {};
        this.players.forEach((data, id) => {
          playersData[id] = data;
        });

        conn.send({
          type: "currentPlayers",
          data: playersData,
        } as MessageType);

        // Notify other players about new player
        this.broadcast(
          {
            type: "playerJoined",
            data: {
              id: peerId,
              position: this.players.get(peerId)!.position,
            },
          },
          peerId
        );
      }

      // Notify application
      if (this.onPlayerJoined) {
        this.onPlayerJoined(peerId, this.players.get(peerId)!);
      }
    });

    conn.on("data", (data) => {
      this.handleMessage(peerId, data as MessageType);
    });

    conn.on("close", () => {
      console.log("Player disconnected:", peerId);
      this.connections.delete(peerId);
      this.players.delete(peerId);

      // Notify other players if we're host
      if (this.isHost) {
        this.broadcast({
          type: "playerLeft",
          data: { id: peerId },
        });
      }

      if (this.onPlayerLeft) this.onPlayerLeft(peerId);
    });

    conn.on("error", (err) => {
      console.error("Connection error with", peerId, err);
    });
  }

  /**
   * Handle incoming messages
   */
  private handleMessage(peerId: string, message: MessageType) {
    switch (message.type) {
      case "playerMove":
        // Update player data
        this.players.set(peerId, message.data);

        // If we're host, broadcast to all other players
        if (this.isHost) {
          this.broadcast(
            {
              type: "playerMoved",
              data: {
                id: peerId,
                ...message.data,
              },
            },
            peerId
          );
        }

        // Notify application
        if (this.onPlayerMoved) {
          this.onPlayerMoved(peerId, message.data);
        }
        break;

      case "playerMoved":
        // Received from host - update the specific player
        const movedPlayerId = message.data.id;
        const movedPlayerData: PlayerData = {
          position: message.data.position,
          rotation: message.data.rotation,
        };
        this.players.set(movedPlayerId, movedPlayerData);

        // Notify application
        if (this.onPlayerMoved) {
          this.onPlayerMoved(movedPlayerId, movedPlayerData);
        }
        break;

      case "playerFired":
        // If we're host, broadcast to all other players
        if (this.isHost) {
          this.broadcast(
            {
              type: "playerFiredRemote",
              data: {
                id: peerId,
                position: message.data.position,
              },
            },
            peerId
          );
        }

        // Notify application
        if (this.onPlayerFired) {
          this.onPlayerFired(peerId, message.data.position);
        }
        break;

      case "playerFiredRemote":
        // Received from host - notify about remote player firing
        if (this.onPlayerFired) {
          this.onPlayerFired(message.data.id, message.data.position);
        }
        break;

      case "currentPlayers":
        // Received from host when joining
        Object.entries(message.data).forEach(([id, data]) => {
          if (id !== this.localPlayerId) {
            this.players.set(id, data);
            if (this.onPlayerJoined) {
              this.onPlayerJoined(id, data);
            }
          }
        });
        break;

      case "playerJoined":
        // Received from host about new player
        const newPlayerId = message.data.id;
        const playerData: PlayerData = {
          position: message.data.position,
          rotation: { x: 0, y: 0 },
        };
        this.players.set(newPlayerId, playerData);
        if (this.onPlayerJoined) {
          this.onPlayerJoined(newPlayerId, playerData);
        }
        break;

      case "playerLeft":
        // Received from host about player leaving
        const leftPlayerId = message.data.id;
        this.players.delete(leftPlayerId);
        if (this.onPlayerLeft) {
          this.onPlayerLeft(leftPlayerId);
        }
        break;
    }
  }

  /**
   * Send player movement to all peers
   */
  sendPlayerMove(position: { x: number; y: number; z: number }, rotation: { x: number; y: number }) {
    const message: MessageType = {
      type: "playerMove",
      data: { position, rotation },
    };

    // Update local player data
    this.players.set(this.localPlayerId, { position, rotation });

    if (this.isHost) {
      // Host broadcasts to all guests
      this.broadcast(message);
    } else {
      // Guest sends to host only
      this.sendToHost(message);
    }
  }

  /**
   * Send player fire event to all peers
   */
  sendPlayerFired(position: { x: number; y: number; z: number }) {
    const message: MessageType = {
      type: "playerFired",
      data: { position },
    };

    if (this.isHost) {
      // Host broadcasts to all guests
      this.broadcast(message);
    } else {
      // Guest sends to host (host will broadcast)
      this.sendToHost(message);
    }
  }

  /**
   * Broadcast message to all connected peers except specified one
   */
  private broadcast(message: MessageType, excludePeerId?: string) {
    this.connections.forEach((conn, peerId) => {
      if (peerId !== excludePeerId && conn.open) {
        conn.send(message);
      }
    });
  }

  /**
   * Send message to host (only for guests)
   */
  private sendToHost(message: MessageType) {
    const hostConn = this.connections.get(this.roomCode);
    if (hostConn && hostConn.open) {
      hostConn.send(message);
    }
  }

  /**
   * Get local player ID
   */
  getLocalPlayerId(): string {
    return this.localPlayerId;
  }

  /**
   * Check if this instance is the host
   */
  getIsHost(): boolean {
    return this.isHost;
  }

  /**
   * Get room code
   */
  getRoomCode(): string {
    return this.roomCode;
  }

  /**
   * Disconnect from all peers and destroy peer instance
   */
  disconnect() {
    this.connections.forEach((conn) => conn.close());
    this.connections.clear();
    this.players.clear();
    if (this.peer) {
      this.peer.destroy();
      this.peer = null;
    }
  }

  /**
   * Generate a random room code
   */
  private generateRoomCode(): string {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let code = "";
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  }
}
