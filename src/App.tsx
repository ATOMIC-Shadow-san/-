import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import confetti from 'canvas-confetti';
import { 
  Dice1,
  Dice2,
  Dice3,
  Dice4,
  Dice5,
  Dice6,
  User, 
  Home, 
  TrendingUp, 
  AlertCircle, 
  Gift, 
  Skull, 
  Lock, 
  Coins,
  ChevronRight,
  History,
  Users,
  LogIn,
  Copy,
  Check
} from 'lucide-react';
import { 
  Player, 
  Tile, 
  GameState, 
  PlayerStatus, 
  TileType 
} from './types';
import { 
  BOARD_SIZE, 
  INITIAL_MONEY, 
  START_BONUS, 
  PLAYER_COLORS, 
  PLAYER_NAMES, 
  createInitialTiles 
} from './constants';

const DiceFaces = [Dice1, Dice2, Dice3, Dice4, Dice5, Dice6];

const TumblingDice = () => {
  const [faceIndex, setFaceIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setFaceIndex(Math.floor(Math.random() * 6));
    }, 100);
    return () => clearInterval(interval);
  }, []);

  const CurrentDice = DiceFaces[faceIndex];

  return (
    <motion.div
      key="rolling"
      animate={{ 
        rotateX: [0, 360, 720],
        rotateY: [0, 180, 360],
        rotateZ: [0, 90, 180],
        y: [0, -40, 0, -20, 0],
        scale: [1, 1.2, 1]
      }}
      transition={{ 
        duration: 1, 
        ease: "easeInOut",
        repeat: Infinity
      }}
      className="text-[#141414] drop-shadow-2xl"
    >
      <CurrentDice className="w-12 h-12 sm:w-16 sm:h-16 md:w-20 md:h-20" />
    </motion.div>
  );
};

const ResultDice = ({ result }: { result: number }) => {
  const CurrentDice = DiceFaces[result - 1] || Dice5;
  return (
    <motion.div
      key="result"
      initial={{ scale: 0, rotate: -180, opacity: 0 }}
      animate={{ scale: [1.5, 1], rotate: 0, opacity: 1 }}
      transition={{ type: "spring", stiffness: 300, damping: 15 }}
      className="flex flex-col items-center text-[#141414] drop-shadow-2xl"
    >
      <CurrentDice className="w-12 h-12 sm:w-16 sm:h-16 md:w-20 md:h-20 mb-2" />
      <motion.span 
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.2 }}
        className="text-4xl sm:text-5xl md:text-6xl font-mono font-black mb-0 sm:mb-2"
      >
        {result}
      </motion.span>
      <span className="text-[8px] sm:text-[10px] md:text-xs uppercase tracking-widest opacity-40">步數</span>
    </motion.div>
  );
};

