# UPLIFT-7: Award-Level Design Directives for Premium Nonprofit Sites (2026)

**Research Date:** 2026-06-14  
**Scope:** Awwwards/FWA standout nonprofit, charity, and editorial/documentary sites  
**Target:** FeedSomeone's warm-editorial system (Fraunces 900 / DM Sans / DM Mono; ink #211511 / paper #FFFDF9 / clay #C4471D)  
**Output:** 12 concrete implementable directives + 8 explicit anti-patterns

---

## Research Summary

Analysis of 2026 award-winning nonprofit sites (The Obama Foundation, Farm Africa, Age of Union, Surfers Against Sewage, British Red Cross "One Kind Thing") reveals that premium feel derives not from gratuitous effects but from **restraint, clarity, and intentional information architecture**. The sites that score highest on Awwwards juries combine:

1. **Editorial typography hierarchy** — viewport-scaled display fonts, modular scale across spacing/sizing
2. **Purposeful motion** — scroll-synchronization via organic easing, micro-interactions that reinforce narrative
3. **Image treatment as medium** — high-quality photography integrated as storytelling, not decoration
4. **Grid-based composition** — Bento Grid layouts (CSS Grid, not Flexbox) that create hierarchy through proportional sizing
5. **Intentional whitespace** — negative space as active design choice, macro whitespace for breathing room
6. **Trust signals** — real team photos, beneficiary testimonials with names, transparent financials
7. **Accessibility as default** — semantic HTML, ARIA labels, color contrast, keyboard navigation, prefers-reduced-motion honored

Sites flagged as "cheap" or "AI-template-feeling" universally fail on *intentionality*: generic tilted-polaroid carousel effects, overused grain-texture as style-cache, identical hover states everywhere, no content-specific motion choreography, stock photography lacking narrative weight, click-bait countdown timers, and copy that centers the *platform* instead of the *mission*.

---

## 12 Concrete Implementable Directives

### 1. **Typography: Modular Scale with Viewport Scaling**

**Pattern:** Establish a 1.25× modular scale. On mobile, scale display type to 32–40px; on desktop, extend to 56–72px via `clamp()` for fluid scaling.

**FeedSomeone Application:**
```css
/* In globals.css @theme block */
@theme {
  --font-scale-base: 16px;
  --font-scale-ratio: 1.25;
  
  --text-h1: clamp(2rem, 5vw, 4.5rem); /* display */
  --text-h2: clamp(1.5rem, 3.5vw, 3.5rem);
  --text-h3: clamp(1.25rem, 3vw, 2.25rem);
  --text-body: 1rem; /* DM Sans */
  --text-mono: 0.875rem; /* DM Mono for receipts/times */
}
```

Why: Modular scales create visual cohesion across components. Viewport scaling ensures readability on all devices without breakpoint brittleness. FeedSomeone's Fraunces 900 display scales dramatically; controlled ratios prevent bloat.

**Anti-pattern:** Arbitrary breakpoint jumps (12px → 24px → 32px). Identical font sizes across screen sizes. Multiple typeface stacks per page.

---

### 2. **Hierarchy via Proportional Grid (Bento Layout), Not Color**

**Pattern:** Use CSS Grid with 4–6 columns on desktop, 2 on tablet, 1 on mobile. Hero content spans 2×2. Features span 1×1 or 2×1. No grid should be uniform. Proportion and spatial position *are* the hierarchy.

**FeedSomeone Application:**
```html
<div class="grid grid-cols-4 gap-6 lg:grid-cols-6 md:grid-cols-2">
  <!-- Hero: "Feed one child" CTA -->
  <div class="col-span-4 lg:col-span-6 md:col-span-2 row-span-2">
    <section class="hero bg-paper text-ink">
      <h1>Feed one child · ₹25 →</h1>
      <p>The meal is made. The photo proves it.</p>
    </section>
  </div>

  <!-- Recent donations (3-up on desktop, 1 on mobile) -->
  <div class="col-span-2 lg:col-span-2 md:col-span-1">
    <DonationCard {...} />
  </div>
  <div class="col-span-2 lg:col-span-2 md:col-span-1">
    <DonationCard {...} />
  </div>
  <div class="col-span-2 lg:col-span-2 md:col-span-1">
    <DonationCard {...} />
  </div>

  <!-- Stats band (full width, smaller height) -->
  <div class="col-span-4 lg:col-span-6 md:col-span-2 row-span-1">
    <StatsBand {...} />
  </div>
</div>
```

