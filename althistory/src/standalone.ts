// 단독 HTML 빌드용 진입점: 데이터와 MapLibre 워커를 파일 안에 넣어 file:// 로도 열린다.
import './style.css';
import { startApp } from './game/Game';
import type { CountryMeta, Scenario } from './data/types';
import workerSource from 'maplibre-gl/dist/maplibre-gl-worker.mjs?raw';
import topo from '../public/data/world.topo.json';
import countries from '../public/data/countries.json';
import reach from '../public/data/reach.json';
import scenarios from '../public/data/scenarios.json';

const status = document.getElementById('status')!;
const intro = document.getElementById('intro-msg')!;
const onStatus = (msg: string, isError = false) => {
  status.textContent = msg; status.classList.toggle('err', isError);
  if (isError) { intro.textContent = msg; intro.classList.add('err'); }
};
const workerUrl = URL.createObjectURL(new Blob([workerSource], { type: 'text/javascript' }));

startApp({ workerUrl, data: { topo, countries: countries as CountryMeta[], reach: reach as number[][], scenarios: scenarios as unknown as Scenario[] }, onStatus })
  .catch((err: unknown) => { console.error(err); onStatus(`불러오기 실패: ${err instanceof Error ? err.message : String(err)}`, true); });
