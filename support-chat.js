const SUPPORT_CHAT_SESSION_KEY = "holidaily-support-chat-session-v1";
const LOCAL_ACCOUNT_STORAGE_KEY = "holidaily-local-accounts-v1";
const LOCAL_ACCOUNT_SESSION_KEY = "holidaily-local-session-v1";
const CHAT_POLL_INTERVAL_MS = 15000;
const supportFallback = window.HolidailySupportFallback || null;

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

const SUPPORT_API_BASE = `${resolveBackendBaseUrl()}/api/chat`;

const supportElements = {
  form: document.querySelector("#supportChatForm"),
  nameInput: document.querySelector("#supportName"),
  emailInput: document.querySelector("#supportEmail"),
  messageInput: document.querySelector("#supportMessage"),
  statusChip: document.querySelector("#supportChatStatus"),
  conversationIdChip: document.querySelector("#supportConversationId"),
  conversationMeta: document.querySelector("#supportConversationMeta"),
  thread: document.querySelector("#supportChatThread"),
  emptyState: document.querySelector("#supportChatEmptyState"),
  feedback: document.querySelector("#supportChatFeedback"),
  refreshButton: document.querySelector("#supportRefreshButton"),
  resetButton: document.querySelector("#supportResetButton")
};

const supportState = {
  conversationId: "",
  conversationToken: "",
  conversation: null,
  pollTimer: 0,
  requestInFlight: false,
  transportMode: "api"
};

const safeLocalRead = (key) => {
  try {
    return window.localStorage.getItem(key);
  } catch (error) {
    return null;
  }
};

const safeLocalWrite = (key, value) => {
  try {
    window.localStorage.setItem(key, value);
    return true;
  } catch (error) {
    return false;
  }
};

const safeLocalRemove = (key) => {
  try {
    window.localStorage.removeItem(key);
    return true;
  } catch (error) {
    return false;
  }
};

const safeSessionRead = (key) => {
  try {
    return window.sessionStorage.getItem(key);
  } catch (error) {
    return null;
  }
};

const safeJsonParse = (value, fallback) => {
  if (!value) {
    return fallback;
  }

  try {
    return JSON.parse(value);
  } catch (error) {
    return fallback;
  }
};

const normalizeText = (value) =>
  String(value || "")
    .replace(/\r\n?/g, "\n")
    .trim();

const normalizeEmail = (value) => String(value || "").trim().toLowerCase();

const setSupportFeedback = (message, tone = "info") => {
  if (!supportElements.feedback) {
    return;
  }

  supportElements.feedback.textContent = message || "";
  supportElements.feedback.className = "support-chat-feedback";

  if (message) {
    supportElements.feedback.classList.add(`is-${tone}`);
  }
};

const setTransportMode = (mode) => {
  supportState.transportMode = mode;
};

