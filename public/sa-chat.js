/* StaffAnchor chat launcher. One line on a page:
   <script src="https://clients.staffanchor.com/sa-chat.js" data-site="main" async></script>
   data-site is "main" (staffanchor.com) or "jobs" (jobs.staffanchor.com). Optional data-side="left". */
(function () {
  if (window.__saChat) return;
  window.__saChat = true;
  var s = document.currentScript;
  var site = (s && s.getAttribute("data-site")) === "jobs" ? "jobs" : "main";
  var side = (s && s.getAttribute("data-side")) === "left" ? "left" : "right";
  var origin = "https://clients.staffanchor.com";
  try { if (s && s.src) origin = new URL(s.src).origin; } catch (e) {}

  var btn = document.createElement("button");
  btn.type = "button";
  btn.setAttribute("aria-label", "Chat with StaffAnchor");
  btn.innerHTML = '<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/></svg>';
  btn.style.cssText = "position:fixed;bottom:20px;" + side + ":20px;width:56px;height:56px;border-radius:50%;border:0;background:#0f172a;cursor:pointer;box-shadow:0 6px 20px rgba(0,0,0,.25);z-index:2147483000;display:flex;align-items:center;justify-content:center;padding:0";

  var frame = document.createElement("iframe");
  frame.title = "Chat with StaffAnchor";
  frame.style.cssText = "position:fixed;bottom:88px;" + side + ":20px;width:380px;height:560px;max-height:calc(100vh - 108px);border:1px solid #e2e8f0;border-radius:16px;box-shadow:0 12px 40px rgba(0,0,0,.25);background:#fff;z-index:2147483000;display:none";

  var loaded = false;
  function mobile() { return window.innerWidth < 520; }
  function open() {
    if (!loaded) { frame.src = origin + "/embed/chat?site=" + site; loaded = true; }
    if (mobile()) frame.style.cssText += ";top:0;bottom:0;" + side + ":0;left:0;right:0;width:100%;height:100%;max-height:none;border-radius:0;border:0";
    frame.style.display = "block";
    btn.style.display = mobile() ? "none" : "flex";
  }
  function close() { frame.style.display = "none"; btn.style.display = "flex"; }

  btn.addEventListener("click", function () { frame.style.display === "block" ? close() : open(); });
  window.addEventListener("message", function (e) {
    if (e.origin !== origin || !e.data || e.data.type !== "sa-chat-close") return;
    close();
  });

  function mount() { document.body.appendChild(frame); document.body.appendChild(btn); }
  if (document.body) mount(); else document.addEventListener("DOMContentLoaded", mount);
})();
