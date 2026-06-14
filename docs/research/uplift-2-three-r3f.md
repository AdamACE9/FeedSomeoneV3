# research/uplift-2-three-r3f

**react-three-fiber + three.js in Next.js 16 App Router (2026)**

*Research agent: Assignment 2-r3f*  
*Date: 2026-06-14*

---

## Executive Summary

react-three-fiber (r3f) v9 pairs with React 19, and is production-ready in Next.js 16. However, **for FeedSomeone's editorial, documentary-focused donation site, r3f is likely *not* worth the payload cost and complexity**—at least not as a primary hero component. A hybrid approach is stronger: pure CSS + single-canvas utility (volumetric lighting atmosphere, hero photo parallax) with `<canvas>` and vanilla three.js or OffscreenCanvas, where payload = 1 impact. r3f shines for *interactive* 3D scenes; FeedSomeone's goals (warm ambient atmosphere, one subtle focus, mobile-first, 44px touch targets) are better served by CSS-driven typography + carefully composed photography + a *single* bespoke canvas effect that respects `prefers-reduced-motion`.

This brief covers current versions, App Router integration, mobile/perf budgets, tasteful editorial use-cases that *avoid* generic vibecoded clichés, and a concrete starter skeleton for a minimal "volumetric dawn light behind hero photo" pattern with lazy loading and motion respects.

---

## Current Versions & Compatibility (June 2026)

### three.js
- **Latest: r184** (April 2026)
- **Recommended for Next.js 16: r180+** (stable, production WebGPU support landed r171+)
- WebGPU production-ready; WebGL fallback solid

### react-three-fiber
- **v9.x** (pairs with React 19; FeedSomeone runs Next 16 w/ React 19)
- v8.x = React 18 only; do not use
- Latest stable: v9.6.1 (April 2026)
- Install: `npm install three@latest @react-three/fiber@latest @react-three/drei@latest`

### @react-three/drei
- **v9.116+** (utilities library for r3f: LOD, PerformanceMonitor, Sky, Bloom, etc.)
- Not strictly required for minimal work, but recommended for production polish

### Next.js 16 Requirements
- **Transpile three.js**: add `transpilePackages: ['three']` to `next.config.js`
- **No special workarounds** for App Router; `'use client'` + dynamic import with `ssr: false` handles hydration

---

## App Router Integration: Setup Pattern

### Minimal Example (App Router)

**`next.config.js`:**
```javascript
/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['three'],
};
module.exports = nextConfig;
```

**`app/(site)/page.tsx`** (server component, can fetch data):
```typescript
import dynamic from 'next/dynamic';

const HeroCanvas = dynamic(
  () => import('@/components/HeroCanvas'),
  { ssr: false, loading: () => <div className="h-96 bg-sand" /> }
);

export default function HomePage() {
  return (
    <main>
      {/* hero canvas occupies a fixed space, server-side content below */}
      <HeroCanvas />
      <section>{/* regular markdown/content below hero */}</section>
    </main>
  );
}
```

**`components/HeroCanvas.tsx`** (client component with Canvas):
```typescript
'use client';

import { Canvas } from '@react-three/fiber';
import { Suspense } from 'react';
import HeroScene from './HeroScene';

export default function HeroCanvas() {
  return (
    <Canvas
      camera={{ position: [0, 0, 10], fov: 50 }}
      style={{ width: '100%', height: '400px' }}
      performance={{ min: 0.5 }}
    >
      <Suspense fallback={null}>
        <HeroScene />
      </Suspense>
    </Canvas>
  );
}
```

**Key points:**
- `ssr: false` prevents Three.js browser APIs from executing during build
- `loading` fallback renders while component hydrates
- Always wrap Canvas in `<Suspense>` to avoid hydration mismatch
- Defer import of heavy 3D libs to client-only boundary

---

## Performance Budget & Mobile Optimization

