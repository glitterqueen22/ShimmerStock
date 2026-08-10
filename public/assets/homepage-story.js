(function () {
  const story = document.querySelector("[data-homepage-story]");
  if (!story) return;
  document.documentElement.classList.add("story-enhanced");

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const industryData = {
    craft: {
      title: "Craft supplies workspace",
      focus: "Catalog depth and supplier timing",
      copy: "Rhinestones, blanks, vinyl rolls, and packaging inserts stay connected to reorder pressure.",
      inventory: "Rhinestones / Blanks / Vinyl",
      production: "Restock Build #118",
      alert: "Best-selling blank below 7-day runway"
    },
    brand: {
      title: "E-commerce brand workspace",
      focus: "Demand pace and connected handoffs",
      copy: "Hero SKUs, bundle components, campaign orders, and customer context move through one operating rhythm.",
      inventory: "Hero SKU / Bundles / Seasonal variants",
      production: "Fulfillment Wave #22",
      alert: "Bundle component risk flagged for Friday"
    },
    freshies: {
      title: "Freshies workspace",
      focus: "Formula, batch, and material runway",
      copy: "Aroma beads, fragrance oils, molds, and curing work stay connected to the orders they support.",
      inventory: "Aroma Beads / Formula 26 / Molds",
      production: "Freshie Batch #284",
      alert: "Formula 26 has 6 days of runway"
    },
    apparel: {
      title: "Apparel workspace",
      focus: "Variant pressure and personalization",
      copy: "Blank inventory, size and color variants, artwork, and personalization queues share the same context.",
      inventory: "Comfort Colors / Sizes / Colorways",
      production: "Retro Summer Tee / 18 orders",
      alert: "Black Large blanks are low"
    },
    bakery: {
      title: "Bakery workspace",
      focus: "Ingredients, prep, and pickup windows",
      copy: "Recipe demand, ingredient availability, batch yield, and pickup timing stay visible together.",
      inventory: "Flour / Vanilla / Butter / Boxes",
      production: "Birthday Cake Batch",
      alert: "Vanilla extract reorder suggested"
    },
    candles: {
      title: "Candles workspace",
      focus: "Components and curing windows",
      copy: "Wax, fragrance oils, vessels, labels, and seasonal demand stay aligned with the production queue.",
      inventory: "Wax / Fragrance oils / Vessels",
      production: "Candle Pour #52",
      alert: "Wick packs are low"
    },
    bath: {
      title: "Bath and body workspace",
      focus: "Formula and lot-aware planning",
      copy: "Ingredients, jars, formula work, and replenishment timing use language that fits the operation.",
      inventory: "Lotions / Soaps / Oils / Jars",
      production: "Glow Set Run #12",
      alert: "Ingredient lot review due today"
    },
    boutique: {
      title: "Boutique workspace",
      focus: "Incoming stock and merchandising rhythm",
      copy: "Seasonal drops, display inventory, fulfillment pacing, and incoming stock remain in one view.",
      inventory: "Accessories / Drops / Display stock",
      production: "Boutique Drop #09",
      alert: "Display refresh is due tomorrow"
    }
  };

  function initIndustryTabs() {
    const root = story.querySelector("[data-story-industry]");
    if (!root) return;

    const tabs = Array.from(root.querySelectorAll("[role='tab']"));
    const workspace = root.querySelector(".industry-workspace");
    const nodes = {
      title: root.querySelector("[data-industry-title]"),
      focus: root.querySelector("[data-industry-focus]"),
      copy: root.querySelector("[data-industry-copy]"),
      inventory: root.querySelector("[data-industry-inventory]"),
      production: root.querySelector("[data-industry-production]"),
      alert: root.querySelector("[data-industry-alert]")
    };

    function render(tab, moveFocus) {
      const key = tab.dataset.industry;
      const data = industryData[key];
      if (!data) return;

      tabs.forEach((item) => {
        const active = item === tab;
        item.setAttribute("aria-selected", active ? "true" : "false");
        item.tabIndex = active ? 0 : -1;
      });
      if (workspace) workspace.setAttribute("aria-labelledby", tab.id);

      const update = function () {
        Object.entries(nodes).forEach(([name, node]) => {
          if (node) node.textContent = data[name];
        });
      };

      const changingNodes = Object.values(nodes).filter(Boolean);
      if (window.gsap && !reduceMotion.matches && changingNodes.length) {
        window.gsap.to(changingNodes, {
          autoAlpha: 0.35,
          duration: 0.14,
          onComplete: function () {
            update();
            window.gsap.to(changingNodes, { autoAlpha: 1, duration: 0.24, ease: "power2.out" });
          }
        });
      } else {
        update();
      }

      if (moveFocus) tab.focus();
    }

    tabs.forEach((tab, index) => {
      tab.addEventListener("click", function () { render(tab, false); });
      tab.addEventListener("keydown", function (event) {
        let nextIndex = index;
        if (event.key === "ArrowRight") nextIndex = (index + 1) % tabs.length;
        else if (event.key === "ArrowLeft") nextIndex = (index - 1 + tabs.length) % tabs.length;
        else if (event.key === "Home") nextIndex = 0;
        else if (event.key === "End") nextIndex = tabs.length - 1;
        else return;
        event.preventDefault();
        render(tabs[nextIndex], true);
      });
    });

    render(tabs[0], false);
  }

  function initDecisionPreviews() {
    const boundary = story.querySelector(".novi-boundary");
    const actions = story.querySelectorAll(".decision-action");
    if (!boundary || !actions.length) return;

    const messages = [
      "Preview only: open the fulfillment exception before anything changes.",
      "Preview only: review runway, lead time, and suggested quantity before deciding.",
      "Preview only: open the order-linked conversation before sending a reply."
    ];

    actions.forEach((action, index) => {
      action.addEventListener("click", function () {
        actions.forEach((item) => item.setAttribute("aria-pressed", "false"));
        action.setAttribute("aria-pressed", "true");
        boundary.textContent = messages[index];
      });
    });
  }

  function initializeMotion() {
    if (!window.gsap || !window.ScrollTrigger || reduceMotion.matches) return null;

    const gsap = window.gsap;
    const ScrollTrigger = window.ScrollTrigger;
    gsap.registerPlugin(ScrollTrigger);
    document.documentElement.classList.add("story-motion");

    const media = gsap.matchMedia();

    media.add("(min-width: 1101px) and (prefers-reduced-motion: no-preference)", function () {
      const assembly = story.querySelector("[data-story-assembly]");
      const stageWrap = story.querySelector(".story-stage-wrap");
      const frame = story.querySelector("[data-command-frame]");
      const fragments = Array.from(story.querySelectorAll(".story-fragment"));
      const slots = Array.from(story.querySelectorAll(".command-slots span"));
      const state = story.querySelector("[data-assembly-state]");

      if (assembly && stageWrap && frame && fragments.length === slots.length) {
        const targetDelta = function (fragment, slot, axis) {
          const fragmentRect = fragment.getBoundingClientRect();
          const slotRect = slot.getBoundingClientRect();
          return axis === "x" ? slotRect.left - fragmentRect.left + 8 : slotRect.top - fragmentRect.top + 8;
        };

        const assemblyTimeline = gsap.timeline({
          defaults: { ease: "none" },
          scrollTrigger: {
            trigger: assembly,
            start: "top top",
            end: "+=1050",
            scrub: 0.65,
            pin: stageWrap,
            anticipatePin: 1,
            invalidateOnRefresh: true,
            onUpdate: function (self) {
              if (!state) return;
              state.textContent = self.progress < 0.34 ? "Disconnected work" : self.progress < 0.72 ? "Records aligning" : "One Command Center";
            }
          }
        });

        assemblyTimeline
          .addLabel("fragmentation")
          .to(fragments, { x: function (index) { return index % 2 ? 20 : -20; }, y: function (index) { return index % 3 ? 10 : -14; }, stagger: 0.035, duration: 0.22 })
          .addLabel("alignment")
          .to(frame, { autoAlpha: 1, scale: 1, duration: 0.22 }, "alignment")
          .to(fragments, {
            x: function (index, element) { return targetDelta(element, slots[index], "x"); },
            y: function (index, element) { return targetDelta(element, slots[index], "y"); },
            rotation: 0,
            scale: 0.72,
            transformOrigin: "top left",
            stagger: 0.025,
            duration: 0.4
          }, "alignment+=0.06")
          .addLabel("command")
          .to(fragments, { boxShadow: "0 7px 18px rgba(16,37,63,0.10)", duration: 0.15 });
      }

      const orderStory = story.querySelector("[data-order-story]");
      const orderSteps = Array.from(story.querySelectorAll("[data-order-step]"));
      const progress = story.querySelector("[data-order-progress]");
      if (orderStory && orderSteps.length && progress) {
        ScrollTrigger.create({
          trigger: orderStory,
          start: "top 45%",
          end: "bottom 55%",
          scrub: true,
          onUpdate: function (self) {
            const activeIndex = Math.min(orderSteps.length - 1, Math.floor(self.progress * orderSteps.length));
            orderSteps.forEach((step, index) => step.classList.toggle("is-active", index === activeIndex));
            gsap.set(progress, { scaleX: Math.max(0.08, self.progress) });
          }
        });
      }

      const reduction = story.querySelector("[data-novi-reduction]");
      const records = story.querySelectorAll(".record-field span");
      const brief = story.querySelector(".novi-brief-frame");
      if (reduction && records.length && brief) {
        gsap.timeline({
          scrollTrigger: { trigger: reduction, start: "top 75%", end: "center 45%", scrub: 0.55 }
        })
          .from(records, { autoAlpha: 0, scale: 0.82, stagger: { amount: 0.35, from: "random" }, duration: 0.45, immediateRender: false })
          .from(brief, { autoAlpha: 0, x: 70, duration: 0.5, immediateRender: false }, "-=0.2")
          .to(records, { autoAlpha: 0.26, scale: 0.94, stagger: { amount: 0.2, from: "edges" }, duration: 0.35 });
      }

      const scan = story.querySelector(".scan-result");
      const beam = story.querySelector(".scan-beam");
      if (scan && beam) {
        gsap.timeline({ scrollTrigger: { trigger: scan, start: "top 78%", toggleActions: "play none none reverse" } })
          .set(beam, { autoAlpha: 1, y: 0 })
          .to(beam, { y: function () { return scan.clientHeight - 2; }, duration: 0.75, ease: "power1.inOut" })
          .to(beam, { autoAlpha: 0, duration: 0.18 });
      }

      return function () {
        document.documentElement.classList.remove("story-motion");
      };
    });

    requestAnimationFrame(function () { ScrollTrigger.refresh(); });
    return media;
  }

  initIndustryTabs();
  initDecisionPreviews();
  const motionContext = initializeMotion();

  window.addEventListener("pagehide", function () {
    if (motionContext) motionContext.revert();
  }, { once: true });
})();