import { a7 as ssr_context, a8 as fallback, a9 as attr_style, e as escape_html, aa as bind_props, ab as stringify, ac as store_get, ad as attr_class, ae as ensure_array_like, a as attr, af as unsubscribe_stores } from "../../chunks/index2.js";
import "clsx";
import { w as writable } from "../../chunks/index.js";
function onDestroy(fn) {
  /** @type {SSRContext} */
  ssr_context.r.on_destroy(fn);
}
const chatMessages = writable([]);
const gatewayConnected = writable(false);
const isLoading = writable(false);
const energy = writable(0);
const mood = writable("");
const mode = writable("initiative");
function EnergyBar($$renderer, $$props) {
  let color, label;
  let level = fallback($$props["level"], 0);
  color = level > 80 ? "#22c55e" : level > 50 ? "#f4a261" : "#ef4444";
  label = level > 80 ? "Volle Kraft" : level > 50 ? "Ausbalanciert" : level > 20 ? "Erholung" : "Energie sparend";
  $$renderer.push(`<div class="energy-card svelte-3a968t"><div class="header svelte-3a968t"><span class="icon svelte-3a968t">⚡</span> <span class="title svelte-3a968t">Energie</span></div> <div class="energy-bar-container svelte-3a968t"><div class="energy-bar svelte-3a968t"${attr_style(`width: ${stringify(level)}%; background: ${stringify(color)};`)}></div></div> <div class="info svelte-3a968t"><span class="level svelte-3a968t">${escape_html(level)}%</span> <span class="label svelte-3a968t">${escape_html(label)}</span></div></div>`);
  bind_props($$props, { level });
}
function MoodCard($$renderer, $$props) {
  let emoji, modeLabel;
  let mood2 = fallback($$props["mood"], "");
  let mode2 = fallback($$props["mode"], "initiative");
  const modeEmojis = {
    "initiative": "🎯",
    "dream": "🌙",
    "balanced": "⚖️",
    "sleeping": "💤"
  };
  const modeLabels = {
    "initiative": "Aktiv & Handelnd",
    "dream": "Träumend",
    "balanced": "Ausbalanciert",
    "sleeping": "Schlafend"
  };
  emoji = modeEmojis[mode2] || "🧠";
  modeLabel = modeLabels[mode2] || mode2;
  $$renderer.push(`<div class="mood-card svelte-zx58f7"><div class="header svelte-zx58f7"><span class="icon svelte-zx58f7">${escape_html(emoji)}</span> <span class="title svelte-zx58f7">Zustand</span></div> <div class="mood-text svelte-zx58f7">`);
  if (mood2) {
    $$renderer.push("<!--[-->");
    $$renderer.push(`${escape_html(mood2)}`);
  } else {
    $$renderer.push("<!--[!-->");
    $$renderer.push(`<span class="placeholder svelte-zx58f7">Wird geladen...</span>`);
  }
  $$renderer.push(`<!--]--></div> <div class="mode-indicator svelte-zx58f7"><span class="mode-badge svelte-zx58f7">${escape_html(modeLabel)}</span></div></div>`);
  bind_props($$props, { mood: mood2, mode: mode2 });
}
function _page($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    var $$store_subs;
    let inputText = "";
    let messagesContainer;
    onDestroy(() => {
    });
    if (store_get($$store_subs ??= {}, "$chatMessages", chatMessages) && messagesContainer) ;
    $$renderer2.push(`<div class="dashboard svelte-1uha8ag"><header class="header svelte-1uha8ag"><h1 class="svelte-1uha8ag">ØM Dashboard</h1> <div class="status svelte-1uha8ag"><span${attr_class("status-dot svelte-1uha8ag", void 0, {
      "connected": store_get($$store_subs ??= {}, "$gatewayConnected", gatewayConnected)
    })}></span> <span class="status-text svelte-1uha8ag">${escape_html(
      // Gateway beim Start verbinden
      // Nachricht senden
      // Heartbeat auslösen
      // Neue Session
      // Enter-Taste zum Senden
      store_get($$store_subs ??= {}, "$gatewayConnected", gatewayConnected) ? "Verbunden" : "Offline"
    )}</span></div></header> <div class="main-layout svelte-1uha8ag"><aside class="sidebar svelte-1uha8ag">`);
    EnergyBar($$renderer2, { level: store_get($$store_subs ??= {}, "$energy", energy) });
    $$renderer2.push(`<!----> `);
    MoodCard($$renderer2, {
      mood: store_get($$store_subs ??= {}, "$mood", mood),
      mode: store_get($$store_subs ??= {}, "$mode", mode)
    });
    $$renderer2.push(`<!----></aside> <main class="chat-area svelte-1uha8ag"><div class="messages svelte-1uha8ag">`);
    if (store_get($$store_subs ??= {}, "$chatMessages", chatMessages).length === 0) {
      $$renderer2.push("<!--[-->");
      $$renderer2.push(`<div class="welcome svelte-1uha8ag"><p class="svelte-1uha8ag">Willkommen bei Øms Dashboard</p> <p class="hint svelte-1uha8ag">Sende eine Nachricht oder löse einen Heartbeat aus</p></div>`);
    } else {
      $$renderer2.push("<!--[!-->");
    }
    $$renderer2.push(`<!--]--> <!--[-->`);
    const each_array = ensure_array_like(store_get($$store_subs ??= {}, "$chatMessages", chatMessages));
    for (let $$index = 0, $$length = each_array.length; $$index < $$length; $$index++) {
      let msg = each_array[$$index];
      $$renderer2.push(`<div${attr_class(`message ${stringify(msg.role)}`, "svelte-1uha8ag")}><div class="avatar svelte-1uha8ag">${escape_html(msg.role === "user" ? "👤" : "🦊")}</div> <div class="content svelte-1uha8ag">${escape_html(msg.content)}</div></div>`);
    }
    $$renderer2.push(`<!--]--> `);
    if (store_get($$store_subs ??= {}, "$isLoading", isLoading)) {
      $$renderer2.push("<!--[-->");
      $$renderer2.push(`<div class="message assistant svelte-1uha8ag"><div class="avatar svelte-1uha8ag">🦊</div> <div class="content typing svelte-1uha8ag"><span class="svelte-1uha8ag">Øm denkt nach</span> <span class="dots svelte-1uha8ag">...</span></div></div>`);
    } else {
      $$renderer2.push("<!--[!-->");
    }
    $$renderer2.push(`<!--]--></div></main></div> <footer class="input-area svelte-1uha8ag"><input type="text"${attr("value", inputText)} placeholder="Nachricht an Øm..."${attr("disabled", store_get($$store_subs ??= {}, "$isLoading", isLoading), true)} class="svelte-1uha8ag"/> <button class="btn send svelte-1uha8ag"${attr("disabled", store_get($$store_subs ??= {}, "$isLoading", isLoading) || !inputText.trim(), true)}>✉️ Senden</button></footer> <div class="controls svelte-1uha8ag"><button class="btn heartbeat svelte-1uha8ag"${attr("disabled", store_get($$store_subs ??= {}, "$isLoading", isLoading), true)}>💓 Heartbeat</button> <button class="btn new-session svelte-1uha8ag"${attr("disabled", store_get($$store_subs ??= {}, "$isLoading", isLoading), true)}>🆕 Neue Session</button></div></div>`);
    if ($$store_subs) unsubscribe_stores($$store_subs);
  });
}
export {
  _page as default
};