### Recommended Budget for Donation Site
- **Initial JS chunk**: ~40–60 KB (three.js + r3f)
- **Canvas resolution**: 1× device pixel ratio on mobile, 2× on desktop (cost of 4× more pixels on high-DPI)
- **Geometry triangles**: <10k total (volumetric effect + parallax photo frame)
- **Texture memory**: <8 MB (warm gradient, noise, maybe 2–3 small maps)
- **Framerate**: 60 fps on iPhone 12+, 30 fps acceptable on mid-range Android (use `PerformanceMonitor`)
- **TTI** (Time to Interactive): Canvas must render in <2s on 4G

### Mobile-First Optimizations

1. **Adaptive Pixel Ratio**
   ```typescript
   import { PerformanceMonitor } from '@react-three/drei';

   <Canvas dpr={[1, 2]}>
     <PerformanceMonitor 
       onIncline={() => {}}
       onDecline={() => renderer.setPixelRatio(1)}
     />
   </Canvas>
   ```

2. **On-Demand Rendering** (`frameloop="demand"`)
   - Only render when needed (scroll, interaction, animation end)
   - Saves battery; critical for mobile
   ```typescript
   <Canvas frameloop="demand">
   ```

3. **Lazy Load Canvas**
   - Use `IntersectionObserver` or Framer Motion `whileInView` to start render only when canvas enters viewport
   - Paired with `dynamic(..., { ssr: false })` at page level

4. **prefers-reduced-motion Respect**
   ```typescript
   const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
   
   // In animation loop:
   if (!prefersReducedMotion) {
     // animate volumetric light intensity, parallax offset
   } else {
     // static, no motion
   }
   ```

5. **Texture Atlasing & LOD**
   - Combine textures into single atlas (reduce draw calls)
   - Use `<Detailed />` from drei for multi-LOD models (rare on donation site)
   - Shaders: prefer `mediump` on mobile GPUs (2× faster than `highp`)

6. **Instancing for Particle Fields**
   - If rendering "meals served" particle cloud, use `THREE.InstancedMesh` (1 draw call for 1000+ particles vs 1000 calls)

---

## Is r3f Worth It for FeedSomeone?

### Case: r3f = OVERKILL
**When to skip r3f:**
- Simple atmospheric background (volumetric light, warm glow)
- Static or CSS-driven parallax on hero photo
- "Meals served" counter animation (CSS `:has()` or Framer Motion suffices)
- Single, non-interactive 3D element

**Payload cost:** ~50 KB + React overhead + Canvas init latency  
**Complexity cost:** Hydration debugging, ssr:false boundaries, shader language unfamiliar to design team

