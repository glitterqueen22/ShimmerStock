import { useRef, useEffect, useState, useCallback } from "react";
import "./Novi.css";

// ── Types ───────────────────────────────────────────────────────────

export type NoviExpression =
  | "calm"
  | "happy"
  | "thinking"
  | "concerned"
  | "proud"
  | "celebrating"
  | "focused"
  | "curious"
  | "grateful";

export type NoviSize = "sm" | "md" | "lg" | "xl";

export type NoviAccessory =
  | "warehouse"
  | "production"
  | "marketing"
  | "customer-service"
  | "affiliate"
  | "finance"
  | "growth";

export interface NoviProps {
  expression?: NoviExpression;
  size?: NoviSize;
  animated?: boolean;
  accessory?: NoviAccessory;
  className?: string;
  notificationSide?: "left" | "right";
}

// ── Size Map ────────────────────────────────────────────────────────

const SIZE_PX: Record<NoviSize, number> = {
  sm: 32,
  md: 64,
  lg: 96,
  xl: 120,
};

// ── Expression Configuration ────────────────────────────────────────

interface ExprConfig {
  eyeRy: number;
  eyeRx: number;
  eyeArc: number;        // positive = smile curve, negative = droop
  upperLid: number;      // 0 = fully open, 1 = fully closed
  lowerLidRaise: number; // 0 = normal, 1 = raised to meet upper
  starScale: number;     // 1 = normal
  starOpacity: number;   // 0-1
  glowRadius: number;    // relative
  glowOpacity: number;
  glowWarmth: number;    // 0 = pure lavender, 1 = pure champagne
  handLeftY: number;     // offset from default
  handRightY: number;
  handLeftX: number;
  handRightX: number;
  sparkleCount: number;
  sparkleOpacity: number;
  bodyScale: number;
  bodyLift: number;      // px lift
  pupilDilate: number;   // 0 = normal
  squintRight: number;   // for thinking asymmetry (0 = normal, 1 = full squint)
}

const EXPRESSION_CONFIG: Record<NoviExpression, ExprConfig> = {
  calm: {
    eyeRy: 7.5, eyeRx: 10, eyeArc: 0, upperLid: 0, lowerLidRaise: 0,
    starScale: 0.65, starOpacity: 0.40, glowRadius: 1, glowOpacity: 0.25, glowWarmth: 0.3,
    handLeftY: 0, handRightY: 0, handLeftX: 0, handRightX: 0,
    sparkleCount: 3, sparkleOpacity: 0.5, bodyScale: 1, bodyLift: 0, pupilDilate: 0,
    squintRight: 0,
  },
  happy: {
    eyeRy: 5.0, eyeRx: 11.5, eyeArc: 5, upperLid: 0, lowerLidRaise: 0.3,
    starScale: 1.0, starOpacity: 0.85, glowRadius: 1.15, glowOpacity: 0.4, glowWarmth: 0.7,
    handLeftY: -4, handRightY: -4, handLeftX: 0, handRightX: 0,
    sparkleCount: 5, sparkleOpacity: 0.8, bodyScale: 1.03, bodyLift: -2, pupilDilate: 0.1,
    squintRight: 0,
  },
  thinking: {
    eyeRy: 6.5, eyeRx: 10, eyeArc: 1, upperLid: 0.1, lowerLidRaise: 0,
    starScale: 0.75, starOpacity: 0.58, glowRadius: 1, glowOpacity: 0.25, glowWarmth: 0.25,
    handLeftY: -2, handRightY: -8, handLeftX: 0, handRightX: -3,
    sparkleCount: 2, sparkleOpacity: 0.35, bodyScale: 1, bodyLift: 0, pupilDilate: 0,
    squintRight: 0.75,
  },
  concerned: {
    eyeRy: 6.5, eyeRx: 10, eyeArc: -2, upperLid: 0.2, lowerLidRaise: 0.05,
    starScale: 0.55, starOpacity: 0.3, glowRadius: 0.85, glowOpacity: 0.15, glowWarmth: 0,
    handLeftY: 3, handRightY: 3, handLeftX: 4, handRightX: -4,
    sparkleCount: 2, sparkleOpacity: 0.2, bodyScale: 0.96, bodyLift: 3, pupilDilate: -0.1,
    squintRight: 0,
  },
  proud: {
    eyeRy: 2.5, eyeRx: 10, eyeArc: 1, upperLid: 0.85, lowerLidRaise: 0.2,
    starScale: 1.0, starOpacity: 0.9, glowRadius: 1.1, glowOpacity: 0.35, glowWarmth: 0.7,
    handLeftY: -1, handRightY: -1, handLeftX: 5, handRightX: -5,
    sparkleCount: 3, sparkleOpacity: 0.6, bodyScale: 1.03, bodyLift: -1, pupilDilate: 0,
    squintRight: 0,
  },
  celebrating: {
    eyeRy: 4.0, eyeRx: 12.5, eyeArc: 8, upperLid: 0, lowerLidRaise: 0.35,
    starScale: 1.3, starOpacity: 1, glowRadius: 1.3, glowOpacity: 0.55, glowWarmth: 0.85,
    handLeftY: -10, handRightY: -10, handLeftX: -3, handRightX: 3,
    sparkleCount: 8, sparkleOpacity: 1, bodyScale: 1.1, bodyLift: -8, pupilDilate: 0.2,
    squintRight: 0,
  },
  focused: {
    eyeRy: 5.5, eyeRx: 10, eyeArc: 0, upperLid: 0.08, lowerLidRaise: 0,
    starScale: 0.72, starOpacity: 0.6, glowRadius: 0.9, glowOpacity: 0.2, glowWarmth: 0.15,
    handLeftY: 0, handRightY: 0, handLeftX: 2, handRightX: -2,
    sparkleCount: 2, sparkleOpacity: 0.25, bodyScale: 1, bodyLift: 2, pupilDilate: -0.05,
    squintRight: 0,
  },
  curious: {
    eyeRy: 9.0, eyeRx: 12, eyeArc: 1, upperLid: 0, lowerLidRaise: 0,
    starScale: 0.85, starOpacity: 0.7, glowRadius: 1.1, glowOpacity: 0.3, glowWarmth: 0.5,
    handLeftY: -6, handRightY: 2, handLeftX: -4, handRightX: 0,
    sparkleCount: 5, sparkleOpacity: 0.7, bodyScale: 1.01, bodyLift: -3, pupilDilate: 0.15,
    squintRight: 0,
  },
  grateful: {
    eyeRy: 6, eyeRx: 10.5, eyeArc: 1, upperLid: 0.25, lowerLidRaise: 0.1,
    starScale: 0.85, starOpacity: 0.75, glowRadius: 1.05, glowOpacity: 0.3, glowWarmth: 0.6,
    handLeftY: -5, handRightY: -5, handLeftX: 10, handRightX: -10,
    sparkleCount: 3, sparkleOpacity: 0.5, bodyScale: 1, bodyLift: 0, pupilDilate: 0.05,
    squintRight: 0,
  },
};

