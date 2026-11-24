/** 공유 템플릿: GitHub 저장소의 폴더를 "갤러리"로 쓴다. 읽기는 공개 raw URL, 올리기는 사용자의 토큰으로 GitHub API를 쓴다. */
export interface ShareConfig { owner: string; repo: string; branch: string; dir: string }
export interface IndexEntry { id: string; name: string; author?: string; description?: string; era?: string; year?: string; file: string; updated?: string }

export const DEFAULT_SHARE: ShareConfig = { owner: 'frenchfries777mc', repo: 'prototypes', branch: 'main', dir: 'althistory/shared-templates' };
export class ShareError extends Error {}

const SAFE = /^[A-Za-z0-9_.-]+$/;
const SAFE_DIR = /^[A-Za-z0-9_./-]+$/;
export function checkConfig(c: ShareConfig): void {
  if (!SAFE.test(c.owner) || !SAFE.test(c.repo) || !SAFE_DIR.test(c.branch) || !SAFE_DIR.test(c.dir) || c.dir.includes('..')) throw new ShareError('공유 저장소 설정(소유자/저장소/브랜치/폴더)에 허용되지 않는 문자가 있습니다.');
}
const rawUrl = (c: ShareConfig, file: string) => `https://raw.githubusercontent.com/${c.owner}/${c.repo}/${c.branch}/${c.dir}/${file}`;
const apiUrl = (c: ShareConfig, file: string) => `https://api.github.com/repos/${c.owner}/${c.repo}/contents/${c.dir}/${file}`;

export async function fetchIndex(c: ShareConfig): Promise<IndexEntry[]> {
  checkConfig(c);
  const res = await fetch(rawUrl(c, 'index.json'), { cache: 'no-store' }).catch(() => { throw new ShareError('공유 갤러리에 연결하지 못했습니다(인터넷 확인).'); });
  if (res.status === 404) return [];
  if (!res.ok) throw new ShareError(`공유 갤러리를 불러오지 못했습니다 (HTTP ${res.status}).`);
  const j = (await res.json()) as unknown;
  if (!Array.isArray(j)) throw new ShareError('갤러리 index.json 형식이 올바르지 않습니다.');
  return j.filter((e): e is IndexEntry => !!e && typeof e === 'object' && typeof (e as IndexEntry).file === 'string' && SAFE.test((e as IndexEntry).file)).slice(0, 200);
}
export async function fetchTemplateFile(c: ShareConfig, file: string): Promise<unknown> {
  checkConfig(c);
  if (!SAFE.test(file)) throw new ShareError('허용되지 않는 파일 이름입니다.');
  const res = await fetch(rawUrl(c, file), { cache: 'no-store' }).catch(() => { throw new ShareError('템플릿을 내려받지 못했습니다.'); });
  if (!res.ok) throw new ShareError(`템플릿을 내려받지 못했습니다 (HTTP ${res.status}).`);
  const text = await res.text();
  if (text.length > 700_000) throw new ShareError('템플릿이 너무 큽니다.');
  return JSON.parse(text) as unknown;
}

const b64 = (s: string): string => { const bytes = new TextEncoder().encode(s); let bin = ''; for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000)); return btoa(bin); };
const unb64 = (s: string): string => { const bin = atob(s.replace(/\s/g, '')); return new TextDecoder().decode(Uint8Array.from(bin, (ch) => ch.charCodeAt(0))); };

async function gh(token: string, url: string, init: RequestInit = {}): Promise<Response> {
  return fetch(url, { ...init, headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) } })
    .catch(() => { throw new ShareError('GitHub에 연결하지 못했습니다(인터넷 확인).'); });
}
function explain(res: Response, what: string): ShareError {
  if (res.status === 401) return new ShareError('토큰이 올바르지 않거나 만료되었습니다(401).');
  if (res.status === 403) return new ShareError('이 저장소에 쓸 권한이 없거나 요청이 제한되었습니다(403). 토큰에 "contents: write" 권한이 필요합니다.');
  if (res.status === 404) return new ShareError(`${what}을(를) 찾을 수 없습니다(404). 소유자/저장소/브랜치 이름과 토큰의 저장소 접근 권한을 확인하세요.`);
  if (res.status === 409 || res.status === 422) return new ShareError(`저장소가 그 사이에 바뀌었거나 요청이 거부되었습니다(${res.status}). 다시 시도하세요.`);
  return new ShareError(`${what} 실패 (HTTP ${res.status}).`);
}

/** 템플릿 파일과 index.json 을 갱신한다. 토큰은 이 요청에만 쓰고 저장하지 않는다. */
export async function uploadTemplate(c: ShareConfig, token: string, meta: IndexEntry, json: string): Promise<string> {
  checkConfig(c);
  if (!token.trim()) throw new ShareError('GitHub 토큰을 입력하세요.');
  const file = meta.file;
  if (!SAFE.test(file)) throw new ShareError('허용되지 않는 파일 이름입니다.');
  // 1) 템플릿 파일
  let sha: string | undefined;
  const cur = await gh(token, `${apiUrl(c, file)}?ref=${encodeURIComponent(c.branch)}`);
  if (cur.ok) sha = ((await cur.json()) as { sha?: string }).sha; else if (cur.status !== 404) throw explain(cur, '파일 확인');
  const put = await gh(token, apiUrl(c, file), { method: 'PUT', body: JSON.stringify({ message: `shared template: ${meta.name}`, content: b64(json), branch: c.branch, ...(sha ? { sha } : {}) }) });
  if (!put.ok) throw explain(put, '템플릿 업로드');
  const htmlUrl = ((await put.json()) as { content?: { html_url?: string } }).content?.html_url ?? '';
  // 2) index.json
  let list: IndexEntry[] = []; let isha: string | undefined;
  const idx = await gh(token, `${apiUrl(c, 'index.json')}?ref=${encodeURIComponent(c.branch)}`);
  if (idx.ok) { const j = (await idx.json()) as { sha?: string; content?: string }; isha = j.sha; try { const p = JSON.parse(unb64(j.content ?? '')); if (Array.isArray(p)) list = p as IndexEntry[]; } catch { /* 새로 만든다 */ } }
  else if (idx.status !== 404) throw explain(idx, '목록 확인');
  list = [{ ...meta, updated: new Date().toISOString().slice(0, 10) }, ...list.filter((e) => e.file !== file)].slice(0, 200);
  const put2 = await gh(token, apiUrl(c, 'index.json'), { method: 'PUT', body: JSON.stringify({ message: `index: ${meta.name}`, content: b64(JSON.stringify(list, null, 1)), branch: c.branch, ...(isha ? { sha: isha } : {}) }) });
  if (!put2.ok) throw explain(put2, '목록 갱신');
  return htmlUrl;
}
