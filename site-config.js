window.HolidailyRuntimeConfig = window.HolidailyRuntimeConfig || {};

const githubPagesBackendBaseUrl = "https://holidaily-chat-api-rgru.onrender.com";
const isHolidailyGitHubPagesHost =
  window.location.hostname === "rg-ru.github.io" &&
  window.location.pathname.startsWith("/holidaily");

// Local/server hosting keeps same-origin by leaving the URL empty.
// GitHub Pages needs an external API host because it cannot run the Express/SQLite backend.
window.HolidailyRuntimeConfig.backendBaseUrl =
  window.HolidailyRuntimeConfig.backendBaseUrl ||
  (isHolidailyGitHubPagesHost ? githubPagesBackendBaseUrl : "");
