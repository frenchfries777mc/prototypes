import type { World } from '../data/world';
import type { Adjudication } from '../engine/diff';
import { normalizeAdjudication } from '../engine/diff';
import type { GameState } from '../engine/state';
import { EXAMPLE, PROMPT_LEVELS, fitPrompt } from './prompt';
import { profileFor } from './profile';
import { localAdjudicate } from './local';

import Anthropic from '@anthropic-ai/sdk';
import type { Difficulty } from '../engine/difficulty';

/** 'local' 은 화면에서 고르는 선택지가 아니다: AI 키가 없을 때 엔진이 쓰는 간이 판정이다. */
export type ProviderId = 'local' | 'free' | 'gemini' | 'claude' | 'openai' | 'webllm';
export interface LlmConfig { provider: ProviderId; geminiKey: string; geminiModel: string; claudeKey: string; claudeModel: string; openaiKey: string; openaiModel: string; webllmModel: string;
  /** 무료 AI 카드: 고른 서비스, 서비스별 키·모델, 직접 입력한 주소 */
  freePreset: string; freeKeys: Record<string, string>; freeModels: Record<string, string>; freeBase: string;
  /** 난이도(게임에도 저장된다) */
  difficulty: Difficulty }

/** OpenAI 호환 API(채팅 완성)를 쓰는 무료 서비스들. 브라우저에서 직접 호출할 수 있는(CORS 허용) 곳만 넣었다. */
export interface FreePreset { id: string; name: string; base: string; needKey: boolean; keyUrl: string; defaultModel: string; note: string; /** 키 없이 쓸 때 요청 사이에 둘 최소 간격(ms) */ freeIntervalMs?: number; /** 키 없이 쓸 때 요청 전체(시스템+사용자 글자 수) 한도 */ maxPromptChars?: number }
export const FREE_PRESETS: FreePreset[] = [
  { id: 'pollinations', name: 'Pollinations (키 없이)', base: 'https://text.pollinations.ai/openai', needKey: false, keyUrl: 'https://enter.pollinations.ai', defaultModel: 'openai-fast', freeIntervalMs: 45000, maxPromptChars: 14500,
    note: '가입도 키도 필요 없지만 키 없이는 IP당 45초에 한 번만 답하고 요청 길이가 16,000자까지입니다(게임이 알아서 간격을 두고 내용을 줄입니다). 명령 내용이 Pollinations 서버로 전송됩니다. Pollinations 키가 있으면 아래에 넣으세요(제한이 풀린다고 안내되는데, 이 게임에서 직접 확인하지는 못했습니다).' },
  { id: 'groq', name: 'Groq (무료 키)', base: 'https://api.groq.com/openai/v1', needKey: true, keyUrl: 'https://console.groq.com/keys', defaultModel: 'llama-3.3-70b-versatile',
    note: '아주 빠릅니다. 무료 키에는 분당·하루 사용 한도가 있습니다(한도는 Groq 정책).' },
  { id: 'openrouter', name: 'OpenRouter (무료 모델)', base: 'https://openrouter.ai/api/v1', needKey: true, keyUrl: 'https://openrouter.ai/keys', defaultModel: '',
    note: '이름이 ":free"로 끝나는 모델만 무료입니다. "모델 불러오기"를 누르면 지금 무료인 모델 목록이 나옵니다. 하루 사용 한도가 있습니다.' },
  { id: 'cerebras', name: 'Cerebras (무료 키)', base: 'https://api.cerebras.ai/v1', needKey: true, keyUrl: 'https://cloud.cerebras.ai/', defaultModel: 'llama3.1-8b',
    note: '무료 키로 쓸 수 있는 모델과 한도는 Cerebras 정책을 따릅니다. "모델 불러오기"로 확인하세요.' },
  { id: 'mistral', name: 'Mistral (무료 키)', base: 'https://api.mistral.ai/v1', needKey: true, keyUrl: 'https://console.mistral.ai/api-keys', defaultModel: 'mistral-small-latest',
    note: '무료 요금제의 한도는 Mistral 정책을 따릅니다.' },
  { id: 'custom', name: '직접 입력 (OpenAI 호환 주소)', base: '', needKey: false, keyUrl: '', defaultModel: '',
    note: 'OpenAI 호환 채팅 API 주소(예: https://…/v1)를 넣으세요. 브라우저에서 호출할 수 있게 CORS를 허용하는 서버여야 합니다. 내 컴퓨터의 Ollama나 LM Studio도 됩니다.' },
];
export const freePreset = (id: string): FreePreset => FREE_PRESETS.find((x) => x.id === id) ?? FREE_PRESETS[0];
export const DEFAULT_OPENAI_MODEL = 'gpt-5-mini';
export const DEFAULT_CLAUDE_MODEL = 'claude-opus-5-5';
/** 고른 AI에 키가 없으면 간이 판정으로 대신한다. */
export function effectiveProvider(cfg: LlmConfig): ProviderId {
  if (cfg.provider === 'gemini' && !cfg.geminiKey.trim()) return 'local';
  if (cfg.provider === 'claude' && !cfg.claudeKey.trim()) return 'local';
  if (cfg.provider === 'openai' && !(cfg.openaiKey ?? '').trim()) return 'local';
  if (cfg.provider === 'free') { const ep = freeEndpoint(cfg); if (!ep.base || (ep.needKey && !ep.key)) return 'local'; }
  return cfg.provider;
}
export const providerLabel = (cfg: LlmConfig): string => {
  const p = effectiveProvider(cfg);
  return p === 'gemini' ? 'Gemini' : p === 'claude' ? 'Claude' : p === 'openai' ? 'ChatGPT' : p === 'free' ? freePreset(cfg.freePreset).name.replace(/ \(.*\)$/, '') : p === 'webllm' ? 'Qwen (브라우저)' : '간이 판정 (AI 키 없음)';
};
export interface Hooks { onProgress?: (msg: string) => void }

