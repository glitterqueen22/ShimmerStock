/**
 * AI Brand Setup Engine
 * =====================
 * Novi auto-generates branded business documents from a logo + website URL.
 * Uses heuristics (not actual AI) for V1 — smart defaults that look great.
 *
 * Works with Fulfillment HQ 1.1's fulfillment_templates system.
 */

// ── Style Presets ────────────────────────────────────────────────────────

export const STYLE_PRESETS = {
  elegant: {
    name: "Elegant",
    icon: "✨",
    description: "Serif fonts, gold accents, cream background",
    colors: {
      primary: "#b8860b",    // dark goldenrod
      secondary: "#daa520",  // goldenrod
      accent: "#f5deb3",     // wheat
      text: "#3d2b1f",       // dark brown
      background: "#fffef7", // cream
    },
    fonts: {
      heading: "Georgia, 'Times New Roman', serif",
      body: "Georgia, 'Times New Roman', serif",
    },
    style: "elegant",
    tone: "professional",
  },
  natural: {
    name: "Natural",
    icon: "🌿",
    description: "Earth tones, rounded sans-serif, kraft paper texture",
    colors: {
      primary: "#5c4033",    // dark brown
      secondary: "#8b7355",  // warm brown
      accent: "#a8b88a",     // sage green
      text: "#3b2f2f",       // dark brown
      background: "#faf6f0", // warm white
    },
    fonts: {
      heading: "'Nunito', 'Segoe UI', sans-serif",
      body: "'Nunito', 'Segoe UI', sans-serif",
    },
    style: "natural",
    tone: "friendly",
  },
  fun: {
    name: "Fun",
    icon: "🎉",
    description: "Bright colors, playful fonts, confetti accents",
    colors: {
      primary: "#ff6b6b",    // coral red
      secondary: "#ffd93d",  // sunny yellow
      accent: "#6bcb77",     // lime green
      text: "#2d3436",       // near black
      background: "#ffffff",
    },
    fonts: {
      heading: "'Poppins', 'Segoe UI', sans-serif",
      body: "'Poppins', 'Segoe UI', sans-serif",
    },
    style: "fun",
    tone: "playful",
  },
  modern: {
    name: "Modern",
    icon: "🖤",
    description: "Minimalist, monochrome, clean lines",
    colors: {
      primary: "#1a1a1a",    // near black
      secondary: "#666666",  // gray
      accent: "#e5e5e5",     // light gray
      text: "#1a1a1a",       // near black
      background: "#ffffff",
    },
    fonts: {
      heading: "'Inter', 'Helvetica Neue', sans-serif",
      body: "'Inter', 'Helvetica Neue', sans-serif",
    },
    style: "modern",
    tone: "minimal",
  },
  luxury: {
    name: "Luxury",
    icon: "💎",
    description: "Dark backgrounds, metallic accents, thin fonts",
    colors: {
      primary: "#c9a84c",    // gold
      secondary: "#8b7355",  // bronze
      accent: "#e8d5b7",     // champagne
      text: "#f5f0e8",       // off-white
      background: "#1a1a2e", // midnight navy
    },
    fonts: {
      heading: "'Cormorant Garamond', Georgia, serif",
      body: "'Inter', 'Helvetica Neue', sans-serif",
    },
    style: "luxury",
    tone: "professional",
  },
  colorful: {
    name: "Colorful",
    icon: "🌈",
    description: "Vibrant palette, bold typography",
    colors: {
      primary: "#6c5ce7",    // purple
      secondary: "#00cec9",  // teal
      accent: "#fab1a0",     // coral
      text: "#2d3436",       // near black
      background: "#ffffff",
    },
    fonts: {
      heading: "'Montserrat', 'Segoe UI', sans-serif",
      body: "'Nunito', 'Segoe UI', sans-serif",
    },
    style: "colorful",
    tone: "friendly",
  },
};

// ── Template Type Definitions ────────────────────────────────────────────

