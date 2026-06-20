/**
 * Prizrak Vote Widget
 * Thumbs up / thumbs down + optional note.
 * Client cache: localStorage key "prizrak_votes_v2"
 * Remote store: GitHub repo chug2k/prizrak-data / offerings-votes.json
 * Usage: <script src="/shared/star-widget.js"></script>
 */
(function () {
  const LOCAL_KEY   = "prizrak_votes_v2";
  const GH_TOKEN    = ""; // SECURITY: real token removed (was exposed publicly). Remote vote persistence disabled until wired through a backend.
  const GH_REPO     = "chug2k/prizrak-data";
  const GH_FILE     = "offerings-votes.json";
  const GH_API_BASE = "https://api.github.com/repos/" + GH_REPO + "/contents/" + GH_FILE;

  // ── Slug detection ──────────────────────────────────────────────────────────
  function getSlug() {
    const parts = window.location.pathname.replace(/\/+$/, "").split("/").filter(Boolean);
    if (!parts.length) return null;
    return parts[0] === "index.html" ? null : parts[0];
  }

  // ── Local cache ─────────────────────────────────────────────────────────────
  function loadLocal() {
    try { return JSON.parse(localStorage.getItem(LOCAL_KEY) || "{}"); }
    catch (e) { return {}; }
  }
  function saveLocal(data) {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(data));
  }

  // ── GitHub read/write ───────────────────────────────────────────────────────
  async function ghRead() {
    const r = await fetch(GH_API_BASE, {
      headers: { Authorization: "token " + GH_TOKEN }
    });
    if (!r.ok) throw new Error("gh read failed: " + r.status);
    const meta = await r.json();
    const content = JSON.parse(atob(meta.content.replace(/\n/g, "")));
    return { content, sha: meta.sha };
  }

  async function ghWrite(content, sha) {
    const body = {
      message: "vote: " + (content._lastSlug || "update"),
      content: btoa(unescape(encodeURIComponent(JSON.stringify(content, null, 2)))),
      sha
    };
    const r = await fetch(GH_API_BASE, {
      method: "PUT",
      headers: {
        Authorization: "token " + GH_TOKEN,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    });
    if (!r.ok) throw new Error("gh write failed: " + r.status);
    return await r.json();
  }

  async function persistVote(slug, vote) {
    if (!GH_TOKEN) return; // no remote sync without a token; local vote already saved
    try {
      const { content, sha } = await ghRead();
      content[slug] = vote;
      content._lastSlug = slug;
      await ghWrite(content, sha);
    } catch (e) {
      console.warn("[prizrak] remote save failed:", e.message);
    }
  }

  // ── UI helpers ───────────────────────────────────────────────────────────────
  function showToast(msg, color) {
    let t = document.getElementById("prizrak-vote-toast");
    if (t) t.remove();
    t = document.createElement("div");
    t.id = "prizrak-vote-toast";
    t.textContent = msg;
    t.style.cssText = `
      position:fixed;bottom:90px;right:24px;z-index:10000;
      background:rgba(24,24,27,0.97);color:${color || "#d4d4d8"};
      border:1px solid #52525b;padding:6px 14px;border-radius:8px;
      font-size:13px;font-family:monospace;
      opacity:1;transition:opacity 0.5s ease;pointer-events:none;
    `;
    document.body.appendChild(t);
    setTimeout(() => { t.style.opacity = "0"; }, 1500);
    setTimeout(() => { t.remove(); }, 2100);
  }

  // ── Vote panel (popup) ───────────────────────────────────────────────────────
  function createPanel(slug, currentVote, onVote) {
    const panel = document.createElement("div");
    panel.id = "prizrak-vote-panel";
    const voteVal = currentVote ? currentVote.vote : null;
    const noteVal = currentVote ? (currentVote.note || "") : "";

    panel.style.cssText = `
      position:fixed;bottom:88px;right:24px;z-index:10000;
      background:#18181b;border:1px solid #52525b;border-radius:14px;
      padding:18px 18px 14px;width:260px;
      box-shadow:0 8px 40px rgba(0,0,0,0.7);
      font-family:system-ui,sans-serif;
    `;

    panel.innerHTML = `
      <div style="font-size:12px;color:#71717a;font-family:monospace;margin-bottom:10px;letter-spacing:.04em;">
        OFFERING: ${slug.replace(/-/g," ").toUpperCase()}
      </div>
      <div style="display:flex;gap:10px;margin-bottom:12px;">
        <button id="pv-up" style="
          flex:1;padding:10px 0;border-radius:10px;border:2px solid;cursor:pointer;
          font-size:22px;transition:all .15s ease;
          background:${voteVal==="up"?"#14532d":"#27272a"};
          border-color:${voteVal==="up"?"#22c55e":"#3f3f46"};
        ">👍</button>
        <button id="pv-down" style="
          flex:1;padding:10px 0;border-radius:10px;border:2px solid;cursor:pointer;
          font-size:22px;transition:all .15s ease;
          background:${voteVal==="down"?"#450a0a":"#27272a"};
          border-color:${voteVal==="down"?"#ef4444":"#3f3f46"};
        ">👎</button>
      </div>
      <textarea id="pv-note" placeholder="Why? (optional)" rows="2" style="
        width:100%;box-sizing:border-box;background:#27272a;border:1px solid #3f3f46;
        color:#e4e4e7;border-radius:8px;padding:8px 10px;
        font-size:13px;resize:none;outline:none;font-family:inherit;
      ">${noteVal}</textarea>
      <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:10px;">
        <button id="pv-clear" style="
          font-size:12px;color:#71717a;background:none;border:none;cursor:pointer;padding:4px 8px;
        ">clear</button>
        <button id="pv-close" style="
          font-size:12px;color:#71717a;background:none;border:none;cursor:pointer;padding:4px 8px;
        ">close</button>
      </div>
    `;

    let selected = voteVal;

    function highlightBtns() {
      panel.querySelector("#pv-up").style.background   = selected==="up"   ? "#14532d" : "#27272a";
      panel.querySelector("#pv-up").style.borderColor  = selected==="up"   ? "#22c55e" : "#3f3f46";
      panel.querySelector("#pv-down").style.background = selected==="down" ? "#450a0a" : "#27272a";
      panel.querySelector("#pv-down").style.borderColor= selected==="down" ? "#ef4444" : "#3f3f46";
    }

    async function submit(vote) {
      selected = selected === vote ? null : vote; // toggle off if same
      highlightBtns();
      const note = panel.querySelector("#pv-note").value.trim();
      const payload = selected ? { vote: selected, note, ts: new Date().toISOString() } : null;

      // Update local cache
      const local = loadLocal();
      if (payload) { local[slug] = payload; } else { delete local[slug]; }
      saveLocal(local);

      // Update trigger button
      onVote(selected);

      // Persist to GitHub
      const remotePayload = payload || { vote: null, note: "", ts: new Date().toISOString() };
      persistVote(slug, remotePayload);

      const msg = selected === "up" ? "👍 noted. good signal." : selected === "down" ? "👎 noted. feedback received." : "vote cleared.";
      const color = selected === "up" ? "#22c55e" : selected === "down" ? "#ef4444" : "#d4d4d8";
      showToast(msg, color);
    }

    panel.querySelector("#pv-up").addEventListener("click",   () => submit("up"));
    panel.querySelector("#pv-down").addEventListener("click", () => submit("down"));
    panel.querySelector("#pv-note").addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey && selected) { e.preventDefault(); submit(selected); }
    });
    panel.querySelector("#pv-clear").addEventListener("click", () => {
      selected = null; highlightBtns();
      panel.querySelector("#pv-note").value = "";
      const local = loadLocal(); delete local[slug]; saveLocal(local);
      onVote(null);
      showToast("vote cleared.", "#d4d4d8");
    });
    panel.querySelector("#pv-close").addEventListener("click", () => panel.remove());

    return panel;
  }

  // ── Main trigger button ──────────────────────────────────────────────────────
  function createTrigger(slug) {
    const local = loadLocal();
    const currentVote = local[slug] || null;
    const v = currentVote ? currentVote.vote : null;

    const btn = document.createElement("button");
    btn.id = "prizrak-vote-btn";
    btn.title = "Rate this offering";

    function applyStyle(vote) {
      const isUp   = vote === "up";
      const isDown = vote === "down";
      btn.innerHTML = isUp ? "👍" : isDown ? "👎" : "👋";
      btn.style.cssText = `
        position:fixed;bottom:24px;right:24px;z-index:9999;
        background:${isUp ? "#14532d" : isDown ? "#450a0a" : "rgba(39,39,42,0.92)"};
        border:2px solid ${isUp ? "#22c55e" : isDown ? "#ef4444" : "#52525b"};
        border-radius:50%;width:52px;height:52px;font-size:22px;
        cursor:pointer;box-shadow:0 4px 24px rgba(0,0,0,0.5);
        transition:all .15s ease;display:flex;align-items:center;justify-content:center;
      `;
    }

    applyStyle(v);

    btn.addEventListener("mouseenter", () => { btn.style.transform = "scale(1.12)"; });
    btn.addEventListener("mouseleave", () => { btn.style.transform = "scale(1)"; });

    btn.addEventListener("click", () => {
      const existing = document.getElementById("prizrak-vote-panel");
      if (existing) { existing.remove(); return; }
      const panel = createPanel(slug, loadLocal()[slug] || null, (newVote) => {
        applyStyle(newVote);
      });
      document.body.appendChild(panel);
    });

    return btn;
  }

  // ── Init ─────────────────────────────────────────────────────────────────────
  function init() {
    const slug = getSlug();
    if (!slug) return;
    document.body.appendChild(createTrigger(slug));
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
