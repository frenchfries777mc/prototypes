import './style.css';
import { createWorldMap } from './map/WorldMap';

const status = document.getElementById('status')!;

createWorldMap({
  container: 'map',
  base: import.meta.env.BASE_URL,
  onStatus: (msg, isError = false) => {
    status.textContent = msg;
    status.classList.toggle('err', isError);
  },
}).catch((err: unknown) => {
  console.error(err);
  status.textContent = `불러오기 실패: ${err instanceof Error ? err.message : String(err)}`;
  status.classList.add('err');
});
