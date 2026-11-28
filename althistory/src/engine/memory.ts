import type { World } from '../data/world';
import type { GameState, TurnRecord } from './state';
import { fmtDate } from './state';

const LEDGER_MAX = 30;
/**
 * 엔진이 확인한 사실만 한 줄씩 기록부(LEDGER)에 적는다: 전쟁 개시·종결, 영토 증감, 크게 달라진 관계, 소요·반란, 목표.
 * AI가 쓰는 memory 와 달리 모델 품질에 영향받지 않아서, 작은 모델도 앞뒤가 맞는 서술을 하는 기준이 된다.
 */
export function ledgerTurn(s: GameState, w: World, rec: TurnRecord, ai: { warKeys: string[]; peaceKeys: string[]; news: string[] }, extra: string[]): void {
  const r = rec.report, date = fmtDate(rec.date), L = (c: string) => w.label(c);
  const pair = (k: string) => k.split('|').map(L).join('–');
  const t = (s.tally ??= { wars: 0, gained: 0, lost: 0, unrest: 0 });
  const add: string[] = [];
  for (const k of r?.warsStart ?? []) { t.wars++; add.push(`전쟁 개시: ${pair(k)}`); }
  for (const k of ai.warKeys) add.push(`전쟁 개시: ${pair(k)}`);
  for (const k of [...(r?.warsEnd ?? []), ...ai.peaceKeys]) add.push(`종전·휴전: ${pair(k)}`);
  if (r?.gained.length) { t.gained += r.gained.length; add.push(`영토 확보 ${r.gained.length}주(${w.provLabel(r.gained[0])} 등), 누계 ${t.gained}주`); }
  if (r?.lost.length) { t.lost += r.lost.length; add.push(`영토 상실 ${r.lost.length}주(${w.provLabel(r.lost[0])} 등), 누계 ${t.lost}주`); }
  for (const x of r?.rel ?? []) if (Math.abs(x.to - x.from) >= 25) add.push(`${L(x.c)}와의 관계 ${x.from}→${x.to}`);
  for (const n of ai.news) if (/반란|폭동/.test(n)) { t.unrest++; add.push(n.replace(/^💥\s*/, '')); }
  add.push(...extra);
  const led = s.ledger ??= [];
  for (const a of add) { const line = `${date} ${a}`; if (led.at(-1) !== line) led.push(line); }
  if (led.length > LEDGER_MAX) led.splice(0, led.length - LEDGER_MAX);
}
