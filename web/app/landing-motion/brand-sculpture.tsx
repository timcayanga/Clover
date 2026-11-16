import type { CSSProperties } from "react";
import s from "./motion-landing.module.css";

/** The official Clover mark, layered in depth rather than redrawn. */
export function BrandSculpture({ small = false }: { small?: boolean }) {
  return (
    <div
      className={`${s.sculpture} ${small ? s.sculptureSmall : ""}`}
      aria-hidden="true"
    >
      <div className={s.sculptureSpin}>
        {Array.from({ length: 10 }, (_, i) => (
          <img
            key={i}
            src="/clover-mark.svg"
            alt=""
            width={320}
            height={320}
            className={s.markLayer}
            style={{ "--layer": i } as CSSProperties}
          />
        ))}
        <div className={s.markSheen} />
      </div>
    </div>
  );
}

export function SpendingSculpture({ values }: { values: readonly number[] }) {
  const colors = ["#fdba74", "#ddd6fe", "#bae6fd", "#94a3b8"];
  let offset = 0;
  const segments = values.map((value, i) => {
    const segment = { color: colors[i], value, offset };
    offset += value;
    return segment;
  });
  return (
    <div className={s.donutObject} aria-hidden="true">
      {Array.from({ length: 9 }, (_, layer) => (
        <svg
          key={layer}
          viewBox="0 0 320 320"
          style={{ "--layer": layer } as CSSProperties}
        >
          {segments.map((segment, i) => (
            <circle
              key={i}
              cx="160"
              cy="160"
              r="111"
              fill="none"
              stroke={segment.color}
              strokeWidth="61"
              pathLength="100"
              strokeDasharray={`${segment.value - 1.1} ${101.1 - segment.value}`}
              strokeDashoffset={-segment.offset}
              transform="rotate(-90 160 160)"
            />
          ))}
        </svg>
      ))}
    </div>
  );
}
