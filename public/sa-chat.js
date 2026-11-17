/* StaffAnchor chat launcher. One line on a page:
   <script src="https://clients.staffanchor.com/sa-chat.js" data-site="main" async></script>
   data-site is "main" (staffanchor.com) or "jobs" (jobs.staffanchor.com). Optional data-side="left".
   It is the site's only floating contact button. It pops up by itself on every landing, computer or phone, right as
   the page appears (the chat is loaded quietly in the background first, so it is ready). If the visitor closes it,
   it stays closed for 20 minutes so it never nags. On a phone it is a sheet over the lower part of the screen, so
   the page stays visible. Optional data-color sets the bubble colour. */
(function () {
  if (window.__saChat) return;
  window.__saChat = true;
  var s = document.currentScript;
  var site = (s && s.getAttribute("data-site")) === "jobs" ? "jobs" : "main";
  var color = (s && s.getAttribute("data-color")) || (site === "jobs" ? "#4C7BFF" : "#4F46E5");
  if (!/^#[0-9a-fA-F]{3,8}$/.test(color)) color = "#4F46E5";
  var side = (s && s.getAttribute("data-side")) === "left" ? "left" : "right";
  var origin = "https://clients.staffanchor.com";
  try { if (s && s.src) origin = new URL(s.src).origin; } catch (e) {}

  // Closed by the visitor within the last 20 minutes: do not pop up again.
  var DISMISS_MS = 20 * 60 * 1000;
  function dismissed() {
    try { var t = Number(localStorage.getItem("sa_chat_closed") || 0); return t && Date.now() - t < DISMISS_MS; } catch (e) { return false; }
  }
  function markDismissed() { try { localStorage.setItem("sa_chat_closed", String(Date.now())); } catch (e) {} }

  function mobile() { return window.innerWidth < 520; }
  // On a job page the phone has a sticky "Apply now" bar at the bottom: sit above it.
  function lifted() { return site === "jobs" && /^\/jobs\/[^/]+/.test(location.pathname) && window.innerWidth < 768; }
  function bottom() { return lifted() ? 96 : 20; }

  var btn = document.createElement("button");
  btn.type = "button";
  btn.setAttribute("aria-label", "Chat with StaffAnchor");
  btn.innerHTML = '<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/></svg>';
  btn.style.cssText = "position:fixed;bottom:" + bottom() + "px;" + side + ":20px;width:56px;height:56px;border-radius:50%;background:" + color + ";border:3px solid #fff;cursor:pointer;box-shadow:0 6px 20px rgba(0,0,0,.35);z-index:2147483000;display:flex;align-items:center;justify-content:center;padding:0";

  var frame = document.createElement("iframe");
  frame.title = "Chat with StaffAnchor";
  frame.style.cssText = "position:fixed;bottom:" + (bottom() + 68) + "px;" + side + ":20px;width:380px;height:560px;max-height:calc(100vh - " + (bottom() + 88) + "px);border:1px solid #e2e8f0;border-radius:16px;box-shadow:0 12px 40px rgba(0,0,0,.25);background:#fff;z-index:2147483000;display:none";

  // On a job page the chat knows which role is open, so it can offer to talk about it.
  function jobTitle() {
    if (site !== "jobs" || !/^\/jobs\/[^/]+/.test(location.pathname)) return "";
    return (document.title || "").replace(/\s*\|\s*StaffAnchor.*$/i, "").slice(0, 80);
  }

  var loaded = false;
  // Load the chat page in the background (still hidden) so that opening it shows a finished window, not a blank one.
  function load() {
    if (loaded) return;
    var j = jobTitle();
    frame.src = origin + "/embed/chat?site=" + site + (j ? "&job=" + encodeURIComponent(j) : "");
    loaded = true;
  }
  function open() {
    load();
    // Phone: a sheet over the lower part of the screen, with the page still visible above it.
    if (mobile()) frame.style.cssText += ";top:auto;bottom:0;left:0;right:0;width:100%;height:78vh;max-height:calc(100vh - 56px);border-radius:16px 16px 0 0;border:0";
    frame.style.display = "block";
    btn.style.display = mobile() ? "none" : "flex";
  }
  // fromVisitor: the visitor closed it themselves, so remember that for a while.
  function close(fromVisitor) {
    frame.style.display = "none";
    btn.style.display = "flex";
    if (fromVisitor) markDismissed();
  }

  btn.addEventListener("click", function () { frame.style.display === "block" ? close(true) : open(); });
  window.addEventListener("message", function (e) {
    if (e.origin !== origin || !e.data) return;
    if (e.data.type === "sa-chat-close") close(true);
    if (e.data.type === "sa-chat-wa") {
      // Count it in the site's own analytics when it has any, so WhatsApp starts are still measured.
      try { if (window.posthog) window.posthog.capture("whatsapp_entry_click", { source: "site_chat_" + e.data.intent, path: location.pathname }); } catch (err) {}
    }
  });

  function mount() {
    document.body.appendChild(frame);
    document.body.appendChild(btn);
    load();
    // Pop up by itself on every landing, unless the visitor closed it a moment ago.
    if (dismissed()) return;
    setTimeout(function () { if (frame.style.display !== "block") open(); }, 400);
  }
  if (document.body) mount(); else document.addEventListener("DOMContentLoaded", mount);
})();
