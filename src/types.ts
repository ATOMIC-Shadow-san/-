export enum PlayerStatus {
  Normal = 0,
  Jail = 1,
  NoJob = 2,
  RetakeClass = 3,
  Bankrupt = -1,
}

export interface Player {
  id: number;
  name: string;
  money: number;
  position: number;
  status: PlayerStatus;
  color: string;
  isBot: boolean;
}

export enum TileType {
  Start = 'START',
  Chance = 'CHANCE',
  Fate = 'FATE',
  Angel = 'ANGEL',
  Devil = 'DEVIL',
  Jail = 'JAIL',
  Property = 'PROPERTY',
}

export interface Tile {
  id: number;
  name: string;
  type: TileType;
  ownerId: number | null; // null if none, 0-3 for players
  price: number;
}

export interface GameState {
  roomId?: string;
  players: Player[];
  tiles: Tile[];
  currentTurn: number;
  logs: string[];
  isGameOver: boolean;
  isStarted: boolean;
  diceResult: number | null;
  isRolling: boolean;
}