/** busy: 서버가 붐벼서 잠깐 기다리면 될 수 있는 오류(429, 503 …). 키 오류 같은 것과 구분해 자동 재시도·대체에 쓴다. */
export class LlmError extends Error { busy = false; retryAfterMs = 0; /** 입력이 너무 길어 거절됨(413 등): 프롬프트를 줄여 다시 보내면 된다 */ tooLong = false; }
const busyError = (msg: string, retryAfterMs = 0): LlmError => { const e = new LlmError(msg); e.busy = true; e.retryAfterMs = retryAfterMs; return e; };
const MAX_WAIT_MS = 60_000;
const retryAfterOf = (res: Response): number => { const v = Number(res.headers.get('retry-after')); return Number.isFinite(v) && v > 0 ? Math.min(v * 1000, MAX_WAIT_MS) : 0; };
/** 오류 문구에서 "Retry after 14s"·"try again in 2 minutes" 같은 대기 시간을 읽는다. */
const retryFromText = (t: string): number => {
  const m = /(?:retry|try again)[^0-9]{0,12}(\d+(?:\.\d+)?)\s*(ms|milliseconds?|s\b|sec\w*|m\b|min\w*)/i.exec(t);
  if (!m) return 0;
  const n = Number(m[1]), u = m[2].toLowerCase();
  return Math.min(Math.round(u.startsWith('ms') || u.startsWith('milli') ? n : u.startsWith('m') ? n * 60_000 : n * 1000), MAX_WAIT_MS);
};
/** "한도에 걸렸으니 잠깐 뒤 다시"라는 뜻의 문구(크레딧·결제 문제와 구분한다). */
const RATE_TEXT = /free limit|rate.?limit|reply every|every \d+ ?(?:sec|min|s\b)|retry after|too many requests|slow down|try again (?:in|later)/i;

type Msg = { role: 'user' | 'assistant'; text: string };

/** 모델 출력에서 JSON 객체를 꺼낸다(코드펜스, 앞뒤 잡담, 끝 쉼표를 너그럽게 처리). */
export function extractJson(text: string): unknown {
  let t = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '');
  const a = t.indexOf('{'), b = t.lastIndexOf('}');
  if (a < 0 || b <= a) throw new Error('JSON 객체를 찾지 못했습니다');
  t = t.slice(a, b + 1);
  try { return JSON.parse(t); } catch { /* 끝 쉼표 제거 후 재시도 */ }
  return JSON.parse(t.replace(/,\s*([}\]])/g, '$1'));
}