const applyChipState = (element, label, variant = "") => {
  if (!element) {
    return;
  }

  element.className = "account-chip";

  if (variant) {
    element.classList.add(variant);
  }

  element.textContent = label;
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

const createMessageElement = (message) => {
  const item = document.createElement("article");
  item.className = `chat-message is-${message.senderType === "admin" ? "admin" : "user"}`;

  const meta = document.createElement("div");
  meta.className = "chat-message-meta";

  const sender = document.createElement("strong");
  sender.textContent = message.senderType === "admin" ? message.senderName || "Support" : "Du";

  const timestamp = document.createElement("span");
  timestamp.textContent = formatDate(message.createdAt);

  const body = document.createElement("p");
  body.className = "chat-message-body";
  body.textContent = message.body;

  meta.append(sender, timestamp);
  item.append(meta, body);

  return item;
};

const getStatusPresentation = (status) => {
  switch (status) {
    case "open":
      return {
        label: "Offen",
        variant: "is-alert"
      };
    case "answered":
      return {
        label: "Beantwortet",
        variant: "is-admin"
      };
    case "closed":
      return {
        label: "Geschlossen",
        variant: "is-default"
      };
    default:
      return {
        label: "Bereit",
        variant: "is-subtle"
      };
  }
};

const clearThread = () => {
  if (!supportElements.thread) {
    return;
  }

  while (supportElements.thread.firstChild) {
    supportElements.thread.removeChild(supportElements.thread.firstChild);
  }
};

const loadStoredSession = () => {
  // The browser keeps only the conversation id and token locally, not the full chat history.
  const storedSession = safeJsonParse(safeLocalRead(SUPPORT_CHAT_SESSION_KEY), null);

  if (!storedSession || typeof storedSession !== "object") {
    return;
  }

  supportState.conversationId = normalizeText(storedSession.conversationId);
  supportState.conversationToken = normalizeText(storedSession.conversationToken);
};

const persistSession = () => {
  if (!supportState.conversationId || !supportState.conversationToken) {
    safeLocalRemove(SUPPORT_CHAT_SESSION_KEY);
    return;
  }

  safeLocalWrite(
    SUPPORT_CHAT_SESSION_KEY,
    JSON.stringify({
      conversationId: supportState.conversationId,
      conversationToken: supportState.conversationToken
    })
  );
};

const resetSession = () => {
  supportState.conversationId = "";
  supportState.conversationToken = "";
  supportState.conversation = null;
  persistSession();
};

const resolveLocalAccount = () => {
  const sessionEmail =
    normalizeEmail(safeSessionRead(LOCAL_ACCOUNT_SESSION_KEY)) ||
    normalizeEmail(safeLocalRead(LOCAL_ACCOUNT_SESSION_KEY));
  const storedAccounts = safeJsonParse(safeLocalRead(LOCAL_ACCOUNT_STORAGE_KEY), { accounts: [] });

  if (!sessionEmail || !storedAccounts || !Array.isArray(storedAccounts.accounts)) {
    return null;
  }

  return (
    storedAccounts.accounts.find((account) => normalizeEmail(account.email) === sessionEmail) || null
  );
};

const prefillFromAccount = (account) => {
  if (!account) {
    return;
  }

  if (supportElements.nameInput && !normalizeText(supportElements.nameInput.value) && account.name) {
    supportElements.nameInput.value = account.name;
  }

  if (supportElements.emailInput && !normalizeEmail(supportElements.emailInput.value) && account.email) {
    supportElements.emailInput.value = account.email;
  }
};

const renderConversation = () => {
  const conversation = supportState.conversation;
  const statusPresentation = getStatusPresentation(conversation?.status);

  applyChipState(supportElements.statusChip, statusPresentation.label, statusPresentation.variant);
  applyChipState(
    supportElements.conversationIdChip,
    conversation ? `ID ${conversation.id}` : "Neue Unterhaltung",
    conversation ? "is-muted" : "is-subtle"
  );

  if (!conversation) {
    if (supportElements.conversationMeta) {
      supportElements.conversationMeta.textContent =
        "Noch keine Konversation gestartet. Die erste Nachricht erzeugt automatisch eine Konversations-ID.";
    }

    if (supportElements.emptyState) {
      supportElements.emptyState.hidden = false;
    }

    if (supportElements.thread) {
      clearThread();
      supportElements.thread.hidden = true;
    }

    return;
  }

  if (supportElements.conversationMeta) {
    supportElements.conversationMeta.textContent = `Konversation ${conversation.id} | Status: ${statusPresentation.label} | Zuletzt aktualisiert: ${formatDate(
      conversation.updatedAt
    )}`;
  }

  const messages = Array.isArray(conversation.messages) ? conversation.messages : [];
  const hasMessages = messages.length > 0;

  if (supportElements.emptyState) {
    supportElements.emptyState.hidden = hasMessages;
  }

  if (!hasMessages) {
    if (supportElements.thread) {
      clearThread();
      supportElements.thread.hidden = true;
    }

    return;
  }

  clearThread();
  messages.forEach((message) => {
    supportElements.thread.appendChild(createMessageElement(message));
  });
  supportElements.thread.hidden = false;
  supportElements.thread.scrollTop = supportElements.thread.scrollHeight;
};

const setRequestState = (isBusy) => {
  supportState.requestInFlight = isBusy;

  if (supportElements.form) {
    Array.from(supportElements.form.elements).forEach((field) => {
      field.disabled = isBusy;
    });
  }

  if (supportElements.refreshButton) {
    supportElements.refreshButton.disabled = isBusy;
  }

  if (supportElements.resetButton) {
    supportElements.resetButton.disabled = isBusy;
  }
};

const apiRequest = async (path, options = {}) => {
  try {
    const response = await fetch(`${SUPPORT_API_BASE}${path}`, {
      method: options.method || "GET",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        ...(supportState.conversationToken
          ? {
              "X-Conversation-Token": supportState.conversationToken
            }
          : {}),
        ...(options.headers || {})
      },
      body: options.body ? JSON.stringify(options.body) : undefined
    });

    const payload = await response.json().catch(() => null);

    if (!response.ok) {
      const message = payload?.error?.message || "Support-Anfrage konnte nicht verarbeitet werden.";
      throw new Error(message);
    }

    setTransportMode("api");
    return payload;
  } catch (error) {
    if (error instanceof TypeError && supportFallback?.enabled) {
      setTransportMode("fallback");

      if (path === "/conversations" && (options.method || "GET") === "POST") {
        return supportFallback.createConversation(options.body || {});
      }

      const conversationMatch = path.match(/^\/([^/]+)$/);
      const messageMatch = path.match(/^\/([^/]+)\/messages$/);

      if (conversationMatch && (options.method || "GET") === "GET") {
        return supportFallback.getPublicConversation({
          conversationId: conversationMatch[1],
          conversationToken: supportState.conversationToken
        });
      }

      if (messageMatch && (options.method || "GET") === "POST") {
        return supportFallback.addPublicMessage({
          conversationId: messageMatch[1],
          conversationToken: supportState.conversationToken,
          ...(options.body || {})
        });
      }
    }

    if (error instanceof TypeError) {
      throw new Error(
        "Der Support-Server ist nicht erreichbar. Pruefe site-config.js oder ob der Node-Server laeuft."
      );
    }

    throw error;
  }
};

