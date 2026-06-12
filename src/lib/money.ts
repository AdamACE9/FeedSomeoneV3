/**
 * Money — integer smallest units ONLY (paise / cents / fils). Never floats in storage.
 *
 * Canonical meal value: 1 child = ₹25 = 2500 paise.
 * Fixed FX (founder-locked): 1 USD = 83 INR · 1 AED = 22.6 INR.
 * Local per-child price rounds UP to the next whole smallest unit — the sub-1%
 * round-up stays in the meals pool (never platform revenue).
 *
 * amount_inr on donations = quantity × 2500 exactly (meal accounting is canonical-INR).
 * Tips convert local→INR at the fixed rate, rounded half-up.
 */

export type Currency = "INR" | "USD" | "AED";

export const PRICE_INR_PAISE = 2500;
export const FX_INR: Record<Currency, number> = { INR: 1, USD: 83, AED: 22.6 };

/** Stripe-style network minimums make 1 child too small in USD/AED (plan §11 R1). */
export const MIN_QUANTITY: Record<Currency, number> = { INR: 1, USD: 2, AED: 2 };

export const TIP_PERCENTS = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50] as const;
export const DEFAULT_TIP_PERCENT = 25;

/** Smallest-unit price of ONE child in the given currency (2500 paise → 31¢ → 111 fils). */
export function perChildLocal(currency: Currency): number {
  if (currency === "INR") return PRICE_INR_PAISE;
  return Math.ceil(PRICE_INR_PAISE / FX_INR[currency]);
}

export function mealsAmountLocal(quantity: number, currency: Currency): number {
  return perChildLocal(currency) * quantity;
}

/** Canonical INR meal value — what the donation feeds, independent of FX rounding. */
export function mealsAmountInr(quantity: number): number {
  return PRICE_INR_PAISE * quantity;
}

export function tipAmountLocal(mealsLocal: number, percent: number): number {
  return Math.round((mealsLocal * percent) / 100);
}

export function localToInr(amountLocal: number, currency: Currency): number {
  return Math.round(amountLocal * FX_INR[currency]);
}

const LOCALE: Record<Currency, string> = { INR: "en-IN", USD: "en-US", AED: "en-AE" };

/** "₹25" / "$0.62" / "AED 2.22" — trims trailing .00 for INR whole rupees. */
export function formatMoney(amountSmallest: number, currency: Currency): string {
  const major = amountSmallest / 100;
  const f = new Intl.NumberFormat(LOCALE[currency], {
    style: "currency",
    currency,
    minimumFractionDigits: Number.isInteger(major) && currency === "INR" ? 0 : 2,
    maximumFractionDigits: 2,
  });
  return f.format(major);
}

export function isCurrency(x: string | null | undefined): x is Currency {
  return x === "INR" || x === "USD" || x === "AED";
}

export function currencyForCountry(iso2: string | null | undefined): Currency | null {
  if (!iso2) return null;
  const c = iso2.toUpperCase();
  if (c === "IN") return "INR";
  if (c === "AE") return "AED";
  if (c === "US") return "USD";
  return null;
}
