// The app icon (public/favicon.svg), reused here so the artwork lives in a single file.
// It is decorative: the text next to it already names the app.
export function Logo({ size = 40 }: { size?: number }) {
  return <img src="/favicon.svg" alt="" width={size} height={size} className="shrink-0" />;
}
