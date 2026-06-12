import { currencyForCountry, isCurrency, type Currency } from "@/lib/money";

/**
 * Currency auto-detection — NO PICKER, ever (locked rule).
 * Server: best-effort country headers (CDN/proxy-dependent).
 * Client: browser timezone hint sent with checkout (more reliable than IP on
 * Firebase App Hosting, and zero external calls).
 * Fallback chain: header country → tz hint → GEO_FALLBACK_CURRENCY (USD).
 */

const COUNTRY_HEADERS = ["x-country", "cf-ipcountry", "x-vercel-ip-country", "x-appengine-country", "x-client-geo-country"];

export function countryFromHeaders(h: Headers): string | null {
  for (const name of COUNTRY_HEADERS) {
    const v = h.get(name);
    if (v && v.length === 2 && v !== "XX" && v !== "T1") return v.toUpperCase();
  }
  return null;
}

export function tzCurrencyHint(tz: string | null | undefined): Currency | null {
  if (!tz) return null;
  if (tz === "Asia/Kolkata" || tz === "Asia/Calcutta") return "INR";
  if (tz === "Asia/Dubai") return "AED";
  return null;
}

export function resolveCurrency(headerCountry: string | null, clientTz?: string | null): Currency {
  const fromHeader = currencyForCountry(headerCountry);
  if (fromHeader) return fromHeader;
  const fromTz = tzCurrencyHint(clientTz);
  if (fromTz) return fromTz;
  const fb = process.env.GEO_FALLBACK_CURRENCY;
  return isCurrency(fb) ? fb : "USD";
}
