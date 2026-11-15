/** 서버·클라이언트가 반드시 같은 값을 써야 하는 시뮬레이션 상수. */
export const TICK_RATE = 20;
export const DT = 1 / TICK_RATE;
/** 서버가 스냅샷을 보내는 주기(틱 단위). 20Hz 시뮬레이션, 10Hz 전송. */
export const SNAPSHOT_EVERY = 2;

export const CHUNK = 16;
/** 타일 좌표 한계. 이 밖은 전부 바다로 취급한다. */
export const WORLD_LIMIT = 30000;
/** 높이 1단계의 월드 단위 크기. */
export const HEIGHT_UNIT = 0.5;

export const PLAYER_SPEED = 4.5;
export const BODY_RADIUS = 0.3;

/** 관심 영역: 들어올 때와 나갈 때 반경을 달리해 경계에서의 깜빡임을 막는다. */
export const AOI_ENTER = 26;
export const AOI_LEAVE = 30;
/** 플레이어 주변으로 자원 노드 상태를 동기화하는 청크 반경. */
export const NODE_SYNC_RADIUS = 3;

export const ATTACK_RANGE = 1.7;
export const ATTACK_ARC = Math.PI / 3;
export const ATTACK_COOLDOWN_TICKS = 8;

export const SAFE_ZONE = 10;
export const MAX_NAME = 16;
export const MAX_CHAT = 120;
export const MAX_TIER = 5;

export const DIR_NONE = 255;
const S = Math.SQRT1_2;
/** 8방향 단위 벡터. 삼각함수 오차 없이 양쪽이 동일한 값을 쓰도록 표로 둔다. */
export const DIRS: ReadonlyArray<readonly [number, number]> = [
  [1, 0], [S, S], [0, 1], [-S, S], [-1, 0], [-S, -S], [0, -1], [S, -S],
];
