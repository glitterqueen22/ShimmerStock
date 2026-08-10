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
  default: "/brand/novi/novi-default.png",
  thinking: "/brand/novi/novi-thinking.png",
  happy: "/brand/novi/novi-happy.png",
  serious: "/brand/novi/novi-serious.png",
  sassy: "/brand/novi/novi-sassy.png",
  comforting: "/brand/novi/novi-comforting.png",
  success: "/brand/novi/novi-success.png",
  scan: "/brand/novi/novi-scan.png",
  label: "/brand/novi/novi-label.png",
} as const;

export const NOVI_APPROVED_ART_AVAILABLE = import.meta.env.VITE_NOVI_APPROVED_ART === "true";
const TEMPORARY_REFERENCE_ASSET = "/brand/novi/novi-art-pending.svg";

const EXPRESSION_ASSET: Record<NoviExpression, keyof typeof NOVI_ASSET_MANIFEST> = {
  calm: "default",
  happy: "happy",
  thinking: "thinking",
  concerned: "serious",
  proud: "happy",
  celebrating: "success",
  focused: "serious",
  curious: "thinking",
  grateful: "comforting",
  sassy: "sassy",
  serious: "serious",
  comforting: "comforting",
  protective: "serious",
  excited: "success",
  suspicious: "sassy",
  cozy: "comforting",
  scanning: "scan",
  label: "label",
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
  const source = NOVI_APPROVED_ART_AVAILABLE ? NOVI_ASSET_MANIFEST[assetKey] : TEMPORARY_REFERENCE_ASSET;
  const motion = animated && !GROUNDED_EXPRESSIONS.has(expression) ? "novi-art-motion" : "";

  return (
    <span
      className={`novi-art novi-art-${size} ${motion} ${className}`}
      style={{ width: pixels, height: pixels }}
      data-expression={expression}
      data-asset={assetKey}
      data-accessory={accessory}
      data-notification-side={notificationSide}
      data-art-status={NOVI_APPROVED_ART_AVAILABLE ? "approved" : "temporary-reference"}
    >
      <img
        src={source}
        width={pixels}
        height={pixels}
        alt={alt ?? `Novi, ShimmerStock's operations bestie: ${expression}`}
        loading={priority || size === "micro" || size === "sm" ? "eager" : "lazy"}
        decoding="async"
        draggable={false}
        onError={(event) => {
          if (!event.currentTarget.src.endsWith(TEMPORARY_REFERENCE_ASSET)) {
            event.currentTarget.src = TEMPORARY_REFERENCE_ASSET;
          }
        }}
      />
    </span>
  );
}
