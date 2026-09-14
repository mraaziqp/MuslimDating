/**
 * Minimal, dependency-free SVG/HTML charts for the admin overview.
 * Single-series magnitude charts: one hue (reference palette slot 1), thin
 * marks with 4px rounded data-ends on the baseline, recessive grid, hover
 * tooltips, and a data table for accessibility.
 */
import { useState, type CSSProperties } from "react";
import { format, parseISO } from "date-fns";
import { useElementWidth } from "../../hooks/useElementWidth";

const VIZ_VARS = {
  "--viz-series": "#2a78d6",
  "--viz-series-hover": "#1c5cab",
  "--viz-grid": "#e1e0d9",
  "--viz-axis": "#c3c2b7",
  "--viz-muted": "#898781",
  "--viz-track": "#f0efec",
} as CSSProperties;

export interface Datum {
  label: string;
  value: number;
}

function axisScale(maxValue: number): { max: number; ticks: number[] } {
  const raw = Math.max(maxValue, 1) / 4;
  const exponent = 10 ** Math.floor(Math.log10(raw));
  const fraction = raw / exponent;
  const nice = (fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10) * exponent;
  const step = Math.max(1, Math.ceil(nice));
  return { max: step * 4, ticks: [0, step, step * 2, step * 3, step * 4] };
}

/** Bar with rounded top corners and a square base sitting on the baseline. */
function columnPath(x: number, y: number, w: number, h: number): string {
  if (h <= 0) return "";
  const r = Math.min(4, w / 2, h);
  return `M${x},${y + h} V${y + r} Q${x},${y} ${x + r},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + r} V${y + h} Z`;
}

function DataTable({ data, valueLabel }: { data: Datum[]; valueLabel: string }) {
  return (
    <details className="mt-2 text-xs text-slate-500">
      <summary className="cursor-pointer select-none hover:text-slate-700">Show data table</summary>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-slate-100">
              <th className="py-1 font-medium">Label</th>
              <th className="py-1 text-right font-medium">{valueLabel}</th>
            </tr>
          </thead>
          <tbody>
            {data.map((d) => (
              <tr key={d.label} className="border-b border-slate-50">
                <td className="py-1">{d.label}</td>
                <td className="py-1 text-right tabular-nums">{d.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

export function ColumnChart({ data, valueLabel, height = 200 }: { data: Datum[]; valueLabel: string; height?: number }) {
  const { ref, width } = useElementWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const pad = { top: 12, right: 4, bottom: 26, left: 30 };
  const innerW = Math.max(0, width - pad.left - pad.right);
  const innerH = height - pad.top - pad.bottom;
  const { max, ticks } = axisScale(Math.max(...data.map((d) => d.value), 0));
  const band = data.length > 0 ? innerW / data.length : 0;
  const barW = Math.max(2, Math.min(24, band - 6));
  const y = (v: number) => pad.top + innerH - (v / max) * innerH;
  const hovered = hover !== null ? data[hover] : undefined;
  const hoverX = hover !== null ? pad.left + band * hover + band / 2 : 0;

  return (
    <div style={VIZ_VARS}>
      <div ref={ref} className="relative w-full">
        <svg width={width} height={height} role="img" aria-label={`${valueLabel} column chart`} className="block">
          {ticks.map((tick) => (
            <g key={tick}>
              <line
                x1={pad.left}
                x2={width - pad.right}
                y1={y(tick)}
                y2={y(tick)}
                stroke={tick === 0 ? "var(--viz-axis)" : "var(--viz-grid)"}
                strokeWidth={1}
              />
              <text x={pad.left - 6} y={y(tick)} dy="0.32em" textAnchor="end" fontSize={10} fill="var(--viz-muted)" className="tabular-nums">
                {tick}
              </text>
            </g>
          ))}
          {data.map((d, i) => {
            const x = pad.left + band * i + (band - barW) / 2;
            const top = y(d.value);
            const showLabel = i % 2 === (data.length - 1) % 2;
            return (
              <g key={d.label}>
                <path d={columnPath(x, top, barW, pad.top + innerH - top)} fill={hover === i ? "var(--viz-series-hover)" : "var(--viz-series)"} />
                {showLabel && (
                  <text x={x + barW / 2} y={height - 8} textAnchor="middle" fontSize={10} fill="var(--viz-muted)">
                    {d.label}
                  </text>
                )}
                <rect
                  x={pad.left + band * i}
                  y={pad.top}
                  width={band}
                  height={innerH}
                  fill="transparent"
                  onMouseEnter={() => setHover(i)}
                  onMouseLeave={() => setHover(null)}
                />
              </g>
            );
          })}
        </svg>
        {hovered && (
          <div
            className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-md border border-slate-200 bg-white px-2 py-1 text-xs whitespace-nowrap shadow-md"
            style={{ left: hoverX, top: y(hovered.value) - 6 }}
          >
            <span className="text-slate-500">{hovered.label}</span>{" "}
            <span className="font-semibold text-slate-900 tabular-nums">
              {hovered.value} {valueLabel.toLowerCase()}
            </span>
          </div>
        )}
      </div>
      <DataTable data={data} valueLabel={valueLabel} />
    </div>
  );
}

export function BarList({ data, valueLabel }: { data: Datum[]; valueLabel: string }) {
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <div style={VIZ_VARS}>
      <ul className="space-y-2.5">
        {data.map((d) => (
          <li key={d.label} className="group relative grid grid-cols-[minmax(0,9rem)_1fr_2.5rem] items-center gap-3 text-sm">
            <span className="truncate text-slate-600">{d.label}</span>
            <span className="relative h-2.5 rounded-r bg-[var(--viz-track)]">
              <span
                className="absolute inset-y-0 left-0 rounded-r-[4px] bg-[var(--viz-series)] transition-colors group-hover:bg-[var(--viz-series-hover)]"
                style={{ width: `${d.value === 0 ? 0 : Math.max(1.5, (d.value / max) * 100)}%` }}
              />
            </span>
            <span className="text-right font-semibold text-slate-900 tabular-nums">{d.value}</span>
            <span className="pointer-events-none absolute -top-7 left-36 z-10 hidden rounded-md border border-slate-200 bg-white px-2 py-1 text-xs whitespace-nowrap shadow-md group-hover:block">
              {d.label}: <strong className="tabular-nums">{d.value}</strong> {valueLabel.toLowerCase()}
            </span>
          </li>
        ))}
      </ul>
      <DataTable data={data} valueLabel={valueLabel} />
    </div>
  );
}

export function shortDate(isoDate: string): string {
  return format(parseISO(isoDate), "d MMM");
}
