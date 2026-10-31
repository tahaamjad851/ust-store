"use client";

// Last resort: shown when even the page shell cannot be built (for example the database is unreachable
// while the header, footer and menus are being loaded). It replaces the root layout, so it brings its own <html>.
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", margin: 0, padding: "4rem 1rem", textAlign: "center" }}>
        <div role="alert">
          <h1 style={{ fontSize: "1.5rem", margin: "0 0 0.5rem" }}>We couldn&apos;t load this page</h1>
          <p style={{ color: "#555", margin: "0 0 1.5rem" }}>Something went wrong on our side. Please try again in a moment.</p>
          <button
            type="button"
            onClick={reset}
            style={{ minHeight: "2.75rem", padding: "0 1.25rem", borderRadius: "0.5rem", border: 0, background: "#14532d", color: "#fff", fontSize: "1rem" }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
