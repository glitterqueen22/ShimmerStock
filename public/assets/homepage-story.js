(function () {
  const story = document.querySelector("[data-homepage-story]");
  if (!story) return;
  document.documentElement.classList.add("story-enhanced");

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  function initHeroVideo() {
    const heroRoot = story.querySelector("[data-novi-hero]");
    const film = story.querySelector("[data-hero-film]");
    const video = story.querySelector("[data-novi-hero-video]");
    const fallback = story.querySelector("[data-hero-poster-fallback]");
    const loading = story.querySelector("[data-hero-loading]");
    const toggle = story.querySelector("[data-hero-toggle]");
    const status = story.querySelector("[data-hero-status]");
    if (!heroRoot || !film || !video || !toggle || !status) return;

    let userPaused = false;
    let hasCompleted = false;

    function setStatus(text) {
      status.textContent = text;
    }

    function setToggle(state) {
      if (state === "playing") {
        toggle.textContent = "Pause film";
        toggle.setAttribute("aria-pressed", "true");
        return;
      }
      if (state === "paused") {
        toggle.textContent = "Play film";
        toggle.setAttribute("aria-pressed", "false");
        return;
      }
      toggle.textContent = "Replay film";
      toggle.setAttribute("aria-pressed", "false");
    }

    function setReady() {
      film.classList.remove("is-loading");
      film.classList.add("is-ready");
      if (loading) loading.hidden = true;
      if (fallback) fallback.classList.remove("is-visible");
      setStatus(userPaused ? "Film paused." : "Novi film is playing.");
    }

    function setFallback(message) {
      film.classList.remove("is-loading", "is-ready");
      film.classList.add("is-fallback");
      if (loading) loading.hidden = true;
      if (fallback) fallback.classList.add("is-visible");
      setStatus(message);
      toggle.hidden = true;
    }

    if (reduceMotion.matches) {
      setFallback("Reduced motion is on. Showing poster.");
      return;
    }

    video.muted = true;
    video.defaultMuted = true;
    video.playsInline = true;
    video.setAttribute("muted", "");
    video.setAttribute("playsinline", "");
    video.loop = false;

    function playFromCurrent(restart) {
      if (restart) video.currentTime = 0;
      return video.play().then(function () {
        hasCompleted = false;
        userPaused = false;
        film.classList.remove("is-complete");
        setToggle("playing");
        setStatus("Novi film is playing.");
      });
    }

    const onCanPlay = function () {
      setReady();
      playFromCurrent(false).catch(function () {
        setFallback("Autoplay is blocked. Showing poster.");
      });
    };

    const onError = function () {
      setFallback("Film unavailable right now. Showing poster.");
    };

    video.addEventListener("canplay", onCanPlay, { once: true });
    video.addEventListener("error", onError, { once: true });
    video.addEventListener("stalled", function () {
      if (!film.classList.contains("is-ready")) setStatus("Still loading Novi film.");
    });

    video.addEventListener("ended", function () {
      hasCompleted = true;
      userPaused = false;
      film.classList.add("is-complete");
      story.setAttribute("data-film-state", "complete");
      setToggle("replay");
      setStatus("Film complete. Replay whenever you're ready.");
    });

    toggle.addEventListener("click", function () {
      if (hasCompleted) {
        playFromCurrent(true).catch(function () {
          setFallback("Playback not available right now. Showing poster.");
        });
        return;
      }

      if (video.paused) {
        playFromCurrent(false).catch(function () {
          setFallback("Playback not available right now. Showing poster.");
        });
      } else {
        userPaused = true;
        video.pause();
        setToggle("paused");
        setStatus("Film paused.");
      }
    });

    reduceMotion.addEventListener("change", function (event) {
      if (!event.matches) return;
      video.pause();
      setFallback("Reduced motion is on. Showing poster.");
    });
  }
  const industryData = {
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
        window.gsap.killTweensOf(changingNodes);
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

  const orderReactions = [
    "Novi is watching Order #8197 arrive.",
    "Novi confirms Vanilla Base has six days of runway.",
    "Novi is focused on Batch #52's component check.",
    "Novi caught the one exception: a label reprint is holding the pack lane.",
    "Novi is proud, the handoff completed and the order shipped.",
    "Novi is pleased, Care can reply with full context."
  ];

  const orderStates = ["alert", "focused", "thinking", "serious", "success", "cozy-end"];
  const orderStageMessages = [
    "Order intake: context is connected and ready.",
    "Inventory check: six days of Vanilla Base runway is visible.",
    "Production context: Batch #52 dependencies are now in view.",
    "One thing before this moves on: this label needs a reprint first.",
    "Shipment state: exception cleared and handoff complete.",
    "Customer context: reply is now fully connected to order and shipment state."
  ];

  const NOVI_ASSET_MANIFEST = {
    idle: "/assets/novi/novi-idle-desk.webp",
    alert: "/assets/novi/novi-alert.webp",
    focused: "/assets/novi/novi-focused.webp",
    thinking: "/assets/novi/novi-thinking.webp",
    serious: "/assets/novi/novi-serious.webp",
    success: "/assets/novi/novi-success.webp",
    "cozy-end": "/assets/novi/novi-cozy-end.webp"
  };

  let currentNoviState = null;
  let noviInitialized = false;
  let orderTokenMoved = false;
  let deskActivationStarted = false;
  const deskAmbientTweens = [];

  function initSceneFilmNav() {
    const nav = story.querySelector("[data-debug-scene-nav]");
    const params = new URLSearchParams(window.location.search);
    const debugScenes = params.get("sceneNav") === "1";

    if (nav && debugScenes) {
      nav.hidden = false;
      nav.removeAttribute("aria-hidden");
      story.setAttribute("data-debug-scenes", "true");
    } else if (nav) {
      nav.hidden = true;
      nav.setAttribute("aria-hidden", "true");
      story.removeAttribute("data-debug-scenes");
    }

    const buttons = nav && debugScenes
      ? Array.from(nav.querySelectorAll("[data-scene-jump]"))
      : [];
    const readout = nav && debugScenes ? nav.querySelector("[data-scene-readout]") : null;
    const sections = Array.from(story.querySelectorAll("[data-scene-title]"));
    if (!sections.length) return;
    const byId = new Map();
    const activeSet = new Set();

    sections.forEach(function (section) {
      if (section.id) byId.set(`#${section.id}`, section);
    });

    function setActiveByScene(scene) {
      if (!scene || !scene.id) return;
      const hash = `#${scene.id}`;
      buttons.forEach(function (button) {
        button.classList.toggle("is-active", button.getAttribute("data-scene-jump") === hash);
      });
      if (readout) {
        readout.textContent = `Scene: ${scene.getAttribute("data-scene-title")}`;
      }
      story.setAttribute("data-active-scene", scene.id);
    }

    function resolveActiveFromCenter() {
      if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2) {
        const finalSection = sections[sections.length - 1];
        if (finalSection) {
          setActiveByScene(finalSection);
          return;
        }
      }

      const viewportCenter = window.innerHeight * 0.5;
      const candidates = (activeSet.size ? Array.from(activeSet) : sections).filter(Boolean);
      if (!candidates.length) return;

      const best = candidates
        .map(function (section) {
          const rect = section.getBoundingClientRect();
          const midpoint = rect.top + (rect.height / 2);
          return { section, distance: Math.abs(midpoint - viewportCenter) };
        })
        .sort(function (a, b) { return a.distance - b.distance; })[0];

      if (best && best.section) setActiveByScene(best.section);
    }

    buttons.forEach(function (button) {
      button.addEventListener("click", function () {
        const hash = button.getAttribute("data-scene-jump");
        const target = hash ? byId.get(hash) : null;
        if (!target) return;
        target.scrollIntoView({ behavior: reduceMotion.matches ? "auto" : "smooth", block: "start" });
        const scene = hash ? byId.get(hash) : null;
        if (!scene) return;
        setActiveByScene(scene);
      });
    });

    if (typeof IntersectionObserver === "undefined") {
      setActiveByScene(sections[0]);
      return;
    }

    const observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.target || !entry.target.id) return;
        if (entry.isIntersecting) activeSet.add(entry.target);
        else activeSet.delete(entry.target);
      });
      resolveActiveFromCenter();
    }, {
      threshold: [0, 0.25, 0.5, 0.75],
      rootMargin: "-45% 0px -45% 0px"
    });

    sections.forEach(function (section) { observer.observe(section); });
    setActiveByScene(sections[0]);
  }

  function applyNoviAsset(portraits, src, useMotion) {
    const doSwap = function () {
      portraits.forEach(function (portrait) { portrait.setAttribute("src", src); });
    };
    if (useMotion && window.gsap && !reduceMotion.matches) {
      window.gsap.killTweensOf(portraits);
      window.gsap.to(portraits, {
        autoAlpha: 0, scale: 0.94, duration: 0.16,
        onComplete: function () {
          doSwap();
          window.gsap.to(portraits, { autoAlpha: 1, scale: 1, duration: 0.22, ease: "power2.out" });
        }
      });
    } else {
      doSwap();
    }
  }

  function swapNoviPortrait(stateKey) {
    if (stateKey === currentNoviState) return;
    const isFirstCall = !noviInitialized;
    currentNoviState = stateKey;
    noviInitialized = true;
    const portraits = Array.from(story.querySelectorAll("[data-novi-portrait]"));
    const asset = NOVI_ASSET_MANIFEST[stateKey];
    if (!portraits.length || !asset) return;

    const probe = new Image();
    probe.onload = function () {
      if (currentNoviState === stateKey) applyNoviAsset(portraits, asset, !isFirstCall);
    };
    probe.src = asset;
  }

  function markDeskActive() {
    const anchor = story.querySelector(".order-anchor");
    const lane = story.querySelector("[data-order-token-dock]");
    if (!anchor) return;

    if (!deskActivationStarted) {
      deskActivationStarted = true;
      animateOrderTokenHandoff();
    }

    anchor.setAttribute("data-order-state", "active");
    if (lane && !orderTokenMoved) {
      lane.textContent = "Routing Order #8197 into the journey";
    }
  }

  function animateOrderTokenHandoff() {
    if (orderTokenMoved) return;
    const token = story.querySelector(".story-hero-copy .story-text-link[href='#order-journey']");
    const dock = story.querySelector("[data-order-token-dock]");
    if (!dock) return;

    const finalize = function () {
      dock.textContent = "Order #8197 is now in the live journey";
      dock.classList.add("is-arrived");
      orderTokenMoved = true;
    };

    if (!token || !window.gsap || reduceMotion.matches) {
      finalize();
      return;
    }

    const start = token.getBoundingClientRect();
    const end = dock.getBoundingClientRect();
    const flight = token.cloneNode(true);
    flight.classList.add("order-token-flight");
    document.body.appendChild(flight);

    window.gsap.set(flight, {
      position: "fixed",
      top: start.top,
      left: start.left,
      width: start.width,
      height: start.height,
      margin: 0,
      zIndex: 80,
      pointerEvents: "none"
    });

    window.gsap.timeline({
      defaults: { ease: "power2.inOut" },
      onComplete: function () {
        flight.remove();
        finalize();
      }
    })
      .to(flight, {
        x: end.left - start.left,
        y: end.top - start.top,
        scale: 0.9,
        duration: 0.52
      })
      .to(flight, {
        autoAlpha: 0,
        duration: 0.18
      });
  }

  function initNoviDeskScene() {
    swapNoviPortrait("idle");
  }

  function initOrderJourneyPlayer() {
    const root = story.querySelector("[data-order-story]");
    const steps = Array.from(story.querySelectorAll("[data-order-step]"));
    const jumpButtons = Array.from(story.querySelectorAll("[data-order-jump]"));
    const progress = story.querySelector("[data-order-progress]");
    const reactionEl = story.querySelector("[data-order-reaction]");
    const reactionText = story.querySelector("[data-order-reaction-text]");
    const stageState = story.querySelector("[data-order-stage-state]");
    const anchor = story.querySelector(".order-anchor");
    const playBtn = story.querySelector("[data-order-play]");
    const pauseBtn = story.querySelector("[data-order-pause]");
    const replayBtn = story.querySelector("[data-order-replay]");
    if (!root || !steps.length || !jumpButtons.length || !progress || !playBtn || !pauseBtn || !replayBtn) return;

    let activeIndex = 0;
    let playing = false;
    let timer = null;
    const STEP_MS = 2200;

    function render(index) {
      activeIndex = Math.max(0, Math.min(steps.length - 1, index));
      steps.forEach((step, i) => step.classList.toggle("is-active", i === activeIndex));
      jumpButtons.forEach((button, i) => {
        if (i === activeIndex) button.setAttribute("aria-current", "step");
        else button.removeAttribute("aria-current");
      });
      const scale = Math.max(0.08, (activeIndex + 1) / steps.length);
      if (window.gsap) window.gsap.set(progress, { scaleX: scale });
      else progress.style.transform = "scaleX(" + scale + ")";
      if (reactionText) reactionText.textContent = orderReactions[activeIndex] || orderReactions[0];
      if (reactionEl) reactionEl.dataset.noviState = orderStates[activeIndex] || orderStates[0];
      if (stageState) stageState.textContent = orderStageMessages[activeIndex] || orderStageMessages[0];
      if (anchor) anchor.setAttribute("data-order-stage", String(activeIndex));
      root.setAttribute("data-story-beat", orderStates[activeIndex] || orderStates[0]);
      swapNoviPortrait(orderStates[activeIndex] || orderStates[0]);
    }

    function stop() {
      playing = false;
      if (timer) { clearInterval(timer); timer = null; }
      playBtn.setAttribute("aria-pressed", "false");
      pauseBtn.setAttribute("aria-pressed", "true");
    }

    function start() {
      if (playing) return;
      playing = true;
      playBtn.setAttribute("aria-pressed", "true");
      pauseBtn.setAttribute("aria-pressed", "false");
      if (activeIndex >= steps.length - 1) render(0);
      timer = setInterval(function () {
        if (activeIndex >= steps.length - 1) { stop(); return; }
        render(activeIndex + 1);
      }, STEP_MS);
    }

    playBtn.addEventListener("click", function () { markDeskActive(); start(); });
    pauseBtn.addEventListener("click", stop);
    replayBtn.addEventListener("click", function () {
      stop();
      render(0);
      markDeskActive();
      start();
    });
    jumpButtons.forEach((button, index) => {
      button.addEventListener("click", function () {
        stop();
        markDeskActive();
        render(index);
      });
    });

    render(0);
  }

  function initSkuSequence() {
    const list = story.querySelector("[data-label-sequence]");
    const scanBtn = story.querySelector("[data-scan-trigger]");
    const beam = story.querySelector(".scan-beam");
    const actionButtons = Array.from(story.querySelectorAll("[data-label-action]"));
    const thermalLabel = story.querySelector("[data-thermal-label]");
    const output = story.querySelector("[data-label-output]");
    if (!list) return;

    const stages = Array.from(list.querySelectorAll("[data-label-stage]"));
    let stageIndex = 0;
    let timer = null;
    let printed = false;

    function render(index) {
      stageIndex = index % stages.length;
      stages.forEach((stage, i) => stage.classList.toggle("is-active", i === stageIndex));
    }

    function setActionPressed(key) {
      actionButtons.forEach(function (button) {
        const pressed = button.getAttribute("data-label-action") === key;
        button.setAttribute("aria-pressed", pressed ? "true" : "false");
      });
    }

    function printLabel(triggeredByUser) {
      printed = true;
      render(stages.length - 1);
      setActionPressed("print");
      if (output) {
        output.textContent = triggeredByUser
          ? "Thermal label printed. Novi is ready for scan verification."
          : "Novi printed the thermal label before scan verification.";
      }
      if (thermalLabel) thermalLabel.classList.add("is-printed");
      if (window.gsap && !reduceMotion.matches && thermalLabel) {
        window.gsap.fromTo(thermalLabel, { y: -42, autoAlpha: 0.4 }, { y: 0, autoAlpha: 1, duration: 0.38, ease: "power2.out" });
      }
    }

    if (!reduceMotion.matches) {
      timer = setInterval(function () { render(stageIndex + 1); }, 1800);
    }

    stages.forEach((stage, index) => {
      stage.addEventListener("click", function () {
        if (timer) { clearInterval(timer); timer = null; }
        render(index);
      });
    });

    actionButtons.forEach(function (button) {
      button.addEventListener("click", function () {
        const action = button.getAttribute("data-label-action");
        if (!action) return;
        if (timer) { clearInterval(timer); timer = null; }

        if (action === "review") {
          setActionPressed("review");
          render(0);
          if (output) output.textContent = "Review mode: current identifier gaps are visible.";
          return;
        }

        if (action === "approve") {
          setActionPressed("approve");
          render(2);
          if (output) output.textContent = "Approved for save: VCK-8OZ with internal barcode SS-008197-02.";
          return;
        }

        if (action === "print") {
          printLabel(true);
        }
      });
    });

    if (scanBtn && beam) {
      scanBtn.addEventListener("click", function () {
        if (!printed) printLabel(false);
        setActionPressed("print");
        render(stages.length - 1);
        if (output) output.textContent = "Scan matched: product, variant, SKU, barcode, quantity, and bin are connected.";
        if (window.gsap && !reduceMotion.matches) {
          window.gsap.timeline()
            .set(beam, { autoAlpha: 1, y: 0 })
            .to(beam, { y: function () { return beam.parentElement.clientHeight - 2; }, duration: 0.75, ease: "power1.inOut" })
            .to(beam, { autoAlpha: 0, duration: 0.18 });
        }
      });
    }
  }

  function initMissionPreviews() {
    const buttons = Array.from(story.querySelectorAll("[data-mission-preview]"));
    const output = story.querySelector("[data-mission-preview-output]");
    if (!buttons.length || !output) return;

    const messages = [
      "Preview only: inspect the pack-lane exception before approving any change.",
      "Preview only: verify runway and supplier lead-time math before confirming reorder quantity.",
      "Preview only: review shipment-linked context before sending a customer reply."
    ];

    buttons.forEach((button) => {
      button.addEventListener("click", function () {
        const index = Number(button.getAttribute("data-mission-preview")) || 0;
        const card = button.closest(".mission-card");
        buttons.forEach(function (item) {
          const owner = item.closest(".mission-card");
          if (owner) owner.classList.remove("is-active");
        });
        if (card) card.classList.add("is-active");
        output.textContent = messages[index] || messages[0];
      });
    });
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
      const reduction = story.querySelector("[data-novi-reduction]");
      const records = story.querySelectorAll(".record-field span");
      const resolvedRecords = story.querySelectorAll(".record-field span:not([data-decision-linked])");
      const linkedRecords = story.querySelectorAll(".record-field span[data-decision-linked]");
      const brief = story.querySelector(".novi-brief-frame");
      if (reduction && records.length && brief) {
        gsap.timeline({
          scrollTrigger: { trigger: reduction, start: "top 75%", end: "center 45%", scrub: 0.55 }
        })
          .from(records, { autoAlpha: 0, scale: 0.82, stagger: { amount: 0.35, from: "start" }, duration: 0.45, immediateRender: false })
          .from(brief, { autoAlpha: 0, x: 70, duration: 0.5, immediateRender: false }, "-=0.2")
          .addLabel("resolve")
          .to(resolvedRecords, { autoAlpha: 0.22, scale: 0.86, y: 6, stagger: { amount: 0.2, from: "edges" }, duration: 0.35 }, "resolve")
          .to(linkedRecords, { autoAlpha: 1, scale: 1.06, borderColor: "var(--pink)", stagger: 0.04, duration: 0.35 }, "resolve");
      }

      return function () {
        document.documentElement.classList.remove("story-motion");
      };
    });

    requestAnimationFrame(function () { ScrollTrigger.refresh(); });
    return media;
  }

  initIndustryTabs();
  initHeroVideo();
  initSceneFilmNav();
  initDecisionPreviews();
  initOrderJourneyPlayer();
  initNoviDeskScene();
  const motionContext = initializeMotion();

  window.addEventListener("pagehide", function () {
    if (motionContext) motionContext.revert();
    deskAmbientTweens.forEach(function (tween) {
      if (tween && typeof tween.kill === "function") tween.kill();
    });
  }, { once: true });
})();