// ── Color Tokens ─────────────────────────────────────────────────────

const COLORS = {
  primary: "#7C3AED",
  core: "#FFFBEB",
  mid: "#A78BFA",
  edge: "#4C1D95",
  champagne: "#FDE68A",
  champagneSoft: "#FEF9E7",
  glowLavender: "#C4B5FD",
  shadowDeep: "#3B0764",
};

// ── Helpers ──────────────────────────────────────────────────────────

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

// ── Accessory Renderer ───────────────────────────────────────────────

const ACCESSORY_COLORS = {
  primary: "#A78BFA",      // lavender mid
  champagne: "#FDE68A",     // champagne gold
  soft: "#FEF9E7",          // warm white
  edge: "#4C1D95",          // deep violet
};

/**
 * Tiny (8-12px) SVG glyph for each department accessory.
 * All rendered in the champagne/lavender palette.
 * Positioned near Novi's right hand area (cx ~78, cy ~60).
 */
function AccessoryGlyph({ type }: { type: NoviAccessory }) {
  // Base transform: positioned near right hand, tiny scale
  const cx = 75;
  const cy = 60;
  const s = 4.5; // base size unit

  switch (type) {
    // ── Warehouse: Barcode Scanner ────────────────────────────────
    case "warehouse":
      return (
        <g className="novi-accessory-glyph" transform={`translate(${cx}, ${cy})`}>
          {/* Scanner body */}
          <rect x={-s * 1.2} y={-s * 0.8} width={s * 2.4} height={s * 1.6} rx={1.5} fill={ACCESSORY_COLORS.primary} opacity="0.7" />
          {/* Screen */}
          <rect x={-s * 0.9} y={-s * 0.55} width={s * 1.8} height={s * 0.9} rx={0.8} fill={ACCESSORY_COLORS.soft} opacity="0.7" />
          {/* Scan line */}
          <line x1={-s * 0.5} y1={s * 0.8} x2={s * 0.7} y2={-s * 1.5} stroke={ACCESSORY_COLORS.champagne} strokeWidth="0.7" opacity="0.8" strokeDasharray="1.5,1" />
          {/* Handle */}
          <rect x={s * 0.6} y={-s * 0.3} width={s * 0.5} height={s * 0.6} rx={0.5} fill={ACCESSORY_COLORS.edge} opacity="0.5" />
        </g>
      );

    // ── Production: Flask ─────────────────────────────────────────
    case "production":
      return (
        <g className="novi-accessory-glyph" transform={`translate(${cx}, ${cy})`}>
          {/* Flask body — round bottom */}
          <path
            d={`M ${-s * 0.2} ${-s * 0.9} L ${-s * 0.2} ${-s * 0.2} C ${-s * 0.2} ${s * 0.9}, ${s * 0.2} ${s * 0.9}, ${s * 0.2} ${-s * 0.2} L ${s * 0.2} ${-s * 0.9}`}
            fill="none"
            stroke={ACCESSORY_COLORS.primary}
            strokeWidth="0.9"
            opacity="0.75"
          />
          {/* Flask neck */}
          <line x1={-s * 0.15} y1={-s * 1.2} x2={-s * 0.15} y2={-s * 0.9} stroke={ACCESSORY_COLORS.primary} strokeWidth="0.8" opacity="0.75" />
          <line x1={s * 0.15} y1={-s * 1.2} x2={s * 0.15} y2={-s * 0.9} stroke={ACCESSORY_COLORS.primary} strokeWidth="0.8" opacity="0.75" />
          {/* Liquid inside */}
          <ellipse cx="0" cy={s * 0.35} rx={s * 0.16} ry={s * 0.25} fill={ACCESSORY_COLORS.champagne} opacity="0.5" />
          {/* Rim */}
          <line x1={-s * 0.3} y1={-s * 1.2} x2={s * 0.3} y2={-s * 1.2} stroke={ACCESSORY_COLORS.primary} strokeWidth="0.6" opacity="0.7" />
        </g>
      );

    // ── Marketing: Paintbrush ─────────────────────────────────────
    case "marketing":
      return (
        <g className="novi-accessory-glyph" transform={`translate(${cx}, ${cy})`}>
          {/* Brush handle */}
          <line x1="0" y1={s * 1.4} x2="0" y2={-s * 0.5} stroke={ACCESSORY_COLORS.edge} strokeWidth="1.0" opacity="0.6" strokeLinecap="round" />
          {/* Ferrule (metal band) */}
          <rect x={-0.9} y={-s * 0.7} width={1.8} height={s * 0.4} rx={0.3} fill={ACCESSORY_COLORS.soft} opacity="0.6" />
          {/* Brush tip */}
          <path
            d={`M ${-0.5} ${-s * 0.3} Q 0 ${-s * 1.2}, 0 ${-s * 1.5} Q 0 ${-s * 1.2}, ${0.5} ${-s * 0.3} Z`}
            fill={ACCESSORY_COLORS.champagne}
            opacity="0.65"
          />
          {/* Paint dab */}
          <circle cx={0.8} cy={-s * 1.2} r={0.6} fill={ACCESSORY_COLORS.primary} opacity="0.4" />
        </g>
      );

    // ── Customer Service: Envelope ────────────────────────────────
    case "customer-service":
      return (
        <g className="novi-accessory-glyph" transform={`translate(${cx}, ${cy})`}>
          {/* Envelope body */}
          <rect x={-s} y={-s * 0.6} width={s * 2} height={s * 1.2} rx={0.8} fill={ACCESSORY_COLORS.primary} opacity="0.6" />
          {/* Envelope flap */}
          <path
            d={`M ${-s} ${-s * 0.6} L 0 ${-s * 0.1} L ${s} ${-s * 0.6}`}
            fill="none"
            stroke={ACCESSORY_COLORS.soft}
            strokeWidth="0.8"
            opacity="0.7"
          />
          {/* Seal dot */}
          <circle cx="0" cy={-s * 0.15} r={0.7} fill={ACCESSORY_COLORS.champagne} opacity="0.6" />
        </g>
      );

    // ── Affiliate: Trophy ─────────────────────────────────────────
    case "affiliate":
      return (
        <g className="novi-accessory-glyph" transform={`translate(${cx}, ${cy})`}>
          {/* Trophy cup */}
          <path
            d={`M ${-s * 0.9} ${s * 0.3} L ${-s * 0.7} ${-s * 0.5} L ${s * 0.7} ${-s * 0.5} L ${s * 0.9} ${s * 0.3} Z`}
            fill={ACCESSORY_COLORS.champagne}
            opacity="0.7"
            stroke={ACCESSORY_COLORS.primary}
            strokeWidth="0.5"
          />
          {/* Left handle */}
          <path
            d={`M ${-s * 0.7} ${-s * 0.1} C ${-s * 1.4} ${-s * 0.1}, ${-s * 1.1} ${s * 0.3}, ${-s * 0.5} ${s * 0.2}`}
            fill="none"
            stroke={ACCESSORY_COLORS.champagne}
            strokeWidth="0.7"
            opacity="0.7"
          />
          {/* Right handle */}
          <path
            d={`M ${s * 0.7} ${-s * 0.1} C ${s * 1.4} ${-s * 0.1}, ${s * 1.1} ${s * 0.3}, ${s * 0.5} ${s * 0.2}`}
            fill="none"
            stroke={ACCESSORY_COLORS.champagne}
            strokeWidth="0.7"
            opacity="0.7"
          />
          {/* Base */}
          <rect x={-s * 0.6} y={s * 0.3} width={s * 1.2} height={s * 0.25} rx={0.4} fill={ACCESSORY_COLORS.primary} opacity="0.6" />
          {/* Star on trophy */}
          <circle cx="0" cy={-s * 0.15} r={0.9} fill={ACCESSORY_COLORS.soft} opacity="0.7" />
        </g>
      );

    // ── Finance: Calculator ───────────────────────────────────────
    case "finance":
      return (
        <g className="novi-accessory-glyph" transform={`translate(${cx}, ${cy})`}>
          {/* Calculator body */}
          <rect x={-s * 0.8} y={-s * 1.0} width={s * 1.6} height={s * 2.0} rx={1.2} fill={ACCESSORY_COLORS.primary} opacity="0.55" />
          {/* Display */}
          <rect x={-s * 0.55} y={-s * 0.8} width={s * 1.1} height={s * 0.5} rx={0.5} fill={ACCESSORY_COLORS.soft} opacity="0.7" />
          {/* Keypad dots — row 1 */}
          <circle cx={-s * 0.3} cy={-s * 0.05} r={0.35} fill={ACCESSORY_COLORS.soft} opacity="0.5" />
          <circle cx="0" cy={-s * 0.05} r={0.35} fill={ACCESSORY_COLORS.soft} opacity="0.5" />
          <circle cx={s * 0.3} cy={-s * 0.05} r={0.35} fill={ACCESSORY_COLORS.soft} opacity="0.5" />
          {/* Row 2 */}
          <circle cx={-s * 0.3} cy={s * 0.25} r={0.35} fill={ACCESSORY_COLORS.soft} opacity="0.5" />
          <circle cx="0" cy={s * 0.25} r={0.35} fill={ACCESSORY_COLORS.soft} opacity="0.5" />
          <circle cx={s * 0.3} cy={s * 0.25} r={0.35} fill={ACCESSORY_COLORS.soft} opacity="0.5" />
          {/* Row 3 */}
          <circle cx={-s * 0.3} cy={s * 0.55} r={0.35} fill={ACCESSORY_COLORS.soft} opacity="0.5" />
          <circle cx="0" cy={s * 0.55} r={0.35} fill={ACCESSORY_COLORS.soft} opacity="0.5" />
          <circle cx={s * 0.3} cy={s * 0.55} r={0.35} fill={ACCESSORY_COLORS.champagne} opacity="0.6" />
        </g>
      );

    // ── Growth: Graph ─────────────────────────────────────────────
    case "growth":
      return (
        <g className="novi-accessory-glyph" transform={`translate(${cx}, ${cy})`}>
          {/* Graph axes */}
          <line x1={-s * 1.0} y1={s * 0.8} x2={-s * 1.0} y2={-s * 0.8} stroke={ACCESSORY_COLORS.primary} strokeWidth="0.6" opacity="0.5" />
          <line x1={-s * 1.0} y1={s * 0.8} x2={s * 1.0} y2={s * 0.8} stroke={ACCESSORY_COLORS.primary} strokeWidth="0.6" opacity="0.5" />
          {/* Trend line — upward */}
          <path
            d={`M ${-s * 0.8} ${s * 0.3} L ${-s * 0.2} ${s * 0.2} L ${s * 0.1} ${-s * 0.1} L ${s * 0.5} ${-s * 0.5}`}
            fill="none"
            stroke={ACCESSORY_COLORS.champagne}
            strokeWidth="1.0"
            opacity="0.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {/* Arrow tip */}
          <polygon
            points={`${s * 0.5},${-s * 0.5} ${s * 0.1},${-s * 0.25} ${s * 0.3},${-s * 0.7}`}
            fill={ACCESSORY_COLORS.champagne}
            opacity="0.8"
          />
          {/* Data dot */}
          <circle cx={s * 0.5} cy={-s * 0.5} r={0.6} fill={ACCESSORY_COLORS.soft} opacity="0.8" />
        </g>
      );

    default:
      return null;
  }
}