const fetchConversation = async ({ silent = false } = {}) => {
  if (!supportState.conversationId || !supportState.conversationToken) {
    supportState.conversation = null;
    renderConversation();
    return;
  }

  if (!silent) {
    setRequestState(true);
  }

  try {
    const payload = await apiRequest(`/${supportState.conversationId}`);
    supportState.conversation = payload.conversation;
    renderConversation();

    if (!silent) {
      setSupportFeedback(
        supportState.transportMode === "fallback"
          ? "Konversation lokal in diesem Browser aktualisiert."
          : "Konversation aktualisiert.",
        "info"
      );
    }
  } catch (error) {
    resetSession();
    renderConversation();
    setSupportFeedback(
      "Die gespeicherte Konversation konnte nicht geladen werden. Du kannst einfach eine neue Nachricht senden.",
      "error"
    );
  } finally {
    if (!silent) {
      setRequestState(false);
    }
  }
};

const sendMessage = async () => {
  const name = normalizeText(supportElements.nameInput?.value);
  const email = normalizeEmail(supportElements.emailInput?.value);
  const message = normalizeText(supportElements.messageInput?.value);

  if (!message) {
    setSupportFeedback("Bitte zuerst eine Nachricht eingeben.", "error");
    return;
  }

  setRequestState(true);

  try {
    const payload = supportState.conversationId
      ? await apiRequest(`/${supportState.conversationId}/messages`, {
          method: "POST",
          body: {
            name,
            email,
            message
          }
        })
      : await apiRequest("/conversations", {
          method: "POST",
          body: {
            name,
            email,
            message
          }
        });

    supportState.conversation = payload.conversation;

    if (payload.conversationToken) {
      supportState.conversationId = payload.conversation.id;
      supportState.conversationToken = payload.conversationToken;
      persistSession();
    }

    renderConversation();
    supportElements.messageInput.value = "";
    setSupportFeedback(
      supportState.transportMode === "fallback"
        ? "Nachricht gesendet. Der Chat laeuft aktuell lokal in diesem Browser."
        : "Nachricht gesendet. Der Support sieht die Anfrage jetzt im Admin-Bereich.",
      "success"
    );
  } catch (error) {
    setSupportFeedback(error.message, "error");
  } finally {
    setRequestState(false);
  }
};

const startPolling = () => {
  if (supportState.pollTimer) {
    window.clearInterval(supportState.pollTimer);
  }

  // Lightweight polling keeps the user thread in sync with admin replies without adding websockets.
  supportState.pollTimer = window.setInterval(() => {
    if (document.visibilityState === "hidden" || !supportState.conversationId || supportState.requestInFlight) {
      return;
    }

    fetchConversation({ silent: true });
  }, CHAT_POLL_INTERVAL_MS);
};

const handleResetConversation = () => {
  if (supportState.conversationId) {
    const confirmed = window.confirm(
      "Soll lokal eine neue Unterhaltung gestartet werden? Die alte Konversation bleibt im Support-System erhalten."
    );

    if (!confirmed) {
      return;
    }
  }

  resetSession();
  if (supportElements.messageInput) {
    supportElements.messageInput.value = "";
    supportElements.messageInput.focus();
  }

  renderConversation();
  setSupportFeedback("Neue Unterhaltung gestartet. Du kannst jetzt eine neue Nachricht senden.", "info");
};

if (supportElements.form) {
  loadStoredSession();
  renderConversation();
  prefillFromAccount(window.HolidailyAccountSnapshot?.user || resolveLocalAccount());
  startPolling();

  if (supportState.conversationId && supportState.conversationToken) {
    fetchConversation({ silent: true });
  }

  supportElements.form.addEventListener("submit", (event) => {
    event.preventDefault();
    sendMessage();
  });

  supportElements.refreshButton?.addEventListener("click", () => {
    fetchConversation();
  });

  supportElements.resetButton?.addEventListener("click", () => {
    handleResetConversation();
  });

  window.addEventListener("holidaily:account-session", (event) => {
    prefillFromAccount(event.detail?.user || null);
  });
}