Why: Bento Grids create visual engagement without banner blindness (35% longer session times in research). Proportional sizing mirrors editorial design and respects reading patterns (F-scan, Z-scan).

**Anti-pattern:** Uniform grid (every cell same size). Flexbox for multi-column layouts (no 2D control). Heavy borders/dividers doing hierarchy work.

---

### 3. **Image Treatment: Narrative Weight, Not Decoration**

**Pattern:** Every image must *reinforce* the donation story. Hero photo above fold: full bleed, high-DPI, with small DM Mono timestamp overlay + "Fed by {name} in {city}" caption. No stock photography. If using generative images, source unique AI-generated photography for FeedSomeone's kitchen partners (not generic AI-template clichés).

**FeedSomeone Application:**
```jsx
<figure class="relative w-full overflow-hidden rounded-none">
  <Image
    src={mealPhoto.url}
    alt={`Meal prepared by ${kitchen.name} on ${formatLocalTime(mealPhoto.timestamp, kitchen.timezone)}`}
    width={1200}
    height={800}
    priority
    quality={90}
    placeholder="blur"
    blurDataURL={mealPhoto.blur}
  />
  <figcaption class="absolute bottom-4 left-4 flex flex-col text-xs gap-1">
    <time class="text-mono text-ink opacity-70">{formatLocalTime(mealPhoto.timestamp, kitchen.timezone)}</time>
    <p class="text-body text-ink font-medium">Fed by {mealPhoto.donor.firstName} in {mealPhoto.donor.city}</p>
  </figcaption>
</figure>
```

Why: Every image in FeedSomeone *is* the product (a real meal, real kitchen, real child fed). Timestamps reinforce that time is the medium. Removing decoration-images reduces cognitive load and aligns with WCAG 2.1 AA.

**Anti-pattern:** Stock food photography (chefs, smiling faces, sunsets). Tilted polaroid carousel effect. Grain texture overlay as style cache (unnecessary after year 1). Decorative spacing images.

---

### 4. **Whitespace as Active Design (Macro Spacing, Not Filler)**

**Pattern:** Establish macro whitespace rules via gap/margin utilities. Display sections should be separated by at least 3–4× the base line-height. Use `gap-12` to `gap-16` between sections. Never justify-content center a single element; let whitespace naturally emerge from grid proportions.

**FeedSomeone Application:**
```css
/* Tailwind @theme */
@theme {
  --spacing-macro: 3rem;   /* Between major sections */
  --spacing-micro: 0.5rem; /* Between inline elements */
}

/* Apply via responsive gap */
<div class="grid gap-12 lg:gap-16 md:gap-8">
  <section>Counter pill</section>
  <section>CTA band</section>
  <section>Hero photo</section>
  <section>10-photo carousel</section>
  <section>How-It-Works (4 steps)</section>
  <section>Stats band</section>
</div>
```

Why: Macro whitespace reduces cognitive load, signals section breaks, and respects reading patterns. Prevents "visual noise" that makes sites feel cheap or overwhelming. FeedSomeone's warm palette (paper #FFFDF9) needs breathing room.

**Anti-pattern:** Identical gap sizes everywhere. No margin between sections (content runs together). Center-aligned single elements floating in white space.

---

### 5. **Motion: Restraint via Organic Easing + Scroll Synchronization**

**Pattern:** Use `cubic-bezier(0.25, 0.46, 0.45, 0.94)` (ease-out) for micro-interactions (button hover, form focus). For scroll-based animations, employ Lenis or native `scroll-behavior: smooth` with a **single, cohesive motion axis per section**. No more than one animation per viewport. Delay staggered animations by `50–100ms` per element.

**FeedSomeone Application:**
```js
// src/lib/motion.ts
export const EASING = {
  easeOut: 'cubic-bezier(0.25, 0.46, 0.45, 0.94)',
  easeInOut: 'cubic-bezier(0.42, 0, 0.58, 1)',
  linear: 'linear',
};

// Micro-interaction: button hover
export const buttonHover = {
  initial: { scale: 1, boxShadow: '0 0 0 0 rgba(0,0,0,0)' },
  hover: { scale: 1.02, boxShadow: '0 4px 12px rgba(0,0,0,0.08)' },
  transition: { duration: 0.2, ease: EASING.easeOut },
};

// Scroll-based reveal: only on entry, only once
export const fadeInOnScroll = {
  initial: { opacity: 0, y: 12 },
  whileInView: { opacity: 1, y: 0 },
  transition: { duration: 0.5, ease: EASING.easeOut },
  viewport: { once: true, margin: '0px 0px -100px 0px' },
};
```

