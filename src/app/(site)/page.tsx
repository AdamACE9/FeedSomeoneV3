export default function HomePage() {
  return (
    <main
      style={{
        minHeight: "100dvh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "1rem",
        padding: "2rem",
        textAlign: "center",
      }}
    >
      <h1
        style={{
          fontFamily: "var(--font-display)",
          fontSize: "clamp(2.5rem, 8vw, 5rem)",
          fontWeight: 900,
          color: "var(--color-clay)",
          lineHeight: 1,
        }}
      >
        FeedSomeone
      </h1>
      <p className="timestamp" style={{ color: "var(--color-ink)", opacity: 0.6 }}>
        stage 3.0 scaffold — landing arrives in 3.4
      </p>
    </main>
  );
}
