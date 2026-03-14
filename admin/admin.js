const normalizeBaseUrl = (value) => {
  const normalizedValue = String(value || "").trim();

  if (!normalizedValue) {
    return "";
  }

  try {
    return new URL(normalizedValue, window.location.href).toString().replace(/\/+$/, "");
  } catch (error) {
    return "";
  }
};

const resolveBackendBaseUrl = () => {
  const configuredBaseUrl = normalizeBaseUrl(window.HolidailyRuntimeConfig?.backendBaseUrl);
  return configuredBaseUrl || window.location.origin;
};

const ADMIN_API_BASE = `${resolveBackendBaseUrl()}/api/admin`;

const adminElements = {
  loginView: document.querySelector("#adminLoginView"),
  loginForm: document.querySelector("#adminLoginForm"),
  loginFeedback: document.querySelector("#adminLoginFeedback"),
  dashboard: document.querySelector("#adminDashboard"),
  sessionMeta: document.querySelector("#adminSessionMeta"),
  logoutButton: document.querySelector("#adminLogoutButton"),
  statTotal: document.querySelector("#statTotal"),
  statOpen: document.querySelector("#statOpen"),
  statAnswered: document.querySelector("#statAnswered"),
  statClosed: document.querySelector("#statClosed"),
  filterForm: document.querySelector("#adminFilterForm"),
  statusFilter: document.querySelector("#adminStatusFilter"),
  searchInput: document.querySelector("#adminSearchInput"),
  conversationList: document.querySelector("#adminConversationList"),
  conversationEmptyState: document.querySelector("#adminConversationEmptyState"),
  detailView: document.querySelector("#adminDetailView"),
  detailEmptyState: document.querySelector("#adminDetailEmptyState"),
  conversationTitle: document.querySelector("#adminConversationTitle"),
  conversationMeta: document.querySelector("#adminConversationMeta"),
  conversationStatus: document.querySelector("#adminConversationStatus"),
  statusForm: document.querySelector("#adminStatusForm"),
  statusSelect: document.querySelector("#adminStatusSelect"),
  thread: document.querySelector("#adminThread"),
  replyForm: document.querySelector("#adminReplyForm"),
  replyMessage: document.querySelector("#adminReplyMessage"),
  deleteConversationButton: document.querySelector("#adminDeleteConversationButton"),
  dashboardFeedback: document.querySelector("#adminDashboardFeedback")
};

const adminState = {
  adminUser: null,
  conversations: [],
  stats: {
    total: 0,
    open: 0,
    answered: 0,
    closed: 0
  },
  selectedConversation: null,
  selectedConversationId: "",
  statusFilter: "all",
  search: ""
};

const setNotice = (element, message, tone = "info") => {
  if (!element) {
    return;
  }

  element.textContent = message || "";
  element.className = "notice";

  if (message) {
    element.classList.add(`is-${tone}`);
  }
};

const formatDate = (value) => {
  if (!value) {
    return "-";
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return "-";
  }

  return new Intl.DateTimeFormat("de-DE", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(parsed);
};

const statusPresentation = (status) => {
  switch (status) {
    case "open":
      return {
        label: "Offen",
        className: "is-open"
      };
    case "answered":
      return {
        label: "Beantwortet",
        className: "is-answered"
      };
    case "closed":
      return {
        label: "Geschlossen",
        className: "is-closed"
      };
    default:
      return {
        label: "Unbekannt",
        className: "is-neutral"
      };
  }
};

const setStatusPill = (element, status) => {
  if (!element) {
    return;
  }

  const presentation = statusPresentation(status);
  element.className = `status-pill ${presentation.className}`;
  element.textContent = presentation.label;
};

const clearElement = (element) => {
  while (element && element.firstChild) {
    element.removeChild(element.firstChild);
  }
};

const setAuthenticatedView = (isAuthenticated) => {
  adminElements.loginView.hidden = isAuthenticated;
  adminElements.dashboard.hidden = !isAuthenticated;
};

const apiRequest = async (path, options = {}) => {
  try {
    // All admin actions go through the secured REST API and rely on the HttpOnly admin session cookie.
    const response = await fetch(`${ADMIN_API_BASE}${path}`, {
      method: options.method || "GET",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {})
      },
      body: options.body ? JSON.stringify(options.body) : undefined
    });

    const payload = await response.json().catch(() => null);

    if (response.status === 401) {
      adminState.adminUser = null;
      setAuthenticatedView(false);
      throw new Error(payload?.error?.message || "Admin-Anmeldung erforderlich.");
    }

    if (!response.ok) {
      throw new Error(payload?.error?.message || "API-Anfrage fehlgeschlagen.");
    }

    return payload;
  } catch (error) {
    if (error instanceof TypeError) {
      throw new Error(
        "Die Admin-API ist nicht erreichbar. Pruefe site-config.js, CORS oder den laufenden Node-Server."
      );
    }

    throw error;
  }
};

