"use client";

import { useEffect, useRef } from "react";

/**
 * A WebGL warm-light field behind the hero — slow organic fbm in the brand
 * palette (paper → sand → marigold → clay), bloomed toward the top-right so the
 * left-aligned headline stays crisp. Deliberately atmospheric, NOT a rainbow
 * blob. Lazy-loaded, paused off-screen, frozen under prefers-reduced-motion.
 */
const VERT = `
  varying vec2 vUv;
  void main(){ vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position, 1.0); }
`;

const FRAG = `
  precision highp float;
  varying vec2 vUv;
  uniform float uTime; uniform vec2 uRes;
  uniform vec3 cPaper, cSand, cMarigold, cClay;

  float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
  float noise(vec2 p){
    vec2 i = floor(p), f = fract(p);
    vec2 u = f*f*(3.0-2.0*f);
    return mix(mix(hash(i), hash(i+vec2(1,0)), u.x),
               mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), u.x), u.y);
  }
  float fbm(vec2 p){
    float v = 0.0, a = 0.5;
    for(int i=0;i<4;i++){ v += a*noise(p); p *= 2.0; a *= 0.5; }
    return v;
  }
  void main(){
    vec2 uv = vUv;
    float asp = uRes.x / max(uRes.y, 1.0);
    vec2 p = vec2(uv.x*asp, uv.y);
    float t = uTime * 0.025;
    float n = fbm(p*2.1 + vec2(t, -t*0.55) + fbm(p*1.2 - t*0.4)*0.6);
    // warm light source toward the top-right (where the hero photo sits)
    float light = smoothstep(1.5, -0.15, distance(uv, vec2(0.86, 0.12)));
    vec3 col = cPaper;
    col = mix(col, cSand,     smoothstep(0.40, 0.76, n) * 0.7);
    col = mix(col, cMarigold, smoothstep(0.55, 0.90, n) * (light * 0.75 + 0.12) * 0.62);
    col = mix(col, cClay,     smoothstep(0.78, 1.00, n) * light * 0.34);
    gl_FragColor = vec4(col, 0.74);
  }
`;

export default function HeroCanvas({ className = "" }: { className?: string }) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let disposed = false;
    let raf = 0;
    const cleanups: Array<() => void> = [];

    import("three")
      .then((THREE) => {
        if (disposed) return;
        const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: false, powerPreference: "low-power" });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.25));
        const dims = () => ({ w: el.clientWidth || 1, h: el.clientHeight || 1 });
        let { w, h } = dims();
        renderer.setSize(w, h);
        const cv = renderer.domElement;
        Object.assign(cv.style, { width: "100%", height: "100%", display: "block" });
        el.appendChild(cv);

        const scene = new THREE.Scene();
        const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
        const u = {
          uTime: { value: 0 },
          uRes: { value: new THREE.Vector2(w, h) },
          cPaper: { value: new THREE.Color("#FBF7F0") },
          cSand: { value: new THREE.Color("#EFE6D6") },
          cMarigold: { value: new THREE.Color("#E8A33D") },
          cClay: { value: new THREE.Color("#C4471D") },
        };
        const mat = new THREE.ShaderMaterial({ uniforms: u, transparent: true, depthTest: false, vertexShader: VERT, fragmentShader: FRAG });
        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
        scene.add(mesh);

        const onResize = () => { const d = dims(); renderer.setSize(d.w, d.h); u.uRes.value.set(d.w, d.h); };
        window.addEventListener("resize", onResize);
        cleanups.push(() => window.removeEventListener("resize", onResize));

        const start = performance.now();
        const draw = () => { u.uTime.value = (performance.now() - start) / 1000; renderer.render(scene, cam); };
        draw(); // always paint one frame

        let running = false;
        const loop = () => { draw(); raf = requestAnimationFrame(loop); };
        const play = () => { if (!running && !reduced) { running = true; loop(); } };
        const stop = () => { running = false; cancelAnimationFrame(raf); };

        // only animate while the hero is on screen
        const io = new IntersectionObserver(([e]) => (e.isIntersecting ? play() : stop()), { threshold: 0.01 });
        io.observe(el);
        cleanups.push(() => { io.disconnect(); stop(); });
        cleanups.push(() => { renderer.dispose(); mat.dispose(); mesh.geometry.dispose(); if (cv.parentNode) cv.parentNode.removeChild(cv); });
      })
      .catch(() => {});

    return () => { disposed = true; cancelAnimationFrame(raf); cleanups.forEach((f) => f()); };
  }, []);

  return <div ref={ref} aria-hidden className={className} />;
}
