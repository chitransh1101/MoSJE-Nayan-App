// Live status dots: each service is pinged every 10 s. A web app counts as
// up when it answers at all; the API when /health says ok.
//
// Two ways this page is served:
//   Docker (port 3000): each app on its own port (5173, 5174, 8000)
//   Desktop edition (DoSJE-Nigrani.exe, port 8000): everything on one server
const DESKTOP = location.port !== "3000";
if (DESKTOP) {
  document.querySelectorAll("[data-desktop-href]").forEach((a) => (a.href = a.dataset.desktopHref));
}
const url = (dockerUrl, desktopPath) => (DESKTOP ? desktopPath : dockerUrl);
const checks = {
  api: () => fetch(url("http://localhost:8000/health", "/health"), { cache: "no-store" }).then((r) => r.ok),
  sentinel: () => fetch(url("http://localhost:5173/", "/sentinel/"), { mode: "no-cors", cache: "no-store" }).then(() => true),
  setu: () => fetch(url("http://localhost:5174/", "/setu/"), { mode: "no-cors", cache: "no-store" }).then(() => true),
};

function show(name, up) {
  document.querySelectorAll(`[data-status="${name}"]`).forEach((el) => {
    el.dataset.state = up ? "up" : "down";
    el.querySelector(".label").textContent = up ? "Running" : "Starting…";
  });
}

async function refresh() {
  await Promise.all(Object.entries(checks).map(async ([name, check]) => {
    try { show(name, await check()); } catch { show(name, false); }
  }));
}

refresh();
setInterval(refresh, 10000);

document.querySelectorAll("[data-copy]").forEach((btn) => {
  btn.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(btn.dataset.copy);
      const old = btn.textContent;
      btn.textContent = "Copied";
      setTimeout(() => (btn.textContent = old), 1200);
    } catch { /* clipboard blocked - the text is visible anyway */ }
  });
});
