# Uplift-9: Premium Motion Plan for FeedSomeone Landing

**Date:** 2026-06-14  
**Scope:** Motion + 3D synthesis for `src/app/(site)/page.tsx` (donor landing). Opinionated, restrained, install-ready.  
**Position:** Synthesizes findings from uplift-1 (motion stack), uplift-2 (3D/canvas), uplift-3 (scroll), uplift-7 (award design).

---

## 1. Verdict on Stack

After reading all prior research the right stack for FeedSomeone is:

**GSAP 3.15 (core + ScrollTrigger + SplitText) + Lenis 1.x + Motion 12.x (for modal/state only)**

No R3F. No Three.js. No WebGL. The prior r3f research (uplift-2) concluded the same: for a documentary-editorial site the 3D canvas buys nothing you can't beat with CSS + GSAP, and costs 50 KB + hydration complexity. The warm-kitchen-light canvas effect is genuinely interesting but it is a stretch goal for a later pass — the motion choreography described here will already put the site in award-territory. Do not ship Three.js in this iteration.

---

## 2. Install Line

```bash
npm install gsap @gsap/react lenis motion
```

- `gsap@^3.15` — ScrollTrigger + SplitText are now bundled free; no `gsap-trial` or `.npmrc` private registry needed since 3.13
- `@gsap/react@^2` — provides `useGSAP()` hook (replaces raw `useEffect` pattern; handles cleanup automatically)
- `lenis@^1.3` — smooth scroll; import from `lenis/react` (old `@studio-freight/*` packages are retired)
- `motion@^12.40` — Motion (formerly Framer Motion); for `AnimatePresence` on the `QuickDonate` drawer only; import from `motion/react`

**Total gzipped budget:** GSAP core 27 KB + ScrollTrigger 3 KB + SplitText 2 KB + Lenis 4 KB + Motion (lazy, only on donate flow) 12 KB = **~36 KB synchronous** on landing; Motion loads on interaction.

---

## 3. Effect Map — What Goes Where

This table covers every named section in `page.tsx`.

| Section | Effect | Lib | Timing | Mobile |
|---------|--------|-----|--------|--------|
| **Masthead** (logo + nav rule) | Rule draws left-to-right on page load | GSAP | 0.6 s, ease-out, 120 ms after first paint | Same |
| **Counter pill / Live counter** | Fade + 6px rise on load | GSAP | 0.4 s, 200 ms delay | Same |
| **H1 "Feed one child / right now."** | Line-by-line SplitText reveal, words fall-in from y:24px | GSAP SplitText | 0.5 s per line, stagger 0.08 s, starts 300 ms after load | Same (words only, not chars) |
| **Hero photo figure** | Opacity 0→1 + scale 0.96→1 on scroll-enter (ScrollTrigger `once`) | GSAP | 0.7 s, scrub off | Enabled |
| **Hero photo internal** | Subtle parallax: image moves y+40px as section scrolls out of view | GSAP scrub 1.5 | Tied to scroll | Disabled (mobile — jittery) |
| **"recently fed" strip** | Cards stagger-fade in as strip enters viewport (left to right) | GSAP | 0.5 s, stagger 0.06 s per card | Same |
| **How-It-Works** | Each step number + text pair slides up from y:20px on scroll-enter, sequential | GSAP | 0.5 s, stagger 0.12 s | Same |
| **Stats band numbers** | Count-up via GSAP `snap` from 0 to real value on entry | GSAP | 1.2 s, ease-out, once | Same |
| **Sign-off "Feed / someone."** | SplitText line-reveal at crawl speed — 0.9 s per line, slight letter-spacing eases from 0.08 em to 0 | GSAP SplitText | 0.9 s per line, stagger 0.14 s | Words only, not chars |
| **Sign-off CTA button** | Opacity 0→1 + y:12px→0 after sign-off text completes | GSAP | 0.4 s, 200 ms after last line | Same |
| **QuickDonate drawer** | Spring mount + unmount | Motion `AnimatePresence` | damping:22, stiffness:260 | Same |

**Rule:** No more than one animation is active per viewport height. Sections are spaced far enough that two overlapping reveals never compete.

---

## 4. Choreography Timing (Page Load Sequence)

Page load is a single coordinated GSAP context, not scattered individual effects. Fire it in a top-level `"use client"` wrapper that is dynamically imported with `ssr: false`.

