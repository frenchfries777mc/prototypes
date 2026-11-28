/**
 * 모델 크기·성향별 프롬프트 설정. 큰 모델은 전체 프롬프트를 그대로, 작은 모델은 간추린 프롬프트 + 예시 + 짧은 지침 + 낮은 온도로
 * 형식 오류를 줄인다. 모델 이름만 보고 고르는 휴리스틱이라(서버가 크기를 알려주지 않는다) 맞지 않으면 "mid"로 떨어진다.
 */
export type Tier = 'strong' | 'mid' | 'small' | 'tiny';
export interface ModelProfile { tier: Tier; /** 시작 프롬프트 단계(0 전체 … 5 가장 짧음) */ minLevel: number; temp: number; /** 간추린 프롬프트에 예시 출력을 붙일지 */ example: boolean; hint: string }

const HINTS: Record<Tier, string> = {
  strong: '',
  mid: '서술(narrative)은 2~3문장으로 간결하게 쓰고, 입력의 LEDGER와 모순되지 않게 한다.',
  small: '【지침】 JSON 객체 하나만 출력한다(설명·코드펜스 금지). 모든 키를 쓰되 쓸 내용이 없는 목록은 []로 둔다. narrative는 2문장, headlines는 1~2개. 국가·주·군대 ID는 입력에 적힌 것만 그대로 쓴다. feasibility는 정수. LEDGER와 모순되게 쓰지 않는다.',
  tiny: '【지침】 JSON 객체 하나만 출력한다. narrative는 1~2문장. world_events는 한 건만, 모르겠으면 빈 객체 {}. ID는 입력에 적힌 것만 쓴다. 쓸 내용이 없는 목록은 []. 설명 금지.',
};
const BASE: Record<Tier, Omit<ModelProfile, 'hint' | 'tier'>> = {
  strong: { minLevel: 0, temp: 0.8, example: false },
  mid: { minLevel: 0, temp: 0.7, example: false },
  small: { minLevel: 2, temp: 0.5, example: true },
  tiny: { minLevel: 3, temp: 0.4, example: true },
};

export function tierOf(model: string): Tier {
  const m = model.toLowerCase();
  if (/(^|[^0-9.])(0\.5|1\.5|[1-3])b([^a-z]|$)/.test(m)) return 'tiny';
  if (/(^|[^0-9.])([5-9]|1[0-4])b([^a-z]|$)|nano|lite|gemma|phi-?\d|ministral|mistral-small/.test(m)) return 'small';
  if (/claude|fable|opus|sonnet|gpt-4\.1$|gpt-4o$|gpt-5|^o\d|gemini.*(pro|flash-latest|2\.5-flash$|-3)|(^|[^0-9])(70|72|120|235|405)b|deepseek|kimi|mistral-large|command-r\+/.test(m)) return 'strong';
  return 'mid';
}
export function profileFor(model: string): ModelProfile { const tier = tierOf(model); return { tier, ...BASE[tier], hint: HINTS[tier] }; }