const renderStats = () => {
  adminElements.statTotal.textContent = String(adminState.stats.total || 0);
  adminElements.statOpen.textContent = String(adminState.stats.open || 0);
  adminElements.statAnswered.textContent = String(adminState.stats.answered || 0);
  adminElements.statClosed.textContent = String(adminState.stats.closed || 0);
};

const renderConversationList = () => {
  clearElement(adminElements.conversationList);
  const hasConversations = adminState.conversations.length > 0;
  adminElements.conversationEmptyState.hidden = hasConversations;

  adminState.conversations.forEach((conversation) => {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "conversation-item";
    item.dataset.conversationId = conversation.id;

    if (conversation.id === adminState.selectedConversationId) {
      item.classList.add("is-selected");
    }

    const head = document.createElement("div");
    head.className = "conversation-head";

    const identity = document.createElement("div");
    const title = document.createElement("strong");
    title.textContent = conversation.customerName || conversation.customerEmail || conversation.id;
    const secondary = document.createElement("p");
    secondary.className = "conversation-secondary";
    secondary.textContent = conversation.customerEmail || conversation.id;
    identity.append(title, secondary);

    const status = document.createElement("span");
    setStatusPill(status, conversation.status);
    head.append(identity, status);

    const preview = document.createElement("p");
    preview.className = "conversation-preview";
    preview.textContent = conversation.lastMessagePreview || "Noch keine Nachricht.";

    const meta = document.createElement("div");
    meta.className = "conversation-meta";
    const updatedAt = document.createElement("span");
    updatedAt.className = "conversation-secondary";
    updatedAt.textContent = `Aktualisiert: ${formatDate(conversation.updatedAt)}`;
    const messageCount = document.createElement("span");
    messageCount.className = "conversation-secondary";
    messageCount.textContent = `${conversation.messageCount} Nachricht${conversation.messageCount === 1 ? "" : "en"}`;
    meta.append(updatedAt, messageCount);

    item.append(head, preview, meta);
    adminElements.conversationList.appendChild(item);
  });
};

const renderThread = (messages) => {
  clearElement(adminElements.thread);

  messages.forEach((message) => {
    const item = document.createElement("article");
    item.className = `message is-${message.senderType === "admin" ? "admin" : "user"}`;

    const meta = document.createElement("div");
    meta.className = "message-meta";

    const sender = document.createElement("strong");
    sender.textContent = message.senderName || (message.senderType === "admin" ? "Admin" : "Nutzer");

    const timestamp = document.createElement("span");
    timestamp.textContent = formatDate(message.createdAt);

    const body = document.createElement("p");
    body.className = "message-body";
    body.textContent = message.body;

    meta.append(sender, timestamp);
    item.append(meta, body);
    adminElements.thread.appendChild(item);
  });

  adminElements.thread.scrollTop = adminElements.thread.scrollHeight;
};

const renderConversationDetail = () => {
  const conversation = adminState.selectedConversation;

  adminElements.detailEmptyState.hidden = Boolean(conversation);
  adminElements.detailView.hidden = !conversation;

  if (!conversation) {
    return;
  }

  adminElements.conversationTitle.textContent =
    conversation.customerName || conversation.customerEmail || conversation.id;
  adminElements.conversationMeta.textContent = `${conversation.customerEmail || "Keine E-Mail"} | ID ${
    conversation.id
  } | Erstellt: ${formatDate(conversation.createdAt)} | Zuletzt aktualisiert: ${formatDate(conversation.updatedAt)}`;
  adminElements.statusSelect.value = conversation.status;
  setStatusPill(adminElements.conversationStatus, conversation.status);
  renderThread(Array.isArray(conversation.messages) ? conversation.messages : []);
};

const loadConversation = async (conversationId, { silent = false } = {}) => {
  if (!conversationId) {
    adminState.selectedConversation = null;
    adminState.selectedConversationId = "";
    renderConversationList();
    renderConversationDetail();
    return;
  }

  try {
    const payload = await apiRequest(`/conversations/${conversationId}`);
    adminState.selectedConversation = payload.conversation;
    adminState.selectedConversationId = payload.conversation.id;
    renderConversationList();
    renderConversationDetail();

    if (!silent) {
      setNotice(adminElements.dashboardFeedback, "", "info");
    }
  } catch (error) {
    adminState.selectedConversation = null;
    adminState.selectedConversationId = "";
    renderConversationList();
    renderConversationDetail();
    setNotice(adminElements.dashboardFeedback, error.message, "error");
  }
};

const loadConversations = async ({ preserveSelection = true, silent = false } = {}) => {
  const params = new URLSearchParams();

  if (adminState.statusFilter && adminState.statusFilter !== "all") {
    params.set("status", adminState.statusFilter);
  }

  if (adminState.search) {
    params.set("search", adminState.search);
  }

  try {
    const payload = await apiRequest(`/conversations?${params.toString()}`);
    adminState.conversations = payload.conversations || [];
    adminState.stats = payload.stats || adminState.stats;
    renderStats();
    renderConversationList();

    const nextConversationId =
      preserveSelection && adminState.selectedConversationId
        ? adminState.selectedConversationId
        : adminState.conversations[0]?.id || "";

    if (nextConversationId) {
      await loadConversation(nextConversationId, { silent: true });
    } else {
      adminState.selectedConversation = null;
      adminState.selectedConversationId = "";
      renderConversationDetail();
    }

    if (!silent) {
      setNotice(adminElements.dashboardFeedback, "Konversationsliste aktualisiert.", "info");
    }
  } catch (error) {
    setNotice(adminElements.dashboardFeedback, error.message, "error");
  }
};