/** 지금 보내는 요청의 온도(모델 프로필이 정한다). 요청은 한 번에 하나씩이라 모듈 값으로 둔다. */
let reqTemp = 0.8;
async function callGemini(cfg: LlmConfig, system: string, msgs: Msg[], signal: AbortSignal): Promise<string> {
  const model = cfg.geminiModel.trim() || 'gemini-flash-latest';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST', signal,
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': cfg.geminiKey.trim() },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: msgs.map((m) => ({ role: m.role === 'user' ? 'user' : 'model', parts: [{ text: m.text }] })),
        generationConfig: { temperature: reqTemp, responseMimeType: 'application/json', maxOutputTokens: 8192 },
      }),
    });
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw new LlmError('응답 시간이 너무 길어 중단했습니다(90초). 다시 시도하세요.');
    throw new LlmError(`네트워크 오류: Gemini에 연결하지 못했습니다. (${(e as Error).message})`);
  }
  if (!res.ok) {
    let detail = '';
    try { detail = ((await res.json()) as { error?: { message?: string } }).error?.message ?? ''; } catch { /* 무시 */ }
    if (res.status === 429) throw busyError('Gemini 무료 사용 한도를 초과했습니다. 1분쯤 뒤에 다시 시도하거나 다른 AI로 바꿔 보세요.', retryAfterOf(res));
    if (res.status === 503 || res.status === 500) throw busyError('Gemini 서버가 붐빕니다.', retryAfterOf(res));
    if (res.status === 400 && /api key/i.test(detail)) throw new LlmError('Gemini API 키가 올바르지 않습니다. 메뉴에서 키를 다시 확인하세요.');
    if (res.status === 403) throw new LlmError(`Gemini 접근이 거부되었습니다(403). 키 권한/지역을 확인하세요. ${detail}`);
    if (res.status === 404) throw new LlmError(`모델 "${model}"을(를) 찾을 수 없습니다. 메뉴에서 모델 이름을 바꿔 보세요(예: gemini-flash-latest).`);
    throw new LlmError(`Gemini 오류 ${res.status}: ${detail.slice(0, 200)}`);
  }
  const j = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
    promptFeedback?: { blockReason?: string };
  };
  const text = j.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
  if (!text) throw new LlmError(`Gemini가 빈 응답을 보냈습니다 (${j.promptFeedback?.blockReason ?? j.candidates?.[0]?.finishReason ?? '이유 불명'}). 명령 표현을 바꿔 보세요.`);
  return text;
}

