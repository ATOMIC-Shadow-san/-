import express from "express";
import { createServer } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { createServer as createViteServer } from "vite";
import { nanoid } from "nanoid";

// Types for the game
interface Player {
  id: number;
  name: string;
  money: number;
  position: number;
  status: number;
  color: string;
  isBot: boolean;
  socketId?: string;
  isConnected?: boolean;
}

interface Tile {
  id: number;
  name: string;
  type: string;
  ownerId: number | null;
  price: number;
}

interface GameState {
  roomId: string;
  players: Player[];
  tiles: Tile[];
  currentTurn: number;
  logs: string[];
  isGameOver: boolean;
  isStarted: boolean;
  diceResult: number | null;
  isRolling: boolean;
}

interface Room {
  id: string;
  state: GameState;
  sockets: Map<string, WebSocket>;
}

const rooms = new Map<string, Room>();

async function startServer() {
  const app = express();
  const server = createServer(app);
  const wss = new WebSocketServer({ server });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static("dist"));
    // SPA fallback: serve index.html for all other routes
    app.get("*", (req, res) => {
      res.sendFile("index.html", { root: "dist" });
    });
  }

  wss.on("connection", (ws) => {
    const socketId = nanoid();
    let currentRoomId: string | null = null;

    ws.on("message", (data) => {
      const message = JSON.parse(data.toString());

      switch (message.type) {
        case "JOIN_ROOM": {
          const { roomId, playerName, playerColor } = message.payload;
          currentRoomId = roomId;
          
          let room = rooms.get(roomId);
          if (!room) {
            // Initialize tiles
            const landmarks = [
              "起點", "二中校門", "二中操場", "機會", "二中圖書館", "二中教官室", "命運", "二中體育館", "二中福利社", "天使",
              "二中音樂館", "二中藝教大樓", "機會", "二中至善樓", "二中明德樓", "命運", "二中弘道樓", "二中萃英樓", "監獄",
              "臺中火車站", "臺中公園", "機會", "一中街商圈", "中友百貨", "命運", "勤美誠品", "草悟道", "惡魔",
              "逢甲夜市", "秋紅谷", "機會", "國家歌劇院", "高美濕地", "命運", "科博館", "新光&遠百"
            ];
            const initialTiles = Array.from({ length: 36 }, (_, i) => {
              let type = "PROPERTY";
              let name = landmarks[i] || `房產 ${i}`;
              let price = 0;
              if (i === 0) type = "START";
              else if ([3, 12, 21, 30].includes(i)) type = "CHANCE";
              else if ([6, 15, 24, 33].includes(i)) type = "FATE";
              else if (i === 9) type = "ANGEL";
              else if (i === 18) type = "JAIL";
              else if (i === 27) type = "DEVIL";
              else price = 500 * (Math.floor(i / 3) + 1);
              return { id: i, name, type, ownerId: null, price };
            });

            // Initialize new room
            room = {
              id: roomId,
              state: {
                roomId,
                players: [],
                tiles: initialTiles,
                currentTurn: 0,
                logs: [`房間 ${roomId} 已建立。`],
                isGameOver: false,
                isStarted: false,
                diceResult: null,
                isRolling: false,
              },
              sockets: new Map(),
            };
            rooms.set(roomId, room);
          }

          // Check if player already in room (reconnect)
          const existingPlayerIndex = room.state.players.findIndex(p => p.name === playerName);
          
          if (existingPlayerIndex !== -1) {
            room.state.players[existingPlayerIndex].socketId = socketId;
            room.state.players[existingPlayerIndex].isConnected = true;
          } else if (room.state.players.length < 4) {
            const playerColors = ["#ef4444", "#3b82f6", "#10b981", "#f59e0b"];
            const newPlayer: Player = {
              id: room.state.players.length,
              name: playerName,
              money: 50000,
              position: 0,
              status: 0,
              color: playerColors[room.state.players.length] || playerColor,
              isBot: false,
              socketId: socketId,
              isConnected: true,
            };
            room.state.players.push(newPlayer);
            room.state.logs.push(`${playerName} 加入了遊戲。`);
          }

          room.sockets.set(socketId, ws);
          
          // Broadcast updated state
          broadcast(room);
          break;
        }

        case "START_GAME": {
          if (!currentRoomId) return;
          const room = rooms.get(currentRoomId);
          if (room && !room.state.isStarted) {
            // Fill with bots if less than 4 players
            const botNames = ["機器人 A", "機器人 B", "機器人 C"];
            const botColors = ["#ef4444", "#3b82f6", "#10b981", "#f59e0b"];
            
            while (room.state.players.length < 4) {
              const botId = room.state.players.length;
              const botColor = botColors[botId] || "#cccccc";
              const botName = botNames[botId - 1] || `機器人 ${botId}`;
              
              room.state.players.push({
                id: botId,
                name: botName,
                money: 50000,
                position: 0,
                status: 0,
                color: botColor,
                isBot: true,
              });
            }
            
            room.state.isStarted = true;
            room.state.logs.push("遊戲正式開始！");
            broadcast(room);
          }
          break;
        }

        case "UPDATE_STATE": {
          if (!currentRoomId) return;
          const room = rooms.get(currentRoomId);
          if (room) {
            const oldPlayers = room.state.players;
            room.state = { ...room.state, ...message.payload };
            
            // Restore socketId and isConnected that might be stripped by client
            if (message.payload.players) {
              room.state.players = message.payload.players.map((newP: any) => {
                const oldP = oldPlayers.find(p => p.name === newP.name);
                return {
                  ...newP,
                  socketId: oldP?.socketId,
                  isConnected: oldP?.isConnected
                };
              });
            }
            
            broadcast(room);
          }
          break;
        }

        case "CHAT": {
          if (!currentRoomId) return;
          const room = rooms.get(currentRoomId);
          if (room) {
            room.state.logs.push(`${message.payload.sender}: ${message.payload.text}`);
            broadcast(room);
          }
          break;
        }
      }
    });

    ws.on("close", () => {
      if (currentRoomId) {
        const room = rooms.get(currentRoomId);
        if (room) {
          room.sockets.delete(socketId);
          
          const player = room.state.players.find(p => p.socketId === socketId);
          if (player) {
            player.isConnected = false;
            broadcast(room);
          }

          if (room.sockets.size === 0) {
            // Optional: Clean up empty rooms after some time
          }
        }
      }
    });
  });

  function broadcast(room: Room) {
    const stateStr = JSON.stringify({ type: "STATE_UPDATE", payload: room.state });
    room.sockets.forEach((socket) => {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(stateStr);
      }
    });
  }

  const PORT = 3000;
  server.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
