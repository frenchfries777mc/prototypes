shader_type canvas_item;
// 후처리: 색보정, 비네트, 약한 필름 그레인, 피격 시 붉은 테두리
uniform sampler2D screen_tex : hint_screen_texture, filter_linear;
uniform float hurt = 0.0;
uniform float low_hp = 0.0;
uniform float vignette = 0.32;
uniform float grain = 0.025;

float h21(vec2 p) {
	p = fract(p * vec2(123.34, 456.21));
	p += dot(p, p + 45.32);
	return fract(p.x * p.y);
}

void fragment() {
	vec3 c = texture(screen_tex, SCREEN_UV).rgb;
	// 따뜻한 그림자 / 차가운 하이라이트 + 채도
	float l = dot(c, vec3(0.299, 0.587, 0.114));
	c = mix(vec3(l), c, 1.08);
	c = mix(c * vec3(1.04, 1.0, 0.94), c * vec3(0.96, 1.0, 1.05), smoothstep(0.2, 0.9, l));
	vec2 uv = SCREEN_UV - 0.5;
	float v = smoothstep(0.85, 0.2, length(uv * vec2(1.0, 0.85)));
	c *= mix(1.0 - vignette, 1.0, v);
	float edge = smoothstep(0.25, 0.75, length(uv * vec2(1.15, 1.0)));
	c = mix(c, vec3(0.65, 0.03, 0.02), edge * (hurt * 0.7 + low_hp * 0.35));
	c = mix(c, vec3(l) * 0.8, low_hp * 0.35);
	c += (h21(SCREEN_UV * 900.0 + TIME) - 0.5) * grain;
	COLOR = vec4(c, 1.0);
}