const initializeSession = async () => {
  try {
    const payload = await apiRequest("/auth/session");
    adminState.adminUser = payload.adminUser;
    adminElements.sessionMeta.textContent = `${payload.adminUser.name} | ${payload.adminUser.email}`;
    setAuthenticatedView(true);
    await loadConversations({ preserveSelection: false, silent: true });
  } catch (error) {
    setAuthenticatedView(false);
  }
};

if (adminElements.loginForm) {
  adminElements.loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(adminElements.loginForm);

    try {
      const payload = await apiRequest("/auth/login", {
        method: "POST",
        body: {
          email: String(formData.get("email") || ""),
          password: String(formData.get("password") || "")
        }
      });

      adminState.adminUser = payload.adminUser;
      adminElements.sessionMeta.textContent = `${payload.adminUser.name} | ${payload.adminUser.email}`;
      setNotice(adminElements.loginFeedback, "Anmeldung erfolgreich.", "success");
      setAuthenticatedView(true);
      adminElements.loginForm.reset();
      await loadConversations({ preserveSelection: false, silent: true });
    } catch (error) {
      setNotice(adminElements.loginFeedback, error.message, "error");
    }
  });
}

adminElements.logoutButton?.addEventListener("click", async () => {
  try {
    await apiRequest("/auth/logout", { method: "POST" });
  } catch (error) {
    // Ignore logout transport errors and reset the UI anyway.
  }

  adminState.adminUser = null;
  adminState.conversations = [];
  adminState.selectedConversation = null;
  adminState.selectedConversationId = "";
  renderConversationList();
  renderConversationDetail();
  renderStats();
  setAuthenticatedView(false);
  setNotice(adminElements.loginFeedback, "Du wurdest abgemeldet.", "info");
});

adminElements.filterForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  adminState.statusFilter = adminElements.statusFilter.value;
  adminState.search = adminElements.searchInput.value.trim();
  await loadConversations({ preserveSelection: false, silent: true });
});

adminElements.conversationList?.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-conversation-id]");

  if (!button) {
    return;
  }

  await loadConversation(button.dataset.conversationId);
});

adminElements.replyForm?.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!adminState.selectedConversationId) {
    setNotice(adminElements.dashboardFeedback, "Bitte zuerst eine Konversation auswaehlen.", "error");
    return;
  }

  try {
    await apiRequest(`/conversations/${adminState.selectedConversationId}/messages`, {
      method: "POST",
      body: {
        message: adminElements.replyMessage.value
      }
    });

    adminElements.replyForm.reset();
    await loadConversations({ preserveSelection: true, silent: true });
    await loadConversation(adminState.selectedConversationId, { silent: true });
    setNotice(adminElements.dashboardFeedback, "Antwort gesendet.", "success");
  } catch (error) {
    setNotice(adminElements.dashboardFeedback, error.message, "error");
  }
});

adminElements.statusForm?.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!adminState.selectedConversationId) {
    setNotice(adminElements.dashboardFeedback, "Bitte zuerst eine Konversation auswaehlen.", "error");
    return;
  }

  try {
    await apiRequest(`/conversations/${adminState.selectedConversationId}/status`, {
      method: "PATCH",
      body: {
        status: adminElements.statusSelect.value
      }
    });

    await loadConversations({ preserveSelection: true, silent: true });
    await loadConversation(adminState.selectedConversationId, { silent: true });
    setNotice(adminElements.dashboardFeedback, "Status gespeichert.", "success");
  } catch (error) {
    setNotice(adminElements.dashboardFeedback, error.message, "error");
  }
});

adminElements.deleteConversationButton?.addEventListener("click", async () => {
  if (!adminState.selectedConversationId || !adminState.selectedConversation) {
    return;
  }

  const confirmed = window.confirm(
    `Soll die Konversation ${adminState.selectedConversation.id} wirklich geloescht werden?`
  );

  if (!confirmed) {
    return;
  }

  try {
    await apiRequest(`/conversations/${adminState.selectedConversationId}`, {
      method: "DELETE"
    });

    const deletedConversationId = adminState.selectedConversationId;
    adminState.selectedConversation = null;
    adminState.selectedConversationId = "";
    await loadConversations({ preserveSelection: false, silent: true });
    setNotice(
      adminElements.dashboardFeedback,
      `Konversation ${deletedConversationId} wurde geloescht.`,
      "success"
    );
  } catch (error) {
    setNotice(adminElements.dashboardFeedback, error.message, "error");
  }
});

initializeSession();
