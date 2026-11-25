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

  const colorClass =
    clamped >= 70
      ? "stroke-emerald-400 text-emerald-400"
      : clamped >= 50
      ? "stroke-amber-400 text-amber-400"
      : "stroke-rose-400 text-rose-400";

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
          className="stroke-slate-800"
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
          className={`transition-all duration-700 ${colorClass.split(" ")[0]}`}
        />
      </svg>
      <span
        className={`absolute font-mono-code font-bold ${
          size >= 72 ? "text-xl" : "text-sm"
        } ${colorClass.split(" ")[1]}`}
      >
        {clamped}
      </span>
    </div>
  );
}