export default function App() {
  const [socket, setSocket] = useState<WebSocket | null>(null);
  const [roomId, setRoomId] = useState<string>('');
  const [playerName, setPlayerName] = useState<string>('');
  const [isJoined, setIsJoined] = useState(false);
  const [copied, setCopied] = useState(false);

  const [gameState, setGameState] = useState<GameState>({
    players: [],
    tiles: createInitialTiles(),
    currentTurn: 0,
    logs: ['遊戲開始！歡迎來到二中大富翁。'],
    isGameOver: false,
    isStarted: false,
    diceResult: null,
    isRolling: false,
  });

  const [showBuyModal, setShowBuyModal] = useState<{ tileId: number; type: 'buy' | 'upgrade' } | null>(null);
  const logEndRef = useRef<HTMLDivElement>(null);

  // WebSocket Connection
  useEffect(() => {
    let ws: WebSocket | null = null;
    let reconnectTimer: NodeJS.Timeout;

    const connect = () => {
      if (!isJoined) return;

      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      ws = new WebSocket(`${protocol}//${window.location.host}`);
      
      ws.onopen = () => {
        console.log('Connected to server');
        ws?.send(JSON.stringify({
          type: 'JOIN_ROOM',
          payload: {
            roomId,
            playerName,
            playerColor: PLAYER_COLORS[Math.floor(Math.random() * PLAYER_COLORS.length)]
          }
        }));
      };

      ws.onmessage = (event) => {
        const message = JSON.parse(event.data);
        if (message.type === 'STATE_UPDATE') {
          setGameState(message.payload);
        }
      };

      ws.onclose = () => {
        console.log('Disconnected from server, reconnecting...');
        reconnectTimer = setTimeout(connect, 2000);
      };

      setSocket(ws);
    };

    connect();

    return () => {
      clearTimeout(reconnectTimer);
      if (ws) {
        ws.onclose = null;
        ws.close();
      }
    };
  }, [isJoined, roomId, playerName]);

  const syncState = useCallback((newState: GameState) => {
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({
        type: 'UPDATE_STATE',
        payload: newState
      }));
    }
  }, [socket]);

  const addLog = useCallback((message: string) => {
    setGameState(prev => {
      const newState = {
        ...prev,
        logs: [...prev.logs.slice(-49), message],
      };
      syncState(newState);
      return newState;
    });
  }, [syncState]);

  const joinRoom = (e: React.FormEvent) => {
    e.preventDefault();
    if (roomId && playerName) {
      setIsJoined(true);
    }
  };

  const startGame = () => {
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({
        type: 'START_GAME'
      }));
    }
  };

  const copyRoomId = () => {
    navigator.clipboard.writeText(roomId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  /* 
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [gameState.logs]);
  */

  const checkBankruptcy = useCallback((playerIndex: number, players: Player[], tiles: Tile[]) => {
    let currentPlayer = { ...players[playerIndex] };
    let currentTiles = [...tiles];
    let logs: string[] = [];

    while (currentPlayer.money < 0 && currentPlayer.status !== PlayerStatus.Bankrupt) {
      // Find cheapest property to sell
      let minPrice = Infinity;
      let sellHouseIndex = -1;

      currentTiles.forEach((tile, idx) => {
        if (tile.ownerId === playerIndex && tile.price < minPrice) {
          minPrice = tile.price;
          sellHouseIndex = idx;
        }
      });

      if (sellHouseIndex !== -1) {
        const sellPrice = Math.floor(currentTiles[sellHouseIndex].price * 0.7);
        currentPlayer.money += sellPrice;
        currentTiles[sellHouseIndex].ownerId = null;
        // Reset price to base
        currentTiles[sellHouseIndex].price = 500 * (Math.floor(sellHouseIndex / 3) + 1);
        logs.push(`${currentPlayer.name} 資金不足，以七折出售 ${currentTiles[sellHouseIndex].name}，獲得 ${sellPrice} 元。`);
      } else {
        currentPlayer.status = PlayerStatus.Bankrupt;
        logs.push(`${currentPlayer.name} 宣佈破產！`);
        // Return all properties to bank
        currentTiles = currentTiles.map(t => t.ownerId === playerIndex ? { ...t, ownerId: null, price: 500 * (Math.floor(t.id / 3) + 1) } : t);
      }
    }

    return { currentPlayer, currentTiles, logs };
  }, []);

  const handleChance = (playerIndex: number, position: number, step: number) => {
    const f = Math.floor(Math.random() * 12);
    let moneyChange = 0;
    let statusChange = PlayerStatus.Normal;
    let log = '';

    switch (f) {
      case 0:
        moneyChange = 5000;
        log = "機會：二中大電神獲得諾貝爾獎。獲得 5000 元。";
        break;
      case 1:
        moneyChange = -1000;
        statusChange = PlayerStatus.RetakeClass;
        log = "機會：因為數學被死當，花費 1000 元參加重補修，並停留一回合。";
        break;
      case 2:
        moneyChange = -2000;
        log = "機會：教室冷氣故障，校方檢查不出問題，反向你收取 2000 元維修費。";
        break;
      case 3:
        moneyChange = 3000;
        log = "機會：參加中二中校慶創意市集大賣！獲得 3000 元。";
        break;
      case 4:
        moneyChange = -1500;
        log = "機會：在忠孝樓走廊奔跑被教官抓到，罰款 1500 元。";
        break;
      case 5:
        moneyChange = 4000;
        log = "機會：代表學校參加全國科展獲得佳績，獲得獎學金 4000 元。";
        break;
      case 6:
        moneyChange = -500;
        log = "機會：在福利社買午餐時發現錢包掉了，損失 500 元。";
        break;
      case 7:
        moneyChange = 6000;
        log = "機會：段考考全校第一，獲得校友會獎學金 6000 元。";
        break;
      case 8:
        moneyChange = -1000;
        log = "機會：上課偷玩手機被沒收，花費 1000 元買新手機。";
        break;
      case 9:
        moneyChange = 2000;
        log = "機會：參加二中校園歌唱大賽獲得冠軍，獲得 2000 元。";
        break;
      case 10:
        moneyChange = -500;
        log = "機會：忘記帶學生證，進校門被記警告，花費 500 元愛校服務銷過。";
        break;
      case 11:
        moneyChange = 3500;
        log = "機會：代表學校參加全國音樂比賽特優，獲得 3500 元。";
        break;
    }
    return { moneyChange, statusChange, log };
  };

  const handleFate = (playerIndex: number, position: number, step: number, playerMoney: number, players: Player[], tiles: Tile[]) => {
    const f = Math.floor(Math.random() * 12);
    let moneyChange = 0;
    let statusChange = PlayerStatus.Normal;
    let log = '';
    let extraTurn = false;
    let otherPlayersMoneyChanges: { id: number; amount: number }[] = [];

    switch (f) {
      case 0:
        moneyChange = -Math.floor(playerMoney * 0.1);
        log = `命運：因為臺中二中缺錢，捐出 10% (${Math.abs(moneyChange)} 元) 的財產。`;
        break;
      case 1:
        statusChange = PlayerStatus.NoJob;
        log = "命運：因為畢業於臺中二中找不到工作而休息一回合。";
        break;
      case 2:
        let factorial = 1;
        for (let i = 1; i <= step; i++) factorial *= i;
        moneyChange = factorial * 10;
        log = `命運：數學課上到階層(!)，獲得步數(${step})! * 10 = ${moneyChange} 元。`;
        break;
      case 3:
        let count = 0;
        players.forEach((p, i) => {
          if (p.status !== PlayerStatus.Bankrupt && i !== playerIndex) {
            otherPlayersMoneyChanges.push({ id: i, amount: -1500 });
            count++;
          }
        });
        moneyChange = count * 1500;
        log = `命運：收班費向每位玩家收 1500 元，共獲得 ${moneyChange} 元。`;
        break;
      case 4:
        let maxPrice = 0;
        let sellHouseIndex = -1;
        tiles.forEach((tile, idx) => {
          if (tile.ownerId === playerIndex && tile.price > maxPrice) {
            maxPrice = tile.price;
            sellHouseIndex = idx;
          }
        });

        if (sellHouseIndex !== -1) {
          log = "命運：新校長上任，新官上任三把火。失去最貴的地標。";
          // This will be handled in the main state update
        } else {
          log = "命運：新校長上任，下午 4 點提早放學。再動一次！";
          extraTurn = true;
        }
        break;
      case 5:
        moneyChange = 2000;
        log = "命運：在萃英樓撿到 2000 元，交給教官後獲得榮譽假獎金。";
        break;
      case 6:
        moneyChange = -3000;
        log = "命運：模擬考成績不理想，被要求參加課後輔導。繳交輔導費 3000 元。";
        break;
      case 7:
        moneyChange = 2500;
        log = "命運：二中校慶抽獎抽中二獎！獲得 2500 元。";
        break;
      case 8:
        moneyChange = -2000;
        log = "命運：二中校園淹水，所有地標維修費，損失 2000 元。";
        break;
      case 9:
        log = "命運：遇到二中傳說中的好老師，心情大好，再動一次！";
        extraTurn = true;
        break;
      case 10:
        moneyChange = -2500;
        log = "命運：不小心打破實驗室器材，賠償 2500 元。";
        break;
      case 11:
        moneyChange = 3000;
        log = "命運：獲得傑出校友提拔，獲得 3000 元。";
        break;
    }
    return { moneyChange, statusChange, log, extraTurn, otherPlayersMoneyChanges, sellHouseIndex: f === 4 ? 4 : -1 }; // sellHouseIndex logic is a bit messy in C++, let's refine
  };

  const executeTurn = useCallback(async (step: number) => {
    setGameState(prev => {
      const currentPlayerIndex = prev.currentTurn;
      const player = prev.players[currentPlayerIndex];
      
      if (!player) return { ...prev, isRolling: false };

      // Only allow the current player to move OR host to move bot
      const myPlayer = prev.players.find(p => p.name === playerName);
      const isHost = prev.players.find(p => !p.isBot && p.isConnected !== false)?.name === playerName;
      const canMove = (myPlayer && myPlayer.id === currentPlayerIndex) || (isHost && player?.isBot);
      
      if (!canMove) {
        return { ...prev, isRolling: false };
      }

      if (player.status !== PlayerStatus.Normal) {
        let statusMsg = '';
        if (player.status === PlayerStatus.Jail) statusMsg = `${player.name} 在監獄休息一回合。`;
        else if (player.status === PlayerStatus.NoJob) statusMsg = `${player.name} 渡過了找不到工作的日子。`;
        else if (player.status === PlayerStatus.RetakeClass) statusMsg = `${player.name} 正在重補修。`;
        
        const newState = {
          ...prev,
          players: prev.players.map((p, i) => i === currentPlayerIndex ? { ...p, status: PlayerStatus.Normal } : p),
          currentTurn: (prev.currentTurn + 1) % prev.players.length,
          logs: [...prev.logs, statusMsg],
          diceResult: step,
          isRolling: false,
        };
        syncState(newState);
        return newState;
      }

      let newPosition = (player.position + step) % BOARD_SIZE;
      let newMoney = player.money;
      let newLogs = [...prev.logs, `${player.name} 擲出了 ${step} 點。`];
      let newTiles = [...prev.tiles];
      let nextTurn = (prev.currentTurn + 1) % prev.players.length;
      let newStatus = PlayerStatus.Normal;

      // Passing Start
      if (player.position + step >= BOARD_SIZE) {
        newMoney += START_BONUS;
        newLogs.push(`${player.name} 經過起點，獲得 ${START_BONUS} 元！`);
        
        // Trigger confetti for passing start if it's the current user
        if (myPlayer && myPlayer.id === currentPlayerIndex) {
          confetti({
            particleCount: 100,
            spread: 70,
            origin: { y: 0.6 }
          });
        }
      }

      const tile = newTiles[newPosition];

      // Handle Tile Logic
      if (newPosition === 18) {
        newLogs.push(`${player.name} 到了監獄，休息一回合。`);
        newStatus = PlayerStatus.Jail;
      } else if (tile.type === TileType.Property) {
        if (tile.ownerId === null) {
          // Empty property
          if (player?.isBot) {
            if (newMoney >= tile.price + 5000) {
              newMoney -= tile.price;
              newTiles[newPosition] = { ...tile, ownerId: currentPlayerIndex, price: Math.floor(tile.price / 2) };
              newLogs.push(`${player.name} 花了 ${tile.price} 元購買了 ${tile.name}！`);
            }
          } else {
            // User turn - show modal
            setTimeout(() => setShowBuyModal({ tileId: newPosition, type: 'buy' }), 500);
            const newState = { ...prev, diceResult: step, isRolling: false, players: prev.players.map((p, i) => i === currentPlayerIndex ? { ...p, position: newPosition } : p) };
            syncState(newState);
            return newState;
          }
        } else if (tile.ownerId === currentPlayerIndex) {
          // Own property - upgrade
          if (player?.isBot) {
            if (newMoney >= tile.price + 5000) {
              newMoney -= tile.price;
              newTiles[newPosition] = { ...tile, price: Math.floor(tile.price * 2.3) };
              newLogs.push(`${player.name} 花了 ${tile.price} 元升級了 ${tile.name}！`);
            }
          } else {
            // User turn - show modal
            setTimeout(() => setShowBuyModal({ tileId: newPosition, type: 'upgrade' }), 500);
            const newState = { ...prev, diceResult: step, isRolling: false, players: prev.players.map((p, i) => i === currentPlayerIndex ? { ...p, position: newPosition } : p) };
            syncState(newState);
            return newState;
          }
        } else {
          // Other's property - pay rent
          const ownerIndex = tile.ownerId;
          let rent = tile.price;
          
          // Adjacent property bonus logic
          const prevIdx = (newPosition - 1 + BOARD_SIZE) % BOARD_SIZE;
          const nextIdx = (newPosition + 1) % BOARD_SIZE;
          const hasNeighborOwned = 
            (newTiles[prevIdx].type === TileType.Property && newTiles[prevIdx].ownerId === ownerIndex) ||
            (newTiles[nextIdx].type === TileType.Property && newTiles[nextIdx].ownerId === ownerIndex);

          if (hasNeighborOwned) {
            rent *= 2;
            newLogs.push(`連鎖效應！由於 ${prev.players[ownerIndex].name} 擁有相鄰地標，過路費翻倍為 ${rent} 元！`);
          } else {
            newLogs.push(`${player.name} 到了 ${prev.players[ownerIndex].name} 的 ${tile.name}，支付過路費 ${rent} 元。`);
          }

          newMoney -= rent;
          
          // Update owner's money
          const updatedPlayers = prev.players.map((p, i) => {
            if (i === ownerIndex) return { ...p, money: p.money + rent };
            if (i === currentPlayerIndex) return { ...p, money: newMoney, position: newPosition, status: newStatus };
            return p;
          });

          // Check bankruptcy after paying rent
          const { currentPlayer, currentTiles, logs: bankLogs } = checkBankruptcy(currentPlayerIndex, updatedPlayers, newTiles);
          const newState = {
            ...prev,
            players: updatedPlayers.map((p, i) => i === currentPlayerIndex ? currentPlayer : p),
            tiles: currentTiles,
            currentTurn: nextTurn,
            logs: [...newLogs, ...bankLogs],
            diceResult: step,
            isRolling: false,
          };
          syncState(newState);
          return newState;
        }
      } else if (tile.type === TileType.Chance) {
        const { moneyChange, statusChange, log } = handleChance(currentPlayerIndex, newPosition, step);
        newMoney += moneyChange;
        newStatus = statusChange;
        newLogs.push(log);
      } else if (tile.type === TileType.Fate) {
        const { moneyChange, statusChange, log, extraTurn, otherPlayersMoneyChanges, sellHouseIndex } = handleFate(currentPlayerIndex, newPosition, step, newMoney, prev.players, newTiles);
        newMoney += moneyChange;
        newStatus = statusChange;
        newLogs.push(log);
        if (extraTurn) nextTurn = currentPlayerIndex;
        
        // Handle other players money changes (class fee)
        let updatedPlayers = prev.players.map(p => {
          const change = otherPlayersMoneyChanges.find(c => c.id === p.id);
          return change ? { ...p, money: p.money + change.amount } : p;
        });

        // Handle losing most expensive house
        if (log.includes("失去最貴的地標")) {
          let maxPrice = 0;
          let houseIdx = -1;
          newTiles.forEach((t, idx) => {
            if (t.ownerId === currentPlayerIndex && t.price > maxPrice) {
              maxPrice = t.price;
              houseIdx = idx;
            }
          });
          if (houseIdx !== -1) {
            newTiles[houseIdx] = { ...newTiles[houseIdx], ownerId: null, price: 500 * (Math.floor(houseIdx / 3) + 1) };
          }
        }

        const { currentPlayer, currentTiles, logs: bankLogs } = checkBankruptcy(currentPlayerIndex, updatedPlayers, newTiles);
        const newState = {
          ...prev,
          players: updatedPlayers.map((p, i) => i === currentPlayerIndex ? currentPlayer : p),
          tiles: currentTiles,
          currentTurn: nextTurn,
          logs: [...newLogs, ...bankLogs],
          diceResult: step,
          isRolling: false,
        };
        syncState(newState);
        return newState;
      } else if (tile.type === TileType.Angel) {
        const gain = Math.floor((newMoney * Math.floor(Math.random() * 101)) / 100);
        newMoney += gain;
        newLogs.push(`天使：隨機獲得自身財產的 0~100%。獲得 ${gain} 元。`);
      } else if (tile.type === TileType.Devil) {
        const loss = Math.floor((newMoney * Math.floor(Math.random() * 31)) / 100);
        newMoney -= loss;
        newLogs.push(`惡魔：隨機損失自身財產的 0~30%。損失 ${loss} 元。`);
      }

      const updatedPlayers = prev.players.map((p, i) => i === currentPlayerIndex ? { ...p, money: newMoney, position: newPosition, status: newStatus } : p);
      const { currentPlayer, currentTiles, logs: bankLogs } = checkBankruptcy(currentPlayerIndex, updatedPlayers, newTiles);

      const newState = {
        ...prev,
        players: updatedPlayers.map((p, i) => i === currentPlayerIndex ? currentPlayer : p),
        tiles: currentTiles,
        currentTurn: nextTurn,
        logs: [...newLogs, ...bankLogs],
        diceResult: step,
        isRolling: false,
      };
      syncState(newState);
      return newState;
    });
  }, [checkBankruptcy, handleChance, handleFate, playerName, syncState]);

  const rollDice = () => {
    if (gameState.isRolling || gameState.isGameOver) return;
    
    const currentPlayer = gameState.players[gameState.currentTurn];
    const myPlayer = gameState.players.find(p => p.name === playerName);
    const isHost = gameState.players.find(p => !p.isBot && p.isConnected !== false)?.name === playerName;

    // Allow roll if it's my turn OR if I'm host and it's a bot's turn
    const canRoll = (myPlayer && myPlayer.id === gameState.currentTurn) || (isHost && currentPlayer?.isBot);
    
    if (!canRoll) return;

    setGameState(prev => {
      const newState = { ...prev, isRolling: true };
      syncState(newState);
      return newState;
    });
    
    // Simulate rolling animation
    setTimeout(() => {
      const step = Math.floor(Math.random() * 6) + 1;
      executeTurn(step);
    }, 1000);
  };

  // Anti-stuck mechanism for dice rolling
  useEffect(() => {
    if (gameState.isRolling) {
      const timer = setTimeout(() => {
        setGameState(prev => {
          if (prev.isRolling) {
            const isHost = prev.players.find(p => !p.isBot && p.isConnected !== false)?.name === playerName;
            const newState = { ...prev, isRolling: false };
            if (isHost) {
              syncState(newState);
            }
            return newState;
          }
          return prev;
        });
      }, 5000); // 5 seconds timeout
      return () => clearTimeout(timer);
    }
  }, [gameState.isRolling, playerName, syncState]);

  // Bot Turn Logic
  useEffect(() => {
    const currentPlayer = gameState.players[gameState.currentTurn];
    const isHost = gameState.players.find(p => !p.isBot && p.isConnected !== false)?.name === playerName;
    
    if (isHost && currentPlayer?.isBot && !gameState.isGameOver && !gameState.isRolling && !showBuyModal && gameState.isStarted) {
      const timer = setTimeout(() => {
        rollDice();
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [gameState.currentTurn, gameState.isRolling, gameState.isGameOver, showBuyModal, gameState.isStarted, playerName, gameState.players]);

  // Check Game Over
  useEffect(() => {
    if (!gameState.isStarted) return;
    const alivePlayers = gameState.players.filter(p => p.status !== PlayerStatus.Bankrupt);
    if (alivePlayers.length <= 1) {
      setGameState(prev => ({ ...prev, isGameOver: true, logs: [...prev.logs, `遊戲結束！獲勝者是 ${alivePlayers[0]?.name || '無人'}！`] }));
      
      // Trigger confetti when game is over and someone wins
      if (alivePlayers.length === 1) {
        const duration = 3 * 1000;
        const animationEnd = Date.now() + duration;
        const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 0 };

        const randomInRange = (min: number, max: number) => Math.random() * (max - min) + min;

        const interval: any = setInterval(function() {
          const timeLeft = animationEnd - Date.now();

          if (timeLeft <= 0) {
            return clearInterval(interval);
          }

          const particleCount = 50 * (timeLeft / duration);
          confetti(Object.assign({}, defaults, { particleCount, origin: { x: randomInRange(0.1, 0.3), y: Math.random() - 0.2 } }));
          confetti(Object.assign({}, defaults, { particleCount, origin: { x: randomInRange(0.7, 0.9), y: Math.random() - 0.2 } }));
        }, 250);
      }
    }
  }, [gameState.players, gameState.isStarted]);

  const handleBuyDecision = (decision: boolean) => {
    if (!showBuyModal) return;

    setGameState(prev => {
      const playerIndex = prev.players.findIndex(p => p.name === playerName);
      if (playerIndex === -1) return prev;
      
      const player = prev.players[playerIndex];
      const tile = prev.tiles[showBuyModal.tileId];
      let newMoney = player.money;
      let newTiles = [...prev.tiles];
      let newLogs = [...prev.logs];

      if (decision) {
        if (showBuyModal.type === 'buy') {
          newMoney -= tile.price;
          newTiles[showBuyModal.tileId] = { ...tile, ownerId: playerIndex, price: Math.floor(tile.price / 2) };
          newLogs.push(`${player.name} 花了 ${tile.price} 元購買了 ${tile.name}！`);
        } else {
          newMoney -= tile.price;
          newTiles[showBuyModal.tileId] = { ...tile, price: Math.floor(tile.price * 2.3) };
          newLogs.push(`${player.name} 花了 ${tile.price} 元升級了 ${tile.name}！`);
        }
      }

      const newState = {
        ...prev,
        players: prev.players.map((p, i) => i === playerIndex ? { ...p, money: newMoney } : p),
        tiles: newTiles,
        currentTurn: (prev.currentTurn + 1) % prev.players.length,
        logs: newLogs,
      };
      syncState(newState);
      return newState;
    });

    setShowBuyModal(null);
  };

  // Board Layout Helper
  const getTilePosition = (index: number) => {
    // 36 tiles total: 10 on each side (corners shared)
    // Top: 0-9
    // Right: 10-17
    // Bottom: 18-27 (reversed)
    // Left: 28-35 (reversed)
    if (index <= 9) return { top: 0, left: index * 10 };
    if (index <= 17) return { top: (index - 9) * 10, left: 90 };
    if (index <= 27) return { top: 90, left: (27 - index + 1) * 10 - 10 };
    return { top: (35 - index + 1) * 10, left: 0 };
  };

  if (!isJoined) {
    return (
      <div className="min-h-screen bg-[#E4E3E0] flex items-center justify-center p-4 font-sans">
        <motion.div 
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="bg-white border-2 border-[#141414] shadow-[12px_12px_0px_0px_rgba(20,20,20,1)] p-8 max-w-md w-full"
        >
          <div className="flex items-center gap-3 mb-8">
            <div className="p-3 bg-zinc-100 rounded-xl">
              <Users className="w-8 h-8" />
            </div>
            <div>
              <h1 className="text-3xl font-serif italic font-bold">二中大富翁</h1>
              <p className="text-[10px] uppercase tracking-widest opacity-50">Online Multiplayer</p>
            </div>
          </div>

          <form onSubmit={joinRoom} className="space-y-6">
            <div>
              <label className="block text-[10px] uppercase tracking-widest opacity-50 mb-2 font-bold">你的名字</label>
              <input 
                required
                type="text" 
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
                placeholder="輸入玩家名稱..."
                className="w-full p-4 bg-zinc-50 border border-[#141414] focus:outline-none focus:ring-2 focus:ring-[#141414]/10 font-mono"
              />
            </div>
            <div>
              <label className="block text-[10px] uppercase tracking-widest opacity-50 mb-2 font-bold">房間 ID</label>
              <input 
                required
                type="text" 
                value={roomId}
                onChange={(e) => setRoomId(e.target.value)}
                placeholder="輸入房間 ID..."
                className="w-full p-4 bg-zinc-50 border border-[#141414] focus:outline-none focus:ring-2 focus:ring-[#141414]/10 font-mono"
              />
            </div>
            <button 
              type="submit"
              className="w-full py-4 bg-[#141414] text-white font-bold rounded-full hover:scale-[1.02] transition-transform active:scale-[0.98] flex items-center justify-center gap-2"
            >
              <LogIn className="w-5 h-5" />
              進入房間
            </button>
          </form>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f5f5f5] text-[#141414] font-sans selection:bg-[#141414] selection:text-white overflow-x-hidden relative">
      {/* Animated Background Elements */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden opacity-20 z-0">
        <motion.div 
          animate={{ 
            x: [0, 100, 0], 
            y: [0, 50, 0],
            rotate: [0, 10, 0]
          }}
          transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
          className="absolute -top-20 -left-20 w-96 h-96 bg-emerald-200 rounded-full blur-[100px]"
        />
        <motion.div 
          animate={{ 
            x: [0, -100, 0], 
            y: [0, -50, 0],
            rotate: [0, -10, 0]
          }}
          transition={{ duration: 25, repeat: Infinity, ease: "linear" }}
          className="absolute -bottom-20 -right-20 w-96 h-96 bg-blue-200 rounded-full blur-[100px]"
        />
      </div>

      <header className="p-8 border-b-4 border-[#141414] bg-white sticky top-0 z-50 shadow-sm">
        <div>
          <h1 className="text-4xl font-serif italic font-bold tracking-tight">二中大富翁</h1>
          <div className="flex items-center gap-3 mt-1">
            <p className="text-xs uppercase tracking-widest opacity-60">TCSSH Edition • Online</p>
            <div className="h-3 w-px bg-[#141414]/20" />
            <button 
              onClick={copyRoomId}
              className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest font-bold opacity-60 hover:opacity-100 transition-opacity"
            >
              ID: {roomId}
              {copied ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
            </button>
          </div>
        </div>
        <div className="flex gap-4">
          {gameState.players.map(player => (
            <div key={player.id} className={`flex flex-col items-end ${player.status === PlayerStatus.Bankrupt ? 'opacity-30 grayscale' : ''}`}>
              <span className="text-[10px] font-mono uppercase opacity-50">{player.name}</span>
              <span className="text-lg font-mono font-bold" style={{ color: player.color }}>
                ${player.money.toLocaleString()}
              </span>
            </div>
          ))}
        </div>
      </header>

      <main className="w-full max-w-[1400px] flex flex-col xl:flex-row gap-4 sm:gap-8 items-start px-2 sm:px-4 pb-20 overflow-hidden">
        {/* Game Board Container */}
        <motion.div 
          initial={{ opacity: 0, y: 50 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full xl:flex-1 relative aspect-square bg-white border-[2px] sm:border-[4px] border-[#141414] shadow-[8px_8px_0px_0px_rgba(20,20,20,1)] sm:shadow-[20px_20px_0px_0px_rgba(20,20,20,1)] overflow-hidden rounded-lg group"
        >
          {/* Center Decoration */}
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none z-0">
            <motion.div 
              animate={{ 
                rotate: [0, 5, -5, 0], 
                scale: [1, 1.05, 1],
                opacity: [0.03, 0.05, 0.03]
              }}
              transition={{ duration: 15, repeat: Infinity, ease: "easeInOut" }}
              className="select-none"
            >
              <h1 className="text-[25vw] font-black tracking-tighter text-[#141414]">TCSSH</h1>
            </motion.div>
          </div>

          {/* Tiles */}
          <div className="absolute inset-0 grid grid-cols-10 grid-rows-10">
            {gameState.tiles.map((tile, i) => {
              const pos = getTilePosition(i);
              const isCorner = i % 9 === 0;
              
              return (
                <motion.div 
                  key={tile.id}
                  whileHover={{ 
                    scale: 1.05, 
                    zIndex: 40,
                    boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.2)",
                    backgroundColor: "#fafafa"
                  }}
                  className={`border-[1px] sm:border-[2px] border-[#141414]/40 flex flex-col items-center justify-center p-0.5 sm:p-2 text-center relative
                    ${isCorner ? 'bg-zinc-100 font-black' : 'bg-white'}
                    ${tile.type === TileType.Chance ? 'bg-blue-100/40' : ''}
                    ${tile.type === TileType.Fate ? 'bg-purple-100/40' : ''}
                    ${tile.type === TileType.Angel ? 'bg-yellow-100/40' : ''}
                    ${tile.type === TileType.Devil ? 'bg-red-100/40' : ''}
                    transition-all duration-300 cursor-pointer
                  `}
                  style={{
                    gridColumnStart: Math.floor(pos.left / 10) + 1,
                    gridRowStart: Math.floor(pos.top / 10) + 1,
                  }}
                >
                  <span className="text-[4px] sm:text-[10px] font-mono font-black opacity-20 absolute top-0.5 left-0.5 sm:top-1 sm:left-1">{i}</span>
                  
                  {/* Property Owner Color Bar */}
                  {tile.ownerId !== null && (
                    <motion.div 
                      initial={{ height: 0 }}
                      animate={{ height: 4 }}
                      className="absolute top-0 left-0 right-0 shadow-sm z-10 border-b border-black/10 sm:h-2" 
                      style={{ backgroundColor: PLAYER_COLORS[tile.ownerId] }}
                    />
                  )}

                  <div className="flex flex-col items-center gap-0 sm:gap-1 w-full px-0.5 sm:px-1 py-1 sm:py-2">
                    {tile.type === TileType.Start && <ChevronRight className="w-3 h-3 sm:w-8 sm:h-8 text-emerald-600 animate-bounce" />}
                    {tile.type === TileType.Chance && <AlertCircle className="w-3 h-3 sm:w-8 sm:h-8 text-blue-500 drop-shadow-md animate-pulse" />}
                    {tile.type === TileType.Fate && <History className="w-3 h-3 sm:w-8 sm:h-8 text-purple-500 drop-shadow-md" />}
                    {tile.type === TileType.Angel && <Gift className="w-3 h-3 sm:w-8 sm:h-8 text-amber-500 drop-shadow-md" />}
                    {tile.type === TileType.Devil && <Skull className="w-3 h-3 sm:w-8 sm:h-8 text-red-500 drop-shadow-md" />}
                    {tile.type === TileType.Jail && <Lock className="w-3 h-3 sm:w-8 sm:h-8 text-zinc-600 drop-shadow-md" />}
                    {tile.type === TileType.Property && <Home className="hidden sm:block w-4 h-4 opacity-10" />}
                    
                    <span className="text-[5px] sm:text-[10px] md:text-[12px] font-black leading-[1.1] text-[#141414] break-words w-full tracking-tighter uppercase">{tile.name}</span>
                    <div className="flex items-center justify-center gap-0.5 sm:gap-1 mt-0 sm:mt-1">
                      {tile.price > 0 && (
                        <span className="text-[4px] sm:text-[10px] md:text-[11px] font-mono font-black text-[#141414]/60">${tile.price}</span>
                      )}
                      {tile.type === TileType.Property && tile.ownerId !== null && (
                        (() => {
                          const prevIdx = (i - 1 + BOARD_SIZE) % BOARD_SIZE;
                          const nextIdx = (i + 1) % BOARD_SIZE;
                          const hasNeighborOwned = 
                            (gameState.tiles[prevIdx].type === TileType.Property && gameState.tiles[prevIdx].ownerId === tile.ownerId) ||
                            (gameState.tiles[nextIdx].type === TileType.Property && gameState.tiles[nextIdx].ownerId === tile.ownerId);
                          return hasNeighborOwned ? (
                            <motion.div 
                              animate={{ 
                                scale: [1, 1.1, 1],
                                rotate: [0, 5, -5, 0]
                              }}
                              transition={{ duration: 0.8, repeat: Infinity }}
                              className="flex items-center gap-0.5 sm:gap-1 bg-amber-500 text-white px-0.5 py-0 sm:px-1.5 sm:py-0.5 rounded-full border border-amber-600 shadow-md"
                            >
                              <span className="text-[4px] sm:text-[8px] font-black italic">x2</span>
                            </motion.div>
                          ) : null;
                        })()
                      )}
                    </div>
                  </div>

                  {/* Player Tokens on this tile */}
                  <div className="absolute bottom-0.5 sm:bottom-1 flex flex-wrap justify-center gap-0.5 sm:gap-1 px-0.5 sm:px-1 z-30">
                    {gameState.players.map(p => p.position === i && p.status !== PlayerStatus.Bankrupt && (
                      <motion.div
                        key={p.id}
                        layoutId={`player-${p.id}`}
                        className="w-2 h-2 sm:w-4 sm:h-4 md:w-6 md:h-6 rounded-full border-[1px] sm:border-[2px] border-white shadow-[0_2px_4px_rgba(0,0,0,0.3)] sm:shadow-[0_4px_8px_rgba(0,0,0,0.3)] flex items-center justify-center relative"
                        style={{ backgroundColor: p.color }}
                        initial={{ scale: 0, y: -20, rotate: -180 }}
                        animate={{ scale: 1, y: 0, rotate: 0 }}
                        transition={{ type: 'spring', stiffness: 600, damping: 10 }}
                      >
                        <div className="absolute inset-0 rounded-full bg-gradient-to-br from-white/40 via-transparent to-black/40 pointer-events-none" />
                        <div className="w-0.5 h-0.5 sm:w-1 sm:h-1 md:w-1.5 md:h-1.5 bg-white/60 rounded-full blur-[0.5px] sm:blur-[1px] absolute top-0.5 left-0.5 sm:top-1 sm:left-1" />
                        <span className="text-white font-black text-[3px] sm:text-[5px] md:text-[6px] opacity-50 uppercase tracking-tighter">{p.name[0]}</span>
                      </motion.div>
                    ))}
                  </div>
                </motion.div>
              );
            })}
          </div>

          {/* Center Area */}
          <div className="absolute inset-[12%] sm:inset-[15%] bg-white/40 backdrop-blur-sm flex flex-col items-center justify-center p-2 sm:p-6 md:p-12 text-center border-2 sm:border-4 border-[#141414]/10 rounded-xl sm:rounded-2xl shadow-inner z-10 overflow-hidden">
            {!gameState.isStarted ? (
              <div className="flex flex-col items-center">
                <Users className="w-6 h-6 sm:w-10 sm:h-10 md:w-16 md:h-16 opacity-10 mb-1 sm:mb-4" />
                <h2 className="text-sm sm:text-xl md:text-2xl font-serif italic font-bold mb-1 sm:mb-2">等待室</h2>
                <p className="text-[8px] sm:text-xs md:text-sm opacity-60 mb-2 sm:mb-6">目前玩家: {gameState.players.length} / 6</p>
                
                <div className="flex flex-col gap-1 sm:gap-2 mb-2 sm:mb-8 w-full max-w-[120px] sm:max-w-[200px]">
                  {gameState.players.map(p => (
                    <div key={p.id} className="flex items-center gap-1 sm:gap-2 text-[8px] sm:text-xs md:text-sm font-mono p-1 sm:p-2 bg-white border border-[#141414]/5 rounded">
                      <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full shrink-0" style={{ backgroundColor: p.color }} />
                      <span className="truncate">{p.name} {p.name === playerName && "(你)"}</span>
                    </div>
                  ))}
                </div>

                {gameState.players.find(p => !p.isBot && p.isConnected !== false)?.name === playerName && (
                  <button
                    onClick={startGame}
                    className="px-3 py-1.5 sm:px-6 sm:py-3 md:px-10 md:py-4 bg-[#141414] text-white rounded-full font-bold hover:scale-105 transition-transform active:scale-95 flex items-center gap-1 sm:gap-2 text-[8px] sm:text-sm md:text-lg shadow-lg"
                  >
                    <LogIn className="w-3 h-3 sm:w-5 sm:h-5 md:w-6 md:h-6" />
                    開始遊戲
                  </button>
                )}
                {gameState.players.length > 0 && gameState.players.find(p => !p.isBot && p.isConnected !== false)?.name !== playerName && (
                  <div className="flex items-center gap-1 sm:gap-2 text-[8px] sm:text-xs md:text-sm font-bold opacity-60">
                    <Users className="w-3 h-3 sm:w-4 sm:h-4 animate-pulse" />
                    等待房主...
                  </div>
                )}
              </div>
            ) : (
              <>
                <AnimatePresence mode="wait">
                  {gameState.isRolling ? (
                    <TumblingDice />
                  ) : gameState.diceResult ? (
                    <ResultDice result={gameState.diceResult} />
                  ) : (
                    <div key="idle" className="flex flex-col items-center">
                      <Dice5 className="w-8 h-8 sm:w-12 sm:h-12 md:w-16 md:h-16 opacity-10 mb-1 sm:mb-4" />
                      <div className="max-w-[120px] sm:max-w-[200px]">
                        <p className="text-[10px] sm:text-xs md:text-sm font-bold text-[#141414] mb-0.5 sm:mb-1">最新動態</p>
                        <p className="text-[8px] sm:text-[10px] md:text-xs italic opacity-60 font-serif leading-tight sm:leading-relaxed line-clamp-2 sm:line-clamp-none">
                          {gameState.logs[gameState.logs.length - 1]}
                        </p>
                      </div>
                    </div>
                  )}
                </AnimatePresence>

                {!gameState.isGameOver && gameState.players.length > 0 && gameState.players[gameState.currentTurn]?.name === playerName && !gameState.isRolling && !showBuyModal && (
                  <button
                    onClick={rollDice}
                    className="mt-2 sm:mt-6 md:mt-8 px-4 py-1.5 sm:px-6 sm:py-2 md:px-8 md:py-3 bg-[#141414] text-white rounded-full font-bold hover:scale-105 transition-transform active:scale-95 flex items-center gap-1 sm:gap-2 text-[10px] sm:text-sm md:text-base"
                  >
                    <Dice5 className="w-3 h-3 sm:w-4 sm:h-4 md:w-5 md:h-5" />
                    擲骰子
                  </button>
                )}

                {!gameState.isGameOver && gameState.players.length > 0 && gameState.players[gameState.currentTurn]?.name !== playerName && !gameState.isRolling && !showBuyModal && (
                  <div className="mt-2 sm:mt-6 md:mt-8 flex flex-col items-center gap-1 sm:gap-3">
                    <div className="flex flex-col items-center gap-1 sm:gap-2">
                      <div className="flex items-center gap-1 sm:gap-2 text-[8px] sm:text-xs md:text-sm font-bold text-[#141414] bg-zinc-100 px-2 py-1 sm:px-4 sm:py-2 rounded-full border border-[#141414]/5">
                        <Users className="w-3 h-3 sm:w-4 sm:h-4 animate-pulse" />
                        <span className="truncate max-w-[60px] sm:max-w-[100px]">等待 {gameState.players[gameState.currentTurn]?.name}</span>
                      </div>
                      <div className="hidden sm:block max-w-[150px] sm:max-w-[250px] p-2 sm:p-3 bg-white/80 border border-[#141414]/5 rounded-lg sm:rounded-xl shadow-sm">
                        <p className="text-[8px] sm:text-[11px] font-bold text-[#141414] mb-0.5 sm:mb-1 uppercase tracking-widest opacity-40">最新事件</p>
                        <p className="text-[8px] sm:text-[10px] md:text-xs italic opacity-80 font-serif leading-tight sm:leading-relaxed">
                          {gameState.logs[gameState.logs.length - 1]}
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}

            {gameState.isGameOver && (
              <div className="mt-2 sm:mt-8">
                <h2 className="text-lg sm:text-xl md:text-2xl font-serif italic font-bold mb-1 sm:mb-2">遊戲結束</h2>
                <button
                  onClick={() => window.location.reload()}
                  className="px-3 py-1 sm:px-6 sm:py-2 text-[10px] sm:text-sm md:text-base border border-[#141414] rounded-full hover:bg-[#141414] hover:text-white transition-colors"
                >
                  重新開始
                </button>
              </div>
            )}
          </div>
        </motion.div>

        {/* Sidebar: Logs & Status */}
        <div className="w-full xl:w-[450px] flex flex-col gap-10 shrink-0">
          {/* Current Turn Info */}
          <div className="p-6 bg-white border border-[#141414] shadow-[4px_4px_0px_0px_rgba(20,20,20,1)]">
            <h3 className="text-xs font-mono uppercase opacity-50 mb-4 flex items-center gap-2">
              <User className="w-3 h-3" />
              當前回合
            </h3>
            <div className="flex items-center gap-4">
              {gameState.players[gameState.currentTurn] ? (
                <>
                  <div 
                    className="w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-xl"
                    style={{ backgroundColor: gameState.players[gameState.currentTurn].color }}
                  >
                    {gameState.currentTurn + 1}
                  </div>
                  <div>
                    <p className="font-bold text-lg">{gameState.players[gameState.currentTurn].name}</p>
                    <p className="text-xs opacity-60">
                      {gameState.players[gameState.currentTurn].status === PlayerStatus.Normal ? '正常行動中' : '休息中'}
                    </p>
                  </div>
                </>
              ) : (
                <div className="text-xs opacity-40 italic">等待玩家中...</div>
              )}
            </div>
          </div>

          {/* Game Logs */}
          <div className="flex-1 flex flex-col bg-white border border-[#141414] shadow-[4px_4px_0px_0px_rgba(20,20,20,1)] overflow-hidden">
            <div className="p-4 border-bottom border-[#141414]/10 bg-zinc-50 flex justify-between items-center">
              <h3 className="text-xs font-mono uppercase opacity-50 flex items-center gap-2">
                <History className="w-3 h-3" />
                遊戲紀錄
              </h3>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-2 max-h-[400px]">
              {gameState.logs.map((log, i) => (
                <div key={i} className="text-xs leading-relaxed border-l-2 border-[#141414]/10 pl-3 py-1">
                  {log}
                </div>
              ))}
              <div ref={logEndRef} />
            </div>
          </div>
        </div>
      </main>

      {/* Modals */}
      <AnimatePresence>
        {showBuyModal && (
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white border-2 border-[#141414] shadow-[12px_12px_0px_0px_rgba(20,20,20,1)] p-8 max-w-md w-full"
            >
              <div className="flex items-center gap-3 mb-6">
                <div className="p-3 bg-emerald-100 rounded-xl">
                  {showBuyModal.type === 'buy' ? <TrendingUp className="w-6 h-6 text-emerald-600" /> : <Home className="w-6 h-6 text-emerald-600" />}
                </div>
                <h2 className="text-2xl font-serif italic font-bold">
                  {showBuyModal.type === 'buy' ? '購買地標' : '升級地標'}
                </h2>
              </div>
              
              <p className="text-lg mb-8">
                是否花費 <span className="font-mono font-bold text-emerald-600">${gameState.tiles[showBuyModal.tileId].price}</span> {showBuyModal.type === 'buy' ? '購買' : '升級'} {gameState.tiles[showBuyModal.tileId].name}？
              </p>

              <div className="grid grid-cols-2 gap-4">
                <button
                  onClick={() => handleBuyDecision(false)}
                  className="py-3 border border-[#141414] rounded-full font-bold hover:bg-zinc-100 transition-colors"
                >
                  放棄
                </button>
                <button
                  onClick={() => handleBuyDecision(true)}
                  disabled={(gameState.players.find(p => p.name === playerName)?.money || 0) < gameState.tiles[showBuyModal.tileId].price}
                  className="py-3 bg-[#141414] text-white rounded-full font-bold hover:scale-105 transition-transform disabled:opacity-50 disabled:hover:scale-100"
                >
                  確認
                </button>
              </div>
              {(gameState.players.find(p => p.name === playerName)?.money || 0) < gameState.tiles[showBuyModal.tileId].price && (
                <p className="text-center text-xs text-red-500 mt-4 font-mono">餘額不足</p>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Footer Stats */}
      <footer className="w-full max-w-6xl mt-12 grid grid-cols-2 md:grid-cols-4 gap-4">
        {gameState.players.map(player => (
          <div key={player.id} className="p-4 bg-white border border-[#141414]/10 rounded-xl flex items-center gap-4">
            <div className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold" style={{ backgroundColor: player.color }}>
              {player.id + 1}
            </div>
            <div>
              <p className="text-[10px] font-mono uppercase opacity-40 leading-none mb-1">{player.name}</p>
              <p className="font-bold text-sm">${player.money.toLocaleString()}</p>
              <div className="flex gap-1 mt-1">
                {gameState.tiles.filter(t => t.ownerId === player.id).map(t => (
                  <div key={t.id} className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: player.color }} />
                ))}
              </div>
            </div>
          </div>
        ))}
      </footer>
    </div>
  );
}
