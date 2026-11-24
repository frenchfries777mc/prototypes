import './style.css';
import { startApp } from './game/Game';
import type { CountryMeta, Scenario, WorldData } from './data/types';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';

const status = document.getElementById('status')!;
const onStatus = (msg: string, isError = false) => { status.textContent = msg; status.classList.toggle('err', isError); };
const base = import.meta.env.BASE_URL;
const get = <T>(f: string): Promise<T> => fetch(`${base}data/${f}`).then((r) => { if (!r.ok) throw new Error(`${f} ${r.status}`); return r.json() as Promise<T>; });

Promise.all([get<WorldData['topo']>('world.topo.json'), get<CountryMeta[]>('countries.json'), get<number[][]>('reach.json'), get<Scenario>('scenario.json')])
  .then(([topo, countries, reach, scenario]) => startApp({ workerUrl, data: { topo, countries, reach, scenario }, onStatus }))
  .catch((err: unknown) => { console.error(err); onStatus(`불러오기 실패: ${err instanceof Error ? err.message : String(err)}`, true); });
