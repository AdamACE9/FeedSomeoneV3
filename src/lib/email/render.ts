/**
 * Baseline branded email HTML — table layout, inline CSS, no external assets
 * except the photo URLs themselves (signed, hosted — never base64; Gmail-safe).
 * Stage 3.7 may elevate these designs; the function signatures are the contract.
 * Motif everywhere: timestamps in mono. Time is the product.
 */

const C = {
  ink: "#211511", paper: "#FFFDF9", clay: "#C4471D", clayDeep: "#A33713",
  marigold: "#E8A33D", leaf: "#3E6B3A", sand: "#F3EBDD", line: "#E5D9C6",
};

const mono = `font-family:'DM Mono','Courier New',monospace;`;
const body = `font-family:'DM Sans',Helvetica,Arial,sans-serif;`;
const serif = `font-family:'Fraunces',Georgia,'Times New Roman',serif;`;

function shell(content: string, preheader: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;padding:0;background:${C.sand};">
<div style="display:none;max-height:0;overflow:hidden;">${preheader}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.sand};padding:24px 0;"><tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:${C.paper};border:1px solid ${C.line};">
<tr><td style="padding:28px 32px 20px;">
  <span style="${serif}font-weight:900;font-size:22px;color:${C.ink};">FeedSomeone</span>
  <span style="${mono}font-size:11px;color:${C.clay};letter-spacing:.08em;">&nbsp;&nbsp;·&nbsp;&nbsp;REAL MEALS, REAL MINUTES</span>
</td></tr>
<tr><td style="padding:0 32px 32px;${body}color:${C.ink};font-size:15px;line-height:1.6;">${content}</td></tr>
<tr><td style="padding:18px 32px;border-top:1px solid ${C.line};${body}font-size:12px;color:#8a7a6d;">
  We charge no admin fee — 100% of every donation feeds children.<br>
  FeedSomeone · feedsomeone.org · hello@feedsomeone.org
