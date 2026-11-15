import { MAX_TIER } from './constants';
import { Biome } from './world';

export const EntityKind = { Player: 1, Slime: 2, Boar: 3, Golem: 4 } as const;

export const Item = { Wood: 0, Stone: 1, Gel: 2, Hide: 3, Core: 4 } as const;
export const ITEM_COUNT = 5;
export const ITEM_NAMES = ['나무', '돌', '젤', '가죽', '핵'] as const;

export interface MobDef {
  kind: number;
  name: string;
  hp: number;
  speed: number;
  damage: number;
  aggro: number;
  xp: number;
  radius: number;
  cooldownTicks: number;
  /** [아이템, 최소, 최대] */
  drops: ReadonlyArray<readonly [number, number, number]>;
}

export const MOBS: Record<number, MobDef> = {
  [EntityKind.Slime]: { kind: EntityKind.Slime, name: '슬라임', hp: 20, speed: 1.8, damage: 4, aggro: 6, xp: 8, radius: 0.35, cooldownTicks: 24, drops: [[Item.Gel, 1, 2]] },
  [EntityKind.Boar]: { kind: EntityKind.Boar, name: '가시멧돼지', hp: 36, speed: 3.1, damage: 7, aggro: 7, xp: 16, radius: 0.4, cooldownTicks: 22, drops: [[Item.Hide, 1, 2]] },
  [EntityKind.Golem]: { kind: EntityKind.Golem, name: '바위 골렘', hp: 90, speed: 1.5, damage: 14, aggro: 5, xp: 45, radius: 0.55, cooldownTicks: 32, drops: [[Item.Stone, 2, 4], [Item.Core, 1, 1]] },
};

/** 시작 지점에서 이 거리 안쪽은 초보 구역이다. 약한 몬스터 위주로 나온다. */
export const STARTER_RADIUS = 70;

/** 바이옴, [0,1) 난수, 시작 지점까지의 거리로 그 자리에 태어날 몬스터 종류를 정한다. 0이면 없음. */
export function mobForBiome(biome: number, r: number, dist: number): number {
  const starter = dist < STARTER_RADIUS;
  switch (biome) {
    case Biome.Sand: return EntityKind.Slime;
    case Biome.Grass: return r < (starter ? 1 : 0.75) ? EntityKind.Slime : EntityKind.Boar;
    case Biome.Forest: return r < (starter ? 0.3 : 0.65) ? EntityKind.Boar : EntityKind.Slime;
    case Biome.Rock: case Biome.Snow: return EntityKind.Golem;
    default: return 0;
  }
}

export const Recipe = { Weapon: 0, Armor: 1, Potion: 2 } as const;
export const POTION_HEAL = 30;

/** 제작 비용. 불가능한 제작이면 null. 서버가 검증하고 클라이언트는 표시에만 쓴다. */
export function recipeCost(recipe: number, weapon: number, armor: number): number[] | null {
  const cost = new Array<number>(ITEM_COUNT).fill(0);
  if (recipe === Recipe.Weapon) {
    if (weapon >= MAX_TIER) return null;
    const n = weapon + 1;
    cost[Item.Wood] = 5 * n; cost[Item.Stone] = 3 * n; cost[Item.Gel] = 2 * n;
    if (n >= 3) cost[Item.Core] = n - 2;
  } else if (recipe === Recipe.Armor) {
    if (armor >= MAX_TIER) return null;
    const n = armor + 1;
    cost[Item.Hide] = 3 * n; cost[Item.Stone] = 4 * n; cost[Item.Wood] = 2 * n;
    if (n >= 3) cost[Item.Core] = n - 2;
  } else if (recipe === Recipe.Potion) {
    cost[Item.Gel] = 2;
  } else return null;
  return cost;
}

export const xpForLevel = (level: number) => Math.round(20 * Math.pow(level, 1.5));
export const maxHpForLevel = (level: number) => 50 + 10 * (level - 1);
export const playerDamage = (weapon: number, level: number) => 5 + weapon * 3 + Math.floor(level / 3);
export const nodeHits = (type: number) => (type === 1 ? 3 : 5);