```
t=0        First paint (server HTML, no JS)
t=0ms      Lenis initialises, smooth scroll begins
t=80ms     Masthead rule draws (0.6 s)
t=200ms    Counter pill fades in (0.4 s)
t=300ms    H1 SplitText lines begin (line 1: "Feed one child", line 2: "right now.")
           Line 1 → 0.5 s; Line 2 starts 0.08 s after last word of line 1
t=1100ms   Hero CTA button fades in (0.4 s)
--- scroll-driven below ---
On scroll  Hero photo enters (0.7 s, scrub off, once)
On scroll  Hero photo internal parallax (scrub 1.5, desktop only)
On scroll  Recently-fed strip stagger
On scroll  How-It-Works steps sequential
On scroll  Stats band count-up
On scroll  Sign-off SplitText reveal (slowest, most dramatic)
On scroll  Sign-off CTA fades in after text
```

---

## 5. Three Concrete Code Patterns

### Pattern A — Global Lenis Setup (layout.tsx)

```tsx
// src/app/layout.tsx
// This is a server component; Lenis wrapper must be extracted.

import { LenisProvider } from '@/components/motion/LenisProvider';
import './globals.css';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-scroll-behavior="smooth">
      <body>
        <LenisProvider>{children}</LenisProvider>
      </body>
    </html>
  );
}
```

```tsx
// src/components/motion/LenisProvider.tsx
'use client';

import { ReactLenis } from 'lenis/react';
import { useEffect, useState } from 'react';

export function LenisProvider({ children }: { children: React.ReactNode }) {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    setReduced(window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }, []);

  // If reduced motion: lerp=1 disables smoothing entirely (native scroll)
  return (
    <ReactLenis
      root
      options={{
        lerp: reduced ? 1 : 0.09,
        syncTouch: !reduced,
        duration: 1.2,
      }}
    >
      {children}
    </ReactLenis>
  );
}
```

**Why `lerp: 0.09`:** Slightly lower than the devdreaming guide's 0.1 for a touch more weight — this palette is ink-heavy and slow-feeling scroll reinforces the editorial weight.

---

### Pattern B — H1 SplitText Line Reveal

This is the page's most important motion moment. Two lines of Fraunces 900 at `clamp(48px,11vw,122px)`. Words fall in, not characters (mobile-safe, legible mid-animation).

```tsx
// src/components/motion/HeroHeadline.tsx
'use client';

import gsap from 'gsap';
import { SplitText } from 'gsap/SplitText';
import { useGSAP } from '@gsap/react';
import { useRef } from 'react';

gsap.registerPlugin(SplitText, useGSAP);

interface Props {
  children: React.ReactNode;
  className?: string;
}

export function HeroHeadline({ children, className }: Props) {
  const containerRef = useRef<HTMLHeadingElement>(null);

  useGSAP(
    () => {
      // Bail early for reduced motion — text is already visible (no initial:hidden)
      const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (reduced) return;

      const split = SplitText.create(containerRef.current!, { type: 'lines,words' });

      // Set starting state
      gsap.set(split.words, { opacity: 0, y: 24, willChange: 'transform, opacity' });

      // Animate
      gsap.to(split.words, {
        opacity: 1,
        y: 0,
        duration: 0.5,
        ease: 'power2.out',
        stagger: 0.06,
        delay: 0.3,
        clearProps: 'willChange', // release compositing layer after done
      });

      return () => split.revert();
    },
    { scope: containerRef }
  );

  return (
    <h1 ref={containerRef} className={className}>
      {children}
    </h1>
  );
}
```

**Usage in page.tsx** — replace the raw `<h1>` block:

```tsx
// In page.tsx (server component) — import at top, then:
import dynamic from 'next/dynamic';

const HeroHeadline = dynamic(
  () => import('@/components/motion/HeroHeadline').then(m => m.HeroHeadline),
  { ssr: false, loading: () => (
    <h1 className="display text-[clamp(48px,11vw,122px)]">
      Feed one child<br /><span className="text-clay">right now.</span>
    </h1>
  )}
);

// In JSX:
<HeroHeadline className="display text-[clamp(48px,11vw,122px)]">
  Feed one child<br /><span className="text-clay">right now.</span>
</HeroHeadline>
```

**Note on `ssr: false` + loading fallback:** The server renders the static fallback (full headline, no FOUC). Once JS hydrates, `useGSAP` fires and animates. If JS never loads or `prefers-reduced-motion` is set, user sees the complete headline.

---

### Pattern C — Hero Photo + Recently-Fed Strip (ScrollTrigger)