</td></tr>
</table></td></tr></table></body></html>`;
}

const tsChip = (label: string) =>
  `<div style="${mono}font-size:11px;letter-spacing:.04em;color:${C.ink};background:${C.sand};display:inline-block;padding:4px 8px;border:1px solid ${C.line};margin-top:8px;">${label}</div>`;

export const ONE_TO_TEN = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];
export const countWords = (n: number) => (n >= 0 && n <= 10 ? ONE_TO_TEN[n] : String(n));

/* ── receipt ─────────────────────────────────────────────────────────────── */
export function receiptEmail(p: {
  number: string; firstName: string | null; quantity: number; days: number;
  mealsFmt: string; tipFmt: string | null; totalFmt: string;
  dedication: { kind: "memory" | "honor"; name: string } | null;
  gift: { recipientName: string } | null;
  isRecurring?: boolean; cadence?: string | null;
}): { subject: string; html: string } {
  const childWord = p.quantity === 1 ? "child" : "children";
  const subject = `Receipt ${p.number} — you fed ${countWords(p.quantity)} ${childWord}`;
  const rows = [
    `<tr><td style="padding:6px 0;">Meals — feed ${p.quantity} ${childWord}${p.days > 1 ? ` × ${p.days} days` : ""}</td><td align="right" style="padding:6px 0;">${p.mealsFmt}</td></tr>`,
    p.tipFmt ? `<tr><td style="padding:6px 0;">Optional tip (runs the platform)</td><td align="right" style="padding:6px 0;">${p.tipFmt}</td></tr>` : "",
    `<tr><td style="padding:10px 0;border-top:1px solid ${C.line};font-weight:700;">Total</td><td align="right" style="padding:10px 0;border-top:1px solid ${C.line};font-weight:700;">${p.totalFmt}</td></tr>`,
  ].join("");
  const html = shell(
    `<h1 style="${serif}font-weight:900;font-size:26px;margin:0 0 6px;">You fed ${countWords(p.quantity)} ${childWord}.</h1>
     <p style="margin:0 0 18px;color:#5d5048;">${p.firstName ? `${p.firstName}, this` : "This"} is your receipt. The photo${p.quantity > 1 ? "s" : ""} of the actual meal${p.quantity > 1 ? "s" : ""} will land in this inbox at the exact minute ${p.quantity > 1 ? "they were" : "it was"} cooked and served.</p>
     ${p.isRecurring && p.cadence ? `<p style="margin:0 0 14px;"><span style="background:${C.sand};border:1px solid ${C.line};padding:3px 8px;${mono}font-size:11px;">RECURRING · ${p.cadence.toUpperCase()}</span></p>` : ""}
     ${p.days > 1 ? `<p style="margin:0 0 14px;color:${C.leaf};">Schedule: ${p.quantity / p.days} meal${p.quantity / p.days > 1 ? "s" : ""} a day for ${p.days} days — one email each day with that day's photos.</p>` : ""}
     ${p.dedication ? `<p style="margin:0 0 14px;font-style:italic;">In ${p.dedication.kind === "memory" ? "memory" : "honor"} of ${p.dedication.name}.</p>` : ""}
     ${p.gift ? `<p style="margin:0 0 14px;">This is a gift for <b>${p.gift.recipientName}</b> — they'll receive the photo email.</p>` : ""}
     <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;">${rows}</table>
     <p style="margin:16px 0 0;"><span style="background:#eef3ec;color:${C.leaf};border:1px solid #cfdccb;padding:6px 10px;font-size:13px;">We charge no admin fee — 100% of ${p.mealsFmt} feeds children.</span></p>
     ${tsChip(`RECEIPT ${p.number}`)}`,
    subject,
  );
  return { subject, html };
}

/* ── the photo email — the product ───────────────────────────────────────── */
export function photoEmail(p: {
  firstName: string | null;
  photos: Array<{ url: string; takenLabel: string; kitchenName: string; city: string; note: string | null }>;
  dayIndex: number; daysTotal: number; quantity: number;
  streakDays: number | null;
  dedication: { kind: "memory" | "honor"; name: string } | null;
  receiptNumber: string | null;
  firstTimeLabel: string;
}): { subject: string; html: string } {
  const subject = `${p.firstTimeLabel}. This meal just happened.`;
  const photoBlocks = p.photos
    .map(
      (ph) => `<div style="margin:0 0 22px;">
  <img src="${ph.url}" width="536" alt="A child eating the meal you paid for, ${ph.kitchenName}, ${ph.city}" style="width:100%;max-width:536px;display:block;border:1px solid ${C.line};">
  <div style="${mono}font-size:11px;letter-spacing:.04em;color:${C.ink};margin-top:6px;">${ph.takenLabel} · ${ph.kitchenName}, ${ph.city}</div>
  ${ph.note ? `<div style="font-size:13px;font-style:italic;color:#5d5048;margin-top:4px;">From the kitchen: “${ph.note}”</div>` : ""}
