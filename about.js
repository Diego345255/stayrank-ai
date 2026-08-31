// Same same-origin/localhost API_BASE resolution as app.js, duplicated
// rather than shared - this page loads independently, the same way
// methodology.html and guides/*.html do, and must not depend on app.js.
const API_BASE =
  window.STAYRANK_API_BASE ||
  (["localhost", "127.0.0.1"].includes(window.location.hostname)
    ? `${window.location.protocol}//${window.location.hostname}:8000`
    : "");

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[ch]));
}

async function copyTextToClipboard(text) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // fall through to the legacy fallback below
    }
  }
  try {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    const copied = document.execCommand("copy");
    document.body.removeChild(textarea);
    return copied;
  } catch {
    return false;
  }
}

function showToast(message, type = "info") {
  const container = document.getElementById("toastContainer");
  if (!container) return;
  const icons = { success: "✅", error: "⚠️", info: "ℹ️" };
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.setAttribute("role", type === "error" ? "alert" : "status");
  toast.innerHTML = `<span aria-hidden="true">${icons[type] || icons.info}</span><span>${escapeHtml(message)}</span><button type="button" class="toast-dismiss" aria-label="Dismiss">×</button>`;
  const dismiss = () => {
    if (!toast.isConnected) return;
    toast.remove();
  };
  toast.querySelector(".toast-dismiss").addEventListener("click", dismiss);
  setTimeout(dismiss, 5000);
  container.appendChild(toast);
}

// Only the 3 stats that are genuinely sitewide (not derived from a
// search that isn't running on this page) - see the plan task's
// "Important refinement from the spec" note for why the other 4 fields
// renderFounderDashboard() computes in app.js don't belong here.
async function loadFounderDashboard() {
  const el = document.getElementById("founderDashboardAbout");
  if (!el) return;
  try {
    const response = await fetch(`${API_BASE}/api/cities`);
    if (!response.ok) throw new Error(`API error ${response.status}`);
    const cities = await response.json();
    const totalHotels = cities.reduce((sum, city) => sum + city.hotelCount, 0);
    const liveCities = cities.filter((city) => city.source === "live").length;
    const cards = [
      { label: "Hotels indexed", value: totalHotels },
      { label: "Cities live", value: cities.length },
      { label: "Live Booking.com cities", value: liveCities },
    ];
    el.innerHTML = cards
      .map((card) => `<div class="founder-item"><strong>${card.value}</strong><span>${escapeHtml(card.label)}</span></div>`)
      .join("");
  } catch (err) {
    console.error("StayRank About: couldn't load real stats:", err);
    el.innerHTML = `<p class="founder-loading">Couldn't load real stats right now.</p>`;
  }
}

document.getElementById("copyAdvertiseEmailButtonAbout")?.addEventListener("click", async () => {
  const btn = document.getElementById("copyAdvertiseEmailButtonAbout");
  const copied = await copyTextToClipboard(btn.dataset.email);
  showToast(copied ? "Email address copied to clipboard." : "Couldn't copy automatically - please copy the address manually.", copied ? "success" : "error");
});

loadFounderDashboard();