// ---- OpenAI 호환 API (ChatGPT와 무료 서비스들이 같은 방식을 쓴다) ----
interface Endpoint { label: string; base: string; key: string; model: string; needKey: boolean; openai: boolean }
const openaiEndpoint = (cfg: LlmConfig): Endpoint => ({ label: 'OpenAI', base: 'https://api.openai.com/v1', key: (cfg.openaiKey ?? '').trim(), model: (cfg.openaiModel ?? '').trim() || DEFAULT_OPENAI_MODEL, needKey: true, openai: true });
function freeEndpoint(cfg: LlmConfig): Endpoint {
  const pr = freePreset(cfg.freePreset);
  const base = (pr.id === 'custom' ? (cfg.freeBase ?? '') : pr.base).trim().replace(/\/+$/, '');
  return { label: pr.name.replace(/ \(.*\)$/, ''), base, key: (cfg.freeKeys?.[pr.id] ?? '').trim(), model: (cfg.freeModels?.[pr.id] ?? '').trim() || pr.defaultModel, needKey: pr.needKey, openai: false };
}
// 추론 모델(gpt-5 계열, o 계열)은 temperature 를 받지 않고 reasoning_effort 를 받는다. 그 밖의 모델은 반대.
const isReasoningModel = (m: string) => /^(gpt-5|o\d)/.test(m);
async function epFetch(ep: Endpoint, path: string, init: RequestInit): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(`${ep.base}/${path}`, { ...init, headers: { 'Content-Type': 'application/json', ...(ep.key ? { Authorization: `Bearer ${ep.key}` } : {}) } });
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw new LlmError('응답 시간이 너무 길어 중단했습니다(90초). 다시 시도하세요.');
    throw new LlmError(`네트워크 오류: ${ep.label}에 연결하지 못했습니다. 인터넷 연결을 확인하세요. 직접 입력한 주소라면 그 서버가 브라우저 호출(CORS)을 허용하는지도 확인하세요. (${(e as Error).message})`);
  }
  if (!res.ok) {
    let detail = '';
    try { detail = ((await res.json()) as { error?: { message?: string } | string }).error as string ?? ''; if (typeof detail !== 'string') detail = (detail as { message?: string }).message ?? ''; } catch { /* 무시 */ }
    if (res.status === 401 || res.status === 403) throw new LlmError(`${ep.label} API 키가 올바르지 않거나 이 키로는 쓸 수 없습니다(${res.status}). 메뉴에서 키를 확인하세요. ${detail.slice(0, 120)}`);
    const wait = Math.max(retryAfterOf(res), retryFromText(detail));
    const rateLimited = RATE_TEXT.test(detail) || wait > 0;
    // 상태 코드가 402·429 어느 쪽이든 "잠깐 기다리면 된다"는 문구가 있으면 붐빔으로 본다(Pollinations 무료 한도 등)
    if (rateLimited) throw busyError(`${ep.label}: ${detail.slice(0, 140) || '요청이 몰려 잠시 기다려야 합니다'}`, wait);
    if (res.status === 402 || (res.status === 429 && /quota|billing|credit|insufficient/i.test(detail))) throw new LlmError(`${ep.label} 크레딧(사용 한도)이 부족합니다. ${detail.slice(0, 160)}`);
    if (res.status === 429 || res.status === 502 || res.status === 503 || res.status === 504) throw busyError(`${ep.label}가 붐빕니다(${res.status}).`, wait);
    if (res.status === 413 || /prompt too long|too long|context length|max(?:imum)? context|characters max/i.test(detail)) { const e = new LlmError(`입력이 너무 깁니다(${res.status}): ${detail.slice(0, 160)}`); e.tooLong = true; throw e; }
    if (res.status === 404) throw new LlmError(`모델 "${ep.model}"을(를) 쓸 수 없습니다. "모델 불러오기"로 지금 쓸 수 있는 모델 목록을 받아 고르세요.`);
    const e = new LlmError(`${ep.label} 오류 ${res.status}: ${detail.slice(0, 200)}`); (e as LlmError & { status?: number }).status = res.status; throw e;
  }
  return res;
}
async function callEndpoint(ep: Endpoint, system: string, msgs: Msg[], signal: AbortSignal): Promise<string> {
  const model = ep.model;
  if (!model) throw new LlmError(`${ep.label}의 모델이 정해지지 않았습니다. "모델 불러오기"를 눌러 고르세요.`);
  const r = ep.openai && isReasoningModel(model);
  const body = (json: boolean) => JSON.stringify({
    model,
    messages: [{ role: 'system', content: system }, ...msgs.map((m) => ({ role: m.role, content: m.text }))],
    ...(json ? { response_format: { type: 'json_object' } } : {}),
    ...(r ? { reasoning_effort: 'low', max_completion_tokens: 12000 } : ep.openai ? { temperature: reqTemp, max_completion_tokens: 4000 } : { temperature: reqTemp, max_tokens: 6000 }),
  });
  let res: Response;
  try { res = await epFetch(ep, 'chat/completions', { method: 'POST', signal, body: body(true) }); }
  catch (e) {
    // 일부 서버·모델은 response_format 을 모른다: 빼고 한 번 더(JSON 은 프롬프트로 요구하고 응답에서 뽑아 쓴다)
    const st = (e as { status?: number }).status;
    if (!ep.openai && e instanceof LlmError && !e.busy && (st === 400 || st === 422)) res = await epFetch(ep, 'chat/completions', { method: 'POST', signal, body: body(false) });
    else throw e;
  }
  const j = (await res.json()) as { choices?: { message?: { content?: string; refusal?: string }; finish_reason?: string }[] };
  const c = j.choices?.[0];
  if (c?.message?.refusal) throw new LlmError(`${ep.label}가 이 명령을 거절했습니다: ${c.message.refusal.slice(0, 160)}`);
  const text = String(c?.message?.content ?? '').replace(/<think>[\s\S]*?<\/think>/g, '').trim();
  if (!text) throw new LlmError(`${ep.label}가 빈 응답을 보냈습니다 (${c?.finish_reason ?? '이유 불명'}).`);
  return text;
}
const callOpenAi = (cfg: LlmConfig, system: string, msgs: Msg[], signal: AbortSignal) => callEndpoint(openaiEndpoint(cfg), system, msgs, signal);
const callFree = (cfg: LlmConfig, system: string, msgs: Msg[], signal: AbortSignal) => callEndpoint(freeEndpoint(cfg), system, msgs, signal);
async function listModels(ep: Endpoint): Promise<string[]> {
  const ctl = new AbortController(); const timer = setTimeout(() => ctl.abort(), 30_000);
  try {
    const j = (await (await epFetch(ep, 'models', { method: 'GET', signal: ctl.signal })).json()) as { data?: { id?: string; name?: string }[] } | { id?: string; name?: string }[];
    const ids = (Array.isArray(j) ? j : j.data ?? []).map((m) => m.id ?? m.name ?? '').filter(Boolean);
    const chat = ids.filter((id) => !/(audio|realtime|transcribe|tts|whisper|image|embed|moderation|guard|rerank|ocr|vision-preview)/i.test(id));
    return chat.sort((a, b) => b.localeCompare(a, 'en', { numeric: true }));
  } finally { clearTimeout(timer); }
}
/** 이 키로 쓸 수 있는 ChatGPT 채팅 모델 목록(키 확인 겸용). */
export async function listOpenAiModels(cfg: LlmConfig): Promise<string[]> {
  return (await listModels(openaiEndpoint(cfg))).filter((id) => /^(gpt-|o\d|chatgpt-)/.test(id) && !/(search|instruct|codex)/.test(id));
}
/** 무료 서비스의 모델 목록(키 확인 겸용). OpenRouter는 무료(:free) 모델만. */
export async function listFreeModels(cfg: LlmConfig): Promise<string[]> {
  const ep = freeEndpoint(cfg);
  if (!ep.base) throw new LlmError('서비스 주소를 먼저 입력하세요.');
  if (ep.needKey && !ep.key && cfg.freePreset !== 'openrouter') throw new LlmError('키를 먼저 입력하세요.');
  const ids = await listModels(ep);
  return cfg.freePreset === 'openrouter' ? ids.filter((id) => id.endsWith(':free')) : ids;
}