</div>`,
    )
    .join("");
  const html = shell(
    `${p.daysTotal > 1 ? `<p style="margin:0 0 10px;"><span style="${mono}font-size:11px;background:${C.sand};border:1px solid ${C.line};padding:3px 8px;">DAY ${p.dayIndex} OF ${p.daysTotal} · ${p.quantity} MEAL${p.quantity > 1 ? "S" : ""}</span></p>` : ""}
     <h1 style="${serif}font-weight:900;font-size:26px;margin:0 0 6px;">This is the meal you paid for.</h1>
     <p style="margin:0 0 18px;color:#5d5048;">${p.firstName ? `${p.firstName} — taken` : "Taken"} at the minute shown. Not a stock photo. Not a campaign. ${p.quantity === 1 ? "A child who ate because of you." : `${p.quantity} children who ate because of you.`}</p>
     ${p.dedication ? `<p style="margin:0 0 16px;font-style:italic;">In ${p.dedication.kind === "memory" ? "memory" : "honor"} of ${p.dedication.name}.</p>` : ""}
     ${photoBlocks}
     ${p.streakDays ? `<p style="margin:4px 0 14px;"><span style="background:#fdf3e2;border:1px solid ${C.marigold};color:#8a5a14;padding:6px 10px;font-size:13px;">🔥 ${p.streakDays}-day streak — a child has eaten every day you have.</span></p>` : ""}
     <p style="margin:8px 0 0;">Feed another: <a href="${process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"}/donate" style="color:${C.clay};font-weight:700;">feedsomeone.org/donate</a></p>
     ${p.receiptNumber ? tsChip(`RECEIPT ${p.receiptNumber}`) : ""}`,
    subject,
  );
  return { subject, html };
}

/* ── gift notice ─────────────────────────────────────────────────────────── */
export function giftNoticeEmail(p: { donorName: string; recipientName: string; message: string | null; quantity: number }): { subject: string; html: string } {
  const subject = `${p.donorName} fed ${p.quantity === 1 ? "a child" : `${p.quantity} children`} in your name`;
  const html = shell(
    `<h1 style="${serif}font-weight:900;font-size:26px;margin:0 0 6px;">Someone did something good in your name.</h1>
     <p style="margin:0 0 14px;">${p.recipientName}, <b>${p.donorName}</b> just paid for ${p.quantity === 1 ? "a hot meal for a child" : `hot meals for ${p.quantity} children`} at a partner kitchen — as a gift to you.</p>
     ${p.message ? `<p style="margin:0 0 14px;font-style:italic;border-left:3px solid ${C.marigold};padding-left:12px;">“${p.message}”</p>` : ""}
     <p style="margin:0;">When the meal is served, the photo — taken at that exact minute — will arrive in this inbox.</p>`,
    subject,
  );
  return { subject, html };
}

/* ── anniversary ─────────────────────────────────────────────────────────── */
export function anniversaryEmail(p: { firstName: string | null; photoUrl: string | null; takenLabel: string | null; totalMealsSince: number }): { subject: string; html: string } {
  const subject = "A year ago today, you fed a child.";
  const html = shell(
    `<h1 style="${serif}font-weight:900;font-size:26px;margin:0 0 6px;">A year ago today.</h1>
     <p style="margin:0 0 18px;">${p.firstName ? `${p.firstName}, a` : "A"} year ago today you fed a child for the first time. Here's the photo we sent you that day.</p>
     ${p.photoUrl ? `<img src="${p.photoUrl}" width="536" alt="Your first FeedSomeone photo" style="width:100%;max-width:536px;display:block;border:1px solid ${C.line};">${p.takenLabel ? `<div style="${mono}font-size:11px;margin-top:6px;">${p.takenLabel}</div>` : ""}` : ""}
     <p style="margin:18px 0 0;">Since then, your donations have fed <b>${p.totalMealsSince}</b> ${p.totalMealsSince === 1 ? "child" : "children"}. Same time next year?</p>`,
    subject,
  );
  return { subject, html };
}

/* ── failures + ops ──────────────────────────────────────────────────────── */
export function paymentFailedEmail(p: { firstName: string | null }): { subject: string; html: string } {
  const subject = "That donation didn't go through";
  const html = shell(
    `<h1 style="${serif}font-weight:900;font-size:24px;margin:0 0 6px;">It didn't go through.</h1>
     <p style="margin:0 0 14px;">${p.firstName ? `${p.firstName}, your` : "Your"} last donation didn't complete — cards do that sometimes. Nothing was charged.</p>
     <p style="margin:0;"><a href="${process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"}/donate" style="color:${C.clay};font-weight:700;">Try again — a child's lunch is ₹25 →</a></p>`,
    subject,
  );
  return { subject, html };
}

export function kitchenWelcomeEmail(p: { kitchenName: string; email: string; password: string; loginUrl: string }): { subject: string; html: string } {
  const subject = "Your FeedSomeone kitchen login";
  const html = shell(
    `<h1 style="${serif}font-weight:900;font-size:24px;margin:0 0 6px;">Welcome, ${p.kitchenName}.</h1>
     <p style="margin:0 0 14px;">Three steps, every meal: <b>cook → photograph → upload</b>. The moment you upload is the moment a donor's inbox learns a child ate.</p>
     <p style="margin:0 0 6px;">Login: <a href="${p.loginUrl}" style="color:${C.clay};">${p.loginUrl}</a></p>
     <p style="margin:0 0 6px;${mono}font-size:13px;">email: ${p.email}</p>
     <p style="margin:0 0 14px;${mono}font-size:13px;">password: ${p.password}</p>
     <p style="margin:0;color:#5d5048;">Big camera button. Tap it after you serve. That's the whole job.</p>`,
    subject,
  );
  return { subject, html };
}
