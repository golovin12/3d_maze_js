uniform sampler2D uRender;
uniform float uTime;

varying vec2 vUv;

float rand(vec2);

void main() {
    float randomValue = rand(vec2(floor(vUv.y * 7.0), uTime / 1.0));

    vec4 color;

    if (randomValue < 0.02) {
        color = texture2D(uRender, vec2(vUv.x + randomValue - 0.01, vUv.y));
    } else {
        color = texture2D(uRender, vUv);
    }

    float lightness = (color.r + color.g + color.b) / 3.0;
    color.rgb = vec3(smoothstep(0.02, 0.7, lightness));

    gl_FragColor = color;
}

float rand(vec2 seed) {
    return fract(sin(dot(seed, vec2(12.9898,78.233))) * 43758.5453123);
}