// ---- Claude (Anthropic 공식 SDK, 사용자가 넣은 API 키로 브라우저에서 직접 호출) ----
// 거절(refusal) 시 서버가 다른 모델로 이어서 처리하도록 fallbacks 를 켠다(지원 모델에서만).
const FALLBACK_MODELS = new Set(['claude-opus-5-5', 'claude-opus-5', 'claude-fable-5-2', 'claude-fable-5-1', 'claude-sonnet-5-5']);
async function callClaude(cfg: LlmConfig, system: string, msgs: Msg[], signal: AbortSignal): Promise<string> {
  const model = cfg.claudeModel.trim() || DEFAULT_CLAUDE_MODEL;
  const client = new Anthropic({ apiKey: cfg.claudeKey.trim(), dangerouslyAllowBrowser: true, maxRetries: 1 });
  try {
    const res = await client.beta.messages.create({
      model, max_tokens: 16000, system,
      output_config: { effort: 'medium' },
      ...(FALLBACK_MODELS.has(model) ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const } : {}),
      messages: msgs.map((m) => ({ role: m.role, content: m.text })),
    }, { signal });
    if (res.stop_reason === 'refusal') throw new LlmError(`Claude가 이 명령을 거절했습니다${res.stop_details?.category ? ` (${res.stop_details.category})` : ''}. 표현을 바꿔 보세요.`);
    const text = res.content.map((b) => (b.type === 'text' ? b.text : '')).join('');
    if (!text) throw new LlmError('Claude가 빈 응답을 보냈습니다. 다시 시도하세요.');
    return text;
  } catch (e) {
    if (e instanceof LlmError) throw e;
    if (e instanceof Anthropic.AuthenticationError) throw new LlmError('Claude API 키가 올바르지 않습니다. 메뉴에서 키를 확인하세요.');
    if (e instanceof Anthropic.PermissionDeniedError) throw new LlmError('이 API 키로는 해당 모델을 쓸 수 없습니다(403). 키 권한/결제 상태를 확인하세요.');
    if (e instanceof Anthropic.NotFoundError) throw new LlmError(`모델 "${model}"을(를) 찾을 수 없습니다. 메뉴에서 모델 이름을 확인하세요.`);
    if (e instanceof Anthropic.RateLimitError) throw busyError('Claude 사용 한도에 걸렸습니다. 잠시 뒤 다시 시도하세요.');
    if (e instanceof Anthropic.APIError && (e.status === 529 || e.status === 503)) throw busyError('Claude 서버가 붐빕니다.');
    if (e instanceof Anthropic.APIUserAbortError) throw new LlmError('응답 시간이 너무 길어 중단했습니다(90초). 다시 시도하세요.');
    if (e instanceof Anthropic.APIConnectionError) throw new LlmError('네트워크 오류: Claude API에 연결하지 못했습니다.');
    if (e instanceof Anthropic.APIError) throw new LlmError(`Claude 오류 ${e.status ?? ''}: ${e.message.slice(0, 160)}`);
    throw e;
  }
}

