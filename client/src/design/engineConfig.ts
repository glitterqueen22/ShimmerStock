// ── Engine Configuration ────────────────────────────────────────
// Every engine gets a consistent badge: icon + label + color.
// Used by <Badge engine="production" /> and anywhere engine identity is needed.

export interface EngineConfig {
  name: string;
  icon: string;
  label: string;
  color: string;       // Tailwind bg color class
  textColor: string;   // Tailwind text color class
  borderColor: string; // Tailwind border color class
}

export const ENGINE_CONFIG: Record<string, EngineConfig> = {
  production: {
    name: 'production',
    icon: '🏭',
    label: 'Production',
    color: 'bg-amber-50',
    textColor: 'text-amber-700',
    borderColor: 'border-amber-200',
  },
  purchasing: {
    name: 'purchasing',
    icon: '📦',
    label: 'Purchasing',
    color: 'bg-blue-50',
    textColor: 'text-blue-700',
    borderColor: 'border-blue-200',
  },
  supplier: {
    name: 'supplier',
    icon: '📦',
    label: 'Supplier',
    color: 'bg-blue-50',
    textColor: 'text-blue-700',
    borderColor: 'border-blue-200',
  },
  commerce: {
    name: 'commerce',
    icon: '📋',
    label: 'Commerce',
    color: 'bg-green-50',
    textColor: 'text-green-700',
    borderColor: 'border-green-200',
  },
  order: {
    name: 'order',
    icon: '📋',
    label: 'Orders',
    color: 'bg-green-50',
    textColor: 'text-green-700',
    borderColor: 'border-green-200',
  },
  scan: {
    name: 'scan',
    icon: '📋',
    label: 'Scan',
    color: 'bg-green-50',
    textColor: 'text-green-700',
    borderColor: 'border-green-200',
  },
  inventory: {
    name: 'inventory',
    icon: '📦',
    label: 'Inventory',
    color: 'bg-slate-50',
    textColor: 'text-slate-700',
    borderColor: 'border-slate-200',
  },
  product: {
    name: 'product',
    icon: '📦',
    label: 'Products',
    color: 'bg-slate-50',
    textColor: 'text-slate-700',
    borderColor: 'border-slate-200',
  },
  calculation: {
    name: 'calculation',
    icon: '🧮',
    label: 'Calculation',
    color: 'bg-teal-50',
    textColor: 'text-teal-700',
    borderColor: 'border-teal-200',
  },
  bestie: {
    name: 'bestie',
    icon: '✨',
    label: 'Novi',
    color: 'bg-purple-50',
    textColor: 'text-purple-700',
    borderColor: 'border-purple-200',
  },
  system: {
    name: 'system',
    icon: '🔧',
    label: 'System',
    color: 'bg-gray-50',
    textColor: 'text-gray-700',
    borderColor: 'border-gray-200',
  },
  auth: {
    name: 'auth',
    icon: '🔧',
    label: 'Auth',
    color: 'bg-gray-50',
    textColor: 'text-gray-700',
    borderColor: 'border-gray-200',
  },
  user: {
    name: 'user',
    icon: '🔧',
    label: 'User',
    color: 'bg-gray-50',
    textColor: 'text-gray-700',
    borderColor: 'border-gray-200',
  },
  settings: {
    name: 'settings',
    icon: '🔧',
    label: 'Settings',
    color: 'bg-gray-50',
    textColor: 'text-gray-700',
    borderColor: 'border-gray-200',
  },
  warehouse: {
    name: 'warehouse',
    icon: '🏗️',
    label: 'Warehouse',
    color: 'bg-sky-50',
    textColor: 'text-sky-700',
    borderColor: 'border-sky-200',
  },
  shipping: {
    name: 'shipping',
    icon: '🚚',
    label: 'Shipping',
    color: 'bg-indigo-50',
    textColor: 'text-indigo-700',
    borderColor: 'border-indigo-200',
  },
  customer_service: {
    name: 'customer_service',
    icon: '💬',
    label: 'Customer Svc',
    color: 'bg-pink-50',
    textColor: 'text-pink-700',
    borderColor: 'border-pink-200',
  },
  marketing: {
    name: 'marketing',
    icon: '📢',
    label: 'Marketing',
    color: 'bg-fuchsia-50',
    textColor: 'text-fuchsia-700',
    borderColor: 'border-fuchsia-200',
  },
  novi: {
    name: 'novi',
    icon: '✨',
    label: 'Novi',
    color: 'bg-purple-50',
    textColor: 'text-purple-700',
    borderColor: 'border-purple-200',
  },
  opportunities: {
    name: 'opportunities',
    icon: '💡',
    label: 'Opportunities',
    color: 'bg-yellow-50',
    textColor: 'text-yellow-700',
    borderColor: 'border-yellow-200',
  },
  studio: {
    name: 'studio',
    icon: '🎨',
    label: 'Studio',
    color: 'bg-violet-50',
    textColor: 'text-violet-700',
    borderColor: 'border-violet-200',
  },
  fulfillment: {
    name: 'fulfillment',
    icon: '🚚',
    label: 'Fulfillment',
    color: 'bg-indigo-50',
    textColor: 'text-indigo-700',
    borderColor: 'border-indigo-200',
  },
};

// ── Status Configuration ────────────────────────────────────────
export interface StatusConfig {
  color: string;
  textColor: string;
  borderColor: string;
  icon: string;
}

export const STATUS_CONFIG: Record<string, StatusConfig> = {
  success: {
    color: 'bg-emerald-50',
    textColor: 'text-emerald-700',
    borderColor: 'border-emerald-200',
    icon: '✅',
  },
  warning: {
    color: 'bg-amber-50',
    textColor: 'text-amber-700',
    borderColor: 'border-amber-200',
    icon: '⚠️',
  },
  danger: {
    color: 'bg-red-50',
    textColor: 'text-red-700',
    borderColor: 'border-red-200',
    icon: '❌',
  },
  info: {
    color: 'bg-blue-50',
    textColor: 'text-blue-700',
    borderColor: 'border-blue-200',
    icon: 'ℹ️',
  },
  neutral: {
    color: 'bg-gray-50',
    textColor: 'text-gray-700',
    borderColor: 'border-gray-200',
    icon: '•',
  },
} as const;

// ── Urgency Configuration ───────────────────────────────────────
export interface UrgencyConfig extends StatusConfig {
  label: string;
}

export const URGENCY_CONFIG: Record<string, UrgencyConfig> = {
  now: {
    ...STATUS_CONFIG.danger,
    label: 'Now',
  },
  soon: {
    ...STATUS_CONFIG.warning,
    label: 'Soon',
  },
  ok: {
    ...STATUS_CONFIG.info,
    label: 'OK',
  },
  low: {
    ...STATUS_CONFIG.neutral,
    label: 'Low',
  },
} as const;
