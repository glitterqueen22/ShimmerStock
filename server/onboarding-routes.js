/**
 * Adaptive Onboarding — Novi-Led Conversational Setup
 * ====================================================
 * Novi has a natural conversation with new business owners,
 * understands their business, and proposes a workspace.
 * No setup forms, no migrations, no starting over.
 */

import { requireAuth } from "./auth.js";

// ── Business Type Detection ─────────────────────────────────────────

const BUSINESS_TYPES = [
  {
    id: "candle-maker",
    name: "Candle Maker",
    keywords: ["candle", "candles", "wax", "wick", "soy", "beeswax", "paraffin", "melt", "tea light", "votive", "pillar"],
    icon: "🕯️",
  },
  {
    id: "fragrance-supplier",
    name: "Fragrance Supplier",
    keywords: ["fragrance", "perfume", "scent", "essential oil", "aroma", "cologne", "diffuser", "room spray"],
    icon: "🌸",
  },
  {
    id: "bakery",
    name: "Bakery",
    keywords: ["bakery", "bake", "baking", "bread", "pastry", "cake", "cookie", "cupcake", "dough", "muffin", "croissant"],
    icon: "🥖",
  },
  {
    id: "coffee-roaster",
    name: "Coffee Roaster",
    keywords: ["coffee", "roast", "bean", "espresso", "latte", "brew", "cold brew", "café", "cafe"],
    icon: "☕",
  },
  {
    id: "boutique",
    name: "Boutique",
    keywords: ["boutique", "clothing", "apparel", "fashion", "jewelry", "accessory", "handbag", "dress", "shirt", "hat", "scarf"],
    icon: "👗",
  },
  {
    id: "cosmetics",
    name: "Cosmetics",
    keywords: ["cosmetic", "makeup", "skincare", "cream", "lotion", "lipstick", "mascara", "foundation", "serum", "beauty", "soap"],
    icon: "💄",
  },
  {
    id: "pet-store",
    name: "Pet Store",
    keywords: ["pet", "dog", "cat", "treat", "collar", "leash", "toy", "food", "grooming"],
    icon: "🐾",
  },
  {
    id: "artisan-food",
    name: "Artisan Food",
    keywords: ["jam", "honey", "sauce", "spice", "olive oil", "vinegar", "chocolate", "confection", "snack", "granola", "nut butter"],
    icon: "🍯",
  },
  {
    id: "home-decor",
    name: "Home Décor",
    keywords: ["decor", "home", "furniture", "pillow", "wall art", "rug", "vase", "ceramic", "pottery", "planter"],
    icon: "🏠",
  },
  {
    id: "stationery",
    name: "Stationery",
    keywords: ["stationery", "card", "notebook", "journal", "sticker", "pen", "planner", "print", "invitation", "paper"],
    icon: "📝",
  },
  {
    id: "general-product",
    name: "Product Business",
    keywords: ["i sell products", "my own products", "etsy shop"],
    icon: "📦",
  },
];

// ── Channel Detection ───────────────────────────────────────────────

const CHANNELS = [
  { id: "shopify", name: "Shopify", keywords: ["shopify", "shopify store", "shopify shop"] },
  { id: "etsy", name: "Etsy", keywords: ["etsy"] },
  { id: "amazon", name: "Amazon", keywords: ["amazon", "fba", "amazon fba"] },
  { id: "tiktok", name: "TikTok Shop", keywords: ["tiktok", "tiktok shop"] },
  { id: "wholesale", name: "Wholesale / Faire", keywords: ["wholesale", "faire", "b2b", "bulk", "stockist"] },
  { id: "in_person", name: "In-Person / Markets", keywords: ["in-person", "market", "fair", "pop-up", "popup", "craft fair", "farmer", "booth", "in person", "in store"] },
  { id: "instagram", name: "Instagram", keywords: ["instagram", "insta", "ig shop"] },
  { id: "website", name: "Own Website", keywords: ["website", "own site", "wordpress", "squarespace", "wix", "square", "online store", "web store"] },
];

// ── Capability Detection ────────────────────────────────────────────

