# Research Brief: Native Scroll-Driven Animations in 2026

**Status:** June 2026 | **Coverage:** CSS `animation-timeline`, View Transitions API, Next.js App Router patterns, browser support, accessibility

---

## Executive Summary

Native scroll-driven animations have moved from experimental to production-ready in 2026. The CSS Scroll-Driven Animations spec (with `animation-timeline: scroll()` and `view()`) is now supported in Chrome 115+, Safari 26+, Edge 115+, and behind a flag in Firefox. The View Transitions API provides smooth morphing and directional navigation in Next.js with zero additional libraries. **For FeedSomeone's editorial redesign, native CSS scroll-reveal + View Transitions replaces JavaScript animation libraries entirely**, reducing bundle size and improving accessibility through built-in `prefers-reduced-motion` support.

---

## Part 1: CSS Scroll-Driven Animations (`animation-timeline`)

### What It Is

`animation-timeline` binds CSS keyframe animations to a scroll progress timeline instead of time. Two main variants:

1. **`animation-timeline: scroll()`** — Ties animation to scroll position of a container (ancestor scroller or root)
2. **`animation-timeline: view()`** — Ties animation to element visibility in viewport

Named timelines are declared with `scroll-timeline` or `view-timeline` properties for reuse across multiple elements.

### Browser Support (Mid-2026)

| Browser | Version | Status | Notes |
|---------|---------|--------|-------|
| Chrome / Edge | 115+ | ✅ Full support | Hardware-accelerated |
| Safari | 26+ | ✅ Full support | Recent addition, stable |
| Firefox | 114+ | ⚠️ Behind flag | Enable via `layout.css.scroll-driven-animations.enabled` |
| Opera | 101+ | ✅ Full support | Chromium-based |

**Current coverage: ~85% of users** (Firefox users opt-in required for animations, but page still works).

### Core CSS Properties

#### `animation-timeline`
Specifies which timeline drives the animation:

```css
/* Anonymous scroll timeline (nearest ancestor scroller) */
animation-timeline: scroll();
animation-timeline: scroll(nearest); /* explicit */
animation-timeline: scroll(nearest block); /* block axis, nearest scroller */
animation-timeline: scroll(nearest inline); /* inline axis */

/* Anonymous view timeline (element's viewport visibility) */
animation-timeline: view();
animation-timeline: view(60%); /* inset: trigger at 60% in viewport */

/* Named timeline (via scroll-timeline or view-timeline) */
animation-timeline: --my-scroll-timeline;
```

#### `scroll-timeline` / `scroll-timeline-name`
Creates a named scroll-driven timeline on a container:

```css
main {
  scroll-timeline-name: --main-scroll;
  scroll-timeline-axis: vertical; /* vertical (default) | horizontal */
  height: 90vh;
  overflow: scroll;
}

/* Alternative shorthand */
scroll-timeline: --main-scroll vertical;
```

#### `view-timeline` / `view-timeline-name`
Creates a timeline based on element visibility:

```css
.hero {
  view-timeline-name: --hero-timeline;
  view-timeline-axis: vertical;
}

/* Shorthand */
view-timeline: --hero-timeline vertical;
```

#### `animation-range` (Optional)
Controls where in the timeline the animation plays:

```css
.fade-in {
  animation: fadeIn linear;
  animation-timeline: view();
  animation-range: entry 0% cover 100%; /* starts at entry, ends at cover */
}

/* Shorthand: animation-range-start, animation-range-end */
animation-range-start: entry 0%;
animation-range-end: cover 100%;
```

**Named range keywords (for `view-timeline`):**
- `entry 0%` — Element enters viewport (top hits bottom)
- `cover 0%` — Element fully covers viewport
- `cover 100%` — Element partially on-screen again
- `exit 100%` — Element exits viewport

### Copy-Paste Pattern: Scroll-Reveal Hero Section

