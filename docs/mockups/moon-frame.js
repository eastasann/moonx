// Fills <aside data-sidebar="key"> and <nav data-tabbar="key"> with the 案1 frame. Load before shared.js renders icons.
(function () {
  const LOGO = '<svg class="logo" viewBox="0 0 512 512" aria-hidden="true"><mask id="crf"><rect width="512" height="512" fill="#fff"/><circle cx="300" cy="215" r="132" fill="#000"/></mask><circle cx="246" cy="266" r="150" fill="currentColor" mask="url(#crf)"/><circle cx="378" cy="150" r="28" fill="currentColor"/></svg>';
  const NAV = [
    ["dashboard", "house", "Dashboard"],
    ["ideas", "lightbulb", "Ideas"],
    ["self", "compass", "Self Analysis"],
    ["notifications", "bell", "Notifications", "3"],
    ["decisions", "scroll", "Decision Log"],
  ];
  function sidebar(cur) {
    const items = NAV.map(([k, ic, label, count]) =>
      `<a href="#"${k === cur ? ' aria-current="page"' : ""}><span data-icon="${ic}"></span><span>${label}</span>${count ? `<span class="count">${count}</span>` : ""}</a>`).join("");
    return `<div class="brand">${LOGO}<span>moonx</span></div>
      <button class="ws"><span>BCDX</span><span data-icon="chevron-down" data-size="16"></span></button>
      <nav class="nav" aria-label="Main">${items}<hr><a href="#"${cur === "settings" ? ' aria-current="page"' : ""}><span data-icon="settings"></span><span>Workspace Settings</span></a></nav>
      <div class="user"><span class="avatar">AV</span><span>Ana Villanueva</span></div>`;
  }
  function tabbar(cur) {
    const tabs = [["dashboard", "house", "Dashboard"], ["ideas", "lightbulb", "Ideas"], ["self", "compass", "Self Analysis"], ["notifications", "bell", "Notifications"], ["more", "menu", "More"]];
    return tabs.map(([k, ic, label]) =>
      `<a href="#"${k === cur ? ' aria-current="page"' : ""}><span data-icon="${ic}" data-size="22"></span>${k === "notifications" ? '<span class="badge">3</span>' : ""}${label}</a>`).join("");
  }
  function fill() {
    document.querySelectorAll("aside[data-sidebar]").forEach((el) => { el.innerHTML = sidebar(el.dataset.sidebar); });
    document.querySelectorAll("nav[data-tabbar]").forEach((el) => { el.innerHTML = tabbar(el.dataset.tabbar); });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", fill);
  else fill();
})();