const CAPABILITY_SIGNALS = {
  manufacturing: {
    keywords: ["make", "manufacture", "produce", "batch", "recipe", "handmade", "hand pour", "hand-pour", "blend", "mix", "assemble", "craft", "create", "formulate", "cook", "bake", "roast", "pour"],
    hq: "production",
    label: "Production HQ",
  },
  warehouse: {
    keywords: ["warehouse", "storage", "bin", "inventory location", "stock room", "fulfillment center", "3pl", "pick and pack"],
    hq: "warehouse",
    label: "Warehouse HQ",
  },
  team: {
    keywords: ["employee", "team", "staff", "hire", "assistant", "worker", "help", "crew", "partner", "co-founder", "cofounder"],
    hq: "team",
    label: "Team HQ",
  },
  shipping: {
    keywords: ["ship", "shipping", "fulfill", "fulfillment", "pack", "label", "carrier", "usps", "ups", "fedex", "dhl", "postage", "delivery", "3pl"],
    hq: "fulfillment",
    label: "Fulfillment HQ",
  },
  affiliates: {
    keywords: ["affiliate", "referral", "ambassador", "influencer", "commission", "partner program"],
    hq: "affiliate",
    label: "Affiliate HQ",
  },
  marketing: {
    keywords: ["marketing", "social media", "content", "email", "newsletter", "ad", "campaign", "promote", "branding"],
    hq: "studio",
    label: "Studio",
  },
};

// ── Helper: extract business type ───────────────────────────────────

function detectBusinessType(message) {
  const lower = message.toLowerCase();
  let best = null;
  let bestScore = 0;

  for (const bt of BUSINESS_TYPES) {
    let score = 0;
    for (const kw of bt.keywords) {
      if (lower.includes(kw)) score += 1;
      // Bonus for exact phrase match
      if (new RegExp(`\\b${kw}\\b`, "i").test(lower)) score += 0.5;
    }
    // Give non-fallback types a 20% bonus to beat generic matches
    if (bt.id !== "general-product") score *= 1.2;
    if (score > bestScore) {
      bestScore = score;
      best = bt;
    }
  }

  return best || BUSINESS_TYPES[BUSINESS_TYPES.length - 1]; // fallback: "Product Business"
}

// ── Helper: extract channels ────────────────────────────────────────

function detectChannels(message) {
  const lower = message.toLowerCase();
  const found = [];
  for (const ch of CHANNELS) {
    for (const kw of ch.keywords) {
      if (lower.includes(kw)) {
        if (!found.find(f => f.id === ch.id)) {
          found.push(ch);
        }
        break;
      }
    }
  }
  return found;
}

// ── Helper: extract capabilities ────────────────────────────────────

function detectCapabilities(message) {
  const lower = message.toLowerCase();
  const capabilities = {};
  for (const [key, signal] of Object.entries(CAPABILITY_SIGNALS)) {
    capabilities[key] = signal.keywords.some(kw => lower.includes(kw));
  }
  return capabilities;
}

// ── Helper: extract product mentions ─────────────────────────────────

function extractProducts(message) {
  const lower = message.toLowerCase();
  const productSignals = [
    "candle", "wax melt", "soap", "lotion", "cream", "perfume", "bread",
    "cake", "cookie", "coffee", "tea", "jewelry", "dress", "shirt",
    "hat", "scarf", "bag", "notebook", "card", "sticker", "art print",
    "ceramic", "vase", "pillow", "toy", "treat", "collar", "jam",
    "honey", "sauce", "chocolate", "snack", "spice",
  ];
  const found = [];
  for (const ps of productSignals) {
    if (lower.includes(ps) && !found.includes(ps)) {
      found.push(ps);
    }
  }
  return found;
}

// ── Helper: extract team size ────────────────────────────────────────

function detectTeamSize(message) {
  const lower = message.toLowerCase();
  const patterns = [
    { regex: /(\d+)\s*(person|people|employee|staff|member|of us)/i, extract: 1 },
    { regex: /(?:just|only)\s*me/i, size: 1 },
    { regex: /solo|myself|alone|just me/i, size: 1 },
    { regex: /team of (\d+)/i, extract: 1 },
    { regex: /(\d+)\s*(of us|people)/i, extract: 1 },
  ];
  for (const p of patterns) {
    if (p.size) return p.size;
    const match = lower.match(p.regex);
    if (match) {
      const n = parseInt(match[p.extract], 10);
      if (n > 0 && n < 1000) return n;
    }
  }
  return 1; // default: solo
}