```tsx
// src/components/motion/ScrollReveal.tsx
'use client';

import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useGSAP } from '@gsap/react';
import { useRef } from 'react';

gsap.registerPlugin(ScrollTrigger);

interface Props {
  children: React.ReactNode;
  className?: string;
  /** 'fade' = simple opacity+y. 'stagger' = apply stagger to direct children. */
  mode?: 'fade' | 'stagger';
  /** Extra y offset override (default 16px) */
  y?: number;
  delay?: number;
}

export function ScrollReveal({ children, className, mode = 'fade', y = 16, delay = 0 }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (reduced) return;

      const targets =
        mode === 'stagger'
          ? Array.from(ref.current!.children)
          : [ref.current!];

      gsap.set(targets, { opacity: 0, y, willChange: 'transform, opacity' });

      gsap.to(targets, {
        opacity: 1,
        y: 0,
        duration: 0.6,
        ease: 'power2.out',
        delay,
        stagger: mode === 'stagger' ? 0.06 : 0,
        scrollTrigger: {
          trigger: ref.current,
          start: 'top 82%',
          once: true,
        },
        onComplete() {
          gsap.set(targets, { clearProps: 'willChange' });
        },
      });
    },
    { scope: ref }
  );

  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}
```

**Hero photo usage** (wrap the `<figure>` in page.tsx):

```tsx
// Dynamic import so ScrollTrigger never runs on server
const ScrollReveal = dynamic(() =>
  import('@/components/motion/ScrollReveal').then(m => m.ScrollReveal),
  { ssr: false }
);

// Hero figure:
<ScrollReveal>
  <figure className="self-end">
    {/* existing figure content */}
  </figure>
</ScrollReveal>

// Recently-fed strip — stagger mode on the inner flex container:
<ScrollReveal mode="stagger" className="mx-auto flex max-w-6xl gap-4 px-5">
  {strip.map((p) => (
    <figure key={p.id} className="lift w-52 flex-none sm:w-56">
      {/* ... */}
    </figure>
  ))}
</ScrollReveal>
```

---

### Pattern D — Sign-Off "Feed / someone." (The Dramatic One)

This is the largest text on the page — `clamp(64px,17vw,232px)`. It should feel inevitable, not fast. Two lines, slow stagger, letter-spacing eases closed.

```tsx
// src/components/motion/SignOffReveal.tsx
'use client';

import gsap from 'gsap';
import { SplitText } from 'gsap/SplitText';
import { useGSAP } from '@gsap/react';
import { useRef } from 'react';

gsap.registerPlugin(SplitText);

export function SignOffReveal({ children, className }: { children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLParagraphElement>(null);

  useGSAP(
    () => {
      const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (reduced) return;

      const split = SplitText.create(ref.current!, { type: 'lines' });

      gsap.set(split.lines, {
        opacity: 0,
        y: 32,
        letterSpacing: '0.05em',
        willChange: 'transform, opacity',
      });

      gsap.to(split.lines, {
        opacity: 1,
        y: 0,
        letterSpacing: '0em', // collapses to normal
        duration: 0.9,
        ease: 'power3.out',
        stagger: 0.14,
        scrollTrigger: {
          trigger: ref.current,
          start: 'top 78%',
          once: true,
        },
        onComplete() {
          gsap.set(split.lines, { clearProps: 'willChange,letterSpacing' });
          split.revert(); // restore DOM for screen readers
        },
      });
    },
    { scope: ref }
  );

  return (
    <p ref={ref} className={className}>
      {children}
    </p>
  );
}
```

---

## 6. Mobile and Performance Budget

| Constraint | Target | How Enforced |
|-----------|--------|-------------|
| Synchronous JS on landing (motion) | ≤ 36 KB gzipped | GSAP + Lenis only; Motion lazy on donate |
| Hero photo parallax | Desktop only | `window.innerWidth > 768` check inside `useGSAP`, or CSS `@media` |
| ScrollTrigger instances | ≤ 6 on landing | One per section; all `once: true` (auto-kill after fire) |
| Canvas / Three.js | None this iteration | Deferred to future pass |
| GSAP timelines active simultaneously | ≤ 1 | Page load timeline runs once; scroll triggers are independent |
| `clearProps` | After every animation | Releases compositor layers; prevents memory leak on long sessions |
| Lenis on touch | `syncTouch: !reduced` | Mirror wheel smoothing on iOS/Android; disabled when reduced |