```tsx
// app/page.tsx (donor homepage)
'use client';

export default function Home() {
  return (
    <>
      <style>{`
        /* Scroll timeline on main container */
        main {
          scroll-timeline: --main-scroll;
          height: 100vh;
          overflow: auto;
        }

        /* Scroll-reveal: opacity + transform on hero photo */
        .hero-photo {
          animation: revealHero linear;
          animation-timeline: view();
          animation-range: entry 0% cover 100%;
        }

        @keyframes revealHero {
          from {
            opacity: 0;
            transform: translateY(40px) scale(0.95);
            filter: blur(8px);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
            filter: blur(0);
          }
        }

        /* Accessibility: disable animation if reduced-motion requested */
        @media (prefers-reduced-motion: reduce) {
          .hero-photo {
            animation: none;
            opacity: 1;
            transform: none;
            filter: none;
          }
        }

        /* Graceful fallback for browsers that don't support view-timeline */
        @supports not (animation-timeline: view()) {
          .hero-photo {
            opacity: 1;
            transform: none;
          }
        }
      `}</style>

      <main>
        <section className="counter-pill">
          {/* Counter */}
        </section>

        <section className="cta">
          <h1>Feed one child right now.</h1>
          <p>₹25 → one meal</p>
        </section>

        {/* Hero photo animates in as viewport scrolls */}
        <section className="hero-photo">
          <img src="..." alt="Fed by {name} in {city}" />
          <time>2025-01-14 · 14:23 IST</time>
        </section>

        {/* Rest of page */}
      </main>
    </>
  );
}
```

### Copy-Paste Pattern: Sticky-Pin Storytelling (How-It-Works)

Pin an element while scroll drives progress through 4 steps:

```tsx
// components/how-it-works.tsx
'use client';

export default function HowItWorks() {
  return (
    <>
      <style>{`
        .how-it-works-container {
          position: relative;
          scroll-timeline: --steps-scroll;
        }

        /* Sticky pin: stays fixed while scroll progresses */
        .pin {
          position: sticky;
          top: 0;
          height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          background: var(--color-paper);
        }

        /* Numbered step marker (1→4) animates opacity */
        .step-number {
          font-size: clamp(3rem, 10vw, 8rem);
          animation: countSteps steps(4, end) linear;
          animation-timeline: --steps-scroll;
        }

        @keyframes countSteps {
          0% { opacity: 0; }
          25% { opacity: 1; }
          50% { opacity: 0.7; }
          75% { opacity: 0.4; }
          100% { opacity: 0; }
        }

        /* Reduced motion: show static step indicator */
        @media (prefers-reduced-motion: reduce) {
          .step-number {
            animation: none;
            opacity: 1;
            font-size: 2rem;
          }
        }

        @supports not (scroll-timeline: --steps-scroll) {
          .step-number {
            opacity: 1;
            font-size: 2rem;
          }
        }
      `}</style>

      <section className="how-it-works-container">
        <div className="pin">
          <div className="step-number">1</div>
          <div className="step-content">
            <h2>Pick an amount</h2>
            <p>Minimum ₹25</p>
          </div>
        </div>

        <div className="step-spacer" style={{ height: '100vh' }} />

        <div className="pin">
          <div className="step-number">2</div>
          <div className="step-content">
            <h2>Checkout</h2>
            <p>Email only — we'll create your account</p>
          </div>
        </div>

        <div className="step-spacer" style={{ height: '100vh' }} />

        <div className="pin">
          <div className="step-number">3</div>
          <div className="step-content">
            <h2>Kitchen prepares meal</h2>
            <p>At a partner kitchen in your chosen city</p>
          </div>
        </div>

        <div className="step-spacer" style={{ height: '100vh' }} />

        <div className="pin">
          <div className="step-number">4</div>
          <div className="step-content">
            <h2>You get the photo</h2>
            <p>At the exact time the meal was served</p>
          </div>
        </div>
      </section>
    </>
  );
}
```

### Graceful Fallback Strategy

For browsers without scroll-timeline support:

