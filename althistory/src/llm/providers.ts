import type { World } from '../data/world';
import type { Adjudication } from '../engine/diff';
import { normalizeAdjudication } from '../engine/diff';
import type { GameState } from '../engine/state';
import { buildUserPrompt, systemPrompt } from './prompt';
import { localAdjudicate } from './local';

export type ProviderId = 'local' | 'gemini' | 'webllm';
export interface LlmConfig { provider: ProviderId; geminiKey: string; geminiModel: string; webllmModel: string }
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

// ---- 브라우저 내 Qwen (WebLLM, 실험적) ----
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let engine: any = null;
let engineModel = '';
async function getEngine(model: string, onProgress?: (m: string) => void) {
  if (engine && engineModel === model) return engine;
  if (!('gpu' in navigator)) throw new LlmError('이 브라우저는 WebGPU를 지원하지 않아 브라우저 Qwen을 쓸 수 없습니다. 최신 Chrome/Edge 데스크톱을 쓰거나 다른 모드를 선택하세요.');
  const url = 'https://esm.run/@mlc-ai/web-llm';
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
    temperature: 0.7, max_tokens: 1800, response_format: { type: 'json_object' },
  }); } catch (e) { throw new LlmError(`Qwen 추론 중 오류: ${(e as Error).message.slice(0, 160)}`); }
  return out.choices?.[0]?.message?.content ?? '';
}

/** 명령 하나를 판정한다. LLM 모드는 형식이 틀리면 오류 내용을 알려 주고 한 번 다시 시도한다. */
export async function adjudicate(
  cfg: LlmConfig, s: GameState, w: World, command: string, pass: boolean, hooks: Hooks = {},
): Promise<{ adj: Adjudication; mode: string }> {
  if (cfg.provider === 'local') return { adj: localAdjudicate(s, w, command, pass), mode: '규칙 모드' };

  const compact = cfg.provider === 'webllm';
  const system = systemPrompt(w, compact);
  const msgs: Msg[] = [{ role: 'user', text: buildUserPrompt(s, w, command, pass, compact) }];
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 90_000);
  try {
    let lastErr = '';
    for (let attempt = 0; attempt < 2; attempt++) {
      hooks.onProgress?.(attempt === 0 ? (cfg.provider === 'gemini' ? 'Gemini가 판정하는 중…' : 'Qwen 준비 중…') : '형식 오류를 고쳐서 다시 요청하는 중…');
      const text = cfg.provider === 'gemini' ? await callGemini(cfg, system, msgs, ctl.signal) : await callWebLlm(cfg, system, msgs, hooks);
      try {
        const parsed = normalizeAdjudication(extractJson(text));
        if (parsed.ok) return { adj: parsed.value, mode: cfg.provider === 'gemini' ? `Gemini (${cfg.geminiModel || 'gemini-flash-latest'})` : `Qwen (${cfg.webllmModel})` };
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