**Mobile-specific rules:**
- Hero parallax disabled: parallax on touch causes jank on variable-refresh-rate screens
- SplitText uses `type: 'lines,words'` on all instances — never characters on mobile (chars are too small mid-animation and wrapping is unpredictable)
- `start: 'top 82%'` (not 75%) — gives more breathing room before trigger fires on small screens where sections are taller relative to viewport

---

## 7. prefers-reduced-motion Behavior

**Rule: every animation file checks `window.matchMedia` inside `useGSAP`. The check is at the start of the callback — bail early and let the element stay in its natural visible state.**

Do not hide elements with `opacity:0` as a default; only set the initial hidden state inside the reduced-motion-false branch. This means if JS never loads or reduced-motion is true, the page looks exactly like the static server render — fully legible, nothing missing.

```tsx
// Template for every animation hook
useGSAP(() => {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduced) return; // ← bail; element already visible (server render)

  // ... animation code here
}, { scope: ref });
```

Additionally in `globals.css`:

```css
@media (prefers-reduced-motion: reduce) {
  /* Nuclear fallback: kill any animation that slipped through */
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

---

## 8. Effects Explicitly Not Used

These are called out because they are tempting and wrong for FeedSomeone:

- **Tilted polaroid + CSS rotation on photo cards** — 2024 cliché, directly called out in uplift-7
- **Film grain overlay** — was already stripped in the `b0a18b9` commit; do not re-add
- **Floating / bobbing animation on any element** — signals "template"; premium sites are still
- **Infinite scroll counters** that tick continuously — a gimmick; the count-up fires once on entry, then stops
- **Parallax on mobile** — causes jank; disabled per mobile budget rule above
- **Canvas / WebGL for atmosphere** — deferred; adds complexity before the base motion choreography is proven
- **Page transition animations via Motion** — not needed; the landing is a single-page experience

---

## 9. File Structure

```
src/
  components/
    motion/
      LenisProvider.tsx       ← global smooth scroll ('use client')
      HeroHeadline.tsx        ← SplitText load-time reveal
      SignOffReveal.tsx       ← SplitText sign-off reveal
      ScrollReveal.tsx        ← generic fade/stagger ScrollTrigger wrapper
      MastheadRule.tsx        ← rule draw-in on load (optional, very lightweight)
  app/
    layout.tsx                ← wraps children with <LenisProvider>
    (site)/
      page.tsx                ← imports dynamic(HeroHeadline, ScrollReveal, SignOffReveal)
```

All motion components are `"use client"` and dynamically imported with `ssr: false` from `page.tsx` (which remains a server component). The `loading` prop on each dynamic import renders the static server HTML — no layout shift, no FOUC.

---

## 10. What to Build Next (After This Ships)

Once the base choreography is verified on mobile:

1. **Stats count-up:** A `CountUp` component using `gsap.to({ val: 0 }, { val: target, onUpdate })` — only worthwhile once real numbers are live (the `showNumbers` gate in `page.tsx` already controls this)
2. **Masthead rule draw:** A 2-second `scaleX(0)→scaleX(1)` on the `<div className="rule" />` element — uses CSS `transform-origin: left` with GSAP, extremely lightweight
3. **Volumetric canvas (stretch):** The warm-kitchen-light backdrop from uplift-2, deferred until after mobile perf is confirmed with the above

---

## Sources

- [GSAP 3.15 npm + free SplitText announcement (3.13)](https://gsap.com/blog/3-13/)
- [useGSAP hook — @gsap/react](https://gsap.com/docs/v3/Packages/gsap-react/)
- [Lenis 1.3 Next.js 2026 guide — DevDreaming](https://devdreaming.com/blogs/nextjs-smooth-scrolling-with-lenis-gsap)
- [Motion 12.40.0 changelog — motion.dev](https://motion.dev/changelog)
- [GSAP matchMedia + prefers-reduced-motion — CodePen demo](https://codepen.io/GreenSock/pen/RwMQwpR)
- [GSAP vs Framer Motion 2026 — Good Fella Lab](https://lab.good-fella.com/blog/gsap-vs-framer-motion-vs-react-spring)
- [uplift-1-motion-stack.md](./uplift-1-motion-stack.md) — motion library comparison
- [uplift-2-three-r3f.md](./uplift-2-three-r3f.md) — 3D/canvas verdict
- [uplift-3-scroll-anim.md](./uplift-3-scroll-anim.md) — native scroll-driven animation research
- [uplift-7-award-design.md](./uplift-7-award-design.md) — Awwwards anti-patterns + directives
