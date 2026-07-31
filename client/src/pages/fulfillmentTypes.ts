// ── Shared types between Fulfillment.tsx and PrintableLabel.tsx ──

export interface TemplateConfig {
  logo?: string;
  primaryColor?: string;
  accentColor?: string;
  font?: string;
  showThankYou?: boolean;
  thankYouMessage?: string;
  showSocialMedia?: boolean;
  socialHandles?: string;
  showQrCode?: boolean;
  showProductPhotos?: boolean;
  showOrderNotes?: boolean;
  showGiftMessage?: boolean;
  showBarcode?: boolean;
  showWarehouseLocation?: boolean;
  showPickListInfo?: boolean;
  showPackedBy?: boolean;
  customFields?: { label: string; value: string }[];
  labelSize?: string;
  [key: string]: any;
}

export function defaultTemplateConfig(type: string): TemplateConfig {
  const base: TemplateConfig = {
    primaryColor: '#e11d48',
    accentColor: '#fda4af',
    font: 'Inter',
    showThankYou: true,
    thankYouMessage: 'Thank you for your order!',
    showSocialMedia: false,
    socialHandles: '',
    showQrCode: false,
    showProductPhotos: false,
    showOrderNotes: true,
    showGiftMessage: false,
    showBarcode: false,
    showWarehouseLocation: false,
    showPickListInfo: false,
    showPackedBy: false,
  };
  if (type === 'shipping_label') {
    base.labelSize = '4x6 thermal';
  }
  return base;
}
