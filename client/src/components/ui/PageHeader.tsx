import React from 'react';

// ── Breadcrumb type ──────────────────────────────────────────────
export interface Breadcrumb {
  label: string;
  href?: string;
}

// ── PageHeader Props ─────────────────────────────────────────────
export interface PageHeaderProps {
  /** Page title — uses TYPOGRAPHY.pageTitle */
  title: string;
  /** Optional muted description below the title */
  description?: string;
  /** Actions to display on the right side (buttons, etc.) */
  actions?: React.ReactNode;
  /** Breadcrumbs shown above the title */
  breadcrumbs?: Breadcrumb[];
  /** Optional Novi element to display beside the title */
  novi?: React.ReactNode;
  /** Additional CSS classes */
  className?: string;
}

// ── PageHeader Component ─────────────────────────────────────────
export function PageHeader({
  title,
  description,
  actions,
  breadcrumbs,
  novi,
  className = '',
}: PageHeaderProps) {
  return (
    <div className={`${className}`}>
      {/* Breadcrumbs */}
      {breadcrumbs && breadcrumbs.length > 0 && (
        <nav className="flex items-center gap-1.5 mb-2 text-sm text-neutral-500" aria-label="Breadcrumb">
          {breadcrumbs.map((crumb, i) => (
            <React.Fragment key={i}>
              {i > 0 && <span className="text-neutral-300">/</span>}
              {crumb.href ? (
                <a
                  href={crumb.href}
                  className="hover:text-rose-500 transition-colors"
                >
                  {crumb.label}
                </a>
              ) : (
                <span className="text-neutral-900 font-medium">{crumb.label}</span>
              )}
            </React.Fragment>
          ))}
        </nav>
      )}

      {/* Title + Actions row */}
      <div className="flex items-start sm:items-center justify-between gap-4 flex-wrap">
        <div className="min-w-0 flex items-center gap-3">
          {novi && <span className="flex-shrink-0">{novi}</span>}
          <div>
            <h1 className="text-2xl font-bold text-neutral-900">{title}</h1>
            {description && (
              <p className="mt-1 text-sm text-neutral-500">{description}</p>
            )}
          </div>
        </div>
        {actions && (
          <div className="flex items-center gap-2 flex-shrink-0">{actions}</div>
        )}
      </div>
    </div>
  );
}

export default PageHeader;