export const TEMPLATE_TYPES = [
  { type: "packing_slip", label: "Packing Slip", icon: "📦" },
  { type: "invoice", label: "Invoice", icon: "🧾" },
  { type: "shipping_label", label: "Shipping Label (4×6)", icon: "🏷️" },
  { type: "thank_you_card", label: "Thank-You Card", icon: "💌" },
  { type: "return_slip", label: "Return Slip", icon: "↩️" },
  { type: "email_header", label: "Email Header", icon: "📧" },
  { type: "email_signature", label: "Email Signature", icon: "✍️" },
  { type: "quote_template", label: "Quote Template", icon: "📝" },
];

// ── Logo Analysis (Heuristic) ────────────────────────────────────────────

/**
 * Extract brand colors from a logo URL using heuristic analysis.
 * Since we can't run actual computer vision, we use a smart default approach:
 * 1. Accept the logo URL
 * 2. Generate a reasonable palette based on style archetypes
 * 3. If the user provides brand colors directly, use those
 */
export function extractBrandFromLogo(logoUrl) {
  // V1: Heuristic approach — analyze URL patterns and return reasonable defaults
  const result = {
    logoUrl,
    detectedColors: null,
    isDarkLogo: false,
    suggestedStyle: "modern",
    suggestedFontStyle: "sans-serif",
  };

  // Try to detect characteristics from the URL/filename
  if (logoUrl) {
    const lower = logoUrl.toLowerCase();

    // Detect industry/style hints from filename
    if (lower.includes("gold") || lower.includes("luxury") || lower.includes("premium")) {
      result.suggestedStyle = "luxury";
      result.suggestedFontStyle = "serif";
    } else if (lower.includes("green") || lower.includes("eco") || lower.includes("nature")) {
      result.suggestedStyle = "natural";
      result.suggestedFontStyle = "sans-serif";
    } else if (lower.includes("color") || lower.includes("rainbow") || lower.includes("bright")) {
      result.suggestedStyle = "colorful";
      result.suggestedFontStyle = "sans-serif";
    } else if (lower.includes("dark") || lower.includes("black")) {
      result.suggestedStyle = "modern";
      result.isDarkLogo = true;
    }
  }

  return result;
}

// ── Website Analysis ─────────────────────────────────────────────────────

/**
 * Extract brand data from a website URL.
 * Attempts to fetch the page and extract meta tags, colors, and social links.
 */