```css
/* Option 1: Instant display (safest) */
@supports not (animation-timeline: scroll()) {
  .scroll-animated-element {
    opacity: 1;
    transform: none;
    filter: none;
  }
}

/* Option 2: Polyfill detection (if using a fallback library) */
@supports not (animation-timeline: view()) {
  /* Use a library like ScrollTrigger (GSAP) */
  .scroll-animated-element {
    /* library will handle animation */
  }
}

/* Option 3: Inline JS check */
if (!CSS.supports('animation-timeline: view()')) {
  // Load fallback library or disable animations
}
```

---

## Part 2: View Transitions API in Next.js 16

### What It Is

The View Transitions API animates between DOM states (SPA) or documents (cross-document). In Next.js App Router, it provides:

1. **Shared element morphing** — A thumbnail becomes a hero image smoothly
2. **Directional navigation** — Forward slides left, back slides right
3. **Suspense reveals** — Skeleton fades out, content fades in
4. **Same-route crossfades** — Switching tabs within a page

### Browser Support (Mid-2026)

| Browser | Version | Status | Notes |
|---------|---------|--------|-------|
| Chrome / Edge | 111+ | ✅ Full support | Mature implementation |
| Safari | 18.2+ | ✅ Full support | Recent addition |
| Firefox | 121+ | ✅ Full support | Behind flag; enabled in Nightly |

**Coverage: ~92% of users**. Graceful degradation: without support, navigation works normally (just no animation).

### Next.js Configuration

Enable in `next.config.ts`:

```typescript
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  experimental: {
    viewTransition: true,
  },
}

export default nextConfig
```

No additional packages needed. Next.js uses React 19's `<ViewTransition>` component.

### Copy-Paste Pattern: Shared Element Morphing (Donor Portal Receipts)

Morph a receipt thumbnail into full receipt detail:

```tsx
// app/(site)/components/receipt-card.tsx
'use client';

import { ViewTransition } from 'react';
import Link from 'next/link';
import Image from 'next/image';

export function ReceiptCard({ receipt }) {
  return (
    <Link href={`/receipts/${receipt.id}`}>
      <ViewTransition name={`receipt-${receipt.id}`}>
        <div className="receipt-thumbnail">
          <div className="receipt-number">{receipt.number}</div>
          <div className="receipt-date">{receipt.date}</div>
          <Image 
            src={receipt.photoUrl} 
            alt="Meal photo" 
            width={100} 
            height={100}
          />
        </div>
      </ViewTransition>
    </Link>
  );
}
```

```tsx
// app/(site)/receipts/[id]/page.tsx
'use client';

import { ViewTransition } from 'react';
import Image from 'next/image';

export default async function ReceiptDetailPage({ params }) {
  const { id } = await params;
  const receipt = await getReceipt(id);

  return (
    <>
      <style>{`
        /* Morph animation customization */
        ::view-transition-group(receipt-${receipt.id}) {
          animation-duration: 500ms;
          animation-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
        }

        /* Add blur during mid-flight for polish */
        ::view-transition-image-pair(receipt-${receipt.id}) {
          animation-name: morph-with-blur;
        }

        @keyframes morph-with-blur {
          50% {
            filter: blur(3px);
          }
        }

        @media (prefers-reduced-motion: reduce) {
          ::view-transition-group(*),
          ::view-transition-old(*),
          ::view-transition-new(*) {
            animation-duration: 0s !important;
          }
        }
      `}</style>

      <div className="receipt-detail">
        <ViewTransition name={`receipt-${receipt.id}`}>
          <article className="receipt-full">
            <h1>{receipt.number}</h1>
            <Image 
              src={receipt.photoUrl} 
              alt="Meal photo" 
              width={600} 
              height={400}
            />
            <div className="meal-details">
              <p><strong>Date:</strong> {receipt.date}</p>
              <p><strong>Time:</strong> {receipt.time}</p>
              <p><strong>Donor:</strong> {receipt.donorName}</p>
              <p><strong>Kitchen:</strong> {receipt.kitchenName}</p>
            </div>
          </article>
        </ViewTransition>
      </div>
    </>
  );
}
```

### Copy-Paste Pattern: Directional Navigation with Header Pin