// ── Build workspace proposal ────────────────────────────────────────

function buildProposal(analysis, db) {
  const { businessType, channels, capabilities, teamSize, products } = analysis;

  // Always recommended
  const recommended = ["commerce", "inventory"];

  // Based on channels
  if (channels.length >= 2) {
    if (!recommended.includes("commerce")) recommended.push("commerce");
  }

  // Based on capabilities
  if (capabilities.manufacturing) recommended.push("production");
  if (capabilities.warehouse) recommended.push("warehouse");
  if (capabilities.shipping) recommended.push("fulfillment");
  if (teamSize > 1 || capabilities.team) recommended.push("team");

  // Optional (not critical on day one but valuable)
  const optional = [];
  if (capabilities.marketing) optional.push("studio");
  if (capabilities.affiliates) optional.push("affiliate");
  optional.push("growth"); // always offer Growth

  // Ensure uniqueness
  const uniqueRecommended = [...new Set(recommended)];
  const uniqueOptional = [...new Set(optional)].filter(h => !uniqueRecommended.includes(h));

  // Build summary
  const btName = businessType?.name || "Product Business";
  const channelNames = channels.map(c => c.name).join(", ") || "your sales channels";
  let summary = `You're running a ${btName.toLowerCase()} business`;

  if (channels.length > 0) {
    summary += ` selling through ${channelNames}`;
  }

  if (capabilities.manufacturing) {
    summary += `. I've set up Production HQ since you're making your own products`;
  }

  if (teamSize > 1) {
    summary += teamSize >= 2
      ? ` and Team HQ for your ${teamSize}-person team`
      : " and Team HQ since you're working with others";
  }

  summary += ".";

  // ── Industry Profile Lookup ────────────────────────────────────
  let industryProfile = null;
  const btId = businessType?.id;

  if (btId && db) {
    const row = db.query(
      "SELECT id, name, icon, terminology, default_engines, workflow_order, default_units FROM industry_configs WHERE id = ?"
    ).get(btId);

    if (row) {
      industryProfile = {
        id: row.id,
        name: row.name,
        icon: row.icon,
        terminology: JSON.parse(row.terminology || "{}"),
        defaultEngines: JSON.parse(row.default_engines || "[]"),
        workflowOrder: JSON.parse(row.workflow_order || "[]"),
        defaultUnits: JSON.parse(row.default_units || "[]"),
        confidence: "detected",
      };
    }
  }

  // If no match, fall back to general-product
  if (!industryProfile && db) {
    const row = db.query(
      "SELECT id, name, icon, terminology, default_engines, workflow_order, default_units FROM industry_configs WHERE id = 'general-product'"
    ).get();
    if (row) {
      industryProfile = {
        id: row.id,
        name: row.name,
        icon: row.icon,
        terminology: JSON.parse(row.terminology || "{}"),
        defaultEngines: JSON.parse(row.default_engines || "[]"),
        workflowOrder: JSON.parse(row.workflow_order || "[]"),
        defaultUnits: JSON.parse(row.default_units || "[]"),
        confidence: "detected",
      };
    }
  }

  // ── Available Industries ───────────────────────────────────────
  let availableIndustries = [];
  if (db) {
    availableIndustries = db.query(
      "SELECT id, name, icon, terminology, default_engines, workflow_order, default_units FROM industry_configs ORDER BY name"
    ).all().map(row => ({
      id: row.id,
      name: row.name,
      icon: row.icon,
      terminology: JSON.parse(row.terminology || "{}"),
      defaultEngines: JSON.parse(row.default_engines || "[]"),
      workflowOrder: JSON.parse(row.workflow_order || "[]"),
      defaultUnits: JSON.parse(row.default_units || "[]"),
    }));
  }

  return {
    businessType: btName,
    industryProfile,
    availableIndustries,
    recommendedHQs: uniqueRecommended,
    optionalHQs: uniqueOptional,
    summary,
  };
}

// ── Evolution Checks ────────────────────────────────────────────────