// ---- 브라우저 내 Qwen (WebLLM, 실험적) ----
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let engine: any = null;
let engineModel = '';
async function getEngine(model: string, onProgress?: (m: string) => void) {
  if (engine && engineModel === model) return engine;
  if (!('gpu' in navigator)) throw new LlmError('이 브라우저는 WebGPU를 지원하지 않아 브라우저 Qwen을 쓸 수 없습니다. 최신 Chrome/Edge 데스크톱을 쓰거나 다른 모드를 선택하세요.');
  const url = 'https://esm.run/@mlc-ai/web-llm@0.2.89'; // 메뉴의 모델 목록과 같은 버전으로 고정
  let mod;
  try { mod = await import(/* @vite-ignore */ url); } catch (e) { throw new LlmError(`WebLLM 라이브러리를 불러오지 못했습니다(인터넷 필요): ${(e as Error).message}`); }
  onProgress?.('모델을 내려받는 중… (처음 한 번만, 수백 MB~수 GB)');
  try {
    engine = await mod.CreateMLCEngine(model, { initProgressCallback: (p: { text?: string }) => onProgress?.(p.text ?? '') });
  } catch (e) {
    throw new LlmError(`브라우저 Qwen(WebLLM)을 시작하지 못했습니다. WebGPU를 쓸 수 있는 GPU/브라우저가 필요하고, 모델 ID(${model})도 확인하세요. 원인: ${(e as Error).message.slice(0, 160)}`);
  }
  engineModel = model;
  return engine;
}
async function callWebLlm(cfg: LlmConfig, system: string, msgs: Msg[], hooks: Hooks): Promise<string> {
  const eng = await getEngine(cfg.webllmModel.trim(), hooks.onProgress);
  hooks.onProgress?.('Qwen이 생각하는 중…');
  let out;
  try { out = await eng.chat.completions.create({
    messages: [{ role: 'system', content: system }, ...msgs.map((m) => ({ role: m.role, content: m.text }))],
    temperature: Math.min(0.7, reqTemp), max_tokens: 1800,
    // response_format json_object는 일부 모델에서 "Failed to initialize the grammar matcher" 오류를 내서 쓰지 않는다.
    // JSON은 프롬프트로 요구하고 응답에서 { … } 부분만 뽑아 쓴다. Qwen3 계열은 생각 모드를 꺼서 바로 JSON을 쓰게 한다.
    ...(/^Qwen3/.test(cfg.webllmModel) ? { extra_body: { enable_thinking: false } } : {}),
  }); } catch (e) { throw new LlmError(`Qwen 추론 중 오류: ${(e as Error).message.slice(0, 160)}`); }
  // Qwen3 계열은 <think>…</think>를 앞에 붙일 수 있어 잘라 낸다
  return String(out.choices?.[0]?.message?.content ?? '').replace(/<think>[\s\S]*?<\/think>/g, '').trim();
}

/** 붐빌 때 같은 AI에 다시 시도하기 전에 기다리는 시간(ms). 테스트에서 줄일 수 있다. */
export const retryPolicy = { delaysMs: [3000, 8000], /** 키 없는 무료 서버 요청 사이 간격을 덮어쓴다(테스트용). null이면 서비스별 기본값 */ paceMs: null as number | null };
const lastFreeCall = new Map<string, number>();
const sleep = (ms: number, signal: AbortSignal) => new Promise<void>((res, rej) => {
  const t = setTimeout(res, ms); signal.addEventListener('abort', () => { clearTimeout(t); rej(new LlmError('중단했습니다.')); }, { once: true });
});
const modeOf = (cfg: LlmConfig, p: ProviderId): string => {
  if (p === 'gemini') return `Gemini (${cfg.geminiModel || 'gemini-flash-latest'})`;
  if (p === 'claude') return `Claude (${cfg.claudeModel || DEFAULT_CLAUDE_MODEL})`;
  if (p === 'openai') return `ChatGPT (${cfg.openaiModel || DEFAULT_OPENAI_MODEL})`;
  if (p === 'free') { const ep = freeEndpoint(cfg); return `${ep.label} (${ep.model})`; }
  return `Qwen (${cfg.webllmModel})`;
};
/** 고른 AI가 붐빌 때 대신 쓸 수 있는 AI: 내가 키를 넣어 둔 것만(키 없는 무료 서버로 몰래 넘기지 않는다). */
function fallbackProviders(cfg: LlmConfig, primary: ProviderId): ProviderId[] {
  return (['gemini', 'claude', 'openai', 'free'] as ProviderId[]).filter((p) => {
    if (p === primary) return false;
    if (p === 'free' && !freePreset(cfg.freePreset).needKey) return false;
    return effectiveProvider({ ...cfg, provider: p }) === p;
  });
}

