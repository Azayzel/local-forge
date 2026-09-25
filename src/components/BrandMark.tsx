import brandLogo from "../assets/logo.png";

interface BrandMarkProps {
  size?: number;
  className?: string;
}

export function BrandMark({ size = 20, className }: BrandMarkProps) {
  return (
    <span
      className={className}
      style={{
        display: "block",
        width: size,
        height: size,
        overflow: "hidden",
      }}
      aria-hidden="true"
    >
      <img
        src={brandLogo}
        alt=""
        draggable={false}
        width={size * 1.4}
        style={{
          display: "block",
          maxWidth: "none",
          clipPath: "inset(0 0 27% 0)",
          transform: `translateX(${-size * 0.2}px)`,
        }}
      />
    </span>
  );
}