function checkEvolution(db, businessId) {
  const recommendations = [];

  // Check order volume growth
  const orderStats = db.query(`
    SELECT
      COUNT(CASE WHEN created_at >= datetime('now', '-30 days') THEN 1 END) as current_month,
      COUNT(CASE WHEN created_at >= datetime('now', '-60 days') AND created_at < datetime('now', '-30 days') THEN 1 END) as previous_month
    FROM orders
    WHERE business_id = ? AND status != 'cancelled'
  `).get(businessId);

  if (orderStats && orderStats.previous_month > 5) {
    const growth = ((orderStats.current_month - orderStats.previous_month) / orderStats.previous_month) * 100;
    if (growth >= 50) {
      recommendations.push({
        type: "growth_surge",
        title: "Your business is growing fast!",
        message: `I noticed your orders are up ${Math.round(growth)}% compared to last month. Want me to set up Growth Intelligence to help you forecast and plan?`,
        hq: "growth",
        hqLabel: "Growth HQ",
        noviExpression: "curious",
      });
    }
  }

  // Check for suppliers
  const supplierCount = db.query(
    "SELECT COUNT(*) as count FROM suppliers WHERE business_id = ?"
  ).get(businessId)?.count || 0;

  if (supplierCount > 0) {
    // Check if purchasing is already in recommended HQs
    const hasPurchasing = db.query(
      "SELECT 1 FROM business_settings WHERE business_id = ? AND settings LIKE '%purchasing%'"
    ).get(businessId);

    if (!hasPurchasing) {
      recommendations.push({
        type: "supplier_detected",
        title: "You're working with suppliers",
        message: `I noticed you have ${supplierCount} supplier${supplierCount > 1 ? 's' : ''} set up. Want me to set up Purchasing Intelligence to help with reordering?`,
        hq: "purchasing",
        hqLabel: "Purchasing Intelligence",
        noviExpression: "curious",
      });
    }
  }

  // Check for team growth
  const userCount = db.query(
    "SELECT COUNT(*) as count FROM user_businesses WHERE business_id = ?"
  ).get(businessId)?.count || 1;

  if (userCount >= 2) {
    const hasTeam = db.query(
      "SELECT 1 FROM business_settings WHERE business_id = ? AND settings LIKE '%team%'"
    ).get(businessId);

    if (!hasTeam) {
      recommendations.push({
        type: "team_growing",
        title: "Your team is growing!",
        message: `I noticed you now have ${userCount} team members. Want me to set up Team HQ so you can manage permissions and roles?`,
        hq: "team",
        hqLabel: "Team HQ",
        noviExpression: "curious",
      });
    }
  }

  // Check for affiliate codes
  const affiliateCount = db.query(
    "SELECT COUNT(*) as count FROM affiliate_referrals WHERE business_id = ?"
  ).get(businessId)?.count || 0;

  if (affiliateCount > 0) {
    const hasAffiliate = db.query(
      "SELECT 1 FROM business_settings WHERE business_id = ? AND settings LIKE '%affiliate%'"
    ).get(businessId);

    if (!hasAffiliate) {
      recommendations.push({
        type: "affiliate_activity",
        title: "Affiliate activity detected",
        message: `I noticed ${affiliateCount} affiliate referral${affiliateCount > 1 ? 's' : ''}. Want me to set up Affiliate HQ to manage your ambassador program?`,
        hq: "affiliate",
        hqLabel: "Affiliate HQ",
        noviExpression: "curious",
      });
    }
  }

  // Check for warehouse activities (bin usage)
  const binCount = db.query(
    "SELECT COUNT(*) as count FROM warehouse_bins WHERE business_id = ?"
  ).get(businessId)?.count || 0;

  if (binCount > 5) {
    const hasWarehouse = db.query(
      "SELECT 1 FROM business_settings WHERE business_id = ? AND settings LIKE '%warehouse%'"
    ).get(businessId);

    if (!hasWarehouse) {
      recommendations.push({
        type: "warehouse_growing",
        title: "Your warehouse is growing",
        message: `I noticed you're using ${binCount} warehouse bins. Want me to enable Warehouse HQ for better inventory tracking?`,
        hq: "warehouse",
        hqLabel: "Warehouse HQ",
        noviExpression: "curious",
      });
    }
  }

  return recommendations;
}

// ── Route Mount ─────────────────────────────────────────────────────

