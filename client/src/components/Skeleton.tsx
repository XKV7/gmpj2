export function MessageSkeleton({ count = 6 }: { count?: number }) {
  const widths = [72, 46, 88, 58, 34, 66, 80, 40];
  return (
    <div className="skeleton-list" aria-hidden>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="skeleton-msg">
          <div className="sk sk-circle" />
          <div className="grow">
            <div className="sk sk-line" style={{ width: 90 + (i % 3) * 24 }} />
            <div className="sk sk-line" style={{ width: `${widths[i % widths.length]}%` }} />
            {i % 3 === 1 && <div className="sk sk-line" style={{ width: `${widths[(i + 3) % widths.length]! / 1.6}%` }} />}
          </div>
        </div>
      ))}
    </div>
  );
}

export function ListSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="skeleton-list compact" aria-hidden>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="skeleton-row">
          <div className="sk sk-circle small" />
          <div className="grow">
            <div className="sk sk-line" style={{ width: `${50 + ((i * 17) % 40)}%` }} />
            <div className="sk sk-line thin" style={{ width: `${30 + ((i * 23) % 50)}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}
