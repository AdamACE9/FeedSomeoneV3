"use client";

export default function PrintButton() {
  return (
    <button
      onClick={() => window.print()}
      className="bg-clay text-paper rounded px-4 py-2 text-sm hover:bg-clay-deep min-h-[44px]"
    >
      Print / Save PDF
    </button>
  );
}
