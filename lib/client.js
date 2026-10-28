/**
 * dsh-mouse-blur — browser half.
 *
 * Goal: while the pointer is idle, the DSH wallpaper is perfectly sharp; while
 * the pointer moves (or the user clicks / scrolls), it blurs to a configurable
 * percentage of the theme background slider's full scale.
 *
 * The background media is painted by dsh-cool-theme:
 *
 *   0.9:  .ct-bg-image { filter: blur(var(--ct-bg-blur-light, 0px)); }
 *   0.10: .ct-bg-side  { filter: blur(var(--ct-bg-blur-light, 0px)); }   // image or video
 *
 * cool-theme writes those two variables inline on <html>. An `!important`
 * author rule on <html> outranks inline declarations, so we can drive the same
 * variables without patching cool-theme, and the composer's backdrop
 * pseudo-element (which reads --ct-bg-blur, derived from the same pair) follows
 * automatically. Removing the style tag restores the theme's own value.
 *
 * Settings live in this browser's localStorage and are exposed as a
 * "主题 · 鼠标模糊" section in DSH Settings, ordered directly after the theme
 * page. The preference store is shared by the settings UI and the pointer
 * runtime, so every slider move applies without a reload.
 */

window.__ModuleLoader__.load({
  id: "dsh-mouse-blur",
  factory: (require) => {
    const module = { exports: {} };
    const exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

    const React = require("react");
    const { createElement: h, useEffect, useState } = React;

    /** dsh-cool-theme clamps its background blur slider to 0–24 px. */
    const BLUR_SCALE_MAX_PX = 24;
    const STORAGE_KEY = "dsh-mouse-blur/settings/v1";
    // The DSH web origin's port changes across restarts, so localStorage alone
    // would lose the preference. A host-only cookie (cookies ignore ports)
    // carries it across restarts; localStorage stays as the same-origin fallback.
    const COOKIE_NAME = "dsh-mouse-blur-settings";
    const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;
    const ACTIVE_ATTR = "data-dsh-mouse-blur-active";
    const STYLE_ID = "dsh-mouse-blur/background.css";
    const STATE_KEY = "__dshMouseBlur";

    /** Editable fields, their public ranges, and their defaults. */
    const SETTING_SPECS = Object.freeze({
      activePercent: Object.freeze({ min: 0, max: 100, step: 1, default: 40 }),
      transitionMs: Object.freeze({ min: 100, max: 2000, step: 10, default: 320 }),
      idleDelayMs: Object.freeze({ min: 100, max: 3000, step: 10, default: 1200 }),
    });

    const DEFAULT_SETTINGS = Object.freeze(
      Object.fromEntries(
        Object.entries(SETTING_SPECS).map(([key, spec]) => [key, spec.default]),
      ),
    );

    const COMPOSER_BACKDROP =
      'html.ct-bg-on [class*="centerCol"] [data-phase="active"] [data-composer-seat]::before';

    // cool-theme 0.10 moved the blur from .ct-bg-image to its .ct-bg-side wrapper
    // (covering image and video backgrounds) and added a composer video element.
    // Keep .ct-bg-image for compat with 0.9.
    const BLUR_LAYERS = ".ct-bg-side,.ct-bg-image,.ct-bg-composer-video";

    const SETTINGS_CSS = [
      ".dsmb{display:flex;flex-direction:column;max-width:760px;padding-bottom:8px;color:var(--dsw-alias-label-primary)}",
      ".dsmb-head{padding:0 0 8px}",
      ".dsmb-title{margin:0;font-size:16px;font-weight:500;line-height:24px}",
      ".dsmb-desc{margin:4px 0 0;font-size:13px;line-height:20px;color:var(--dsw-alias-label-tertiary)}",
      ".dsmb-status{margin:4px 0 12px;padding:8px 10px;border-radius:6px;background:rgba(127,127,127,.08);font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums}",
      ".dsmb-row{display:flex;align-items:center;justify-content:space-between;gap:16px 24px;padding:16px 0;border-bottom:.5px solid var(--dsw-alias-border-l2)}",
      ".dsmb-row-main{display:flex;flex-direction:column;gap:4px;min-width:0;flex:1}",
      ".dsmb-row-title{font-size:14px;line-height:22px}",
      ".dsmb-row-desc{font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary)}",
      ".dsmb-control{display:flex;align-items:center;gap:10px;flex:0 0 auto;min-width:270px}",
      ".dsmb-range{width:190px;accent-color:var(--dsw-alias-brand-primary);cursor:pointer}",
      ".dsmb-value{min-width:64px;text-align:right;font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums}",
      ".dsmb-actions{display:flex;justify-content:flex-end;padding-top:14px}",
      ".dsmb-reset{height:30px;padding:0 12px;border:1px solid var(--dsw-alias-border-l2);border-radius:6px;background:transparent;color:var(--dsw-alias-label-primary);font-size:12.5px;cursor:pointer}",
      ".dsmb-reset:hover{background:var(--dsw-alias-interactive-bg-hover)}",
      "@media(max-width:640px){.dsmb-row{flex-direction:column;align-items:stretch}.dsmb-control{min-width:0}.dsmb-range{flex:1;width:auto}}",
    ].join("");

    const CSS = [
      "html{--dsmb-blur:0px}",
      `html[${ACTIVE_ATTR}]{--dsmb-blur:var(--dsmb-active-blur,9.6px)}`,
      // Beat cool-theme's inline variables (author !important > inline).
      "html{--ct-bg-blur-light:var(--dsmb-blur) !important;--ct-bg-blur-dark:var(--dsmb-blur) !important}",
      `${BLUR_LAYERS},${COMPOSER_BACKDROP}{transition:filter var(--dsmb-transition,320ms) cubic-bezier(.22,.61,.36,1)}`,
      `@media (prefers-reduced-motion:reduce){${BLUR_LAYERS},${COMPOSER_BACKDROP}{transition:none}}`,
      SETTINGS_CSS,
    ].join("");

    /** Clamp one value into its public range and snap it to the slider step. */
    function normalizeValue(key, value) {
      const spec = SETTING_SPECS[key];
      const numeric = typeof value === "number" ? value : Number(value);
      if (!Number.isFinite(numeric)) return spec.default;
      const clamped = Math.min(spec.max, Math.max(spec.min, numeric));
      const steps = Math.round((clamped - spec.min) / spec.step);
      return Math.min(spec.max, spec.min + steps * spec.step);
    }

    /** Validate one stored or partial settings object. */
    function normalizeSettings(raw) {
      const source = raw && typeof raw === "object" ? raw : {};
      return Object.fromEntries(
        Object.keys(SETTING_SPECS).map((key) => [key, normalizeValue(key, source[key])]),
      );
    }

    /** Read one host-only cookie value, or null when absent/unavailable. */
    function readCookieValue(name) {
      try {
        const prefix = `${name}=`;
        for (const part of document.cookie.split(";")) {
          const trimmed = part.trim();
          if (trimmed.startsWith(prefix)) {
            return decodeURIComponent(trimmed.slice(prefix.length));
          }
        }
      } catch {
        /* cookies unavailable */
      }
      return null;
    }

    /** Write one host-only cookie; a blocked cookie jar falls back to storage. */
    function writeCookieValue(name, value) {
      try {
        document.cookie = `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${COOKIE_MAX_AGE_SECONDS}; SameSite=Lax`;
      } catch {
        /* cookies unavailable */
      }
    }

    /** Read settings from cookie/localStorage, falling back to defaults. */
    function readStoredSettings() {
      const cookie = readCookieValue(COOKIE_NAME);
      if (cookie !== null) {
        try {
          return normalizeSettings(JSON.parse(cookie));
        } catch {
          /* fall through to localStorage */
        }
      }
      try {
        const text = window.localStorage.getItem(STORAGE_KEY);
        if (text === null) return { ...DEFAULT_SETTINGS };
        return normalizeSettings(JSON.parse(text));
      } catch {
        return { ...DEFAULT_SETTINGS };
      }
    }

    /** Persist settings to both stores; a blocked store only loses that fallback. */
    function writeStoredSettings(settings) {
      const text = JSON.stringify(settings);
      writeCookieValue(COOKIE_NAME, text);
      try {
        window.localStorage.setItem(STORAGE_KEY, text);
      } catch {
        /* ignore unavailable or full storage */
      }
    }

    /** Current blur radius for an active percentage. */
    function blurPxFor(percent) {
      return Math.round(((BLUR_SCALE_MAX_PX * percent) / 100) * 100) / 100;
    }

    /** Format the derived px value for the settings readouts. */
    function formatPx(px) {
      return `${Number.isInteger(px) ? String(px) : px.toFixed(1)} px`;
    }

    // One module-level store: the runtime and the settings page read and write
    // the same values, and every change is broadcast synchronously.
    let currentSettings = readStoredSettings();
    const settingsListeners = new Set();

    /** Read the accepted settings snapshot. */
    function getSettings() {
      return currentSettings;
    }

    /** Notify every live listener, isolating a broken one. */
    function emitSettings(next) {
      for (const listener of [...settingsListeners]) {
        try {
          listener(next);
        } catch {
          /* one listener must not break the others */
        }
      }
    }

    /** Merge one patch, persist it, and notify the runtime and the page. */
    function setSettings(patch) {
      const next = normalizeSettings({ ...currentSettings, ...patch });
      currentSettings = next;
      writeStoredSettings(next);
      emitSettings(next);
      return next;
    }

    /** Subscribe to settings changes; returns the unsubscriber. */
    function subscribeSettings(listener) {
      settingsListeners.add(listener);
      return () => {
        settingsListeners.delete(listener);
      };
    }

    /** Install (or refresh) the plugin's stylesheet. */
    function installStyle() {
      let tag = document.querySelector(`style[data-plugin-css="${STYLE_ID}"]`);
      if (tag === null) {
        tag = document.createElement("style");
        tag.dataset.plugin = "dsh-mouse-blur";
        tag.dataset.pluginCss = STYLE_ID;
        document.head.append(tag);
      }
      tag.textContent = CSS;
      return tag;
    }

    /** One slider row in the settings section. */
    function SettingRow({ label, hint, value, spec, unit, onChange }) {
      return h(
        "div",
        { className: "dsmb-row" },
        h(
          "div",
          { className: "dsmb-row-main" },
          h("div", { className: "dsmb-row-title" }, label),
          h("div", { className: "dsmb-row-desc" }, hint),
        ),
        h(
          "div",
          { className: "dsmb-control" },
          h("input", {
            className: "dsmb-range",
            type: "range",
            min: spec.min,
            max: spec.max,
            step: spec.step,
            value,
            "aria-label": label,
            onChange: (event) => onChange(Number(event.currentTarget.value)),
          }),
          h("span", { className: "dsmb-value" }, `${value}${unit}`),
        ),
      );
    }

    /** The "主题 · 鼠标模糊" settings section. */
    function MouseBlurSection() {
      const [settings, setLocalSettings] = useState(getSettings);

      useEffect(() => subscribeSettings(setLocalSettings), []);

      const update = (key) => (value) => setSettings({ [key]: value });
      const px = blurPxFor(settings.activePercent);

      return h(
        "div",
        { className: "dsmb" },
        h(
          "div",
          { className: "dsmb-head" },
          h("h2", { className: "dsmb-title" }, "主题 · 鼠标模糊"),
          h(
            "p",
            { className: "dsmb-desc" },
            "控制背景图随鼠标活动的模糊程度。背景图由 dsh-cool-theme 提供；改动立即生效，设置保存在当前浏览器。",
          ),
        ),
        h(
          "div",
          { className: "dsmb-status" },
          `当前：活动 ${settings.activePercent}% (${formatPx(px)}) · 过渡 ${settings.transitionMs} ms · 静默 ${settings.idleDelayMs} ms`,
        ),
        h(SettingRow, {
          label: "活动时模糊",
          hint: `鼠标移动、点击或滚动时，背景模糊到满量程 24 px 的 ${settings.activePercent}%（${formatPx(px)}）。`,
          value: settings.activePercent,
          spec: SETTING_SPECS.activePercent,
          unit: "%",
          onChange: update("activePercent"),
        }),
        h(SettingRow, {
          label: "过渡时间",
          hint: "清晰和模糊之间切换的时长。",
          value: settings.transitionMs,
          spec: SETTING_SPECS.transitionMs,
          unit: " ms",
          onChange: update("transitionMs"),
        }),
        h(SettingRow, {
          label: "静默归零",
          hint: "鼠标停下多久后，背景恢复完全清晰。",
          value: settings.idleDelayMs,
          spec: SETTING_SPECS.idleDelayMs,
          unit: " ms",
          onChange: update("idleDelayMs"),
        }),
        h(
          "div",
          { className: "dsmb-actions" },
          h(
            "button",
            {
              type: "button",
              className: "dsmb-reset",
              onClick: () => setSettings(DEFAULT_SETTINGS),
            },
            "恢复默认（40% / 320 ms / 1200 ms）",
          ),
        ),
      );
    }

    /**
     * Apply the presentation-only behaviour.
     * @param ctx - Cordis client context; `ctx.effect` owns the cleanup.
     */
    function apply(ctx) {
      if (typeof document === "undefined") return;

      if (window[STATE_KEY] !== undefined) {
        // The previous instance is still mounted (HMR overlap). Keep it; the
        // loader disposes it before mounting a replacement in the normal path.
        ctx.effect(() => () => {}, "dsh-mouse-blur: already active");
        return;
      }

      const root = document.documentElement;
      const style = installStyle();
      const previous = {
        activeBlur: root.style.getPropertyValue("--dsmb-active-blur"),
        transition: root.style.getPropertyValue("--dsmb-transition"),
      };
      const state = {
        active: false,
        timer: 0,
        frame: 0,
        idleDelayMs: currentSettings.idleDelayMs,
        settings: currentSettings,
        setActive(on) {
          setActive(on === true);
        },
      };
      window[STATE_KEY] = state;

      /** Toggle the documented state attribute; CSS resolves the px value. */
      function setActive(on) {
        if (state.active === on) return;
        state.active = on;
        if (on) root.setAttribute(ACTIVE_ATTR, "");
        else root.removeAttribute(ACTIVE_ATTR);
      }

      /** Restart the quiet-window countdown. */
      function scheduleIdle() {
        clearTimeout(state.timer);
        state.timer = window.setTimeout(() => {
          state.timer = 0;
          setActive(false);
        }, state.idleDelayMs);
      }

      /** Push one settings snapshot into the running presentation. */
      function applySettings(next) {
        state.settings = next;
        state.idleDelayMs = next.idleDelayMs;
        root.style.setProperty("--dsmb-active-blur", `${blurPxFor(next.activePercent)}px`);
        root.style.setProperty("--dsmb-transition", `${next.transitionMs}ms`);
        if (state.active) scheduleIdle();
      }

      applySettings(currentSettings);

      /**
       * Activity wake-up, coalesced to one frame so a fast pointer stream does
       * not toggle classes or thrash timers at pointer-event rate.
       */
      function wake() {
        if (state.frame !== 0) {
          scheduleIdle();
          return;
        }
        state.frame = window.requestAnimationFrame(() => {
          state.frame = 0;
          setActive(true);
          scheduleIdle();
        });
      }

      const listenerOptions = { capture: true, passive: true };
      window.addEventListener("pointermove", wake, listenerOptions);
      window.addEventListener("pointerdown", wake, listenerOptions);
      window.addEventListener("mousedown", wake, listenerOptions);
      window.addEventListener("click", wake, listenerOptions);
      window.addEventListener("wheel", wake, listenerOptions);

      const unsubscribe = subscribeSettings((next) => {
        if (window[STATE_KEY] === state) applySettings(next);
      });

      /** Cross-tab: another page changed the same browser preference. */
      const onStorage = (event) => {
        if (event.key !== STORAGE_KEY && event.key !== null) return;
        const next = readStoredSettings();
        currentSettings = next;
        emitSettings(next);
      };
      window.addEventListener("storage", onStorage);

      const cleanup = () => {
        clearTimeout(state.timer);
        if (state.frame !== 0) window.cancelAnimationFrame(state.frame);
        window.removeEventListener("pointermove", wake, listenerOptions);
        window.removeEventListener("pointerdown", wake, listenerOptions);
        window.removeEventListener("mousedown", wake, listenerOptions);
        window.removeEventListener("click", wake, listenerOptions);
        window.removeEventListener("wheel", wake, listenerOptions);
        window.removeEventListener("storage", onStorage);
        unsubscribe();
        root.removeAttribute(ACTIVE_ATTR);
        if (previous.activeBlur === "") root.style.removeProperty("--dsmb-active-blur");
        else root.style.setProperty("--dsmb-active-blur", previous.activeBlur);
        if (previous.transition === "") root.style.removeProperty("--dsmb-transition");
        else root.style.setProperty("--dsmb-transition", previous.transition);
        style.remove();
        if (window[STATE_KEY] === state) delete window[STATE_KEY];
      };

      ctx.effect(() => cleanup, "dsh-mouse-blur: idle background blur");

      if (ctx.slots !== undefined) {
        ctx.effect(
          () =>
            ctx.slots.inject("settings.section", () =>
              ctx.slots.register(
                {
                  name: "settings.section",
                  id: "mouse-blur",
                  order: 5.1,
                  label: () => "主题 · 鼠标模糊",
                },
                MouseBlurSection,
              ),
            ),
          "dsh-mouse-blur: settings section",
        );
      }
    }

    exports.apply = apply;
    exports.getSettings = getSettings;
    exports.setSettings = setSettings;
    exports.subscribeSettings = subscribeSettings;
    exports.DEFAULT_SETTINGS = DEFAULT_SETTINGS;
    exports.SETTING_SPECS = SETTING_SPECS;
    exports.MouseBlurSection = MouseBlurSection;
    // Backwards-compatible defaults for older harnesses/consumers.
    exports.ACTIVE_BLUR_PERCENT = DEFAULT_SETTINGS.activePercent;
    exports.ACTIVE_BLUR_PX = blurPxFor(DEFAULT_SETTINGS.activePercent);
    exports.IDLE_DELAY_MS = DEFAULT_SETTINGS.idleDelayMs;
    exports.TRANSITION_MS = DEFAULT_SETTINGS.transitionMs;
    exports.inject = ["slots"];
    return module.exports;
  },
});
