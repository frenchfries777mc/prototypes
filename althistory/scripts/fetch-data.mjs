// Natural Earth 원본(퍼블릭 도메인)을 data/raw 로 내려받는다. 용량이 커서 git 에는 넣지 않는다.
// 사용: npm run fetch:data
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RAW = path.join(ROOT, 'data/raw');
fs.mkdirSync(RAW, { recursive: true });
const BASE = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson';
const FILES = { 'admin0.geojson': 'ne_10m_admin_0_countries.geojson', 'admin1.geojson': 'ne_10m_admin_1_states_provinces.geojson' };

for (const [local, remote] of Object.entries(FILES)) {
  const dest = path.join(RAW, local);
  if (fs.existsSync(dest) && !process.argv.includes('--force')) { console.log(`있음, 건너뜀: ${local}`); continue; }
  process.stdout.write(`내려받는 중: ${remote} … `);
  const res = await fetch(`${BASE}/${remote}`);
  if (!res.ok) throw new Error(`${remote}: HTTP ${res.status}`);
  fs.writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
  console.log(`${(fs.statSync(dest).size / 1e6).toFixed(1)} MB`);
}
