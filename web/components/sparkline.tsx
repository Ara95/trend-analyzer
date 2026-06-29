/**
 * Tiny inline-SVG data-viz used across the premium surfaces (trend brief momentum graph, and any
 * future per-video tempo line). Both take a raw numeric series and normalize it to the viewBox — so
 * callers pass real data, never pre-baked coordinates. Render nothing for a degenerate series
 * (< 2 points), which keeps the "hide when there's no real data" contract intact.
 *
 * stroke/area both use the Ember accent (var(--signal)); area fill sits at 0.08 opacity per the
 * design tokens.
 */

function toPoints(series: number[], width: number, height: number, pad = 2): string {
  const n = series.length;
  const min = Math.min(...series);
  const max = Math.max(...series);
  const span = max - min || 1;
  const innerW = width - pad * 2;
  const innerH = height - pad * 2;
  return series
    .map((v, i) => {
      const x = pad + (n === 1 ? innerW / 2 : (i / (n - 1)) * innerW);
      // Invert: higher value → higher on screen (smaller y).
      const y = pad + innerH - ((v - min) / span) * innerH;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");
}

/** A plain trend line. */
export function Sparkline({
  series,
  width = 52,
  height = 18,
  strokeWidth = 2,
  className,
}: {
  series: number[];
  width?: number;
  height?: number;
  strokeWidth?: number;
  className?: string;
}) {
  if (series.length < 2) return null;
  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      fill="none"
      aria-hidden
      className={className}
    >
      <polyline
        points={toPoints(series, width, height)}
        stroke="var(--signal)"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** A filled area chart with a terminal dot — the trend-brief momentum graph. */
export function AreaSparkline({
  series,
  width = 150,
  height = 46,
  className,
}: {
  series: number[];
  width?: number;
  height?: number;
  className?: string;
}) {
  if (series.length < 2) return null;
  const pad = 3;
  const line = toPoints(series, width, height, pad);
  const coords = line.split(" ");
  const last = coords[coords.length - 1].split(",");
  // Close the polygon down to the baseline for the area fill.
  const area = `${line} ${width - pad},${height} ${pad},${height}`;
  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      aria-hidden
      className={className}
    >
      <polygon points={area} fill="var(--signal)" fillOpacity="0.08" />
      <polyline
        points={line}
        fill="none"
        stroke="var(--signal)"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx={last[0]} cy={last[1]} r="3.5" fill="var(--signal)" stroke="#fff" strokeWidth="2" />
    </svg>
  );
}
