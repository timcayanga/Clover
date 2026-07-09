type CloverLoadingMarkProps = {
  className?: string;
};

const SPLASH_LEAVES = [
  {
    src: "/assets/loading/clover-top-left.svg",
    className: "clover-loading-screen__leaf clover-loading-screen__leaf--1",
  },
  {
    src: "/assets/loading/clover-top-right.svg",
    className: "clover-loading-screen__leaf clover-loading-screen__leaf--2",
  },
  {
    src: "/assets/loading/clover-bottom-right.svg",
    className: "clover-loading-screen__leaf clover-loading-screen__leaf--3",
  },
  {
    src: "/assets/loading/clover-bottom-left.svg",
    className: "clover-loading-screen__leaf clover-loading-screen__leaf--4",
  },
] as const;

export function CloverLoadingMark({ className }: CloverLoadingMarkProps) {
  return (
    <div className={className ? `clover-loading-screen__mark ${className}` : "clover-loading-screen__mark"} aria-hidden="true">
      {SPLASH_LEAVES.map((leaf) => (
        <img
          key={leaf.src}
          src={leaf.src}
          alt=""
          className={leaf.className}
          loading="eager"
          decoding="async"
          fetchPriority="high"
          draggable={false}
        />
      ))}
    </div>
  );
}
