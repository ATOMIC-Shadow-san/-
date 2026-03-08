import { Tile, TileType } from './types';

export const BOARD_SIZE = 36;
export const INITIAL_MONEY = 50000;
export const START_BONUS = 3000;

export const PLAYER_COLORS = [
  '#ef4444', // Red
  '#3b82f6', // Blue
  '#10b981', // Green
  '#f59e0b', // Amber
];

export const PLAYER_NAMES = ['玩家 1', '機器人 A', '機器人 B', '機器人 C'];

export const createInitialTiles = (): Tile[] => {
  const landmarks = [
    "起點", "二中校門", "二中操場", "機會", "二中圖書館", "二中教官室", "命運", "二中體育館", "二中福利社", "天使",
    "二中音樂館", "二中藝教大樓", "機會", "二中至善樓", "二中明德樓", "命運", "二中弘道樓", "二中萃英樓", "監獄",
    "臺中火車站", "臺中公園", "機會", "一中街商圈", "中友百貨", "命運", "勤美誠品", "草悟道", "惡魔",
    "逢甲夜市", "秋紅谷", "機會", "國家歌劇院", "高美濕地", "命運", "科博館", "新光&遠百"
  ];

  const tiles: Tile[] = [];
  for (let i = 0; i < BOARD_SIZE; i++) {
    let type = TileType.Property;
    let name = landmarks[i] || `房產 ${i}`;
    let price = 0;

    if (i === 0) {
      type = TileType.Start;
    } else if (i === 3 || i === 12 || i === 21 || i === 30) {
      type = TileType.Chance;
    } else if (i === 6 || i === 15 || i === 24 || i === 33) {
      type = TileType.Fate;
    } else if (i === 9) {
      type = TileType.Angel;
    } else if (i === 18) {
      type = TileType.Jail;
    } else if (i === 27) {
      type = TileType.Devil;
    } else {
      price = 500 * (Math.floor(i / 3) + 1);
    }

    tiles.push({
      id: i,
      name,
      type,
      ownerId: null,
      price,
    });
  }
  return tiles;
};
