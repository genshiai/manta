/* Manta LP — shared behaviour (no dependencies, light theme only) */
(() => {
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---- nav ---- */
  const initNav = () => {
    const nav = document.querySelector(".nav");
    if (nav) {
      const onScroll = () => nav.classList.toggle("scrolled", scrollY > 8);
      onScroll();
      addEventListener("scroll", onScroll, { passive: true });
    }
    const burger = document.querySelector(".nav-burger");
    const links = document.querySelector(".nav-links");
    if (burger && links) {
      burger.addEventListener("click", () => {
        const open = links.classList.toggle("open");
        burger.setAttribute("aria-expanded", String(open));
      });
      links.addEventListener("click", (e) => {
        if (e.target.closest("a")) {
          links.classList.remove("open");
          burger.setAttribute("aria-expanded", "false");
        }
      });
    }
  };

  /* ---- reveal on scroll（data-stagger で子要素を自動時差） ---- */
  const initReveal = () => {
    document.querySelectorAll("[data-stagger]").forEach((parent) => {
      const base = parseFloat(parent.dataset.stagger) || 0.08;
      [...parent.querySelectorAll(":scope .rv")].forEach((el, i) => {
        if (!el.style.getPropertyValue("--d")) el.style.setProperty("--d", `${(i * base).toFixed(2)}s`);
      });
    });
    const els = document.querySelectorAll(".rv");
    if (!els.length) return;
    if (reduced) { els.forEach((el) => el.classList.add("on")); return; }
    const io = new IntersectionObserver(
      (entries) => {
        for (const en of entries) {
          if (en.isIntersecting) {
            en.target.classList.add("on");
            io.unobserve(en.target);
          }
        }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.08 }
    );
    els.forEach((el) => io.observe(el));
  };

  /* ---- parallax（[data-plx] な img を緩やかに追従） ---- */
  const initParallax = () => {
    if (reduced) return;
    const els = [...document.querySelectorAll("[data-plx]")];
    if (!els.length) return;
    let ticking = false;
    const update = () => {
      ticking = false;
      const vh = innerHeight;
      for (const el of els) {
        const r = el.getBoundingClientRect();
        if (r.bottom < -80 || r.top > vh + 80) continue;
        const mid = r.top + r.height / 2 - vh / 2;
        const f = parseFloat(el.dataset.plx) || -0.05;
        el.style.transform = `scale(1.12) translateY(${(mid * f).toFixed(1)}px)`;
      }
    };
    const onScroll = () => {
      if (!ticking) { ticking = true; requestAnimationFrame(update); }
    };
    addEventListener("scroll", onScroll, { passive: true });
    addEventListener("resize", onScroll, { passive: true });
    update();
  };

  /* ---- count up（.stat の数字） ---- */
  const initCount = () => {
    const els = document.querySelectorAll("[data-count]");
    if (!els.length) return;
    const run = (el) => {
      const to = parseFloat(el.dataset.count);
      const suffix = el.dataset.suffix || "";
      if (reduced || !isFinite(to)) { el.textContent = el.dataset.count + suffix; return; }
      const t0 = performance.now();
      const dur = 1100;
      const tick = (t) => {
        const p = Math.min(1, (t - t0) / dur);
        const eased = 1 - Math.pow(1 - p, 3);
        el.textContent = Math.round(to * eased) + suffix;
        if (p < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    };
    const io = new IntersectionObserver((entries) => {
      for (const en of entries) {
        if (en.isIntersecting) { run(en.target); io.unobserve(en.target); }
      }
    }, { threshold: 0.6 });
    els.forEach((el) => io.observe(el));
  };

  /* ---- copy buttons ---- */
  const initCopy = () => {
    document.querySelectorAll("[data-copy]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const sel = btn.getAttribute("data-copy");
        const src = sel ? document.querySelector(sel) : null;
        if (!src) return;
        try {
          await navigator.clipboard.writeText(src.innerText.replace(/^\$ /gm, ""));
          const prev = btn.textContent;
          btn.textContent = "コピーしました";
          setTimeout(() => (btn.textContent = prev), 1600);
        } catch { /* clipboard unavailable — noop */ }
      });
    });
  };

  const boot = () => {
    initNav();
    initReveal();
    initParallax();
    initCount();
    initCopy();
  };
  document.readyState === "loading"
    ? document.addEventListener("DOMContentLoaded", boot)
    : boot();
})();
