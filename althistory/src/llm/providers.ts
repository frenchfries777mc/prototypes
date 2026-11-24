import type { World } from '../data/world';
import type { Adjudication } from '../engine/diff';
import { normalizeAdjudication } from '../engine/diff';
import type { GameState } from '../engine/state';
import { buildUserPrompt, systemPrompt } from './prompt';
import { localAdjudicate } from './local';

import Anthropic from '@anthropic-ai/sdk';

/** 'local' 은 화면에서 고르는 선택지가 아니다: AI 키가 없을 때 엔진이 쓰는 간이 판정이다. */
export type ProviderId = 'local' | 'gemini' | 'claude' | 'webllm';
export interface LlmConfig { provider: ProviderId; geminiKey: string; geminiModel: string; claudeKey: string; claudeModel: string; webllmModel: string }
export const DEFAULT_CLAUDE_MODEL = 'claude-opus-5-5';
/** 고른 AI에 키가 없으면 간이 판정으로 대신한다. */
export function effectiveProvider(cfg: LlmConfig): ProviderId {
  if (cfg.provider === 'gemini' && !cfg.geminiKey.trim()) return 'local';
  if (cfg.provider === 'claude' && !cfg.claudeKey.trim()) return 'local';
  return cfg.provider;
}
export const providerLabel = (cfg: LlmConfig): string => {
  const p = effectiveProvider(cfg);
  return p === 'gemini' ? 'Gemini' : p === 'claude' ? 'Claude' : p === 'webllm' ? 'Qwen (브라우저)' : '간이 판정 (AI 키 없음)';
};
export interface Hooks { onProgress?: (msg: string) => void }

export class LlmError extends Error {}

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
        generationConfig: { temperature: 0.8, responseMimeType: 'application/json', maxOutputTokens: 8192 },
      }),
    });
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw new LlmError('응답 시간이 너무 길어 중단했습니다(90초). 다시 시도하세요.');
    throw new LlmError(`네트워크 오류: Gemini에 연결하지 못했습니다. (${(e as Error).message})`);
  }
  if (!res.ok) {
    let detail = '';
    try { detail = ((await res.json()) as { error?: { message?: string } }).error?.message ?? ''; } catch { /* 무시 */ }
    if (res.status === 429) throw new LlmError('Gemini 무료 사용 한도를 초과했습니다. 1분쯤 뒤에 다시 시도하거나, 규칙 모드/다른 모델로 바꿔 보세요.');
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
    if (e instanceof Anthropic.RateLimitError) throw new LlmError('Claude 사용 한도에 걸렸습니다. 잠시 뒤 다시 시도하세요.');
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
    temperature: 0.7, max_tokens: 1800,
    // response_format json_object는 일부 모델에서 "Failed to initialize the grammar matcher" 오류를 내서 쓰지 않는다.
    // JSON은 프롬프트로 요구하고 응답에서 { … } 부분만 뽑아 쓴다. Qwen3 계열은 생각 모드를 꺼서 바로 JSON을 쓰게 한다.
    ...(/^Qwen3/.test(cfg.webllmModel) ? { extra_body: { enable_thinking: false } } : {}),
  }); } catch (e) { throw new LlmError(`Qwen 추론 중 오류: ${(e as Error).message.slice(0, 160)}`); }
  // Qwen3 계열은 <think>…</think>를 앞에 붙일 수 있어 잘라 낸다
  return String(out.choices?.[0]?.message?.content ?? '').replace(/<think>[\s\S]*?<\/think>/g, '').trim();
}

/** 명령 하나를 판정한다. LLM 모드는 형식이 틀리면 오류 내용을 알려 주고 한 번 다시 시도한다. */
export async function adjudicate(
  cfg: LlmConfig, s: GameState, w: World, command: string, pass: boolean, hooks: Hooks = {},
): Promise<{ adj: Adjudication; mode: string }> {
  const provider = effectiveProvider(cfg);
  if (provider === 'local') return { adj: localAdjudicate(s, w, command, pass), mode: '간이 판정 (AI 키 없음)' };

  const compact = provider === 'webllm';
  const system = systemPrompt(w, compact);
  const msgs: Msg[] = [{ role: 'user', text: buildUserPrompt(s, w, command, pass, compact) }];
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 90_000);
  try {
    let lastErr = '';
    for (let attempt = 0; attempt < 2; attempt++) {
      hooks.onProgress?.(attempt === 0 ? `${providerLabel(cfg)}가 판정하는 중…` : '형식 오류를 고쳐서 다시 요청하는 중…');
      const text = provider === 'gemini' ? await callGemini(cfg, system, msgs, ctl.signal) : provider === 'claude' ? await callClaude(cfg, system, msgs, ctl.signal) : await callWebLlm(cfg, system, msgs, hooks);
      try {
        const parsed = normalizeAdjudication(extractJson(text));
        if (parsed.ok) return { adj: parsed.value, mode: provider === 'gemini' ? `Gemini (${cfg.geminiModel || 'gemini-flash-latest'})` : provider === 'claude' ? `Claude (${cfg.claudeModel || DEFAULT_CLAUDE_MODEL})` : `Qwen (${cfg.webllmModel})` };
        lastErr = parsed.error;
      } catch (e) { lastErr = (e as Error).message; }
      msgs.push({ role: 'assistant', text: text.slice(0, 6000) });
      msgs.push({ role: 'user', text: `직전 출력이 형식에 맞지 않았다: ${lastErr}. 위 JSON 형식에 정확히 맞춰 JSON 객체 하나만 다시 출력하라.` });
    }
    throw new LlmError(`AI가 올바른 형식으로 답하지 못했습니다 (${lastErr}). 다시 시도하거나 명령을 단순하게 바꿔 보세요.`);
  } finally { clearTimeout(timer); }
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
