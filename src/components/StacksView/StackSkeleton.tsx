import "./StackSkeleton.css";

function SkeletonRow({ widths }: { widths: [string, string, string] }) {
  return (
    <div className="ssk-row" aria-hidden="true">
      <div className="ssk-toggle" />
      <div className="ssk-cell ssk-cell--name">
        <div className="ssk-shimmer" style={{ width: widths[0] }} />
      </div>
      <div className="ssk-cell ssk-cell--services">
        <div className="ssk-shimmer" style={{ width: widths[1] }} />
      </div>
      <div className="ssk-cell ssk-cell--stats">
        <div className="ssk-shimmer" style={{ width: widths[2] }} />
      </div>
      <div className="ssk-cell ssk-cell--actions">
        <div className="ssk-shimmer ssk-btn" />
        <div className="ssk-shimmer ssk-btn" />
        <div className="ssk-shimmer ssk-icon" />
        <div className="ssk-shimmer ssk-icon" />
        <div className="ssk-shimmer ssk-icon" />
      </div>
    </div>
  );
}

export function StackSkeleton() {
  return (
    <div className="ssk-list" aria-label="Loading stacks…">
      <SkeletonRow widths={["9rem", "4rem", "14rem"]} />
      <SkeletonRow widths={["7rem", "5rem", "10rem"]} />
      <SkeletonRow widths={["11rem", "3rem", "12rem"]} />
    </div>
  );
}