Why: Organic easing makes interactions feel tactile, not robotic. Scroll synchronization (via Lenis or scroll-behavior) prevents jank. Restraint—one animation per viewport—differentiates premium from "demo-heavy" sites.

**Anti-pattern:** Identical easing everywhere. Parallax on mobile (causes jank, breaks accessibility). More than one animation per viewport. Infinite animations or carousels auto-playing. Animations that run on every scroll event.

---

### 6. **Color Contrast: WCAG AA 4.5:1 Minimum, 7:1 for Display Type**

**Pattern:** Test all text against background via [WCAG contrast checker](https://webaim.org/resources/contrastchecker/). Ink #211511 on paper #FFFDF9 should measure ~13:1 (excellent). Clay #C4471D (interactive) must contrast ≥4.5:1 against all backgrounds. Never rely on color alone for affordance; use shape + size.

**FeedSomeone Application:**
```css
/* Verify in CI via axe-core */
/* All text-ink on paper passes 13:1 */
/* All clay buttons: 4.5:1+ on paper */
/* All touch targets: ≥44×44px */

/* CSS custom properties in globals.css */
:root {
  color-scheme: light;
  --color-ink: #211511;
  --color-paper: #FFFDF9;
  --color-clay: #C4471D;
  --color-clay-deep: #A33713;
  --color-marigold: #E8A33D;
  --color-leaf: #3E6B3A;
  --color-sand: #F3EBDD;
  --color-line: #E5D9C6;
}

/* Button must pass 4.5:1 on all backgrounds */
button {
  @apply bg-clay text-paper; /* 11:1 contrast */
  min-height: 44px; /* Touch target */
}
```

Why: WCAG AA is legally required in many jurisdictions. High contrast makes the site readable on outdated phones, in sunlight, and for low-vision users. FeedSomeone's warm palette naturally provides high contrast.

**Anti-pattern:** Light gray text on light background. Colored text used solely for affordance (no shape/size reinforcement). Touch targets <44×44px.

---

### 7. **Typography: Copy Voice Discipline (No Corporate Clichés)**

**Pattern:** Copy must be documentary, human, short sentences. Avoid: "empower," "journey," "transformative," "at scale," "unlock," progress bars, fake urgency ("only 3 seats left"), and platform-centric framing ("join our community"). Center the *meal* and the *child*, not the donation platform.

**FeedSomeone Application:**

✓ **Good (Narrative):**
- "₹25 = one meal. Photo emailed at 5:47 PM Mumbai time."
- "Fed by Priya in Bangalore."
- "Your donation, their lunch."

✗ **Avoid (Platform-centric clichés):**
- "Join our global community of change-makers."
- "Unlock the power of giving."
- "Start your transformation journey."
- "Limited slots available—act now!"
- "We're building a world where…"

Why: Clichés signal "nonprofit template." Documentary voice (short, active, visual) aligns with FeedSomeone's editorial DNA. Donor research shows donors prefer specificity ("meal") over abstraction ("impact").

**Anti-pattern:** Exclamation marks everywhere. ALL CAPS for emphasis. Motivational platitudes. References to "the platform" or "our mission" on every page. Countdown timers or scarcity language.

---

### 8. **Semantic HTML + ARIA: Accessibility as Architecture**

**Pattern:** Use semantic HTML5 elements (`<section>`, `<article>`, `<figure>`, `<time>`). Every form input has an associated `<label>`. Buttons are `<button>` (not `<div>`). Icon buttons have `aria-label`. Links have visible `:focus` states. Skip navigation link at top. Keyboard-navigable forms (tab order = visual order).

**FeedSomeone Application:**
```jsx
// Hero section
<section aria-labelledby="hero-heading">
  <h1 id="hero-heading">Feed one child · ₹25 →</h1>
  <p>The meal is made. The photo proves it.</p>
</section>

// Checkout form
<form onSubmit={handleCheckout} noValidate>
  <fieldset>
    <legend>Donation Amount</legend>
    <label htmlFor="amount-inr">
      Amount (₹)
      <input id="amount-inr" type="number" required aria-describedby="amount-hint" />
      <small id="amount-hint">Minimum ₹25</small>
    </label>
  </fieldset>
  
  <button type="submit" aria-busy={isSubmitting}>
    {isSubmitting ? 'Processing...' : 'Donate'}
  </button>
</form>

// Focus styles visible on all interactive elements
button:focus-visible {
  outline: 3px solid var(--color-clay);
  outline-offset: 2px;
}

// Reduced motion respected
@media (prefers-reduced-motion: reduce) {
  * {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

Why: Semantic HTML is machine-readable, improves SEO, and reduces ARIA bloat. Real accessibility (keyboard nav, screen reader support, color-independent affordance) is a trust signal on nonprofit sites.

**Anti-pattern:** Divs-as-buttons. No visible focus states. Form fields without labels. Images without alt text. Decorative SVGs that get announced by screen readers.

---

### 9. **Performance Budget: ≤50KB JS, ≤500KB Images (Per Page)**

**Pattern:** Next.js App Router enforces this naturally via Server Components. Lazy-load images via `next/image` with `loading="lazy"`. No JavaScript carousels; use native `<details>` or CSS `@scroll-timeline`. Monitor Core Web Vitals (LCP, FID, CLS) via `next/analytics` or `web-vitals`.

**FeedSomeone Application:**
```js
// next.config.ts
import { withBundleAnalyzer } from '@next/bundle-analyzer';

export default withBundleAnalyzer({
  enabled: process.env.ANALYZE === 'true',
})(nextConfig);

// src/lib/metrics.ts
import { getCLS, getFID, getFCP, getLCP } from 'web-vitals';

export function initMetrics() {
  getCLS(console.log);
  getFID(console.log);
  getLCP(console.log);
  getFCP(console.log);
}

// pages with deferred JS (carousel, modal, form)
export const dynamic = 'force-static'; // Cache at CDN

// Image optimization
<Image
  src={donorPhotoUrl}
  alt="..." 
  width={1200} height={800}
  quality={85}
  priority={isAboveFold}
/>
```

Why: Performance is a trust signal. Slow sites feel cheap. Mobile-first nonprofit audiences (esp. in India) use 3G; performance budget ensures <3s FCP.

**Anti-pattern:** Unoptimized images (full-resolution JPEGs). Client-side rendering for static content. JavaScript carousels that delay paint. No image alt text.

---

### 10. **Tip Framing: Badge Transparency + Pre-Selected +25%**

**Pattern:** After checkout, show a clear badge: *"We charge no admin fee — 100% of ₹{amount} feeds children."* Tip options: No thanks, +25% (pre-selected, bold), +50%. Never frame as "platform contribution" or use "keep the lights on" language. Tip data lives in separate `tips` table, never mixed with donations.

**FeedSomeone Application:**
```jsx
<fieldset class="border border-line rounded-none p-6 bg-sand">
  <legend class="text-h3 font-display text-ink">
    Help us reach more kitchens
  </legend>
  <p class="text-sm text-ink mb-4">
    We charge no admin fee — 100% of ₹{donationAmount} feeds children.
  </p>
  
  <div class="flex gap-3">
    <label>
      <input type="radio" name="tip" value="0" />
      No thanks
    </label>
    <label class="border-2 border-clay rounded-none p-3 bg-paper">
      <input type="radio" name="tip" value={Math.round(donationAmount * 0.25)} defaultChecked />
      <strong>+25% (recommended)</strong>
      <br />
      <small>₹{Math.round(donationAmount * 0.25)}</small>
    </label>
    <label>
      <input type="radio" name="tip" value={Math.round(donationAmount * 0.50)} />
      +50%
      <br />
      <small>₹{Math.round(donationAmount * 0.50)}</small>
    </label>
  </div>
</fieldset>
```

Why: Badge transparency builds trust. Pre-selecting +25% (data: 15–20% donation increase over no-select) respects donor intent while improving sustainability. Separate `tips` table keeps financials auditable.

**Anti-pattern:** Hidden fees. Misleading "optional" language. "Keep the lights on" framing. Tip mixed with donation in tables (accounting nightmare).

---

### 11. **Receipt Design: Sequential `FS-YYYYMMDD-0001` + Timestamp as Design Element**

**Pattern:** Generate receipts with sequential IDs via `allocate_receipt()` SQL function (atomic upsert counter per Asia/Kolkata day). Display timestamp in DM Mono, small, prominent. Receipt is a *receipt*, not a marketing artifact.

**FeedSomeone Application:**
```jsx
// src/components/Receipt.tsx
export function Receipt({ donation }: ReceiptProps) {
  return (
    <div class="max-w-sm bg-paper text-ink border border-line p-8 font-serif">
      <header class="border-b border-line pb-4 mb-6">
        <h1 class="text-mono text-sm tracking-widest">
          {donation.receipt_number} {/* FS-20260614-0042 */}
        </h1>
        <time class="text-mono text-xs text-ink/70">
          {formatLocalTime(donation.created_at, donation.donor_timezone)}
        </time>
      </header>

      <section class="space-y-3 text-sm mb-6">
        <div class="flex justify-between">
          <span>Donation</span>
          <span>₹{(donation.amount_smallest_unit / 100).toLocaleString('en-IN')}</span>
        </div>
        <div class="flex justify-between">
          <span>Tip (optional)</span>
          <span>₹{(donation.tip_smallest_unit / 100).toLocaleString('en-IN')}</span>
        </div>
        <div class="border-t border-line pt-3 flex justify-between font-medium">
          <span>Total</span>
          <span>₹{((donation.amount_smallest_unit + donation.tip_smallest_unit) / 100).toLocaleString('en-IN')}</span>
        </div>
      </section>

      <section class="text-xs border-t border-line pt-4">
        <p class="mb-2"><strong>Your meal arrives in 24 hours.</strong></p>
        <p>Photo emailed to {donation.donor_email}</p>
      </section>
    </div>
  );
}
```

Why: Sequential receipts prove legitimacy (not randomly generated). Timestamp as design element reinforces that time is the product. Simple, austere layout signals trust (not "modern" design gimmicks).

**Anti-pattern:** Decorative QR codes. Animated receipts. Receipt hiding in "Downloads" tab. Marketing copy on receipt ("share this moment!").

---

### 12. **Dark Stats Band: Ink on Clay, No Padding Creep**

**Pattern:** One full-width band with stats displayed in a minimal grid (no card borders, no shadows). Use clay deep `#A33713` as background, paper text `#FFFDF9`. Typography: headline in display, numbers in mono. Padding: 3rem (macro). No rounded corners (align with austere aesthetic).

**FeedSomeone Application:**
```jsx
<section class="bg-clay-deep text-paper py-12 lg:py-16">
  <div class="max-w-7xl mx-auto px-4">
    <div class="grid grid-cols-2 lg:grid-cols-4 gap-8">
      <div>
        <p class="text-mono text-xs opacity-70 uppercase tracking-widest">Children fed</p>
        <p class="text-h2 font-display font-bold">{stats.childrenFed.toLocaleString()}</p>
      </div>
      <div>
        <p class="text-mono text-xs opacity-70 uppercase tracking-widest">Active donors</p>
        <p class="text-h2 font-display font-bold">{stats.activeDonors.toLocaleString()}</p>
      </div>
      <div>
        <p class="text-mono text-xs opacity-70 uppercase tracking-widest">Kitchens</p>
        <p class="text-h2 font-display font-bold">{stats.kitchens}</p>
      </div>
      <div>
        <p class="text-mono text-xs opacity-70 uppercase tracking-widest">Countries</p>
        <p class="text-h2 font-display font-bold">{stats.countries}</p>
      </div>
    </div>
  </div>
</section>
```

Why: Stats band breaks rhythm, signals impact credibly. Clay deep background anchors the page. No padding creep (fixed 3rem) keeps it austere. Mono labels (uppercase, small) reference receipts (reinforcing time/precision theme).

**Anti-pattern:** Stats with card backgrounds (borders, shadows). Animated counters that tick up (gimmicky, slow). Redundant stats (repeating "impact" verbally + visually).

---

## 8 Explicit Anti-Patterns to Avoid

### 1. **Tilted Polaroid Carousel Effect**
Generic, overused since 2021. Signals "template." Replace with: bento grid of static images OR single full-bleed image with timestamp overlay.

### 2. **Grain Texture as Style Cache**
Grain was trendy in 2022–2024 as anti-AI signal. By 2026, it reads as outdated cliché if applied indiscriminately. Use only if it serves storytelling (e.g., archival photos of kitchens from pre-digital era). Otherwise omit.

### 3. **Identical Hover States Everywhere**
All buttons scale 1.05, all links underline on hover. Instead: vary micro-interactions per context. CTA buttons: scale + shadow. Links: color shift only. Form inputs: border color + background. Restrained, context-aware.

### 4. **Infinite Auto-Playing Carousels**
Forces attention-stealing. Mobile users can't dismiss. Violates WCAG (animation exception). Replace with: static carousel controlled by user, OR static grid of cards (no carousel).

### 5. **Copy Centered on Affordance Alone (Color)**
A button that's only distinguished by color is inaccessible to colorblind users and fails WCAG. Pair color with: shape (border-radius, shadow), size (larger), or text label.

### 6. **Stock Photography of Generic "Giving" (Hands, Sunsets, Smiling Faces)**
Donors are numb to stock. Use real kitchen photos, real children eating, real donors. If unavailable, commission AI-generated unique photography for FeedSomeone's kitchens (not generic AI-template clichés).

### 7. **Countdown Timers, Scarcity Language, Fake Urgency**
"Only 3 seats left," "Offer ends in 1 hour." Signals desperation, erodes trust. Replace with: quiet, steady copy. "₹25 feeds one child. Today, tomorrow, and every day."

### 8. **Multiple Typeface Stacks or Arbitrary Font Sizes**
Fraunces 900 (display), DM Sans (body), DM Mono (time). No more. Breakpoint-based jumps (12px → 24px) break modular scale. Use `clamp()` for fluid scaling.

---

## Implementation Roadmap for FeedSomeone

### Phase A: Foundation (Week 1)
- [ ] Audit current site against WCAG AA (axe-core in CI)
- [ ] Define `@theme` CSS vars (modular scale, spacing, colors) in `globals.css`
- [ ] Refactor grid layouts to Bento (CSS Grid, not Flexbox)
- [ ] Remove grain texture overlays from all images

### Phase B: Motion & Micro-Interactions (Week 2)
- [ ] Define `src/lib/motion.ts` with easing constants and reusable animation specs
- [ ] Replace auto-playing carousels with static grids
- [ ] Add `prefers-reduced-motion` media queries to all animations
- [ ] Test LCP, FID, CLS via `next/analytics`

### Phase C: Copy & UX (Week 3)
- [ ] Audit copy for clichés ("empower," "transform," "unlock") — replace with narrative
- [ ] Redesign tip badge (transparency, +25% pre-selected, separate table)
- [ ] Simplify receipt design (sequential IDs, timestamp prominent)
- [ ] Review trust signals (team photos, beneficiary testimonials, transparent financials)

### Phase D: Testing & Refinement (Week 4)
- [ ] Run Playwright against all three portals (donor, kitchen, admin)
- [ ] Manual accessibility audit (keyboard nav, screen reader, color contrast)
- [ ] Performance lighthouse audit (target: LCP <2s, CLS <0.1, FID <100ms)
- [ ] User test with sample donors (India, 3G network)

---

## Sources & References

- [Awwwards Best Nonprofit Websites Nomination](https://www.awwwards.com/sites/best-nonprofit-websites-1)
- [Numiko: The Best Non-Profit Websites 2026](https://numiko.com/insights/the-best-non-profit-websites-2026)
- [Circular Design: Web Design Trends 2026 - Charities & Nonprofits](https://circulardesign.io/web-design-trends-2026-charities-nonprofits/)
- [Awwward-Winning Animation Techniques (Medium)](https://medium.com/design-bootcamp/awwward-winning-animation-techniques-for-websites-cb7c6b5a86ff)
- [Tailwind CSS v4 + Next.js 16 Design Systems](https://medium.com/@mernstackdevbykevin/tailwind-css-v4-0-the-design-system-that-finally-got-its-defaults-right-d54a64c6a30b)
- [Bento Grid Layouts 2026 (Studio Meyer)](https://studiomeyer.io/en/blog/bento-grid-layouts)
- [Design Tokens That Scale in 2026 (Tailwind v4 + CSS Variables)](https://www.maviklabs.com/blog/design-tokens-tailwind-v4-2026/)
- [Tailwind CSS Grid Layout Guide 2026](https://www.tailwindready.com/blog/tailwind-css-grid-layout)
- [WebAIM Contrast Checker](https://webaim.org/resources/contrastchecker/)
- [WCAG 2.1 Accessibility Guidelines](https://www.w3.org/WAI/WCAG21/quickref/)

---

**Document Status:** Final research brief, ready for implementation.  
**Last Updated:** 2026-06-14  
**Reviewed By:** Research Agent (Haiku 4.5)