export async function extractBrandFromWebsite(websiteUrl) {
  const result = {
    websiteUrl,
    pageTitle: null,
    metaDescription: null,
    socialLinks: {},
    detectedColors: null,
    industry: null,
    error: null,
  };

  if (!websiteUrl) return result;

  try {
    const normalizedUrl = websiteUrl.startsWith("http") ? websiteUrl : `https://${websiteUrl}`;
    const response = await fetch(normalizedUrl, {
      headers: { "User-Agent": "ShimmerStock-BrandSetup/1.0" },
      signal: AbortSignal.timeout(8000),
    });

    if (!response.ok) {
      result.error = `Received ${response.status} from website`;
      return result;
    }

    const html = await response.text();

    // Extract title
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    if (titleMatch) {
      result.pageTitle = titleMatch[1].trim();
    }

    // Extract meta description
    const descMatch = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i)
      || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["']/i);
    if (descMatch) {
      result.metaDescription = descMatch[1].trim();
    }

    // Extract social links
    const socialPatterns = {
      instagram: /https?:\/\/(?:www\.)?instagram\.com\/([A-Za-z0-9_.]+)/i,
      facebook: /https?:\/\/(?:www\.)?facebook\.com\/([A-Za-z0-9.]+)/i,
      twitter: /https?:\/\/(?:www\.)?(?:twitter|x)\.com\/([A-Za-z0-9_]+)/i,
      tiktok: /https?:\/\/(?:www\.)?tiktok\.com\/@?([A-Za-z0-9_.]+)/i,
      pinterest: /https?:\/\/(?:www\.)?pinterest\.com\/([A-Za-z0-9]+)/i,
      youtube: /https?:\/\/(?:www\.)?youtube\.com\/(?:@|channel\/|c\/)?([A-Za-z0-9_]+)/i,
    };

    for (const [platform, pattern] of Object.entries(socialPatterns)) {
      const match = html.match(pattern);
      if (match) {
        result.socialLinks[platform] = match[0];
      }
    }

    // Extract CSS colors
    const colorMatches = html.match(/#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b/g);
    if (colorMatches && colorMatches.length > 0) {
      const colorCounts = {};
      for (const c of colorMatches) {
        const normalized = c.length === 4
          ? `#${c[1]}${c[1]}${c[2]}${c[2]}${c[3]}${c[3]}`
          : c.toLowerCase();
        colorCounts[normalized] = (colorCounts[normalized] || 0) + 1;
      }
      const sorted = Object.entries(colorCounts)
        .sort((a, b) => b[1] - a[1])
        .filter(([c]) => !["#ffffff", "#000000", "#fff", "#000"].includes(c));

      if (sorted.length > 0) {
        result.detectedColors = {
          primary: sorted[0][0],
          secondary: sorted[1] ? sorted[1][0] : null,
          accent: sorted[2] ? sorted[2][0] : null,
        };
      }
    }

    // Detect industry from keywords
    const content = (result.pageTitle || "") + " " + (result.metaDescription || "") + " " + html.substring(0, 5000);
    result.industry = detectIndustry(content);

  } catch (err) {
    result.error = err.message || "Failed to fetch website";
  }

  return result;
}

// ── Industry Detection ───────────────────────────────────────────────────

function detectIndustry(content) {
  const lower = content.toLowerCase();
  const industries = {
    "candles & home fragrance": ["candle", "soy wax", "beeswax", "home fragrance", "diffuser", "room spray"],
    "skincare & beauty": ["skincare", "serum", "moisturizer", "beauty", "cosmetics", "lotion", "cream", "lip"],
    "food & beverage": ["coffee", "tea", "snack", "chocolate", "baked", "bread", "sauce", "spice", "recipe"],
    "clothing & apparel": ["clothing", "apparel", "shirt", "dress", "fashion", "wear", "hoodie"],
    "jewelry & accessories": ["jewelry", "necklace", "bracelet", "earring", "ring", "accessory"],
    "art & stationery": ["art print", "stationery", "notebook", "sticker", "card", "journal"],
    "home goods": ["home", "decor", "pillow", "blanket", "kitchen", "ceramic", "pottery"],
    "pets": ["pet", "dog", "cat", "leash", "treat", "toy"],
    "wellness & fitness": ["wellness", "fitness", "yoga", "supplement", "vitamin", "workout"],
  };

  for (const [industry, keywords] of Object.entries(industries)) {
    const score = keywords.filter(k => lower.includes(k)).length;
    if (score >= 2) return industry;
  }

  // Single keyword match — still useful
  for (const [industry, keywords] of Object.entries(industries)) {
    if (keywords.some(k => lower.includes(k))) return industry;
  }

  return null;
}

// ── Brand Kit Generator ──────────────────────────────────────────────────

/**
 * Build a complete brandKit object from extracted data.
 * Merges logo analysis, website data, user-provided overrides, and style presets.
 */
export function buildBrandKit({ logoUrl, websiteData, brandColors, brandName, style }) {
  const baseStyle = style && STYLE_PRESETS[style] ? STYLE_PRESETS[style] : STYLE_PRESETS.modern;
  const presets = baseStyle;

  // Determine colors — priority: user-provided > website-detected > style preset
  const colors = {
    primary: brandColors?.primary || websiteData?.detectedColors?.primary || presets.colors.primary,
    secondary: brandColors?.secondary || websiteData?.detectedColors?.secondary || presets.colors.secondary,
    accent: brandColors?.accent || websiteData?.detectedColors?.accent || presets.colors.accent,
    text: presets.colors.text,
    background: presets.colors.background,
  };

  // Determine brand name
  const name = brandName || websiteData?.pageTitle || "Your Business";

  // Clean up website title (remove "|", "-" suffixes)
  let cleanName = name;
  if (cleanName && !brandName) {
    cleanName = cleanName.replace(/\s*[|\-–—]\s*.+$/, "").trim();
  }

  const brandKit = {
    logo_url: logoUrl || null,
    brand_name: cleanName,
    colors,
    fonts: presets.fonts,
    style: presets.style,
    tone: presets.tone,
    social_links: {
      instagram: websiteData?.socialLinks?.instagram || null,
      facebook: websiteData?.socialLinks?.facebook || null,
      twitter: websiteData?.socialLinks?.twitter || null,
      tiktok: websiteData?.socialLinks?.tiktok || null,
      website: websiteData?.websiteUrl || null,
    },
    detected_industry: websiteData?.industry || null,
    generated_at: new Date().toISOString(),
  };

  return brandKit;
}

// ── Template Config Generators ───────────────────────────────────────────

/**
 * Generate the config object for a specific template type from a brand kit.
 */
export function generateTemplateConfig(templateType, brandKit) {
  const { colors, fonts, logo_url, brand_name, social_links, style } = brandKit;

  const baseConfig = {
    logo_url: logo_url || "",
    logo_position: "top-center",
    brand_colors: {
      primary: colors.primary,
      secondary: colors.secondary,
      accent: colors.accent,
    },
    font_family: fonts.heading,
    generated_by: "novi",
    brand_kit_version: 1,
    style: style,
  };

  switch (templateType) {
    case "packing_slip":
      return {
        ...baseConfig,
        type: "packing_slip",
        show_thank_you: true,
        thank_you_message: `Thank you for choosing ${brand_name}! We appreciate your order.`,
        show_social: !!social_links?.instagram,
        social_handles: {
          instagram: social_links?.instagram ? `@${extractSocialHandle(social_links.instagram, "instagram")}` : null,
          facebook: social_links?.facebook || null,
          website: social_links?.website || null,
        },
        show_brand_title: true,
        paper_size: "letter",
      };

    case "invoice":
      return {
        ...baseConfig,
        type: "invoice",
        payment_terms: "Net 30",
        show_tax_id: false,
        tax_id: "",
        show_payment_qr: false,
        show_brand_title: true,
        footer_text: `Thank you for your business — ${brand_name}`,
        paper_size: "letter",
      };

    case "shipping_label":
      return {
        ...baseConfig,
        type: "shipping_label",
        show_barcode: true,
        label_size: "4x6",
        show_order_ref: true,
        return_address_text: `${brand_name}`,
        compact_layout: true,
      };

    case "thank_you_card":
      return {
        ...baseConfig,
        type: "thank_you_card",
        message: `Thank you for supporting ${brand_name}! Every order means the world to us. We hope you love your purchase.`,
        card_size: "4x6",
        show_social: !!social_links?.instagram,
        social_handles: {
          instagram: social_links?.instagram ? `@${extractSocialHandle(social_links.instagram, "instagram")}` : null,
          facebook: social_links?.facebook || null,
          website: social_links?.website || null,
        },
        signature: `With love,\nThe ${brand_name} Team`,
        show_product_image: false,
      };

    case "return_slip":
      return {
        ...baseConfig,
        type: "return_slip",
        return_policy: "Returns accepted within 30 days of delivery. Items must be unused and in original packaging.",
        show_instructions: true,
        rma_prefix: "RMA",
        paper_size: "letter",
      };

    case "email_header":
      return {
        ...baseConfig,
        type: "email_header",
        header_height: "120px",
        logo_size: "60px",
        show_tagline: true,
        tagline: `Handcrafted by ${brand_name}`,
        alignment: "center",
      };

    case "email_signature":
      return {
        ...baseConfig,
        type: "email_signature",
        name_placeholder: "Your Name",
        title_placeholder: "Your Title",
        show_social_icons: true,
        social_handles: {
          instagram: social_links?.instagram || null,
          facebook: social_links?.facebook || null,
          website: social_links?.website || null,
        },
        show_logo: true,
        logo_size: "40px",
      };

    case "quote_template":
      return {
        ...baseConfig,
        type: "quote_template",
        watermark: "QUOTE",
        show_expiry: true,
        expiry_days: 30,
        payment_terms: "Due upon acceptance",
        footer_text: `This is a quote, not an invoice. Valid for 30 days.`,
        paper_size: "letter",
      };

    default:
      return baseConfig;
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────

function extractSocialHandle(url, platform) {
  if (!url) return null;
  try {
    const urlObj = new URL(url);
    const path = urlObj.pathname.replace(/\/$/, "");
    const parts = path.split("/");
    return parts[parts.length - 1] || parts[0];
  } catch {
    return url.split("/").pop() || url;
  }
}

// ── Conversational Edit Parser ───────────────────────────────────────────

/**
 * Parse a natural language instruction and update a template config.
 * Uses keyword matching (V1 heuristic, no LLM).
 * Returns { updatedConfig, changesDescription }.
 */
export function parseConversationalEdit(instruction, brandKit, currentConfig) {
  const lower = instruction.toLowerCase().trim();
  const changes = [];
  const updated = { ...currentConfig };

  // "make it more premium" / "make it more elegant" / "luxury feel"
  if (lower.includes("premium") || lower.includes("luxury") || lower.includes("high-end") || lower.includes("elegant")) {
    updated.brand_colors = { ...STYLE_PRESETS.luxury.colors };
    updated.brand_colors.primary = updated.brand_colors.primary || STYLE_PRESETS.luxury.colors.primary;
    updated.font_family = STYLE_PRESETS.luxury.fonts.heading;
    updated.style = "luxury";
    changes.push("Adjusted to luxury color palette with elegant serif fonts");
  }

  // "make it more natural" / "earthy"
  if (lower.includes("natural") || lower.includes("earthy") || lower.includes("organic")) {
    updated.brand_colors = { ...STYLE_PRESETS.natural.colors };
    updated.font_family = STYLE_PRESETS.natural.fonts.heading;
    updated.style = "natural";
    changes.push("Switched to natural earth tones with warm fonts");
  }

  // "make it more fun" / "playful"
  if (lower.includes("fun") || lower.includes("playful") || lower.includes("bright") || lower.includes("cheerful")) {
    updated.brand_colors = { ...STYLE_PRESETS.fun.colors };
    updated.font_family = STYLE_PRESETS.fun.fonts.heading;
    updated.style = "fun";
    changes.push("Brightened up with playful colors and fun fonts");
  }

  // "make it more modern" / "clean" / "minimal"
  if (lower.includes("modern") || lower.includes("clean") || lower.includes("minimal")) {
    updated.brand_colors = { ...STYLE_PRESETS.modern.colors };
    updated.font_family = STYLE_PRESETS.modern.fonts.heading;
    updated.style = "modern";
    changes.push("Cleaned up with modern minimalist styling");
  }

  // Color changes
  const colorKeywords = {
    pink: "#e91e8c", rose: "#e91e8c", magenta: "#e91e8c",
    blue: "#3b82f6", navy: "#1e3a5f",
    green: "#22c55e", emerald: "#10b981",
    purple: "#8b5cf6", violet: "#7c3aed",
    red: "#ef4444", crimson: "#dc2626",
    orange: "#f97316", amber: "#f59e0b",
    gold: "#c9a84c", metallic: "#c0c0c0",
    teal: "#14b8a6", cyan: "#06b6d4",
    black: "#1a1a1a", white: "#ffffff",
    gray: "#6b7280", grey: "#6b7280",
    brown: "#8b4513",
    lavender: "#a78bfa", coral: "#ff6b6b",
    peach: "#fda4af", mint: "#a7f3d0",
  };

  for (const [word, hex] of Object.entries(colorKeywords)) {
    if (lower.includes(word)) {
      updated.brand_colors = updated.brand_colors || {};
      if (lower.includes("more") || lower.includes("use") || lower.includes("make")) {
        updated.brand_colors.primary = hex;
        changes.push(`Shifted primary color to ${word}`);
      } else {
        updated.brand_colors.accent = hex;
        changes.push(`Added ${word} as accent color`);
      }
      break; // Only apply one color change
    }
  }

  // "move logo to top" / "move logo to left"
  if (lower.includes("logo")) {
    if (lower.includes("top")) {
      updated.logo_position = "top-center";
      changes.push("Moved logo to the top");
    } else if (lower.includes("left")) {
      updated.logo_position = "top-left";
      changes.push("Moved logo to the left");
    } else if (lower.includes("right")) {
      updated.logo_position = "top-right";
      changes.push("Moved logo to the right");
    } else if (lower.includes("center")) {
      updated.logo_position = "top-center";
      changes.push("Centered the logo");
    } else if (lower.includes("bottom")) {
      updated.logo_position = "bottom-center";
      changes.push("Moved logo to the bottom");
    }
  }

  // "add my Instagram" / "add social"
  if (lower.includes("instagram") || lower.includes("social")) {
    updated.show_social = true;
    updated.social_handles = updated.social_handles || {};
    if (brandKit?.social_links?.instagram) {
      updated.social_handles.instagram = brandKit.social_links.instagram;
    }
    changes.push("Added Instagram to the template");
  }

  // "add Facebook"
  if (lower.includes("facebook")) {
    updated.social_handles = updated.social_handles || {};
    if (brandKit?.social_links?.facebook) {
      updated.social_handles.facebook = brandKit.social_links.facebook;
    }
    changes.push("Added Facebook to the template");
  }

  // "make the font bigger" / "larger text"
  if (lower.includes("font bigger") || lower.includes("larger") || lower.includes("bigger text")) {
    updated.font_size_multiplier = (updated.font_size_multiplier || 1) + 0.15;
    changes.push("Increased font size by 15%");
  }

  // "make the font smaller"
  if (lower.includes("font smaller") || lower.includes("smaller text")) {
    updated.font_size_multiplier = (updated.font_size_multiplier || 1) - 0.1;
    changes.push("Decreased font size by 10%");
  }

  // "add discount code" / "add coupon"
  if (lower.includes("discount") || lower.includes("coupon") || lower.includes("promo code")) {
    updated.show_discount_section = true;
    updated.discount_label = "Use code WELCOME10 for 10% off your next order";
    changes.push("Added discount code section");
  }

  // "add a message" / "change the message"
  if (lower.includes("message") && (lower.includes("add") || lower.includes("change") || lower.includes("update"))) {
    // Try to extract message after quotes or after "to"
    const quoteMatch = instruction.match(/["'""]([^"'"'']+)["'""]/);
    const toMatch = instruction.match(/\bto\s+(.+)$/i);
    if (quoteMatch) {
      updated.thank_you_message = quoteMatch[1];
      changes.push(`Updated message to: "${quoteMatch[1]}"`);
    } else if (toMatch) {
      updated.thank_you_message = toMatch[1];
      changes.push(`Updated message to: "${toMatch[1]}"`);
    }
  }

  // "remove social" / "hide social"
  if (lower.includes("remove social") || lower.includes("hide social") || lower.includes("no social")) {
    updated.show_social = false;
    changes.push("Removed social media links");
  }

  // "add thank you" / "show thank you"
  if (lower.includes("thank you") && (lower.includes("add") || lower.includes("show"))) {
    updated.show_thank_you = true;
    if (!updated.thank_you_message) {
      updated.thank_you_message = `Thank you for choosing ${brandKit?.brand_name || "us"}!`;
    }
    changes.push("Added thank-you section");
  }

  // If no changes detected, provide a helpful response
  if (changes.length === 0) {
    changes.push("I've noted your request — try being more specific, like \"use more pink\", \"make the font bigger\", or \"move the logo to the top\".");
  }

  return {
    updatedConfig: updated,
    changesDescription: changes.join(". ") + ".",
    noviMessage: changes.join(". ") + ".",
  };
}
