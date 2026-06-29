/**
 * Orbit brand marks — geometric, asset-free inline SVG (see design_handoff_premium_lyft).
 *
 * The brand is an *orbit*: a tilted ring (the path), a core (the topic) and a single Ember satellite
 * (the idea that rises). The satellite is the only coloured detail — the same role the accent plays
 * across the whole app.
 *
 * - `OrbitMark`  — the wordmark symbol (ring + core + Ember satellite). Ring/core use `currentColor`
 *   so the lockup inherits the surrounding ink; the satellite is always Ember.
 * - `OrbitMotif` — the faint background ornament (concentric tilted ellipses). Used only as a quiet
 *   backdrop (hero, cold-start, empty). When `animated`, a satellite slowly circles the core; the
 *   `.orbit-satellite` class disables its motion under prefers-reduced-motion.
 */

export function OrbitMark({
  size = 22,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      aria-hidden
      className={className}
    >
      <ellipse
        cx="20"
        cy="20"
        rx="17"
        ry="8"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.4"
        transform="rotate(-28 20 20)"
      />
      <circle cx="20" cy="20" r="4.5" fill="currentColor" />
      <circle cx="33.5" cy="12.6" r="3.4" className="fill-signal" />
    </svg>
  );
}

export function OrbitMotif({
  className,
  animated = false,
}: {
  className?: string;
  /** Add a slowly-orbiting Ember satellite + core (cold-start / empty). Off = quiet rings only. */
  animated?: boolean;
}) {
  return (
    <svg viewBox="0 0 360 360" aria-hidden className={className}>
      <ellipse
        cx="180"
        cy="180"
        rx="150"
        ry="66"
        fill="none"
        stroke="#e7decf"
        strokeWidth="1.5"
        transform="rotate(-28 180 180)"
      />
      <ellipse
        cx="180"
        cy="180"
        rx="104"
        ry="46"
        fill="none"
        stroke="#eee7da"
        strokeWidth="1.5"
        transform="rotate(-28 180 180)"
      />
      {animated && (
        <>
          <circle cx="180" cy="180" r="9" className="fill-ink/80" />
          <g className="orbit-satellite" style={{ transformOrigin: "180px 180px" }}>
            <circle cx="300" cy="114" r="7" className="fill-signal" />
          </g>
        </>
      )}
    </svg>
  );
}
