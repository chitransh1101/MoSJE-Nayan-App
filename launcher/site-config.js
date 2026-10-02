// ─────────────────────────────────────────────────────────────────────────
//  Site settings for the launcher pages (the online demo home and the local
//  launcher). This is the ONLY place the GitHub repository is set.
//
//  REPO_URL — your repository, e.g. "https://github.com/your-name/your-repo".
//    Leave it empty ("") to detect it automatically: when the page is served
//    from GitHub Pages (https://<user>.github.io/<repo>/…) the repository is
//    https://github.com/<user>/<repo>. Set it only for a custom domain or for
//    the local launcher if you want its links to point at your repo.
// ─────────────────────────────────────────────────────────────────────────
window.SITE_CONFIG = {
  REPO_URL: "",
};

// Fills every link marked data-repo / data-pages from the repository above.
//   data-repo="/releases/latest"  → <repo>/releases/latest
//   data-pages="sentinel/"        → https://<user>.github.io/<repo>/sentinel/
(function () {
  const clean = (u) => String(u || "").trim().replace(/\/+$/, "");
  let repo = clean(window.SITE_CONFIG.REPO_URL);
  if (!repo) {
    const m = location.hostname.match(/^([a-z0-9-]+)\.github\.io$/i);
    const first = location.pathname.split("/").filter(Boolean)[0];
    if (m && first) repo = `https://github.com/${m[1]}/${first}`;
  }
  if (!repo) return; // keep the links already written in the page
  const parts = repo.match(/github\.com\/([^/]+)\/([^/]+)/i);
  const pages = parts ? `https://${parts[1].toLowerCase()}.github.io/${parts[2]}/` : null;

  document.querySelectorAll("[data-repo]").forEach((a) => {
    a.href = repo + (a.dataset.repo || "");
  });
  if (pages) {
    document.querySelectorAll("[data-pages]").forEach((a) => {
      a.href = pages + (a.dataset.pages || "");
    });
  }
})();