// ── Sparkle Particle Component ──────────────────────────────────────

function Sparkle({ index, total, opacity }: { index: number; total: number; opacity: number }) {
  const angle = (index / total) * 360 + (index % 3) * 17;
  const distance = 22 + (index % 5) * 4;
  const cx = 50 + Math.cos((angle * Math.PI) / 180) * distance;
  const cy = 55 + Math.sin((angle * Math.PI) / 180) * distance;
  const size = 1.5 + (index % 3) * 0.8;
  const isStar = index % 4 === 0;
  const delay = index * 0.15;

  return isStar ? (
    <g opacity={opacity} style={{ animationDelay: `${delay}s` }} className="novi-sparkle-particle">
      <path
        d={`M ${cx} ${cy - size} L ${cx + size * 0.3} ${cy - size * 0.3} L ${cx + size} ${cy} L ${cx + size * 0.3} ${cy + size * 0.3} L ${cx} ${cy + size} L ${cx - size * 0.3} ${cy + size * 0.3} L ${cx - size} ${cy} L ${cx - size * 0.3} ${cy - size * 0.3} Z`}
        fill={COLORS.champagne}
      />
    </g>
  ) : (
    <circle
      cx={cx} cy={cy} r={size * 0.6}
      fill={index % 3 === 0 ? COLORS.champagneSoft : COLORS.champagne}
      opacity={opacity}
      className="novi-sparkle-particle"
      style={{ animationDelay: `${delay}s` }}
    />
  );
}

