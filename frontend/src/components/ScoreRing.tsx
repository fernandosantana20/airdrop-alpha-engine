"use client";

interface ScoreRingProps {
  score: number;
  size?: number;
  strokeWidth?: number;
}

export function ScoreRing({ score, size = 64, strokeWidth = 5 }: ScoreRingProps) {
  const clamped = Math.max(0, Math.min(100, score));
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (clamped / 100) * circumference;

  const strokeClass =
    clamped >= 70
      ? "stroke-emerald-600 dark:stroke-emerald-400"
      : clamped >= 50
      ? "stroke-amber-600 dark:stroke-amber-400"
      : "stroke-rose-600 dark:stroke-rose-400";

  const textClass =
    clamped >= 70
      ? "text-emerald-600 dark:text-emerald-400"
      : clamped >= 50
      ? "text-amber-600 dark:text-amber-400"
      : "text-rose-600 dark:text-rose-400";

  return (
    <div
      className="relative inline-flex items-center justify-center shrink-0"
      style={{ width: size, height: size }}
    >
      <svg className="-rotate-90" width={size} height={size}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={strokeWidth}
          className="stroke-track"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className={`transition-all duration-700 ${strokeClass}`}
        />
      </svg>
      <span
        className={`absolute font-mono-code font-bold ${
          size >= 72 ? "text-xl" : "text-sm"
        } ${textClass}`}
      >
        {clamped}
      </span>
    </div>
  );
}