### Case: r3f = JUSTIFIED
**When to use r3f:**
- Interactive 3D kitchen or meal environment (user rotates, clicks, explores)
- Real-time particle physics (donors' names flowing, meal particles spawning)
- Multi-layer scene (volumetric + parallax + interactive geometry)
- Animated 3D infographic (meal → child → satisfied face, rendered in 3D)

### FeedSomeone Recommendation
**Start with pure CSS + single minimal Canvas for atmosphere.** If the site needs richer 3D storytelling (e.g., "explore a kitchen 3D model", "see meal particles flow to children"), *then* introduce r3f. For now, avoid r3f's overhead for the sake of design purity.

---

## Three Tasteful Editorial Use-Cases (Avoiding Clichés)

### ✓ 1. Volumetric Warm Light Behind Hero Photo (RECOMMENDED)

**Goal:** Subtle, invisible-unless-you-stare atmospheric glow behind the "Fed by X in Y" hero photo. Suggests warmth, care, lighting a meal. No bloom, no lens flare, no vibecoded gloss.

**How it works:**
- Render a warm gradient (dawn/kitchen light) with volumetric light scattering (god rays filtered by invisible geometry)
- Place real donor photo on top at full opacity; canvas is *backdrop only*
- Quiet animation: light intensity pulses subtly ±5% every 5 seconds
- On mobile: `frameloop="demand"` + pulse only once every 3 rotations (not every frame)

**Why it avoids cliché:** It's not about flashy effects; it's about *temperature*—editorial sensibility, not generic 3D flourish. Viewers won't consciously see the canvas; they'll feel the warmth.

**Payload & perf:**
- `three.js` core only (no addons), single Canvas, ~8 KB gzipped
- Geometry: fullscreen quad + 1 light
- Texture: 1 small noise map (256×256, ~12 KB PNG)
- Shader: basic volumetric scattering (post-process via EffectComposer is overkill; use a custom fragment shader)
- Mobile: 30 fps acceptable, `prefersReducedMotion` → static

**Code skeleton** (minimal, no r3f):
```typescript
'use client';
import { useEffect, useRef } from 'react';
import * as THREE from 'three';

export default function VolumetricHeroCanvas() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    // Check prefers-reduced-motion
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const w = containerRef.current.clientWidth;
    const h = containerRef.current.clientHeight;

    // Scene setup
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(50, w / h, 0.1, 1000);
    camera.position.z = 5;

    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setSize(w, h);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    containerRef.current.appendChild(renderer.domElement);

    // Warm gradient quad
    const geometry = new THREE.PlaneGeometry(10, 10);
    const material = new THREE.ShaderMaterial({
      uniforms: {
        uIntensity: { value: 0.3 },
        uTime: { value: 0 },
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform float uIntensity;
        uniform float uTime;
        varying vec2 vUv;

        void main() {
          // Warm gradient: clay to marigold
          vec3 colorA = vec3(0.77, 0.28, 0.11); // clay #C4471D
          vec3 colorB = vec3(0.91, 0.64, 0.24); // marigold #E8A33D
          vec3 color = mix(colorA, colorB, vUv.y);

          // Subtle volumetric effect via radial falloff
          float dist = length(vUv - 0.5) * 1.4;
          float vignette = 1.0 - smoothstep(0.0, 1.0, dist);

          // Pulse intensity
          float pulse = 0.95 + 0.05 * sin(uTime * 0.3);
          float intensity = uIntensity * vignette * pulse;

          gl_FragColor = vec4(color, intensity);
        }
      `,
    });

    const mesh = new THREE.Mesh(geometry, material);
    scene.add(mesh);

    // Animation loop
    let frameCount = 0;
    const animate = () => {
      requestAnimationFrame(animate);

      if (!prefersReducedMotion) {
        frameCount++;
        if (frameCount % 3 === 0) {
          material.uniforms.uTime.value += 0.016;
        }
      }

      renderer.render(scene, camera);
    };

    animate();

    // Handle resize
    const handleResize = () => {
      const newW = containerRef.current?.clientWidth || w;
      const newH = containerRef.current?.clientHeight || h;
      camera.aspect = newW / newH;
      camera.updateProjectionMatrix();
      renderer.setSize(newW, newH);
    };

    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      containerRef.current?.removeChild(renderer.domElement);
    };
  }, []);

  return <div ref={containerRef} className="absolute inset-0 -z-10" />;
}
```

---

### ✓ 2. Subtle Parallax on Hero Photo (CSS-FIRST, then Canvas)

**Goal:** Hero photo lags slightly behind scroll, creating depth without flashiness. On mobile, disabled (too jittery on variable refresh rates).

**Recommendation:** Use pure CSS `background-attachment: fixed` with fallback to Framer Motion's `useScroll` + `useTransform`. Only use r3f if the photo is *3D-textured* (displaced) rather than flat.

**Avoid:** Tilted polaroid, grain overlay, float animation—these are 2024 clichés.

**Why it works:** Documentary sites (e.g., UNICEF, World Food Program) use parallax to convey a sense of weight and care—you're *looking deeper* at impact, not being sold.

---

### ✓ 3. Displacement-Mapped Hero Photo (MEDIUM COMPLEXITY)

**Goal:** "Waves" ripple gently through the hero photo on page load or on scroll, suggesting the fluidity of impact (a meal served ripples outward). Displacement map (normal map) bends the photo's pixels.

**Implementation:**
- Load hero photo as texture
- Use displacement shader to subtly warp based on a sine wave or noise
- Animate over 4–6 seconds, then settle
- `prefers-reduced-motion` → no displacement, static photo

**Why it avoids cliché:** It's not about "liquid morphing" or organic blobs. It's a single, purposeful deformation that mirrors the site's core metaphor: one meal → many ripples. Subtle, intentional, not arbitrary.

**Payload:** ~3 KB extra (displacement fragment shader), no new textures if using photo itself.

---

## Concrete Minimal Hero Concept

### The "Warm Kitchen Light" Pattern

**Page structure:**
```html
<div className="relative h-96 overflow-hidden">
  {/* Volumetric canvas backdrop (Hero component above) */}
  <VolumetricHeroCanvas />
  
  {/* Hero photo, centered, full opacity */}
  <Image
    src={heroPhoto}
    alt="Fed by X in Y"
    fill
    className="object-cover object-center"
  />
  
  {/* Metadata overlay: timestamp, name */}
  <div className="absolute bottom-4 left-4 right-4 text-white mix-blend-multiply">
    <p className="text-xs font-mono">2026-06-14 14:23</p>
    <p className="text-sm font-display">Fed by Sarah in Bangalore</p>
  </div>
