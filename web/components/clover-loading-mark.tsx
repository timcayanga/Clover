const markPaths = {
  topLeft:
    "M0 40C0 28.9543 8.9543 20 20 20C20 8.9543 28.9543 0 40 0C51.0457 0 60 8.9543 60 20V60H20C8.95431 60 0 51.0457 0 40Z",
  topRight:
    "M60 40C60 51.0457 48.8071 60 35 60C30.5563 60 26.3837 59.0716 22.7676 57.4453L20.0713 60.1426L11.4639 51.5352L24 39L21.1719 36.1719L8.63574 48.707L0 40.0713L2.6416 37.4287C0.960359 33.7678 0 29.524 0 25C0 11.1929 8.95431 0 20 0H60V40Z",
  bottomLeft:
    "M40 60C28.9543 60 20 51.0457 20 40C8.9543 40 0 31.0457 0 20C0 8.95431 8.9543 0 20 0H60V40C60 51.0457 51.0457 60 40 60Z",
  bottomRight:
    "M60 20C60 31.0457 51.0457 40 40 40C40 51.0457 31.0457 60 20 60C8.9543 60 0 51.0457 0 40V0H40C51.0457 0 60 8.95431 60 20Z",
} as const;

type CloverLoadingMarkProps = {
  className?: string;
};

export function CloverLoadingMark({ className }: CloverLoadingMarkProps) {
  return (
    <svg
      className={className ? `clover-loading-screen__mark ${className}` : "clover-loading-screen__mark"}
      viewBox="0 0 124 124"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <g>
        <g className="clover-loading-screen__leaf clover-loading-screen__leaf--1">
          <path d={markPaths.topLeft} fill="url(#clover-loading-screen-top-left)" />
        </g>
      </g>
      <g transform="translate(64 0)">
        <g className="clover-loading-screen__leaf clover-loading-screen__leaf--2">
          <path d={markPaths.topRight} fill="url(#clover-loading-screen-top-right)" />
        </g>
      </g>
      <g transform="translate(64 64)">
        <g className="clover-loading-screen__leaf clover-loading-screen__leaf--3">
          <path d={markPaths.bottomRight} fill="url(#clover-loading-screen-bottom-right)" />
        </g>
      </g>
      <g transform="translate(0 64)">
        <g className="clover-loading-screen__leaf clover-loading-screen__leaf--4">
          <path d={markPaths.bottomLeft} fill="url(#clover-loading-screen-bottom-left)" />
        </g>
      </g>
      <defs>
        <linearGradient id="clover-loading-screen-top-left" x1="0" y1="0" x2="60" y2="60" gradientUnits="userSpaceOnUse">
          <stop offset="0.5" stopColor="#03A8C0" />
          <stop offset="1" stopColor="#00DFFF" />
        </linearGradient>
        <linearGradient id="clover-loading-screen-top-right" x1="60" y1="0" x2="0" y2="60" gradientUnits="userSpaceOnUse">
          <stop stopColor="#6EE7B7" />
          <stop offset="1" stopColor="#7EF0C2" />
        </linearGradient>
        <linearGradient id="clover-loading-screen-bottom-right" x1="0" y1="0" x2="60" y2="60" gradientUnits="userSpaceOnUse">
          <stop stopColor="#00DFFF" />
          <stop offset="0.5" stopColor="#03A8C0" />
        </linearGradient>
        <linearGradient id="clover-loading-screen-bottom-left" x1="60" y1="0" x2="0" y2="60" gradientUnits="userSpaceOnUse">
          <stop stopColor="#00DFFF" />
          <stop offset="0.5" stopColor="#03A8C0" />
        </linearGradient>
      </defs>
    </svg>
  );
}
