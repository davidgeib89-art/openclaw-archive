import { a7 as store_get, a8 as attr_class, e as escape_html, a9 as ensure_array_like, aa as stringify, a as attr, ab as unsubscribe_stores } from "../../chunks/index2.js";
import { w as writable } from "../../chunks/index.js";
const chatMessages = writable([]);
const gatewayConnected = writable(false);
const isLoading = writable(false);
function _page($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    var $$store_subs;
    let inputText = "";
    let messagesContainer;
    if (store_get($$store_subs ??= {}, "$chatMessages", chatMessages) && messagesContainer) ;
    $$renderer2.push(`<div class="dashboard svelte-1uha8ag"><header class="header svelte-1uha8ag"><h1 class="svelte-1uha8ag">ØM Dashboard</h1> <div class="status svelte-1uha8ag"><span${attr_class("status-dot svelte-1uha8ag", void 0, {
      "connected": store_get($$store_subs ??= {}, "$gatewayConnected", gatewayConnected)
    })}></span> <span class="status-text svelte-1uha8ag">${escape_html(
      // Gateway Status beim Start prüfen
      // Nachricht senden
      // Kurze Pause für Response
      // TODO: Echte Response vom Gateway holen
      // Heartbeat auslösen
      // Neue Session
      // Enter-Taste zum Senden
      store_get($$store_subs ??= {}, "$gatewayConnected", gatewayConnected) ? "Verbunden" : "Offline"
    )}</span></div></header> <main class="chat-area svelte-1uha8ag"><div class="messages svelte-1uha8ag">`);
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
    $$renderer2.push(`<!--]--></div></main> <footer class="input-area svelte-1uha8ag"><input type="text"${attr("value", inputText)} placeholder="Nachricht an Øm..."${attr("disabled", store_get($$store_subs ??= {}, "$isLoading", isLoading), true)} class="svelte-1uha8ag"/> <button class="btn send svelte-1uha8ag"${attr("disabled", store_get($$store_subs ??= {}, "$isLoading", isLoading) || !inputText.trim(), true)}>✉️ Senden</button></footer> <div class="controls svelte-1uha8ag"><button class="btn heartbeat svelte-1uha8ag"${attr("disabled", store_get($$store_subs ??= {}, "$isLoading", isLoading), true)}>💓 Heartbeat</button> <button class="btn new-session svelte-1uha8ag"${attr("disabled", store_get($$store_subs ??= {}, "$isLoading", isLoading), true)}>🆕 Neue Session</button></div></div>`);
    if ($$store_subs) unsubscribe_stores($$store_subs);
  });
}
export {
  _page as default
};
