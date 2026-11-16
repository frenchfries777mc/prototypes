shader_type spatial;
render_mode unshaded, blend_add, cull_disabled, depth_draw_never, fog_disabled;
// 멀리서도 거점이 보이도록 하는 빛기둥
uniform vec3 col : source_color = vec3(0.7, 0.7, 0.7);
uniform float height = 70.0;
varying float hy;

void vertex() {
	hy = VERTEX.y;
}

void fragment() {
	float t = clamp((hy + height * 0.5) / height, 0.0, 1.0);
	float edge = abs(dot(normalize(NORMAL), normalize(VIEW))) ;
	ALBEDO = col;
	ALPHA = (1.0 - t) * (1.0 - t) * 0.2 * (0.35 + 0.65 * edge);
}
