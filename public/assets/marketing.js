(function () {
  const statuses = {
    live: { label: "Live", className: "status-live" },
    beta: { label: "Beta", className: "status-beta" },
    early: { label: "Early Access", className: "status-early" },
    planned: { label: "Planned", className: "status-planned" },
    demo: { label: "Demo", className: "status-demo" }
  };

  window.ShimmerMarketingStatus = statuses;

  const topNav = {
    product: [
      ["Platform Overview", "/product"],
      ["Inventory & Warehouse", "/product/inventory"],
      ["Orders & Fulfillment", "/product/orders"],
      ["Production", "/product/production"],
      ["Purchasing", "/product/production"],
      ["Customer Care", "/product/customer-care"],
      ["Partner & Affiliate HQ", "/product/partners"],
      ["Novi", "/product/novi"],
      ["Team & Permissions", "/product/partners"]
    ],
    solutions: [
      ["Craft & Maker Supplies", "/solutions/craft-suppliers"],
      ["E-commerce Brands", "/solutions/ecommerce-brands"],
      ["Made-to-Order & Manufacturing", "/solutions/made-to-order"],
      ["Apparel & Print", "/solutions/apparel"],
      ["Food & Bakery", "/solutions/bakery"],
      ["Candles, Bath & Body & Home Fragrance", "/solutions/candles"],
      ["Boutiques & Retail", "/solutions/boutiques"],
      ["Subscription Boxes", "/solutions/subscription-boxes"],
      ["Freshie Businesses", "/solutions/freshies"]
    ],
    resources: [
      ["How It Works", "/resources/how-it-works"],
      ["Integrations", "/resources/integrations"],
      ["FAQ", "/resources/faq"],
      ["Dream Grant", "/dream-grant"]
    ]
  };

  function menuItems(items) {
    return items.map((item) => `<a href="${item[1]}">${item[0]}</a>`).join("");
  }

  function renderHeader() {
    const host = document.querySelector("[data-marketing-header]");
    if (!host) return;

    host.innerHTML = `
      <a class="skip-link" href="#main-content">Skip to content</a>
      <header class="site-header">
        <div class="container nav-shell">
          <a class="brand" href="/">ShimmerStock<small>The operating system for product businesses</small></a>

          <nav class="nav-desktop" aria-label="Primary">
            <div class="menu-wrap" data-menu>
              <button class="menu-button" aria-expanded="false" aria-controls="menu-product">Product</button>
              <div class="mega-menu" id="menu-product">${menuItems(topNav.product)}</div>
            </div>
            <div class="menu-wrap" data-menu>
              <button class="menu-button" aria-expanded="false" aria-controls="menu-solutions">Solutions</button>
              <div class="mega-menu" id="menu-solutions">${menuItems(topNav.solutions)}</div>
            </div>
            <a class="nav-link" href="/pricing">Pricing</a>
            <div class="menu-wrap" data-menu>
              <button class="menu-button" aria-expanded="false" aria-controls="menu-resources">Resources</button>
              <div class="mega-menu" id="menu-resources">${menuItems(topNav.resources)}</div>
            </div>
            <a class="nav-link" href="/about">About</a>
          </nav>

          <div class="header-right">
            <a class="nav-link" href="/login">Login</a>
            <a class="btn btn-primary" href="/early-access">Join Early Access</a>
          </div>

          <button class="mobile-toggle" aria-expanded="false" aria-controls="mobile-nav" id="mobile-toggle">Menu</button>
        </div>
      </header>
      <div class="mobile-overlay" id="mobile-overlay" data-open="false"></div>
      <aside class="mobile-panel" id="mobile-nav" data-open="false" aria-label="Mobile navigation">
        <div class="mobile-head">
          <strong>ShimmerStock</strong>
          <button id="mobile-close" aria-label="Close navigation">Close</button>
        </div>
        <nav class="mobile-nav" aria-label="Mobile primary">
          <button class="mobile-accordion" data-target="mobile-product" aria-expanded="false">Product <span>+</span></button>
          <div class="mobile-sub" id="mobile-product">${menuItems(topNav.product)}</div>

          <button class="mobile-accordion" data-target="mobile-solutions" aria-expanded="false">Solutions <span>+</span></button>
          <div class="mobile-sub" id="mobile-solutions">${menuItems(topNav.solutions)}</div>

          <a href="/pricing">Pricing</a>

          <button class="mobile-accordion" data-target="mobile-resources" aria-expanded="false">Resources <span>+</span></button>
          <div class="mobile-sub" id="mobile-resources">${menuItems(topNav.resources)}</div>

          <a href="/about">About</a>
          <a href="/login">Login</a>
          <a class="btn btn-primary" style="margin-top: 0.8rem;" href="/early-access">Join Early Access</a>
        </nav>
      </aside>
    `;
  }

  function renderFooter() {
    const host = document.querySelector("[data-marketing-footer]");
    if (!host) return;

    host.innerHTML = `
      <footer class="site-footer">
        <div class="container">
          <div class="footer-grid">
            <div>
              <h4>ShimmerStock</h4>
              <p class="small">Run the business behind your brand from one beautiful workspace.</p>
            </div>
            <div>
              <h4>Product</h4>
              <a href="/product">Product</a>
              <a href="/pricing">Pricing</a>
              <a href="/resources/integrations">Integrations</a>
              <a href="/product/novi">Novi</a>
            </div>
            <div>
              <h4>Solutions</h4>
              <a href="/solutions/craft-suppliers">Craft &amp; Maker Supplies</a>
              <a href="/solutions/ecommerce-brands">E-commerce Brands</a>
              <a href="/solutions/made-to-order">Made-to-Order</a>
              <a href="/solutions/apparel">Apparel</a>
              <a href="/solutions/bakery">Food &amp; Bakery</a>
            </div>
            <div>
              <h4>Company</h4>
              <a href="/about">About</a>
              <a href="/early-access">Early Access</a>
              <a href="/dream-grant">Dream Grant</a>
              <a href="/contact">Contact</a>
            </div>
            <div>
              <h4>Trust</h4>
              <a href="/security">Security</a>
              <a href="/privacy">Privacy</a>
              <a href="/terms">Terms</a>
              <a href="/early-access-terms">Early Access Terms</a>
              <a href="/data-request">Data Request</a>
            </div>
          </div>
          <p class="small">Built from real operations. Illustrative demo workspace UI appears throughout public pages where shown. Shopify connection status: Early Access / Read-only Beta.</p>
        </div>
      </footer>
    `;
  }

  let cachedPublicRuntime = null;

  async function getPublicRuntime() {
    if (cachedPublicRuntime) return cachedPublicRuntime;

    try {
      const response = await fetch("/api/public/runtime", {
        method: "GET",
        headers: { "Accept": "application/json" }
      });
      if (!response.ok) {
        throw new Error("runtime-fetch-failed");
      }
      const payload = await response.json();
      cachedPublicRuntime = payload;
      return payload;
    } catch {
      cachedPublicRuntime = {
        privateMode: false,
        noindex: false,
        siteOrigin: "",
        dreamGrantOpen: false
      };
      return cachedPublicRuntime;
    }
  }

  function upsertMeta(attrName, attrValue, content) {
    const selector = `meta[${attrName}="${attrValue}"]`;
    let node = document.head.querySelector(selector);
    if (!node) {
      node = document.createElement("meta");
      node.setAttribute(attrName, attrValue);
      document.head.appendChild(node);
    }
    node.setAttribute("content", content);
  }

  function upsertLink(rel, href) {
    let node = document.head.querySelector(`link[rel="${rel}"]`);
    if (!node) {
      node = document.createElement("link");
      node.setAttribute("rel", rel);
      document.head.appendChild(node);
    }
    node.setAttribute("href", href);
  }

  async function initSeoMetadata() {
    if (!document.head) return;

    const runtime = await getPublicRuntime();
    const activeOrigin = runtime.siteOrigin || window.location.origin;
    const canonicalUrl = `${activeOrigin}${window.location.pathname === "/" ? "/" : window.location.pathname.replace(/\/$/, "")}`;
    const socialImage = `${activeOrigin}/assets/shimmerstock-social-1200x630.svg`;

    if (runtime.noindex) {
      upsertMeta("name", "robots", "noindex, nofollow, noarchive");
      const canonicalNode = document.head.querySelector('link[rel="canonical"]');
      if (canonicalNode) canonicalNode.remove();
    } else {
      upsertLink("canonical", canonicalUrl);
    }

    upsertMeta("property", "og:type", "website");
    upsertMeta("property", "og:url", canonicalUrl);
    upsertMeta("property", "og:image", socialImage);
    upsertMeta("name", "twitter:card", "summary_large_image");
    upsertMeta("name", "twitter:image", socialImage);

    if (!document.head.querySelector('script[data-structured="organization"]')) {
      const org = {
        "@context": "https://schema.org",
        "@type": "Organization",
        "name": "ShimmerStock",
        "url": activeOrigin,
        "description": "ShimmerStock is the commerce operating system for product businesses.",
        "sameAs": []
      };
      const node = document.createElement("script");
      node.type = "application/ld+json";
      node.setAttribute("data-structured", "organization");
      node.textContent = JSON.stringify(org);
      document.head.appendChild(node);
    }

    if (!document.head.querySelector('script[data-structured="software"]')) {
      const app = {
        "@context": "https://schema.org",
        "@type": "SoftwareApplication",
        "name": "ShimmerStock",
        "applicationCategory": "BusinessApplication",
        "operatingSystem": "Web",
        "url": activeOrigin,
        "description": "ShimmerStock helps product businesses run inventory, orders, production, purchasing, fulfillment, and customer care in one workspace."
      };
      const node = document.createElement("script");
      node.type = "application/ld+json";
      node.setAttribute("data-structured", "software");
      node.textContent = JSON.stringify(app);
      document.head.appendChild(node);
    }
  }

  async function initEarlyAccessApplicationForm() {
    const form = document.getElementById("early-access-application-form");
    if (!form) return;

    const runtime = await getPublicRuntime();
    const message = document.getElementById("early-access-message");
    const submitButton = document.getElementById("early-access-submit");
    const successPane = document.getElementById("early-access-success");
    const planSelect = form.querySelector('select[name="plan_interest"]');

    const allowedPlans = new Set(["launch", "grow", "scale", "not_sure"]);
    const planFromUrl = new URLSearchParams(window.location.search).get("plan");
    if (planSelect && planFromUrl && allowedPlans.has(planFromUrl)) {
      planSelect.value = planFromUrl;
    }

    if (runtime.privateMode) {
      if (message) {
        message.textContent = "Early Access applications are disabled in private staging mode. Use this page for visual review only.";
      }
      form.querySelectorAll("input, select, textarea, button").forEach((node) => {
        node.setAttribute("disabled", "disabled");
      });
      if (submitButton) submitButton.style.display = "none";
      return;
    }

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (message) message.textContent = "";

      const formData = new FormData(form);
      const payload = {
        first_name: String(formData.get("first_name") || "").trim(),
        last_name: String(formData.get("last_name") || "").trim(),
        email: String(formData.get("email") || "").trim(),
        business_name: String(formData.get("business_name") || "").trim(),
        website_url: String(formData.get("website_url") || "").trim(),
        what_business_sells: String(formData.get("what_business_sells") || "").trim(),
        business_category: String(formData.get("business_category") || "").trim(),
        current_commerce_platform: String(formData.get("current_commerce_platform") || "").trim(),
        monthly_order_range: String(formData.get("monthly_order_range") || "").trim(),
        team_size: String(formData.get("team_size") || "").trim(),
        biggest_operational_challenge: String(formData.get("biggest_operational_challenge") || "").trim(),
        plan_interest: String(formData.get("plan_interest") || "").trim(),
        consent: formData.get("consent") === "on",
        privacy_acknowledged: formData.get("privacy_acknowledged") === "on",
        fax_number: String(formData.get("fax_number") || "").trim()
      };

      if (!payload.first_name || !payload.last_name || !payload.email || !payload.business_name || !payload.what_business_sells || !payload.business_category || !payload.current_commerce_platform || !payload.monthly_order_range || !payload.team_size || !payload.biggest_operational_challenge || !payload.plan_interest || !payload.consent || !payload.privacy_acknowledged) {
        if (message) message.textContent = "Please complete all required fields and confirmations.";
        return;
      }

      if (submitButton) {
        submitButton.setAttribute("disabled", "disabled");
        submitButton.textContent = "Submitting...";
      }

      try {
        const response = await fetch("/api/early-access/apply", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Accept": "application/json"
          },
          body: JSON.stringify(payload)
        });

        const data = await response.json();
        if (!response.ok) {
          if (message) message.textContent = data.error || "Unable to submit right now. Please try again.";
          return;
        }

        form.style.display = "none";
        if (successPane) successPane.hidden = false;
      } catch {
        if (message) message.textContent = "Unable to submit right now. Please try again.";
      } finally {
        if (submitButton) {
          submitButton.removeAttribute("disabled");
          submitButton.textContent = "Submit Early Access Application";
        }
      }
    });
  }

  function initMenus() {
    document.querySelectorAll("[data-menu]").forEach((wrap) => {
      const button = wrap.querySelector(".menu-button");
      if (!button) return;

      function closeAll() {
        document.querySelectorAll("[data-menu]").forEach((item) => {
          const b = item.querySelector(".menu-button");
          item.dataset.open = "false";
          if (b) b.setAttribute("aria-expanded", "false");
        });
      }

      button.addEventListener("click", (event) => {
        event.stopPropagation();
        const nextOpen = wrap.dataset.open !== "true";
        closeAll();
        wrap.dataset.open = nextOpen ? "true" : "false";
        button.setAttribute("aria-expanded", nextOpen ? "true" : "false");
      });

      button.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
          wrap.dataset.open = "false";
          button.setAttribute("aria-expanded", "false");
          button.blur();
        }
      });
    });

    document.addEventListener("click", () => {
      document.querySelectorAll("[data-menu]").forEach((item) => {
        const b = item.querySelector(".menu-button");
        item.dataset.open = "false";
        if (b) b.setAttribute("aria-expanded", "false");
      });
    });

    const toggle = document.getElementById("mobile-toggle");
    const panel = document.getElementById("mobile-nav");
    const overlay = document.getElementById("mobile-overlay");
    const close = document.getElementById("mobile-close");

    function setMobile(open) {
      if (!panel || !overlay || !toggle) return;
      panel.dataset.open = open ? "true" : "false";
      overlay.dataset.open = open ? "true" : "false";
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
      document.body.style.overflow = open ? "hidden" : "";
      if (!open) toggle.focus();
    }

    if (toggle) toggle.addEventListener("click", () => setMobile(true));
    if (close) close.addEventListener("click", () => setMobile(false));
    if (overlay) overlay.addEventListener("click", () => setMobile(false));

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        setMobile(false);
      }
    });

    if (panel) {
      panel.querySelectorAll("a").forEach((link) => {
        link.addEventListener("click", () => setMobile(false));
      });
    }

    document.querySelectorAll(".mobile-accordion").forEach((button) => {
      button.addEventListener("click", () => {
        const id = button.getAttribute("data-target");
        if (!id) return;
        const sub = document.getElementById(id);
        if (!sub) return;
        const nextOpen = sub.dataset.open !== "true";
        sub.dataset.open = nextOpen ? "true" : "false";
        button.setAttribute("aria-expanded", nextOpen ? "true" : "false");
      });
    });
  }

  function initTabs() {
    document.querySelectorAll("[data-tab-group]").forEach((group) => {
      const buttons = group.querySelectorAll(".tab-button");
      const panels = group.querySelectorAll(".tab-panel");
      buttons.forEach((button) => {
        button.addEventListener("click", () => {
          const tab = button.getAttribute("data-tab");
          buttons.forEach((b) => b.setAttribute("aria-selected", b === button ? "true" : "false"));
          panels.forEach((panel) => {
            panel.dataset.open = panel.getAttribute("data-panel") === tab ? "true" : "false";
          });
        });
      });
    });
  }

  function initProductTour() {
    const shell = document.querySelector(".hero-stage[data-tour]");
    const tabs = document.querySelectorAll("[data-product-tour] .tour-tab");
    const summaryLabel = document.querySelector("[data-tour-kicker]");
    const summaryTitle = document.querySelector("[data-tour-title]");
    const summaryCopy = document.querySelector("[data-tour-copy]");
    const summaryMetricNodes = document.querySelectorAll("[data-tour-metric-1], [data-tour-metric-2], [data-tour-metric-3]");
    const summaryNote = document.querySelector("[data-tour-note]");

    if (!shell || !tabs.length) return;

    const states = {
      command: {
        label: "Command center",
        title: "One calm place to run the day.",
        copy: "The command shell tracks orders, inventory, production, care, and Novi without making the workspace feel crowded.",
        metrics: ["146", "2,730", "9"],
        note: "Everything is visible, but nothing is fighting for attention."
      },
      inventory: {
        label: "Inventory",
        title: "Stock, bins, and low-risk signals.",
        copy: "Inventory states surface before a shortage becomes a scramble, so the team can restock with confidence.",
        metrics: ["3", "2,730", "9"],
        note: "Use it to preview counts, reorder timing, and material pressure."
      },
      orders: {
        label: "Orders",
        title: "Order flow stays visible from the first click.",
        copy: "Incoming orders land in the queue with enough context to keep the handoff from storefront to fulfillment smooth.",
        metrics: ["146", "2,730", "14"],
        note: "The queue stays operational, not decorative."
      },
      production: {
        label: "Production",
        title: "Batch planning and purchasing live together.",
        copy: "Production cards connect demand changes, draft purchase orders, and the work needed to keep batches moving.",
        metrics: ["146", "1,930", "2"],
        note: "Useful for makers, packers, and anyone juggling component lead times."
      },
      "customer-care": {
        label: "Customer care",
        title: "Support reads the same operational context.",
        copy: "Messages are easier to answer when the order, inventory, and production state sit next to the conversation.",
        metrics: ["3", "2,730", "9"],
        note: "The care lane stays aware of the rest of the business."
      },
      novi: {
        label: "Novi",
        title: "Novi turns scattered signals into a brief.",
        copy: "Instead of a chatbot bubble, Novi behaves like a real business operator that watches exceptions and prioritizes the morning.",
        metrics: ["1", "3", "9"],
        note: "This is the signature surface for the product."
      }
    };

    function applyState(key) {
      const state = states[key] || states.command;
      shell.dataset.tour = key;
      tabs.forEach((tab) => tab.setAttribute("aria-pressed", tab.getAttribute("data-tour-target") === key ? "true" : "false"));
      if (summaryLabel) summaryLabel.textContent = state.label;
      if (summaryTitle) summaryTitle.textContent = state.title;
      if (summaryCopy) summaryCopy.textContent = state.copy;
      summaryMetricNodes.forEach((node, index) => {
        const value = state.metrics[index] || node.textContent || "";
        node.textContent = value;
      });
      if (summaryNote) summaryNote.textContent = state.note;
    }

    tabs.forEach((tab) => {
      tab.addEventListener("click", () => applyState(tab.getAttribute("data-tour-target") || "command"));
    });

    applyState(tabs[0].getAttribute("data-tour-target") || "command");
  }

  function initChaosToggle() {
    const stage = document.querySelector("[data-chaos-stage]");
    const buttons = document.querySelectorAll("[data-chaos-view]");
    if (!stage || !buttons.length) return;

    const states = {
      before: {
        title: "Before ShimmerStock",
        copy: "Teams juggle channels, sheets, inboxes, and shipping tools just to answer one operational question.",
        pills: ["Storefront", "Spreadsheet", "Shipping App", "Support Inbox", "Batch Sheet", "Affiliate Tracker"]
      },
      after: {
        title: "After ShimmerStock",
        copy: "Orders, stock, production, fulfillment, care, and growth signals align in one operating rhythm.",
        pills: ["Orders", "Inventory", "Production", "Fulfillment", "Customer Care", "Novi"]
      }
    };

    const titleNode = stage.querySelector("[data-chaos-title]");
    const copyNode = stage.querySelector("[data-chaos-copy]");
    const pillsNode = stage.querySelector("[data-chaos-pills]");

    function applyMode(mode) {
      const state = states[mode] || states.before;
      stage.dataset.chaosMode = mode;
      buttons.forEach((button) => button.classList.toggle("is-active", button.getAttribute("data-chaos-view") === mode));
      if (titleNode) titleNode.textContent = state.title;
      if (copyNode) copyNode.textContent = state.copy;
      if (pillsNode) {
        pillsNode.innerHTML = state.pills.map((pill) => `<span>${pill}</span>`).join("");
      }
    }

    buttons.forEach((button) => {
      button.addEventListener("click", () => applyMode(button.getAttribute("data-chaos-view") || "before"));
    });

    applyMode(stage.dataset.chaosMode || "before");
  }

  function initIndustrySpotlight() {
    const spotlight = document.querySelector("[data-industry-spotlight]");
    const tabs = document.querySelectorAll(".tabs .tab-button[data-industry-label]");
    if (!spotlight || !tabs.length) return;

    const labelNode = spotlight.querySelector("[data-industry-inventory]");
    const productionNode = spotlight.querySelector("[data-industry-production]");
    const alertNode = spotlight.querySelector("[data-industry-alert]");

    function apply(tab) {
      if (labelNode) labelNode.textContent = tab.getAttribute("data-industry-inventory") || "";
      if (productionNode) productionNode.textContent = tab.getAttribute("data-industry-production") || "";
      if (alertNode) alertNode.textContent = tab.getAttribute("data-industry-alert") || "";
    }

    tabs.forEach((tab) => tab.addEventListener("click", () => apply(tab)));
    apply(document.querySelector(".tabs .tab-button[aria-selected='true'][data-industry-label]") || tabs[0]);
  }

  function initNoviBrief() {
    const root = document.querySelector("[data-novi-demo]");
    if (!root) return;

    const detailBadge = root.querySelector("[data-novi-detail-badge]");
    const detailTitle = root.querySelector("[data-novi-detail-title]");
    const detailCopy = root.querySelector("[data-novi-detail-copy]");
    const detailList = root.querySelector("[data-novi-detail-list]");
    const buttons = root.querySelectorAll("[data-novi-target]");

    const states = {
      fulfillment: {
        badge: { className: "status-live", label: "Review" },
        title: "14 orders need your attention",
        copy: "Open the fulfillment queue, clear the label reprint, and keep the packing line moving.",
        rows: [["Queued", "14 orders"], ["Priority", "Pack lane"], ["Next step", "Review pick list"]]
      },
      inventory: {
        badge: { className: "status-early", label: "Preview" },
        title: "Vanilla base may run out in 6 days",
        copy: "Novi notices the lead-time risk early enough to draft a refill before the pace turns urgent.",
        rows: [["At risk", "Vanilla base"], ["Runway", "6 days"], ["Action", "Preview refill"]]
      },
      customers: {
        badge: { className: "status-demo", label: "Review" },
        title: "3 conversations need a reply",
        copy: "Care stays connected to the order and fulfillment state so replies feel informed, not generic.",
        rows: [["Open replies", "3"], ["Context", "Order + fulfillment"], ["Action", "Open queue"]]
      },
      trend: {
        badge: { className: "status-beta", label: "Preview" },
        title: "Formula 26 demand is up 28%",
        copy: "Novi spots the trend while it is still small enough to shape purchasing and production.",
        rows: [["Growth", "+28%"], ["Signal", "Formula 26"], ["Action", "Adjust purchasing"]]
      },
      purchase: {
        badge: { className: "status-live", label: "Review" },
        title: "Your suggested purchase order is ready",
        copy: "The draft PO uses the live demand and supply picture so you can review it before anything is sent.",
        rows: [["Draft", "Ready"], ["Lead time", "11 days"], ["Action", "Review PO"]]
      }
    };

    function applyState(key) {
      const state = states[key] || states.fulfillment;
      buttons.forEach((button) => {
        const active = button.getAttribute("data-novi-target") === key;
        button.classList.toggle("is-active", active);
        button.setAttribute("aria-selected", active ? "true" : "false");
      });
      if (detailBadge) {
        // support both the old .status class pattern and the new .novi-voice-label pattern
        if (detailBadge.classList.contains("status")) {
          detailBadge.className = `status ${state.badge.className}`;
        }
        detailBadge.textContent = state.badge.label;
      }
      if (detailTitle) detailTitle.textContent = state.title;
      if (detailCopy) detailCopy.textContent = state.copy;
      if (detailList) {
        // use .novi-data-row divs to match flagship component structure
        detailList.innerHTML = state.rows.map(([left, right]) => `<div class="novi-data-row"><strong>${left}</strong><span>${right}</span></div>`).join("");
      }
    }

    buttons.forEach((button) => {
      button.addEventListener("click", () => applyState(button.getAttribute("data-novi-target") || "fulfillment"));
    });

    applyState("fulfillment");
  }

  function initWorkflowDetail() {
    const root = document.querySelector("[data-workflow-detail]");
    const stageButtons = document.querySelectorAll("[data-workflow-stage]");
    const steps = document.querySelectorAll("[data-workflow-step]");
    if (!root || !stageButtons.length || !steps.length) return;

    const titleNode = root.querySelector("[data-workflow-title]");
    const copyNode = root.querySelector("[data-workflow-copy]");
    const listNode = root.querySelector("[data-workflow-list]");

    const states = {
      order: {
        title: "Order arrives",
        copy: "When a Shopify order lands, the queue opens and Novi watches for exceptions before the team touches the work.",
        rows: [["Source", "Shopify"], ["Action", "Queue opens"], ["Novi", "Flags risk"]]
      },
      reserve: {
        title: "Inventory reserved",
        copy: "Inventory reserves against the order so the visible counts and the real queue stay aligned.",
        rows: [["Source", "Inventory"], ["Action", "Reserve stock"], ["Novi", "Checks runway"]]
      },
      production: {
        title: "Production needed",
        copy: "If a component is short, the batch lane lights up and the production team can see what needs to be made next.",
        rows: [["Source", "Batch demand"], ["Action", "Draft work"], ["Novi", "Highlights shortage"]]
      },
      pick: {
        title: "Ready to pick",
        copy: "Verified orders move into the pick queue so the team can move faster without losing context.",
        rows: [["Source", "Fulfillment"], ["Action", "Release queue"], ["Novi", "Keeps priority clear"]]
      },
      pack: {
        title: "Packed",
        copy: "Pack verification closes the loop before shipment, which keeps the handoff tight and auditable.",
        rows: [["Source", "Packing"], ["Action", "Verify package"], ["Novi", "Confirms exception-free"]]
      },
      ship: {
        title: "Shipped",
        copy: "The customer timeline updates once the order leaves the building and the work is no longer in the warehouse.",
        rows: [["Source", "Carrier"], ["Action", "Mark shipped"], ["Novi", "Updates the brief"]]
      }
    };

    function applyState(key) {
      const state = states[key] || states.order;
      stageButtons.forEach((button) => button.classList.toggle("is-active", button.getAttribute("data-workflow-stage") === key));
      steps.forEach((step) => step.classList.toggle("is-active", step.getAttribute("data-workflow-step") === key));
      if (titleNode) titleNode.textContent = state.title;
      if (copyNode) copyNode.textContent = state.copy;
      if (listNode) {
        listNode.innerHTML = state.rows.map(([left, right]) => `<div class="novi-detail-row"><strong>${left}</strong><span>${right}</span></div>`).join("");
      }
    }

    stageButtons.forEach((button) => {
      button.addEventListener("click", () => applyState(button.getAttribute("data-workflow-stage") || "order"));
    });

    steps.forEach((step) => {
      step.addEventListener("click", () => applyState(step.getAttribute("data-workflow-step") || "order"));
    });

    applyState("order");
  }

  function initSavingsMeter() {
    const root = document.getElementById("savings-calculator");
    if (!root) return;

    const bar = document.querySelector("[data-savings-bar]");
    const inputs = root.querySelectorAll("input[data-cost]");
    const stackOut = document.getElementById("stack-cost");
    const savingsOut = document.getElementById("stack-savings");
    const planOut = document.getElementById("stack-plan");

    function recalc() {
      let stackCost = 0;
      inputs.forEach((input) => {
        const value = Number.parseFloat(input.value || "0");
        stackCost += Number.isFinite(value) ? value : 0;
      });
      const shimmerPlan = 149;
      const savings = Math.max(0, stackCost - shimmerPlan);

      if (stackOut) stackOut.textContent = `$${stackCost.toFixed(0)}/mo`;
      if (planOut) planOut.textContent = `$${shimmerPlan}/mo`;
      if (savingsOut) savingsOut.textContent = `$${savings.toFixed(0)}/mo`;
      if (bar) bar.style.setProperty("--savings-fill", `${Math.min(100, Math.max(18, stackCost / 5))}%`);
    }

    inputs.forEach((input) => input.addEventListener("input", recalc));
    recalc();
  }

  function initSavingsCalculator() {
    const root = document.getElementById("savings-calculator");
    if (!root) return;

    const inputs = root.querySelectorAll("input[data-cost]");
    const stackOut = document.getElementById("stack-cost");
    const savingsOut = document.getElementById("stack-savings");
    const planOut = document.getElementById("stack-plan");

    function recalc() {
      let stackCost = 0;
      inputs.forEach((input) => {
        const value = Number.parseFloat(input.value || "0");
        stackCost += Number.isFinite(value) ? value : 0;
      });
      const shimmerPlan = 149;
      const savings = Math.max(0, stackCost - shimmerPlan);

      if (stackOut) stackOut.textContent = `$${stackCost.toFixed(0)}/mo`;
      if (planOut) planOut.textContent = `$${shimmerPlan}/mo`;
      if (savingsOut) savingsOut.textContent = `$${savings.toFixed(0)}/mo`;
    }

    inputs.forEach((input) => input.addEventListener("input", recalc));
    recalc();
  }

  function makeStatusBadge(status) {
    const item = statuses[status] || statuses.planned;
    return `<span class="status ${item.className}">${item.label}</span>`;
  }

  function initStatusBadges() {
    document.querySelectorAll("[data-status]").forEach((node) => {
      const key = node.getAttribute("data-status");
      node.innerHTML = makeStatusBadge(key || "planned");
    });
  }

  renderHeader();
  renderFooter();
  initSeoMetadata();
  initMenus();
  initTabs();
  initProductTour();
  initChaosToggle();
  initIndustrySpotlight();
  initNoviBrief();
  initWorkflowDetail();
  initSavingsMeter();
  initEarlyAccessApplicationForm();
  initStatusBadges();
})();