Navigate between pages with forward/back slides; header stays fixed:

```tsx
// app/(site)/layout.tsx
'use client';

import { ViewTransition } from 'react';
import { Header } from '@/components/header';

export default function SiteLayout({ children }) {
  return (
    <>
      <style>{`
        /* Global transition timings */
        :root {
          --transition-duration-fast: 150ms;
          --transition-duration-slow: 400ms;
          --transition-easing: cubic-bezier(0.4, 0, 0.2, 1);
        }

        /* Header: pinned across transitions */
        header {
          view-transition-name: site-header;
          position: sticky;
          top: 0;
          z-index: 100;
          background: var(--color-paper);
          border-bottom: 1px solid var(--color-line);
        }

        ::view-transition-group(site-header) {
          animation: none !important;
        }

        ::view-transition-old(site-header) {
          display: none;
        }

        /* Forward navigation: old content slides left, new slides in from right */
        ::view-transition-old(.nav-forward) {
          animation-name: slide-out-left;
          animation-duration: var(--transition-duration-slow);
          animation-timing-function: var(--transition-easing);
        }

        ::view-transition-new(.nav-forward) {
          animation-name: slide-in-right;
          animation-duration: var(--transition-duration-slow);
          animation-timing-function: var(--transition-easing);
        }

        /* Back navigation: old content slides right, new slides in from left */
        ::view-transition-old(.nav-back) {
          animation-name: slide-out-right;
          animation-duration: var(--transition-duration-slow);
          animation-timing-function: var(--transition-easing);
        }

        ::view-transition-new(.nav-back) {
          animation-name: slide-in-left;
          animation-duration: var(--transition-duration-slow);
          animation-timing-function: var(--transition-easing);
        }

        @keyframes slide-out-left {
          to {
            transform: translateX(-60px);
            opacity: 0;
          }
        }

        @keyframes slide-in-right {
          from {
            transform: translateX(60px);
            opacity: 0;
          }
        }

        @keyframes slide-out-right {
          to {
            transform: translateX(60px);
            opacity: 0;
          }
        }

        @keyframes slide-in-left {
          from {
            transform: translateX(-60px);
            opacity: 0;
          }
        }

        /* Respect reduced motion */
        @media (prefers-reduced-motion: reduce) {
          ::view-transition-old(*),
          ::view-transition-new(*) {
            animation-duration: 0s !important;
          }
        }
      `}</style>

      <Header />
      <ViewTransition
        enter={{
          'nav-forward': 'nav-forward',
          'nav-back': 'nav-back',
          default: 'none',
        }}
        exit={{
          'nav-forward': 'nav-forward',
          'nav-back': 'nav-back',
          default: 'none',
        }}
        default="none"
      >
        {children}
      </ViewTransition>
    </>
  );
}
```

```tsx
// components/header.tsx
'use client';

import { Link } from 'next/link';

export function Header() {
  return (
    <header>
      <div className="container">
        <div className="logo">FeedSomeone</div>
        <nav>
          <Link href="/" transitionTypes={['nav-back']}>
            Home
          </Link>
          <Link href="/donate" transitionTypes={['nav-forward']}>
            Donate
          </Link>
          <Link href="/receipts" transitionTypes={['nav-forward']}>
            My Receipts
          </Link>
        </nav>
      </div>
    </header>
  );
}
```

### Copy-Paste Pattern: Suspense Reveal (Loading States)

Skeleton fades out, content fades in:

```tsx
// app/(site)/donate/page.tsx
'use client';

import { Suspense, ViewTransition } from 'react';
import { DonationForm } from '@/components/donation-form';
import { DonationFormSkeleton } from '@/components/donation-form-skeleton';

export default async function DonatePage() {
  return (
    <>
      <style>{`
        :root {
          --reveal-exit-duration: 150ms;
          --reveal-enter-duration: 210ms;
        }

        /* Skeleton exits with fade + slight blur */
        ::view-transition-old(.reveal-skeleton) {
          animation-name: fade-blur-out;
          animation-duration: var(--reveal-exit-duration);
          animation-timing-function: ease-out;
        }

        /* Content enters with fade + blur */
        ::view-transition-new(.reveal-content) {
          animation-name: fade-blur-in;
          animation-duration: var(--reveal-enter-duration);
          animation-timing-function: ease-in;
          animation-delay: var(--reveal-exit-duration);
        }

        @keyframes fade-blur-out {
          from {
            opacity: 1;
            filter: blur(0);
          }
          to {
            opacity: 0;
            filter: blur(3px);
          }
        }

        @keyframes fade-blur-in {
          from {
            opacity: 0;
            filter: blur(3px);
          }
          to {
            opacity: 1;
            filter: blur(0);
          }
        }

        @media (prefers-reduced-motion: reduce) {
          ::view-transition-old(.reveal-skeleton),
          ::view-transition-new(.reveal-content) {
            animation-duration: 0s !important;
            animation-delay: 0s !important;
          }
        }
      `}</style>

      <div className="donate-page">
        <h1>Donate</h1>

        <Suspense
          fallback={
            <ViewTransition exit="reveal-skeleton">
              <DonationFormSkeleton />
            </ViewTransition>
          }
        >
          <ViewTransition enter="reveal-content" default="none">
            <DonationForm />
          </ViewTransition>
        </Suspense>
      </div>
    </>
  );
}
```

---

## Part 3: Native vs. JavaScript Libraries

### When to Use Native

✅ **Use CSS `animation-timeline` + View Transitions API:**
- Page-level animations (scroll-reveal, sticky sections, navigation transitions)
- Accessibility-first: built-in `prefers-reduced-motion` support
- **Bundle size:** Zero additional JS (already in browser)
- **Performance:** GPU-accelerated, no main thread blocking
- **SEO/SSR:** Works in server-rendered pages without client-side JS
- Design system consistency: Can tie animations to global CSS tokens

❌ **Skip if you need:**
- Complex choreography (multiple staggered animations)
- Scrubbing/rewinding (draggable playheads)
- SVG morphing (shape interpolation)
- 3D transforms (perspective effects)

### When to Use Framer Motion / GSAP

✅ **Use Framer Motion:**
- React state-driven animations (`whileInView`, `animate` props)
- Interaction-driven (hover, drag, gesture)
- Complex UI transitions requiring stagger/delay
- **Bundle:** ~50 KB (acceptable for interactive apps)

✅ **Use GSAP ScrollTrigger:**
- Advanced scroll sequences with timelines
- Multiple simultaneous animations with precise control
- Marketing pages with creative storytelling
- **Bundle:** ~50 KB (industry standard for complex animations)

### FeedSomeone's Recommendation

**Primary:** Native CSS scroll-driven animations + View Transitions for the donor site landing page (scroll-reveal hero, How-It-Works sticky sections, directional navigation).

**Secondary:** Framer Motion for kitchen portal interactions (drag-to-sort meals, state-driven form feedback) if React state is already managing those, but avoid additional library for scroll.

---

## Part 4: Accessibility & `prefers-reduced-motion`

### The Rule

**Always test with `prefers-reduced-motion: reduce` enabled.** This respects users with vestibular disorders, migraines, ADHD, and motion sensitivity.

```css
/* Safest approach: disable all animations for reduced-motion users */
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

### Refined Approach: Keep Crossfades, Remove Motion

Crossfades (opacity) are safer than positional movement:

```css
@media (prefers-reduced-motion: reduce) {
  /* Disable positional movement */
  ::view-transition-old(*),
  ::view-transition-new(*) {
    animation: none !important;
  }

  /* But allow crossfades (opacity) */
  ::view-transition-group(*) {
    animation-duration: 300ms !important;
    animation-name: crossfade !important;
  }

  @keyframes crossfade {
    to {
      opacity: 1;
    }
  }
}
```

### Testing in DevTools

**Chrome/Edge:**
1. Open DevTools
2. Command Palette → "Rendering" → "Emulate CSS media feature prefers-reduced-motion"
3. Select "prefers-reduced-motion: reduce"

**Programmatic check:**

```typescript
const prefersReducedMotion = window.matchMedia(
  '(prefers-reduced-motion: reduce)'
).matches;