export function mountOnboardingRoutes(app, db) {

  // ── POST /api/onboarding/start — begin the conversation ────────

  app.post("/api/onboarding/start", requireAuth(db), (req, res) => {
    try {
      const bizId = req.businessId;

      // Get display name
      const user = db.query("SELECT display_name FROM users WHERE id = ?").get(req.user.id);
      const name = user?.display_name || "there";

      // Check if already completed
      const existing = db.query(
        "SELECT * FROM onboarding_state WHERE business_id = ?"
      ).get(bizId);

      if (existing && existing.phase === "complete") {
        return res.json({
          phase: "complete",
          noviMessage: `Your workspace is already set up, ${name}! But I'm always here if you want to adjust anything.`,
          noviExpression: "happy",
          analysis: JSON.parse(existing.analysis_data || "{}"),
        });
      }

      // Create or reset onboarding state
      if (existing) {
        db.run(
          "UPDATE onboarding_state SET phase = 'greeting', analysis_data = '{}', workspace_config = '{}' WHERE business_id = ?",
          [bizId]
        );
      } else {
        db.run(
          "INSERT INTO onboarding_state (business_id, phase, analysis_data, workspace_config) VALUES (?, 'greeting', '{}', '{}')",
          [bizId]
        );
      }

      const noviMessage = `Hi, ${name}! I'm Novi. ✨ I'm going to help you get everything set up — no forms, no stress. Just a quick chat.\n\nFirst — tell me about your business. What do you make or sell? Where do you sell it? Are you flying solo or working with a team?\n\nTake your time — just describe things naturally, like you're telling a friend.`;

      res.json({
        phase: "greeting",
        noviMessage,
        noviExpression: "calm",
      });
    } catch (err) {
      console.error("POST /api/onboarding/start error:", err);
      res.status(500).json({ error: "Failed to start onboarding" });
    }
  });

  // ── POST /api/onboarding/respond — process owner's response ────

  app.post("/api/onboarding/respond", requireAuth(db), (req, res) => {
    try {
      const bizId = req.businessId;
      const { message } = req.body;

      if (!message || !message.trim()) {
        return res.status(400).json({ error: "Message is required" });
      }

      const state = db.query(
        "SELECT * FROM onboarding_state WHERE business_id = ?"
      ).get(bizId);

      if (!state) {
        return res.status(400).json({ error: "No active onboarding session. Call /start first." });
      }

      const currentPhase = state.phase;
      const existingAnalysis = JSON.parse(state.analysis_data || "{}");

      if (!existingAnalysis.responses) {
        existingAnalysis.responses = [];
      }
      existingAnalysis.responses.push(message.trim());

      // Analyze the message
      const businessType = detectBusinessType(message);
      const channels = detectChannels(message);
      const capabilities = detectCapabilities(message);
      const products = extractProducts(message);
      const teamSize = detectTeamSize(message);

      // Merge with any previous analysis
      const mergedChannels = mergeArrays(existingAnalysis.channels || [], channels, "id");
      const mergedProducts = mergeStringArrays(existingAnalysis.products || [], products);

      const analysis = {
        ...existingAnalysis,
        businessType: businessType || existingAnalysis.businessType,
        channels: mergedChannels,
        capabilities: { ...(existingAnalysis.capabilities || {}), ...capabilities },
        products: mergedProducts,
        teamSize: teamSize > 1 ? teamSize : (existingAnalysis.teamSize || 1),
      };

      // Determine next phase
      let nextPhase = currentPhase;
      let noviMessage = "";
      let noviExpression = "focused";

      if (currentPhase === "greeting") {
        // After first response, move to clarification
        nextPhase = "clarification";

        const btName = businessType?.name || "a product business";
        const channelList = channels.map(c => c.name);
        const productList = products.length > 0 ? products.slice(0, 5).join(", ") : null;

        let understanding = `Let me make sure I understand: you're running **${btName}**`;

        if (productList) {
          understanding += `, selling products like ${productList}`;
        }

        if (channelList.length > 0) {
          understanding += `. You sell through **${channelList.join(", ")}**`;
        } else {
          understanding += `. I didn't catch where you're selling — online, in-person, or both?`;
        }

        if (teamSize > 1) {
          understanding += `. It sounds like you have about **${teamSize} people** on your team`;
        } else {
          understanding += `. It sounds like you're **flying solo** at the moment`;
        }

        if (capabilities.manufacturing) {
          understanding += `. And you're **making your own products** — that's awesome!`;
        }

        if (capabilities.warehouse) {
          understanding += `. You mentioned a warehouse or storage space`;
        }

        understanding += `.\n\nDid I get that right? Anything you'd add or correct?`;

        noviMessage = understanding;
        noviExpression = "focused";
      } else if (currentPhase === "clarification") {
        // After second response, move to proposal
        nextPhase = "proposal";
        noviMessage = "Great, I've got a clear picture now! Let me put together a workspace that fits your business. One moment...";
        noviExpression = "thinking";
      } else {
        // Already in proposal or complete — just acknowledge
        nextPhase = "proposal";
        noviMessage = "I've noted that! Let me update your recommendations based on what you've shared.";
        noviExpression = "focused";
      }

      // Save updated state
      db.run(
        "UPDATE onboarding_state SET phase = ?, analysis_data = ? WHERE business_id = ?",
        [nextPhase, JSON.stringify(analysis), bizId]
      );

      res.json({
        phase: nextPhase,
        noviMessage,
        noviExpression,
        analysis: {
          businessType: analysis.businessType,
          channels: analysis.channels,
          teamSize: analysis.teamSize,
          capabilities: analysis.capabilities,
          products: analysis.products,
        },
      });
    } catch (err) {
      console.error("POST /api/onboarding/respond error:", err);
      res.status(500).json({ error: "Failed to process response" });
    }
  });

  // ── POST /api/onboarding/propose — generate workspace proposal ──

  app.post("/api/onboarding/propose", requireAuth(db), (req, res) => {
    try {
      const bizId = req.businessId;

      const state = db.query(
        "SELECT * FROM onboarding_state WHERE business_id = ?"
      ).get(bizId);

      if (!state) {
        return res.status(400).json({ error: "No active onboarding session. Call /start first." });
      }

      const analysis = JSON.parse(state.analysis_data || "{}");
      const proposal = buildProposal(analysis, db);

      // Save proposal
      db.run(
        "UPDATE onboarding_state SET phase = 'proposal', workspace_config = ? WHERE business_id = ?",
        [JSON.stringify(proposal), bizId]
      );

      // Build a warm Novi message
      const hqList = proposal.recommendedHQs.map(h => formatHqName(h)).join(", ");
      const optList = proposal.optionalHQs.map(h => formatHqName(h)).join(", ");

      const noviMessage = `Here's what I recommend for your workspace:\n\n**Core setup:** ${hqList}\n\n**Nice to have:** ${optList}\n\nI've pre-selected everything I think you need. Feel free to toggle anything on or off — this is *your* workspace.\n\nWhen you're ready, just hit **Apply** and I'll set everything up!`;

      res.json({
        phase: "proposal",
        noviMessage,
        noviExpression: "happy",
        ...proposal,
      });
    } catch (err) {
      console.error("POST /api/onboarding/propose error:", err);
      res.status(500).json({ error: "Failed to generate proposal" });
    }
  });

  // ── POST /api/onboarding/apply — apply workspace configuration ─

  app.post("/api/onboarding/apply", requireAuth(db), (req, res) => {
    try {
      const bizId = req.businessId;
      const { hqs, industryProfile: requestedIndustryId } = req.body;

      if (!hqs || !Array.isArray(hqs)) {
        return res.status(400).json({ error: "hqs array is required" });
      }

      const state = db.query(
        "SELECT * FROM onboarding_state WHERE business_id = ?"
      ).get(bizId);

      if (!state) {
        return res.status(400).json({ error: "No active onboarding session." });
      }

      const proposal = JSON.parse(state.workspace_config || "{}");

      // Apply industry profile — prefer request body, then proposal, then fallback
      let industryConfigId = requestedIndustryId
        || (proposal.industryProfile?.id)
        || (proposal.industryProfile)
        || "general-product";

      // Validate the industry config exists
      const industryExists = db.query(
        "SELECT id FROM industry_configs WHERE id = ?"
      ).get(industryConfigId);
      if (!industryExists) {
        // If the requested/proposal one doesn't exist, try general-product
        const fallback = db.query("SELECT id FROM industry_configs WHERE id = 'general-product'").get();
        industryConfigId = fallback ? "general-product" : null;
      }

      const settings = {
        enabledHQs: hqs,
        onboardingCompleted: true,
        onboardedAt: new Date().toISOString(),
      };

      const configData = JSON.stringify(settings);
      const existingSettings = db.query(
        "SELECT business_id FROM business_settings WHERE business_id = ?"
      ).get(bizId);

      if (existingSettings) {
        db.run(
          "UPDATE business_settings SET industry_config_id = ?, settings = ? WHERE business_id = ?",
          [industryConfigId, configData, bizId]
        );
      } else {
        db.run(
          "INSERT INTO business_settings (business_id, industry_config_id, settings) VALUES (?, ?, ?)",
          [bizId, industryConfigId, configData]
        );
      }

      // Mark onboarding complete
      db.run(
        "UPDATE onboarding_state SET phase = 'complete', completed_at = datetime('now'), workspace_config = ? WHERE business_id = ?",
        [JSON.stringify({ ...proposal, appliedHqs: hqs, appliedIndustryId: industryConfigId }), bizId]
      );

      // Build celebration message
      const hqNames = hqs.map(h => formatHqName(h)).join(", ");
      const user = db.query("SELECT display_name FROM users WHERE id = ?").get(req.user.id);
      const name = user?.display_name || "there";

      const noviMessage = `🎉 All set, ${name}! Your workspace is ready.\n\nI've set up: **${hqNames}**\n\nYour ${proposal.businessType || "business"} workspace is configured and ready to go. Want me to give you a quick tour of your dashboard?`;

      res.json({
        phase: "complete",
        noviMessage,
        noviExpression: "celebrating",
        applied: {
          industryConfigId,
          hqs,
          settings,
        },
      });
    } catch (err) {
      console.error("POST /api/onboarding/apply error:", err);
      res.status(500).json({ error: "Failed to apply configuration" });
    }
  });

  // ── GET /api/onboarding/status — current onboarding state ──────

  app.get("/api/onboarding/status", requireAuth(db), (req, res) => {
    try {
      const bizId = req.businessId;
      const state = db.query(
        "SELECT * FROM onboarding_state WHERE business_id = ?"
      ).get(bizId);

      if (!state) {
        return res.json({
          phase: null,
          started: false,
          analysis: {},
          workspaceConfig: {},
        });
      }

      res.json({
        phase: state.phase,
        started: true,
        completed: state.phase === "complete",
        analysis: JSON.parse(state.analysis_data || "{}"),
        workspaceConfig: JSON.parse(state.workspace_config || "{}"),
        createdAt: state.created_at,
        completedAt: state.completed_at,
      });
    } catch (err) {
      console.error("GET /api/onboarding/status error:", err);
      res.status(500).json({ error: "Failed to fetch onboarding status" });
    }
  });

  // ── GET /api/onboarding/check-evolution — evolution recs ───────

  app.get("/api/onboarding/check-evolution", requireAuth(db), (req, res) => {
    try {
      const bizId = req.businessId;

      // Only check if onboarding is complete
      const state = db.query(
        "SELECT * FROM onboarding_state WHERE business_id = ?"
      ).get(bizId);

      if (!state || state.phase !== "complete") {
        return res.json({ recommendations: [], onboardingActive: true });
      }

      const recommendations = checkEvolution(db, bizId);

      res.json({
        recommendations,
        onboardingActive: false,
        checkedAt: new Date().toISOString(),
      });
    } catch (err) {
      console.error("GET /api/onboarding/check-evolution error:", err);
      res.status(500).json({ error: "Failed to check evolution" });
    }
  });
}

// ── Helpers ─────────────────────────────────────────────────────────

function mergeArrays(existing, incoming, keyField) {
  const map = new Map();
  for (const item of existing) map.set(item[keyField], item);
  for (const item of incoming) map.set(item[keyField], item);
  return [...map.values()];
}

function mergeStringArrays(existing, incoming) {
  const set = new Set([...existing, ...incoming]);
  return [...set];
}

function formatHqName(hq) {
  const names = {
    commerce: "Commerce",
    inventory: "Inventory",
    production: "Production HQ",
    warehouse: "Warehouse HQ",
    fulfillment: "Fulfillment HQ",
    team: "Team HQ",
    affiliate: "Affiliate HQ",
    studio: "Studio",
    growth: "Growth HQ",
    purchasing: "Purchasing Intelligence",
    customer_service: "Customer Service",
  };
  return names[hq] || hq;
}