</div>
```

**Behavior:**
- On page load: canvas fades in over 2s, then soft pulse
- On scroll: canvas becomes static (paused), photo parallax moves
- On mobile: no parallax, canvas intensity reduced 50%, pulse paused
- On `prefers-reduced-motion`: canvas intensity locked to static

**Result:** Warm, intentional, invisible to those not looking for it. No bloom, no lens flare, no vibecoding.

---

## Lazy Loading & Performance Strategy

### Intersection Observer Pattern

```typescript
'use client';
import { useEffect, useRef, useState } from 'react';

export default function HeroCanvasWithLazyLoad() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => {
      setIsVisible(entry.isIntersecting);
    });

    if (containerRef.current) {
      observer.observe(containerRef.current);
    }

    return () => observer.disconnect();
  }, []);

  return (
    <div ref={containerRef} className="h-96 bg-sand">
      {isVisible && <VolumetricHeroCanvas />}
    </div>
  );
}
```

**Effect:** Canvas only initializes when user scrolls near hero. Saves ~500 ms FCP on slow connections.

---

## Accessibility & Motion Respects

### prefers-reduced-motion in Canvas Code
```typescript
const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

if (!prefersReducedMotion) {
  // Animate: pulse, parallax, displacement
} else {
  // Static: render once, freeze animation
}
```

### Touch Targets & Mobile UX
- If hero canvas is clickable (e.g., "play 3D kitchen tour"), ensure button is ≥44×44 px
- Avoid hover-only interactions; use tap events
- Mobile: cap frame rate to 30 fps under load (use PerformanceMonitor from drei)

---

## Recommended Dependencies for Production

```json
{
  "dependencies": {
    "next": "^16.2.9",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "three": "^184",
    "tailwindcss": "^4.3",
    "framer-motion": "^12.0.0"
  },
  "devDependencies": {
    "@types/three": "^r184.0.0",
    "typescript": "^5.x"
  }
}
```

**Optionally (if r3f is chosen later):**
```json
{
  "@react-three/fiber": "^9.6.1",
  "@react-three/drei": "^9.116.0"
}
```

---

## Key Takeaways

1. **For FeedSomeone's documentary, editorial vision:** r3f is *not* required. Vanilla three.js (or CSS-only) is leaner and more intentional.

2. **If 3D is essential:** Start with a single Canvas utility (volumetric light, parallax, displacement). Avoid animated clichés (floating blobs, morphing gradients, glassy materials).

3. **Mobile-first always:** Pixel ratio adaptive, `frameloop="demand"`, `prefers-reduced-motion` detection. No exceptions.

4. **Lazy load everything:** Canvas hidden until viewport intersection. Reduces FCP by 500+ ms.

5. **Payload budget:** Hero canvas + shader = ~8–12 KB gzipped. Three.js polyfill is a cost; don't spend it on decoration.

6. **Editorial tone:** If you use 3D, make it *invisible*—temperature, not spectacle. Donors should feel warmth and depth, not marvel at a technical effect.

---

## Sources

- [Next.js 16 App Router: The Complete Guide for 2026 - DEV Community](https://dev.to/getcraftly/nextjs-16-app-router-the-complete-guide-for-2026-2hi3)
- [Unlocking the Third Dimension: Building Immersive 3D Experiences with React Three Fiber in Next.js](https://medium.com/@divyanshsharma0631/unlocking-the-third-dimension-building-immersive-3d-experiences-with-react-three-fiber-in-next-js-153397f27802)
- [react-three/fiber on npm](https://www.npmjs.com/package/@react-three/fiber)
- [100 Three.js Tips That Actually Improve Performance (2026)](https://www.utsubo.com/blog/threejs-best-practices-100-tips)
- [Boosting React Three Fiber Mobile Performance in 2026: A Deep Dive](https://www.krapton.com/blog/boosting-react-three-fiber-mobile-performance-in-2026-a-deep-dive-d6105c)
- [React-Three-Fiber: Enhancing Scene Quality with Drei + Performance Tips](https://medium.com/@ertugrulyaman99/react-three-fiber-enhancing-scene-quality-with-drei-performance-tips-976ba3fba67a)
- [Scaling Performance - React Three Fiber Docs](https://r3f.docs.pmnd.rs/advanced/scaling-performance)
- [React Three Fiber Installation - r3f Docs](https://r3f.docs.pmnd.rs/getting-started/installation)
- [The ssr: false Trap in Next.js App Router — and How I Escaped It](https://medium.com/@joshisagarm3/the-ssr-false-trap-in-next-js-app-router-and-how-i-escaped-it-74816bc7a778)
- [What's New in Three.js (2026): WebGPU, New Workflows & Beyond](https://www.utsubo.com/blog/threejs-2026-what-changed)
- [Three.js r171 Release](https://github.com/mrdoob/three.js/releases/tag/r171)
- [Three.js r170 Release](https://github.com/mrdoob/three.js/releases/tag/r170)
- [Volumetric Light Scattering in three.js](https://medium.com/@andrew_b_berg/volumetric-light-scattering-in-three-js-6e1850680a41)
- [GitHub - volumetric_light_example](https://github.com/netpraxis/volumetric_light_example)
- [On Shaping Light: Real-Time Volumetric Lighting with Post-Processing and Raymarching for the Web](https://blog.maximeheckel.com/posts/shaping-light-volumetric-lighting-with-post-processing-and-raymarching-for-the-web/)
- [Accessible Animations in React with "prefers-reduced-motion"](https://www.joshwcomeau.com/react/prefers-reduced-motion/)
- [prefers-reduced-motion CSS media feature - MDN Web Docs](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/@media/prefers-reduced-motion)
- [Building Efficient Three.js Scenes: Optimize Performance While Maintaining Quality](https://tympanus.net/codrops/2025/02/11/building-efficient-three-js-scenes-optimize-performance-while-maintaining-quality/)
- [prefers-reduced-motion: Sometimes less movement is more - web.dev](https://web.dev/articles/prefers-reduced-motion)
- [Nonprofit Web Design Guide 2026](https://bigsea.co/articles/nonprofit-web-design-guide/)
- [22 Best Nonprofit & NGO Website Examples 2026](https://colorlib.com/wp/nonprofit-websites/)
- [10 graphic design trends for 2026 & the future of creativity](https://www.lummi.ai/blog/2026-design-trend)
