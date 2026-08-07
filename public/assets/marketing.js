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
      ["Purchasing", "/product/production#purchasing"],
      ["Customer Care", "/product/customer-care"],
      ["Partner & Affiliate HQ", "/product/partners"],
      ["Novi", "/product/novi"],
      ["Team & Permissions", "/product/partners#team"]
    ],
    solutions: [
      ["Freshie Businesses", "/solutions/freshies"],
      ["Apparel & T-Shirt Brands", "/solutions/apparel"],
      ["Bakeries", "/solutions/bakery"],
      ["Candle Makers", "/solutions/candles"],
      ["Bath & Body", "/solutions/bath-body"],
      ["Boutiques", "/solutions/boutiques"],
      ["Craft Suppliers", "/solutions/freshies#craft"],
      ["Subscription Boxes", "/solutions/boutiques#subscription"],
      ["Custom / Personalized Products", "/solutions/apparel#custom"]
    ],
    resources: [
      ["How It Works", "/resources/how-it-works"],
      ["Integrations", "/resources/integrations"],
      ["FAQ", "/resources/faq"],
      ["Help Center (Coming Soon)", "/resources/faq#help-center"],
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
              <a href="/product">Overview</a>
              <a href="/product/inventory">Inventory</a>
              <a href="/product/orders">Orders</a>
              <a href="/product/production">Production</a>
              <a href="/product/novi">Novi</a>
            </div>
            <div>
              <h4>Solutions</h4>
              <a href="/solutions/freshies">Freshies</a>
              <a href="/solutions/apparel">Apparel</a>
              <a href="/solutions/bakery">Bakery</a>
              <a href="/solutions/candles">Candles</a>
              <a href="/solutions/bath-body">Bath & Body</a>
            </div>
            <div>
              <h4>Resources</h4>
              <a href="/resources/how-it-works">How It Works</a>
              <a href="/resources/integrations">Integrations</a>
              <a href="/resources/faq">FAQ</a>
              <a href="/dream-grant">Dream Grant</a>
              <a href="/early-access">Early Access</a>
            </div>
            <div>
              <h4>Trust</h4>
              <p class="small">Shopify least-privilege read-only connection in early access. Encrypted credentials. Secure HttpOnly sessions. Tenant-aware architecture.</p>
            </div>
          </div>
          <p class="small">Built from real operations. Illustrative demo workspace UI appears throughout public pages where shown.</p>
        </div>
      </footer>
    `;
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
  initMenus();
  initTabs();
  initSavingsCalculator();
  initStatusBadges();
})();
