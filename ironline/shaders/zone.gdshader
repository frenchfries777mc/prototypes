shader_type spatial;
render_mode unshaded, blend_mix, cull_disabled, depth_draw_never, fog_disabled;
// 점령 구역 바닥 표시: 테두리 링 + 점령 진행 채움
uniform vec3 col : source_color = vec3(0.7, 0.7, 0.7);
uniform vec3 col_fill : source_color = vec3(0.4, 0.6, 1.0);
uniform float fill = 0.0;
uniform float radius = 14.0;
uniform float contested = 0.0;
varying vec2 lp;

void vertex() {
	lp = VERTEX.xz;
}

void fragment() {
	float d = length(lp);
	float edge = smoothstep(radius - 0.55, radius - 0.2, d) * (1.0 - smoothstep(radius - 0.05, radius + 0.15, d));
	float inner = step(d, radius * fill) * (1.0 - smoothstep(radius - 0.7, radius - 0.5, d));
	float ang = atan(lp.y, lp.x);
	float dash = 0.65 + 0.35 * step(0.0, sin(ang * 36.0 + TIME * 0.6));
	float pulse = 1.0 + contested * 0.5 * sin(TIME * 8.0);
	ALBEDO = mix(col, col_fill, inner);
	ALPHA = clamp(edge * 0.9 * dash * pulse + inner * 0.16 + (1.0 - smoothstep(radius - 5.0, radius, d)) * 0.05, 0.0, 1.0);
}