/** 한 AI에게 판정을 시킨다. 붐비면 기다렸다 다시, 형식이 틀리면 오류를 알려 주고 한 번 다시 시도한다. */
async function tryProvider(cfg0: LlmConfig, provider: ProviderId, s: GameState, w: World, command: string, pass: boolean, hooks: Hooks): Promise<{ adj: Adjudication; mode: string }> {
  const cfg = { ...cfg0, provider };
  // 입력 길이에 한도가 있는 무료 서버(키 없이 쓰는 Pollinations 등)는 한도 안에 들어가는 단계까지 프롬프트를 줄인다.
  // 서버가 그래도 413으로 거절하면 한 단계씩 더 줄여 다시 보낸다.
  const limit = provider === 'free' && !freeEndpoint(cfg).key ? freePreset(cfg.freePreset).maxPromptChars ?? 0 : 0;
  // 모델 이름으로 크기를 가늠해 프롬프트 단계·온도·지침을 정한다(작은 모델일수록 간추린 프롬프트 + 예시 + 낮은 온도)
  const prof = profileFor(modeOf(cfg, provider).replace(/^[^(]*\(|\)$/g, ''));
  reqTemp = prof.temp;
  let level = Math.max(prof.minLevel, provider === 'webllm' ? 2 : 0);
  let system = '', msgs: Msg[] = [];
  const rebuild = () => {
    const extraLen = prof.hint.length + (prof.example ? EXAMPLE.length : 0) + 4;
    const p = fitPrompt(w, s, command, pass, limit ? limit - extraLen : 0, level); level = p.level;
    system = p.system + (prof.hint ? `\n\n${prof.hint}` : '') + (prof.example && p.level >= 2 ? `\n\n${EXAMPLE}` : '');
    msgs = [{ role: 'user', text: p.user }];
  };
  rebuild();
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 90_000 + (retryPolicy.delaysMs.length + 1) * MAX_WAIT_MS);
  // 키 없는 무료 서버(Pollinations 등)는 요청 사이에 일정 간격이 필요하다: 미리 기다려서 한도에 걸리지 않게 한다
  const pace = async () => {
    if (provider !== 'free') return;
    const pr = freePreset(cfg.freePreset), ep = freeEndpoint(cfg), gap = retryPolicy.paceMs ?? pr.freeIntervalMs ?? 0;
    if (!gap || ep.key) return;
    const wait = (lastFreeCall.get(pr.id) ?? 0) + gap - Date.now();
    if (wait > 300) { hooks.onProgress?.(`${pr.name.replace(/ \(.*\)$/, '')} 무료 이용은 ${Math.round(gap / 1000)}초에 한 번만 답해서 ${Math.ceil(wait / 1000)}초 기다립니다…`); await sleep(wait, ctl.signal); }
    lastFreeCall.set(pr.id, Date.now());
  };
  const call = async (): Promise<string> => {
    for (let i = 0; ; i++) {
      try {
        await pace();
        return provider === 'gemini' ? await callGemini(cfg, system, msgs, ctl.signal) : provider === 'claude' ? await callClaude(cfg, system, msgs, ctl.signal)
          : provider === 'openai' ? await callOpenAi(cfg, system, msgs, ctl.signal) : provider === 'free' ? await callFree(cfg, system, msgs, ctl.signal) : await callWebLlm(cfg, system, msgs, hooks);
      } catch (e) {
        if (e instanceof LlmError && e.tooLong && level < PROMPT_LEVELS - 1) { level += 1; rebuild(); hooks.onProgress?.('요청이 길어서 내용을 줄여 다시 보냅니다…'); i = -1; continue; }
        if (!(e instanceof LlmError) || !e.busy || i >= retryPolicy.delaysMs.length) throw e;
        const wait = Math.max(e.retryAfterMs, retryPolicy.delaysMs[i]);
        hooks.onProgress?.(`${providerLabel(cfg)}가 붐벼서 ${Math.round(wait / 1000)}초 뒤 다시 시도합니다… (${i + 1}/${retryPolicy.delaysMs.length})`);
        await sleep(wait, ctl.signal);
      }
    }
  };
  try {
    let lastErr = '';
    for (let attempt = 0; attempt < 2; attempt++) {
      hooks.onProgress?.(attempt === 0 ? `${providerLabel(cfg)}가 판정하는 중…` : '형식 오류를 고쳐서 다시 요청하는 중…');
      const text = await call();
      try {
        const parsed = normalizeAdjudication(extractJson(text));
        if (parsed.ok) return { adj: parsed.value, mode: modeOf(cfg, provider) };
        lastErr = parsed.error;
      } catch (e) { lastErr = (e as Error).message; }
      const fix = `직전 출력이 형식에 맞지 않았다: ${lastErr}. 위 JSON 형식에 정확히 맞춰 JSON 객체 하나만 다시 출력하라.`;
      const used = system.length + msgs.reduce((n, m) => n + m.text.length, 0) + fix.length;
      // 길이 한도가 있으면 이전 출력은 한도가 허락하는 만큼만 되돌려 보낸다
      const echo = limit ? Math.max(0, Math.min(1200, limit + 1500 - used)) : 6000;
      if (echo > 200) msgs.push({ role: 'assistant', text: text.slice(0, echo) });
      msgs.push({ role: 'user', text: fix });
    }
    throw new LlmError(`AI가 올바른 형식으로 답하지 못했습니다 (${lastErr}). 다시 시도하거나 명령을 단순하게 바꿔 보세요.`);
  } finally { clearTimeout(timer); }
}

