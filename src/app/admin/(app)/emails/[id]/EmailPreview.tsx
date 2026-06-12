"use client";

export default function EmailPreview({ html }: { html: string }) {
  return (
    <iframe
      srcDoc={html}
      sandbox="allow-same-origin"
      title="Email preview"
      className="w-full border border-line rounded"
      style={{ height: "600px" }}
    />
  );
}
