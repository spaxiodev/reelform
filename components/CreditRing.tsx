import { creditRing } from "@/lib/pricing";

/**
 * A thin arc around whatever it wraps (normally the avatar), showing how much
 * of the account's credit allowance is left. It's an at-a-glance gauge, not a
 * readout: the exact number lives on the account page, and the title attribute
 * carries it for anyone who wants it here.
 */
export function CreditRing({
  credits,
  plan,
  size = 32,
  stroke = 2.5,
  children,
}: {
  credits: number;
  plan: string | null | undefined;
  size?: number;
  stroke?: number;
  children: React.ReactNode;
}) {
  const { fraction, allowance } = creditRing(plan, credits);
  const outer = size + stroke * 2 + 4;
  const r = (outer - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  // Empty is the state worth noticing, so the ring turns as it drains.
  const color = fraction <= 0.1 ? "var(--danger)" : fraction <= 0.3 ? "var(--coral)" : "var(--live)";

  return (
    <span
      className="relative inline-flex items-center justify-center shrink-0"
      style={{ width: outer, height: outer }}
      title={`${credits.toLocaleString()} credits left`}
    >
      <svg
        width={outer}
        height={outer}
        viewBox={`0 0 ${outer} ${outer}`}
        className="absolute inset-0 -rotate-90"
        aria-hidden
      >
        <circle
          cx={outer / 2}
          cy={outer / 2}
          r={r}
          fill="none"
          stroke="var(--line)"
          strokeWidth={stroke}
        />
        {fraction > 0 && (
          <circle
            cx={outer / 2}
            cy={outer / 2}
            r={r}
            fill="none"
            stroke={color}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${circumference * fraction} ${circumference}`}
          />
        )}
      </svg>
      {children}
      <span className="sr-only">
        {credits.toLocaleString()} of {allowance.toLocaleString()} credits remaining
      </span>
    </span>
  );
}