/**
 * 명령 하나를 판정한다. 고른 AI가 붐비면 ① 기다렸다 다시 ② 내가 키를 넣어 둔 다른 AI로 ③ 그래도 안 되면 간이 판정으로 넘어가서
 * 턴이 멈추지 않게 한다. 키가 틀리거나 크레딧이 없는 것처럼 기다려도 낫지 않는 오류는 그대로 알려 준다.
 */
export async function adjudicate(
  cfg: LlmConfig, s: GameState, w: World, command: string, pass: boolean, hooks: Hooks = {},
): Promise<{ adj: Adjudication; mode: string }> {
  const provider = effectiveProvider(cfg);
  if (provider === 'local') return { adj: localAdjudicate(s, w, command, pass), mode: '간이 판정 (AI 키 없음)' };
  const chain = [provider, ...(provider === 'webllm' ? [] : fallbackProviders(cfg, provider))];
  for (let k = 0; k < chain.length; k++) {
    try { return await tryProvider(cfg, chain[k], s, w, command, pass, hooks); }
    catch (e) {
      if (!(e instanceof LlmError) || !e.busy) throw e;
      const next = chain[k + 1];
      hooks.onProgress?.(next ? `${providerLabel({ ...cfg, provider: chain[k] })}가 계속 붐벼서 ${providerLabel({ ...cfg, provider: next })}로 바꿔 시도합니다…` : '');
    }
  }
  hooks.onProgress?.('AI가 모두 붐벼서 이번 턴은 간이 판정으로 처리합니다…');
  return { adj: localAdjudicate(s, w, command, pass), mode: `간이 판정 (${providerLabel({ ...cfg, provider })}가 붐벼서)` };
}

/** 키 확인용 가벼운 호출. */
export async function testGemini(cfg: LlmConfig): Promise<string> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 30_000);
  try {
    const t = await callGemini(cfg, '답은 JSON 한 개만.', [{ role: 'user', text: '{"ok":true} 라고만 답하라.' }], ctl.signal);
    return t.slice(0, 80);
  } finally { clearTimeout(timer); }
}

/** Claude 키 확인용 가벼운 호출. */
export async function testClaude(cfg: LlmConfig): Promise<string> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 60_000);
  try { return (await callClaude(cfg, '짧게 답하라.', [{ role: 'user', text: '"ok" 라고만 답하라.' }], ctl.signal)).slice(0, 40); } finally { clearTimeout(timer); }
}