// ── Novi Component ──────────────────────────────────────────────────

export default function Novi({
  expression = "calm",
  size = "md",
  animated = true,
  accessory,
  className = "",
  notificationSide,
}: NoviProps) {
  const px = SIZE_PX[size];
  const cfg = EXPRESSION_CONFIG[expression];
  const prevExprRef = useRef<NoviExpression>(expression);
  const prevAccessoryRef = useRef<NoviAccessory | undefined>(accessory);
  const [transitioning, setTransitioning] = useState(false);
  const [accessoryKey, setAccessoryKey] = useState(0);
  const [blinkState, setBlinkState] = useState<"open" | "closed">("open");
  const blinkTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── M6: Notification awareness state ─────────────────────────────
  const [notifActive, setNotifActive] = useState(false);
  const notifTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (notificationSide) {
      setNotifActive(true);
      if (notifTimerRef.current) clearTimeout(notifTimerRef.current);
      notifTimerRef.current = setTimeout(() => setNotifActive(false), 600);
      return () => {
        if (notifTimerRef.current) clearTimeout(notifTimerRef.current);
      };
    }
  }, [notificationSide]);

  // ── M7: Hand-to-heart idle gesture ──────────────────────────────
  const [handsHeart, setHandsHeart] = useState(false);
  const heartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scheduleHeartGesture = useCallback(() => {
    if (!animated || expression !== "calm") return;
    const interval = 45000 + Math.random() * 45000; // 45-90s
    heartTimerRef.current = setTimeout(() => {
      setHandsHeart(true);
      // Hold 2.5s then release
      setTimeout(() => setHandsHeart(false), 2500);
      // Schedule next
      scheduleHeartGesture();
    }, interval);
  }, [animated, expression]);

  useEffect(() => {
    if (animated && expression === "calm") {
      scheduleHeartGesture();
      return () => {
        if (heartTimerRef.current) clearTimeout(heartTimerRef.current);
      };
    } else {
      setHandsHeart(false);
    }
  }, [animated, expression, scheduleHeartGesture]);

  // ── M8: Celebration sparkle micro-moments ────────────────────────
  const [microSparkle, setMicroSparkle] = useState<{ active: boolean; angle: number; distance: number }>({
    active: false, angle: 0, distance: 0,
  });
  const microSparkleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scheduleMicroSparkle = useCallback(() => {
    if (!animated) return;
    const interval = 120000 + Math.random() * 180000; // 2-5 min
    microSparkleTimerRef.current = setTimeout(() => {
      const angle = Math.random() * 360;
      const distance = 12 + Math.random() * 16;
      setMicroSparkle({ active: true, angle, distance });
      // Fade after 2s
      setTimeout(() => setMicroSparkle({ active: false, angle: 0, distance: 0 }), 2000);
      scheduleMicroSparkle();
    }, interval);
  }, [animated]);

  useEffect(() => {
    if (animated) {
      scheduleMicroSparkle();
      return () => {
        if (microSparkleTimerRef.current) clearTimeout(microSparkleTimerRef.current);
      };
    }
  }, [animated, scheduleMicroSparkle]);

  // ── Expression transition tracking ──────────────────────────────
  useEffect(() => {
    if (prevExprRef.current !== expression) {
      setTransitioning(true);
      const timer = setTimeout(() => setTransitioning(false), 600);
      prevExprRef.current = expression;
      return () => clearTimeout(timer);
    }
  }, [expression]);

  // ── Accessory transition tracking ───────────────────────────────
  useEffect(() => {
    if (prevAccessoryRef.current !== accessory) {
      setAccessoryKey(k => k + 1);
      prevAccessoryRef.current = accessory;
    }
  }, [accessory]);

  // ── Random blink scheduling ─────────────────────────────────────
  const scheduleBlink = useCallback(() => {
    if (!animated) return;
    // Weighted toward 3-4s, range 2.5-6s
    const base = 2500 + Math.random() * 3500;
    // 10% long blinks, 5% double blinks
    const rand = Math.random();

    blinkTimerRef.current = setTimeout(() => {
      if (rand < 0.05) {
        // Double blink — close 150ms, open 200ms, close 150ms, open
        setBlinkState("closed");
        setTimeout(() => setBlinkState("open"), 150);
        setTimeout(() => setBlinkState("closed"), 350);
        setTimeout(() => {
          setBlinkState("open");
          scheduleBlink();
        }, 500);
      } else {
        const closeDuration = rand < 0.10 ? 250 : 150;
        setBlinkState("closed");
        setTimeout(() => {
          setBlinkState("open");
          scheduleBlink();
        }, closeDuration);
      }
    }, base);
  }, [animated]);

  useEffect(() => {
    if (animated) {
      scheduleBlink();
      return () => {
        if (blinkTimerRef.current) clearTimeout(blinkTimerRef.current);
      };
    }
  }, [animated, scheduleBlink]);

  // ── Compute eye parameters ──────────────────────────────────────
  const eyeCenterY = 42;
  const leftEyeCx = 36;
  const rightEyeCx = 64;

  // Eye dimensions with expression config
  const eyeRx = cfg.eyeRx;
  const eyeRy = cfg.eyeRy * (cfg.squintRight > 0 ? 1 : 1); // base ry
  const rightEyeRy = cfg.eyeRy * (1 - cfg.squintRight * 0.25); // squint for thinking

  // Upper lid: covers top portion of eye
  const lidClamp = cfg.upperLid * eyeRy * 2;

  // ── Glow gradient IDs ───────────────────────────────────────────
  const glowId = "novi-glow-grad";
  const bodyId = "novi-body-grad";
  const starGlowId = "novi-star-glow";

  // ── Sparkle particles ───────────────────────────────────────────
  const sparkles = [];
  if (cfg.sparkleCount > 0) {
    for (let i = 0; i < cfg.sparkleCount; i++) {
      sparkles.push(
        <Sparkle key={i} index={i} total={cfg.sparkleCount} opacity={cfg.sparkleOpacity} />
      );
    }
  }

  // ── Animation classes ───────────────────────────────────────────
  const animClasses = animated ? "novi-animated" : "";
  const floatClass = animated && expression === "calm" ? "novi-float" : "";
  const stillClass = expression === "focused" || expression === "concerned" ? "novi-still" : "";

  // ── M6: Notification iris offset ────────────────────────────────
  const notifIrisOffset = notifActive
    ? notificationSide === "right" ? 2.5 : -2.5
    : 0;
  const notifHandOffset = notifActive
    ? notificationSide === "right" ? -3 : 0
    : 0;
  const notifHandRightOffset = notifActive
    ? notificationSide === "right" ? 0 : -3
    : 0;

  // ── M8: Micro sparkle position ──────────────────────────────────
  const microSparkleCx = microSparkle.active
    ? 50 + Math.cos((microSparkle.angle * Math.PI) / 180) * microSparkle.distance
    : 0;
  const microSparkleCy = microSparkle.active
    ? 50 + Math.sin((microSparkle.angle * Math.PI) / 180) * microSparkle.distance
    : 0;

  return (
    <span
      className={`novi-container ${animClasses} ${floatClass} ${stillClass} ${className}`}
      style={{
        display: "inline-block",
        width: px,
        height: px,
        lineHeight: 0,
        verticalAlign: "middle",
      }}
      role="img"
      aria-label={`Novi looks ${expression}`}
    >
      <svg
        viewBox="0 0 100 120"
        width={px}
        height={px}
        xmlns="http://www.w3.org/2000/svg"
        style={{ overflow: "visible" }}
      >
        <defs>
          {/* Crystal body gradient */}
          <radialGradient id={bodyId} cx="45%" cy="35%" r="55%" fx="42%" fy="30%">
            <stop offset="0%" stopColor={COLORS.core} stopOpacity="0.95" />
            <stop offset="30%" stopColor={COLORS.mid} stopOpacity="0.7" />
            <stop offset="60%" stopColor={COLORS.primary} stopOpacity="0.6" />
            <stop offset="85%" stopColor={COLORS.edge} stopOpacity="0.8" />
            <stop offset="100%" stopColor={COLORS.edge} stopOpacity="0.95" />
          </radialGradient>

          {/* Internal glow gradient */}
          <radialGradient id={glowId} cx="50%" cy="45%" r="40%">
            <stop offset="0%" stopColor={COLORS.core} stopOpacity="0.9" />
            <stop offset="15%" stopColor={COLORS.champagneSoft} stopOpacity="0.6" />
            <stop offset="35%" stopColor={COLORS.glowLavender} stopOpacity="0.35" />
            <stop offset="60%" stopColor="#8B5CF6" stopOpacity="0.12" />
            <stop offset="100%" stopColor={COLORS.primary} stopOpacity="0" />
          </radialGradient>

          {/* Star glow */}
          <radialGradient id={starGlowId} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor={COLORS.core} stopOpacity="1" />
            <stop offset="30%" stopColor={COLORS.champagne} stopOpacity="0.8" />
            <stop offset="60%" stopColor={COLORS.champagneSoft} stopOpacity="0.3" />
            <stop offset="100%" stopColor={COLORS.champagneSoft} stopOpacity="0" />
          </radialGradient>

          {/* Subtle body highlight — specular reflection */}
          <linearGradient id="novi-highlight" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={COLORS.core} stopOpacity="0.4" />
            <stop offset="40%" stopColor={COLORS.core} stopOpacity="0.05" />
            <stop offset="100%" stopColor={COLORS.core} stopOpacity="0" />
          </linearGradient>

          {/* Eye white gradient */}
          <radialGradient id="novi-eye-white" cx="50%" cy="45%" r="50%">
            <stop offset="0%" stopColor="#FFFFFF" />
            <stop offset="100%" stopColor="#F8F6FF" />
          </radialGradient>

          {/* Glow filter for bloom */}
          <filter id="novi-glow-filter" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>

          {/* Soft shadow filter */}
          <filter id="novi-shadow" x="-20%" y="-10%" width="140%" height="130%">
            <feDropShadow dx="0" dy="3" stdDeviation="2.5" floodColor={COLORS.shadowDeep} floodOpacity="0.12" />
          </filter>
        </defs>

        {/* ── Shadow beneath ──────────────────────────────────── */}
        <ellipse
          cx="50" cy="108" rx="28" ry="5"
          fill={COLORS.shadowDeep}
          opacity="0.06"
          className="novi-shadow"
        />

        {/* ── Body: Crystal Teardrop ──────────────────────────── */}
        <g
          className={`novi-body-group${notifActive ? ` novi-notif-tilt-${notificationSide}` : ""}`}
          style={{
            transform: `scale(${cfg.bodyScale})${notifActive ? ` rotate(${notificationSide === "left" ? "3" : "-3"}deg)` : ""}`,
            transformOrigin: "50px 60px",
            transition: "transform 400ms ease-out",
          }}
          filter="url(#novi-shadow)"
        >
          <path
            d={`
              M 44 21
              C 48 17.5, 52 17.5, 56 21
              C 65 24, 72 36, 73 48
              C 74 57, 70 71, 62 83
              C 56 91, 53 94.5, 50 95
              C 47 94.5, 44 91, 38 83
              C 30 71, 26 57, 27 48
              C 28 36, 35 24, 44 21
              Z
            `}
            fill={`url(#${bodyId})`}
            className="novi-body"
          />

          {/* Facet lines — subtle internal refraction boundaries */}
          <path
            d="M 38 35 C 40 55, 38 75, 35 90"
            stroke={COLORS.mid}
            strokeWidth="0.4"
            fill="none"
            opacity="0.2"
            className="novi-facet"
          />
          <path
            d="M 62 35 C 60 55, 62 75, 65 90"
            stroke={COLORS.mid}
            strokeWidth="0.4"
            fill="none"
            opacity="0.2"
            className="novi-facet"
          />
          <path
            d="M 50 18 C 50 35, 52 55, 50 85"
            stroke={COLORS.core}
            strokeWidth="0.3"
            fill="none"
            opacity="0.1"
            className="novi-facet"
          />

          {/* Specular highlights — Baccarat crystal polish */}
          {/* Existing highlight — adjusted */}
          <ellipse
            cx="42" cy="28" rx="6" ry="4"
            fill={COLORS.champagneSoft}
            opacity="0.4"
            className="novi-specular"
            style={{
              transition: "opacity 400ms ease-out",
            }}
          />
          {/* Top edge highlight — like rim of crystal glass catching light */}
          <path
            d="M 44 19 C 48 17, 52 17, 56 19"
            stroke="#FFFEF0"
            strokeWidth="1.8"
            fill="none"
            opacity="0.7"
            strokeLinecap="round"
            className="novi-specular-top"
          />
          {/* Right edge highlight — light wrapping around crystal form */}
          <ellipse
            cx="69" cy="33" rx="3" ry="5"
            fill="#FEF3C7"
            opacity="0.15"
            className="novi-specular-right"
          />
        </g>

        {/* ── Internal Glow ───────────────────────────────────── */}
        <circle
          cx="50" cy="52"
          r={22 * cfg.glowRadius}
          fill={`url(#${glowId})`}
          opacity={cfg.glowOpacity}
          filter="url(#novi-glow-filter)"
          className="novi-glow"
          style={{
            transition: "r 400ms ease-out, opacity 400ms ease-out",
            transitionDelay: "150ms",
          }}
        />

        {/* ── Living Star Heart ────────────────────────────────── */}
        <g
          className="novi-star"
          style={{
            transform: `scale(${cfg.starScale})`,
            transformOrigin: "50px 50px",
            opacity: cfg.starOpacity,
            transition: "transform 300ms ease-out, opacity 300ms ease-out",
            transitionDelay: "0ms",
          }}
        >
          {/* Star glow corona */}
          <circle cx="50" cy="50" r="6" fill={`url(#${starGlowId})`} opacity="0.2" />

          {/* Corona — faint larger 4-point shape */}
          <path
            d="M 50 36 L 52 48 L 64 50 L 52 52 L 50 64 L 48 52 L 36 50 L 48 48 Z"
            fill={COLORS.champagne}
            opacity="0.15"
          />

          {/* Main 4-point star — slightly organic */}
          <path
            d="M 50 39.5
               C 50.3 42, 50.6 46, 51 48
               C 51.3 49.5, 51.8 49.8, 53 50
               C 54.4 50.2, 56 50.4, 57.5 50.5
               C 56 50.7, 54.4 50.9, 53 51
               C 51.8 51.2, 51.3 51.5, 51 53
               C 50.6 55, 50.3 59, 50 61.5
               C 49.7 59, 49.4 55, 49 53
               C 48.7 51.5, 48.2 51.2, 47 51
               C 45.6 50.9, 44 50.7, 42.5 50.5
               C 44 50.4, 45.6 50.2, 47 50
               C 48.2 49.8, 48.7 49.5, 49 48
               C 49.4 46, 49.7 42, 50 39.5
               Z"
            fill={COLORS.champagne}
            opacity="0.6"
          />

          {/* Bright center point — only visible during high-emotion expressions */}
          {(expression === "celebrating" || expression === "proud" || expression === "grateful") && (
            <circle cx="50" cy="50" r="1.5" fill={COLORS.core} opacity="0.4" />
          )}
        </g>

        {/* ── Eyes ─────────────────────────────────────────────── */}
        <g className="novi-eyes-group">
          {/* Left eye */}
          <g>
            {/* Eye white */}
            <ellipse
              cx={leftEyeCx} cy={eyeCenterY}
              rx={eyeRx} ry={eyeRy}
              fill="url(#novi-eye-white)"
              className="novi-eye-white"
              style={{
                transition: "rx 400ms ease-out, ry 400ms ease-out",
              }}
            />

            {/* Iris */}
            <circle
              cx={leftEyeCx + (cfg.eyeArc > 0 ? 0.5 : 0) + notifIrisOffset}
              cy={eyeCenterY + (cfg.upperLid > 0 ? 1 : 0)}
              r={4 + cfg.pupilDilate * 0.8}
              fill={COLORS.edge}
              className="novi-iris"
              style={{
                transition: "r 400ms ease-out, cy 400ms ease-out, cx 400ms ease-out",
              }}
            />

            {/* Pupil */}
            <circle
              cx={leftEyeCx + (cfg.eyeArc > 0 ? 0.5 : 0) + notifIrisOffset}
              cy={eyeCenterY + (cfg.upperLid > 0 ? 1 : 0)}
              r={2.2 + cfg.pupilDilate}
              fill="#1A1030"
              className="novi-pupil"
              style={{ transition: "r 400ms ease-out, cx 400ms ease-out" }}
            />

            {/* Catchlight */}
            <circle
              cx={leftEyeCx - 1.5}
              cy={eyeCenterY - 2.5}
              r={1.3}
              fill="white"
              opacity={expression === "celebrating" ? 0.95 : 0.8}
              className="novi-catchlight"
              style={{ transition: "opacity 400ms ease-out" }}
            />

            {/* Upper lid — when partially closed */}
            {cfg.upperLid > 0 && (
              <rect
                x={leftEyeCx - eyeRx - 1}
                y={eyeCenterY - eyeRy - 1}
                width={eyeRx * 2 + 2}
                height={lidClamp + 1}
                fill={COLORS.mid}
                opacity="0.9"
                rx="2"
                className="novi-lid"
                style={{
                  transition: "height 400ms ease-out",
                }}
              />
            )}

            {/* Lower lid raise for Duchenne smile — thin curved stroke */}
            {cfg.lowerLidRaise > 0 && (
              <path
                d={`M ${leftEyeCx - eyeRx - 0.5} ${eyeCenterY + eyeRy}
                    Q ${leftEyeCx} ${eyeCenterY + eyeRy - cfg.lowerLidRaise * eyeRy * 1.5}
                    ${leftEyeCx + eyeRx + 0.5} ${eyeCenterY + eyeRy}`}
                stroke={COLORS.edge}
                strokeWidth="0.6"
                fill="none"
                opacity="0.4"
                strokeLinecap="round"
              />
            )}

            {/* Happy eye arc — curved upper lid line */}
            {cfg.eyeArc > 0 && (
              <path
                d={`M ${leftEyeCx - eyeRx} ${eyeCenterY - cfg.eyeArc * 0.6} Q ${leftEyeCx} ${eyeCenterY - eyeRy - cfg.eyeArc} ${leftEyeCx + eyeRx} ${eyeCenterY - cfg.eyeArc * 0.6}`}
                stroke={COLORS.edge}
                strokeWidth="0.8"
                fill="none"
                opacity="0.5"
                className="novi-eye-arc"
                style={{ transition: "d 400ms ease-out" }}
              />
            )}
          </g>

          {/* Right eye */}
          <g>
            <ellipse
              cx={rightEyeCx} cy={eyeCenterY}
              rx={eyeRx} ry={rightEyeRy}
              fill="url(#novi-eye-white)"
              className="novi-eye-white"
              style={{
                transition: "rx 400ms ease-out, ry 400ms ease-out",
              }}
            />

            <circle
              cx={rightEyeCx + (cfg.squintRight > 0 ? 0 : cfg.eyeArc > 0 ? 0.5 : 0) + notifIrisOffset}
              cy={eyeCenterY + (cfg.upperLid > 0 ? 1 : 0)}
              r={4 + cfg.pupilDilate * 0.8}
              fill={COLORS.edge}
              className="novi-iris"
              style={{
                transition: "r 400ms ease-out, cy 400ms ease-out, cx 400ms ease-out",
              }}
            />

            <circle
              cx={rightEyeCx + (cfg.squintRight > 0 ? 0 : cfg.eyeArc > 0 ? 0.5 : 0) + notifIrisOffset}
              cy={eyeCenterY + (cfg.upperLid > 0 ? 1 : 0)}
              r={2.2 + cfg.pupilDilate}
              fill="#1A1030"
              className="novi-pupil"
              style={{ transition: "r 400ms ease-out, cx 400ms ease-out" }}
            />

            <circle
              cx={rightEyeCx - 1.5}
              cy={eyeCenterY - 2.5}
              r={1.3}
              fill="white"
              opacity={expression === "celebrating" ? 0.95 : 0.8}
              className="novi-catchlight"
              style={{ transition: "opacity 400ms ease-out" }}
            />

            {cfg.upperLid > 0 && (
              <rect
                x={rightEyeCx - eyeRx - 1}
                y={eyeCenterY - rightEyeRy - 1}
                width={eyeRx * 2 + 2}
                height={lidClamp + 1}
                fill={COLORS.mid}
                opacity="0.9"
                rx="2"
                className="novi-lid"
                style={{ transition: "height 400ms ease-out" }}
              />
            )}

            {/* Lower lid raise for Duchenne smile — thin curved stroke */}
            {cfg.lowerLidRaise > 0 && (
              <path
                d={`M ${rightEyeCx - eyeRx - 0.5} ${eyeCenterY + rightEyeRy}
                    Q ${rightEyeCx} ${eyeCenterY + rightEyeRy - cfg.lowerLidRaise * rightEyeRy * 1.5}
                    ${rightEyeCx + eyeRx + 0.5} ${eyeCenterY + rightEyeRy}`}
                stroke={COLORS.edge}
                strokeWidth="0.6"
                fill="none"
                opacity="0.4"
                strokeLinecap="round"
              />
            )}

            {cfg.eyeArc > 0 && (
              <path
                d={`M ${rightEyeCx - eyeRx} ${eyeCenterY - cfg.eyeArc * 0.6} Q ${rightEyeCx} ${eyeCenterY - rightEyeRy - cfg.eyeArc} ${rightEyeCx + eyeRx} ${eyeCenterY - cfg.eyeArc * 0.6}`}
                stroke={COLORS.edge}
                strokeWidth="0.8"
                fill="none"
                opacity="0.5"
                className="novi-eye-arc"
                style={{ transition: "d 400ms ease-out" }}
              />
            )}
          </g>

          {/* Subtle furrow for focused */}
          {expression === "focused" && (
            <line
              x1={leftEyeCx + eyeRx + 2} y1={eyeCenterY - eyeRy - 2}
              x2={rightEyeCx - eyeRx - 2} y2={eyeCenterY - eyeRy - 2}
              stroke={COLORS.edge}
              strokeWidth="0.5"
              opacity="0.12"
              className="novi-furrow"
            />
          )}

          {/* Blink overlay */}
          {blinkState === "closed" && (
            <g className="novi-blink">
              <rect
                x={leftEyeCx - eyeRx - 1}
                y={eyeCenterY - eyeRy - 1}
                width={eyeRx * 2 + 2}
                height={eyeRy * 2 + 2}
                fill={COLORS.mid}
                opacity="0.85"
                rx={eyeRx}
              />
              <rect
                x={rightEyeCx - eyeRx - 1}
                y={eyeCenterY - rightEyeRy - 1}
                width={eyeRx * 2 + 2}
                height={rightEyeRy * 2 + 2}
                fill={COLORS.mid}
                opacity="0.85"
                rx={eyeRx}
              />
            </g>
          )}
        </g>

        {/* ── Mouth ─────────────────────────────────────────────── */}
        <g className="novi-mouth-group">
          {/* Smile — corners lift with eyeArc, center dips slightly */}
          <path
            d={`M ${44} ${eyeCenterY + 18 - cfg.eyeArc * 0.5} Q 50 ${eyeCenterY + 18 + cfg.eyeArc * 0.4} ${56} ${eyeCenterY + 18 - cfg.eyeArc * 0.5}`}
            stroke={COLORS.edge}
            strokeWidth="1"
            fill="none"
            strokeLinecap="round"
            opacity="0.5"
            className="novi-mouth"
            style={{ transition: "d 400ms ease-out" }}
          />
          {/* Tiny lip highlight */}
          <path
            d={`M ${45} ${eyeCenterY + 17 - cfg.eyeArc * 0.4} Q 50 ${eyeCenterY + 17.5 + cfg.eyeArc * 0.3} ${55} ${eyeCenterY + 17 - cfg.eyeArc * 0.4}`}
            stroke={COLORS.core}
            strokeWidth="0.4"
            fill="none"
            strokeLinecap="round"
            opacity="0.25"
          />
        </g>

        {/* ── Hands ──────────────────────────────────────────────── */}
        <g className={`novi-hands-group${handsHeart ? " novi-hands-heart" : ""}`}>
          {/* Left hand — tiny rounded shape */}
          <g
            className="novi-hand novi-hand-left"
            style={{
              transform: `translate(${cfg.handLeftX}px, ${cfg.handLeftY + notifHandOffset}px)`,
              transition: "transform 500ms ease-out",
            }}
          >
            <ellipse cx="22" cy="60" rx="5" ry="4" fill={COLORS.mid} opacity="0.7" />
            {/* Tiny finger details */}
            <circle cx="20" cy="58" r="1.5" fill={COLORS.core} opacity="0.4" />
            <circle cx="22" cy="57" r="1.2" fill={COLORS.core} opacity="0.35" />
            <circle cx="24" cy="58" r="1.4" fill={COLORS.core} opacity="0.38" />
          </g>

          {/* Right hand */}
          <g
            className="novi-hand novi-hand-right"
            style={{
              transform: `translate(${cfg.handRightX}px, ${cfg.handRightY + notifHandRightOffset}px)`,
              transition: "transform 500ms ease-out",
            }}
          >
            <ellipse cx="78" cy="60" rx="5" ry="4" fill={COLORS.mid} opacity="0.7" />
            <circle cx="76" cy="58" r="1.5" fill={COLORS.core} opacity="0.4" />
            <circle cx="78" cy="57" r="1.2" fill={COLORS.core} opacity="0.35" />
            <circle cx="80" cy="58" r="1.4" fill={COLORS.core} opacity="0.38" />
          </g>
        </g>

        {/* ── Sparkle Particles ──────────────────────────────────── */}
        <g className="novi-sparkles-group">
          {sparkles}
        </g>

        {/* ── Department Accessory ────────────────────────────────── */}
        {accessory && (
          <g className="novi-accessory-group" key={accessoryKey}>
            <AccessoryGlyph type={accessory} />
          </g>
        )}

        {/* ── Celebrating sparkle burst ──────────────────────────── */}
        {expression === "celebrating" && (
          <g className="novi-celebration-burst">
            {Array.from({ length: 10 }).map((_, i) => {
              const angle = (i / 10) * 360;
              const dist = 25 + (i % 3) * 10;
              const cx = 50 + Math.cos((angle * Math.PI) / 180) * dist;
              const cy = 50 + Math.sin((angle * Math.PI) / 180) * dist;
              const sz = 1 + (i % 3) * 0.8;
              const isTriangle = i % 3 === 0;
              return (
                <g key={`burst-${i}`} className="novi-burst-particle" style={{ animationDelay: `${i * 0.08}s` }}>
                  {isTriangle ? (
                    <polygon
                      points={`${cx},${cy - sz} ${cx + sz * 0.7},${cy + sz * 0.5} ${cx - sz * 0.7},${cy + sz * 0.5}`}
                      fill={i % 2 === 0 ? COLORS.champagne : "#FB7185"}
                      opacity="0.9"
                    />
                  ) : (
                    <circle cx={cx} cy={cy} r={sz * 0.5} fill={i % 2 === 0 ? "white" : COLORS.champagne} opacity="0.8" />
                  )}
                </g>
              );
            })}
          </g>
        )}

        {/* ── M8: Micro sparkle (random celebration moments) ──────── */}
        {microSparkle.active && (
          <g className="novi-micro-sparkle">
            <circle
              cx={microSparkleCx}
              cy={microSparkleCy}
              r="1.5"
              fill={COLORS.champagne}
              opacity="0.8"
            />
            <circle
              cx={microSparkleCx}
              cy={microSparkleCy}
              r="3"
              fill={COLORS.champagneSoft}
              opacity="0.25"
            />
          </g>
        )}

        {/* ── Proud glistening tear effect ─────────────────────── */}
        {expression === "proud" && (
          <g className="novi-glisten" opacity="0.3">
            <circle cx={leftEyeCx + eyeRx - 1} cy={eyeCenterY + eyeRy - 1} r="0.8" fill={COLORS.core} />
            <circle cx={rightEyeCx + eyeRx - 1} cy={eyeCenterY + eyeRy - 1} r="0.8" fill={COLORS.core} />
          </g>
        )}
      </svg>
    </span>
  );
}