if (prefersReducedMotion) {
  // Disable JS-powered animations
}
```

---

## Part 5: Complete Working Example for FeedSomeone

A minimal, production-ready homepage combining scroll-reveal + View Transitions:

```tsx
// app/(site)/page.tsx
'use client';

import { ViewTransition } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Counter } from '@/components/counter';

export default function Home() {
  return (
    <>
      <style>{`
        :root {
          --color-paper: #FFFDF9;
          --color-ink: #211511;
          --color-clay: #C4471D;
          --color-marigold: #E8A33D;
          --color-line: #E5D9C6;
        }

        /* Scroll-driven animation: hero photo reveal */
        .hero-section {
          scroll-timeline: --hero-scroll;
          min-height: 200vh;
        }

        .hero-photo {
          animation: revealHero linear both;
          animation-timeline: view();
          animation-range: entry 0% cover 100%;
        }

        @keyframes revealHero {
          0% {
            opacity: 0;
            transform: translateY(40px) scale(0.9);
            filter: blur(8px);
          }
          100% {
            opacity: 1;
            transform: translateY(0) scale(1);
            filter: blur(0);
          }
        }

        /* Carousel: fade in as scroll progresses */
        .carousel-container {
          scroll-timeline: --carousel-scroll;
        }

        .carousel-image {
          animation: fadeInCarousel linear both;
          animation-timeline: view();
          animation-range: entry 20% cover 80%;
        }

        @keyframes fadeInCarousel {
          0% { opacity: 0; }
          100% { opacity: 1; }
        }

        /* Stats band: counter ticks up as scrolled into view */
        .stats-band {
          background: var(--color-ink);
          color: var(--color-paper);
          padding: 4rem 2rem;
        }

        .stat-item {
          animation: countUp linear both;
          animation-timeline: view();
          animation-range: entry 0% exit 100%;
        }

        @keyframes countUp {
          0% { opacity: 0.5; }
          100% { opacity: 1; }
        }

        /* Reduced motion: disable all animations */
        @media (prefers-reduced-motion: reduce) {
          .hero-photo,
          .carousel-image,
          .stat-item {
            animation: none !important;
            opacity: 1;
            transform: none;
            filter: none;
          }
        }

        /* Fallback for older browsers */
        @supports not (animation-timeline: view()) {
          .hero-photo,
          .carousel-image,
          .stat-item {
            opacity: 1;
            transform: none;
          }
        }
      `}</style>

      <main>
        {/* Counter pill */}
        <section style={{ padding: '2rem' }}>
          <div className="counter-pill">
            <Counter />
            <span> children fed</span>
          </div>
        </section>

        {/* CTA section */}
        <section style={{ padding: '4rem 2rem', textAlign: 'center' }}>
          <h1 style={{ fontSize: 'clamp(1.5rem, 5vw, 3rem)' }}>
            Feed one child right now.
          </h1>
          <p style={{ fontSize: '1.25rem', color: 'var(--color-marigold)' }}>
            ₹25 → one meal
          </p>
          <Link
            href="/donate"
            transitionTypes={['nav-forward']}
            style={{
              display: 'inline-block',
              marginTop: '2rem',
              padding: '0.75rem 1.5rem',
              background: 'var(--color-clay)',
              color: 'white',
              borderRadius: '0.25rem',
              textDecoration: 'none',
              fontSize: '1rem',
            }}
          >
            Feed one child · ₹25 →
          </Link>
        </section>

        {/* Hero photo: scrolls into view with reveal */}
        <section className="hero-section">
          <div className="hero-photo">
            <Image
              src="/images/seed/hero-photo.jpg"
              alt="Fed by Arun in Bangalore"
              width={800}
              height={600}
              priority
            />
            <div
              style={{
                marginTop: '1rem',
                fontSize: '0.875rem',
                color: 'var(--color-ink)',
                fontFamily: 'DM Mono, monospace',
              }}
            >
              Fed by Arun in Bangalore · 2025-01-14 · 14:23 IST
            </div>
          </div>
        </section>

        {/* 10-photo carousel */}
        <section style={{ padding: '4rem 2rem' }} className="carousel-container">
          <h2>Recent meals</h2>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
              gap: '1rem',
              marginTop: '2rem',
            }}
          >
            {[...Array(10)].map((_, i) => (
              <div key={i} className="carousel-image">
                <Image
                  src={`/images/seed/carousel-${i + 1}.jpg`}
                  alt={`Recent meal ${i + 1}`}
                  width={150}
                  height={150}
                />
              </div>
            ))}
          </div>
        </section>

        {/* How-It-Works (sticky sections) */}
        <section style={{ padding: '4rem 2rem' }}>
          <h2>How it works</h2>
          {/* Implement using sticky-pin pattern from earlier */}
        </section>

        {/* Stats band */}
        <section className="stats-band">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)' }}>
            <div className="stat-item">
              <div style={{ fontSize: '2rem', fontWeight: 900 }}>14,200</div>
              <div>Children fed</div>
            </div>
            <div className="stat-item">
              <div style={{ fontSize: '2rem', fontWeight: 900 }}>₹3.5M</div>
              <div>Raised</div>
            </div>
            <div className="stat-item">
              <div style={{ fontSize: '2rem', fontWeight: 900 }}>42</div>
              <div>Partner kitchens</div>
            </div>
          </div>
        </section>
      </main>
    </>
  );
}
```

---

## Key Takeaways

1. **Native CSS scroll-driven animations are production-ready in 2026.** Use `animation-timeline: scroll()` and `view()` instead of JavaScript for scroll-reveal and sticky effects.

2. **View Transitions API eliminates the need for complex route animation libraries.** Enable in `next.config.ts`, use React's `<ViewTransition>` component, and style with CSS pseudo-elements.

3. **Accessibility is built-in.** Both APIs respect `prefers-reduced-motion` natively; fallback gracefully with `@supports` and `@media` queries.

4. **Bundle savings are significant.** Zero additional libraries for page-level animations; rely on browser APIs that ship with the platform.

5. **Testing: Always check with reduced-motion enabled.** Chrome DevTools has built-in emulation; progressive enhancement is essential.

---

## Sources

- [Scroll-Driven Animation Timelines - CSS - MDN Web Docs](https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Scroll-driven_animations/Timelines)
- [animation-timeline CSS property - MDN Web Docs](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/animation-timeline)
- [View Transition API - Web APIs | MDN](https://developer.mozilla.org/en-US/docs/Web/API/View_Transition_API)
- [Using the View Transition API - MDN Web Docs](https://developer.mozilla.org/en-US/docs/Web/API/View_Transition_API/Using)
- [Designing view transitions | Next.js](https://nextjs.org/docs/app/guides/view-transitions)
- [Can I use animation-timeline: scroll()](https://caniuse.com/mdn-css_properties_animation-timeline_scroll)
- [prefers-reduced-motion CSS media feature - MDN Web Docs](https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion)
- [Mastering CSS Scroll Timeline: A Complete Guide - DEV Community](https://dev.to/softheartengineer/mastering-css-scroll-timeline-a-complete-guide-to-animation-on-scroll-in-2025-3g7p)
- [Cross-Document View Transitions: The Gotchas - CSS-Tricks](https://css-tricks.com/cross-document-view-transitions-part-1/)
- [View Transitions in Next.js App Router: Practical Guide - 72Technologies](https://www.72technologies.com/blog/view-transitions-nextjs-app-router-guide)
- [Web Animation in 2026: GSAP, Framer Motion, and When to Use the Platform - CODERCOPS](https://www.codercops.com/blog/web-animation-gsap-framer-motion-css-2026)
- [Using prefers-reduced-motion for Accessible Animation - OpenReplay Blog](https://blog.openreplay.com/prefers-reduced-motion-accessible-animation/)
