import type { ReactNode } from "react";
import Novi, { type NoviExpression, type NoviProps, type NoviSize } from "../Novi";

export function NoviAvatar(props: NoviProps) {
  return <Novi {...props} />;
}

export function NoviState(props: NoviProps) {
  return <Novi {...props} />;
}

interface NoviCalloutProps {
  title: string;
  children: ReactNode;
  expression?: NoviExpression;
  action?: ReactNode;
  tone?: "neutral" | "warning" | "success" | "serious";
  className?: string;
}

const CALLOUT_TONES = {
  neutral: "border-pink-200 bg-pink-50/70",
  warning: "border-amber-200 bg-amber-50",
  success: "border-emerald-200 bg-emerald-50",
  serious: "border-red-200 bg-red-50",
};

export function NoviCallout({
  title,
  children,
  expression = "calm",
  action,
  tone = "neutral",
  className = "",
}: NoviCalloutProps) {
  return (
    <aside className={`flex items-start gap-3 rounded-lg border p-4 ${CALLOUT_TONES[tone]} ${className}`} aria-label={`Novi says: ${title}`}>
      <NoviAvatar expression={expression} size="sm" animated={false} />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-neutral-900">{title}</p>
        <div className="mt-1 text-sm text-neutral-600">{children}</div>
        {action && <div className="mt-3">{action}</div>}
      </div>
    </aside>
  );
}

interface NoviEmptyStateProps {
  title: string;
  description: string;
  expression?: NoviExpression;
  action?: ReactNode;
  children?: ReactNode;
  className?: string;
}

export function NoviEmptyState({
  title,
  description,
  expression = "comforting",
  action,
  children,
  className = "",
}: NoviEmptyStateProps) {
  return (
    <div className={`flex flex-col items-center justify-center px-4 py-10 text-center ${className}`}>
      <NoviAvatar expression={expression} size="lg" />
      <h3 className="mt-4 text-lg font-semibold text-neutral-900">{title}</h3>
      <p className="mt-2 max-w-md text-sm text-neutral-600">{description}</p>
      {action && <div className="mt-5">{action}</div>}
      {children}
    </div>
  );
}

interface NoviHomepageAppearanceProps {
  children: ReactNode;
  expression?: NoviExpression;
  size?: Extract<NoviSize, "md" | "lg" | "xl">;
  label?: string;
  className?: string;
}

export function NoviHomepageAppearance({
  children,
  expression = "calm",
  size = "lg",
  label = "Novi",
  className = "",
}: NoviHomepageAppearanceProps) {
  return (
    <div className={`flex flex-col gap-5 sm:flex-row sm:items-start ${className}`}>
      <div className="flex shrink-0 flex-col items-center gap-1.5">
        <NoviAvatar expression={expression} size={size} priority />
        <span className="text-xs font-medium text-purple-600">{label}</span>
      </div>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
