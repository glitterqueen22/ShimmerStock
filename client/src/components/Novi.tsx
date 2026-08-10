import "./Novi.css";

export type NoviExpression =
  | "calm" | "happy" | "thinking" | "concerned" | "proud" | "celebrating"
  | "focused" | "curious" | "grateful" | "sassy" | "serious" | "comforting"
  | "protective" | "excited" | "suspicious" | "cozy" | "scanning" | "label";
export type NoviSize = "micro" | "sm" | "md" | "lg" | "xl";
export type NoviAccessory = "warehouse" | "production" | "marketing" | "customer-service" | "affiliate" | "finance" | "growth";

export interface NoviProps {
  expression?: NoviExpression;
  size?: NoviSize;
  animated?: boolean;
  accessory?: NoviAccessory;
  className?: string;
  notificationSide?: "left" | "right";
  alt?: string;
  priority?: boolean;
}

export const NOVI_ASSET_MANIFEST = {
  idle: "/assets/novi/novi-idle-desk.webp",
  alert: "/assets/novi/novi-alert.webp",
  focused: "/assets/novi/novi-focused.webp",
  thinking: "/assets/novi/novi-thinking.webp",
  serious: "/assets/novi/novi-serious.webp",
  success: "/assets/novi/novi-success.webp",
  "cozy-end": "/assets/novi/novi-cozy-end.webp",
} as const;

const EXPRESSION_ASSET: Record<NoviExpression, keyof typeof NOVI_ASSET_MANIFEST> = {
  calm: "idle",
  happy: "success",
  thinking: "thinking",
  concerned: "serious",
  proud: "success",
  celebrating: "success",
  focused: "focused",
  curious: "thinking",
  grateful: "cozy-end",
  sassy: "serious",
  serious: "serious",
  comforting: "cozy-end",
  protective: "serious",
  excited: "alert",
  suspicious: "serious",
  cozy: "cozy-end",
  scanning: "focused",
  label: "focused",
};

const SIZE_PX: Record<NoviSize, number> = { micro: 26, sm: 36, md: 68, lg: 104, xl: 136 };
const GROUNDED_EXPRESSIONS = new Set<NoviExpression>(["concerned", "focused", "protective", "serious", "suspicious"]);

export default function Novi({
  expression = "calm",
  size = "md",
  animated = true,
  accessory,
  className = "",
  notificationSide,
  alt,
  priority = false,
}: NoviProps) {
  const pixels = SIZE_PX[size];
  const assetKey = EXPRESSION_ASSET[expression];
  const source = NOVI_ASSET_MANIFEST[assetKey];
  const motion = animated && !GROUNDED_EXPRESSIONS.has(expression) ? "novi-art-motion" : "";

  return (
    <span
      className={`novi-art novi-art-${size} ${motion} ${className}`}
      style={{ width: pixels, height: pixels }}
      data-expression={expression}
      data-asset={assetKey}
      data-accessory={accessory}
      data-notification-side={notificationSide}
      data-art-status="approved"
    >
      <img
        src={source}
        width={pixels}
        height={pixels}
        alt={alt ?? `Novi, ShimmerStock's operations bestie: ${expression}`}
        loading={priority || size === "micro" || size === "sm" ? "eager" : "lazy"}
        decoding="async"
        draggable={false}
      />
    </span>
  );
}
