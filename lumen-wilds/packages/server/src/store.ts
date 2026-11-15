import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

export interface PlayerSave {
  name: string; x: number; y: number; level: number; xp: number; weapon: number; armor: number; inv: number[];
}

/**
 * 영속 계층 인터페이스. 게임 로직은 이것만 알기 때문에,
 * 규모가 커지면 파일 구현을 데이터베이스 구현으로 갈아 끼울 수 있다.
 */
export interface Store {
  load(token: string): PlayerSave | undefined;
  save(token: string, data: PlayerSave): void;
  flush(): void;
}

export class MemoryStore implements Store {
  protected data = new Map<string, PlayerSave>();
  load(token: string) { return this.data.get(token); }
  save(token: string, data: PlayerSave) { this.data.set(token, data); }
  flush() {}
}

/** 단일 JSON 파일 저장소. 임시 파일에 쓴 뒤 이름을 바꿔, 쓰는 도중 죽어도 파일이 깨지지 않게 한다. */
export class FileStore extends MemoryStore {
  private dirty = false;
  constructor(private path: string) {
    super();
    try {
      const raw = JSON.parse(readFileSync(path, 'utf8')) as Record<string, PlayerSave>;
      for (const [k, v] of Object.entries(raw)) this.data.set(k, v);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e; // 파일이 깨졌다면 덮어쓰지 말고 멈춘다
    }
  }
  override save(token: string, data: PlayerSave) { super.save(token, data); this.dirty = true; }
  override flush() {
    if (!this.dirty) return;
    mkdirSync(dirname(this.path), { recursive: true });
    const tmp = `${this.path}.tmp`;
    writeFileSync(tmp, JSON.stringify(Object.fromEntries(this.data)));
    renameSync(tmp, this.path);
    this.dirty = false;
  }
}
