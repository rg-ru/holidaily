const FALLBACK_STORAGE_KEY = "holidaily-support-fallback-db-v1";
const FALLBACK_ADMIN_SESSION_KEY = "holidaily-support-fallback-admin-session-v1";
const FALLBACK_ADMIN_EMAIL = "dan.siemens@outlook.de";
const FALLBACK_ADMIN_NAME = "Dan Siemens";
const FALLBACK_ADMIN_PASSWORD_HASH = "fnv1a-784af754";

const isPagesHost =
  window.location.hostname === "rg-ru.github.io" &&
  window.location.pathname.startsWith("/holidaily");

const safeRead = (key) => {
  try {
    return window.localStorage.getItem(key);
  } catch (error) {
    return null;
  }
};

const safeWrite = (key, value) => {
  try {
    window.localStorage.setItem(key, value);
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

const safeSessionWrite = (key, value) => {
  try {
    window.sessionStorage.setItem(key, value);
    return true;
  } catch (error) {
    return false;
  }
};

const safeSessionRemove = (key) => {
  try {
    window.sessionStorage.removeItem(key);
    return true;
  } catch (error) {
    return false;
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

const normalizeEmail = (value) => normalizeText(value).toLowerCase();

const hashPassword = (value) => {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619) >>> 0;
  }

  return `fnv1a-${hash.toString(16).padStart(8, "0")}`;
};

const createIdentifier = (prefix) => {
  if (window.crypto?.randomUUID) {
    return `${prefix}-${window.crypto.randomUUID()}`;
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
};

const createConversationId = () => createIdentifier("conversation");
const createMessageId = () => createIdentifier("message");
const createConversationToken = () => createIdentifier("token");

const loadDb = () => {
  const stored = safeJsonParse(safeRead(FALLBACK_STORAGE_KEY), { conversations: [] });
  return {
    version: 1,
    conversations: Array.isArray(stored?.conversations) ? stored.conversations : []
  };
};

const saveDb = (db) =>
  safeWrite(
    FALLBACK_STORAGE_KEY,
    JSON.stringify({
      version: 1,
      conversations: db.conversations
    })
  );

const mapConversation = (conversation) => ({
  id: conversation.id,
  customerName: conversation.customerName || "",
  customerEmail: conversation.customerEmail || "",
  status: conversation.status,
  createdAt: conversation.createdAt,
  updatedAt: conversation.updatedAt,
  lastMessageAt: conversation.lastMessageAt,
  lastAdminReplyAt: conversation.lastAdminReplyAt || "",
  closedAt: conversation.closedAt || "",
  messages: Array.isArray(conversation.messages) ? [...conversation.messages] : []
});

const ensureConversation = (db, conversationId) => {
  const conversation = db.conversations.find((entry) => entry.id === conversationId);

  if (!conversation) {
    throw new Error("Konversation nicht gefunden.");
  }

  return conversation;
};

const ensurePublicConversation = (db, conversationId, conversationToken) => {
  const conversation = ensureConversation(db, conversationId);

  if (!conversationToken || conversation.publicToken !== conversationToken) {
    throw new Error("Konversation nicht gefunden.");
  }

  return conversation;
};

const createStats = (conversations) => ({
  total: conversations.length,
  open: conversations.filter((conversation) => conversation.status === "open").length,
  answered: conversations.filter((conversation) => conversation.status === "answered").length,
  closed: conversations.filter((conversation) => conversation.status === "closed").length
});

const buildAdminList = (conversations) =>
  [...conversations]
    .map((conversation) => {
      const lastMessage = conversation.messages[conversation.messages.length - 1] || null;

      return {
        id: conversation.id,
        customerName: conversation.customerName || "",
        customerEmail: conversation.customerEmail || "",
        status: conversation.status,
        createdAt: conversation.createdAt,
        updatedAt: conversation.updatedAt,
        lastMessageAt: conversation.lastMessageAt,
        lastAdminReplyAt: conversation.lastAdminReplyAt || "",
        closedAt: conversation.closedAt || "",
        messageCount: conversation.messages.length,
        lastMessagePreview: lastMessage?.body || "",
        lastSenderType: lastMessage?.senderType || ""
      };
    })
    .sort((left, right) => {
      if (left.status === "open" && right.status !== "open") {
        return -1;
      }

      if (left.status !== "open" && right.status === "open") {
        return 1;
      }

      return new Date(right.lastMessageAt).getTime() - new Date(left.lastMessageAt).getTime();
    });

const createFallbackConversation = ({ name, email, message }) => {
  const db = loadDb();
  const now = new Date().toISOString();
  const conversationId = createConversationId();
  const conversationToken = createConversationToken();
  const customerName = normalizeText(name);
  const customerEmail = normalizeEmail(email);
  const body = normalizeText(message);

  if (!body) {
    throw new Error("Die Nachricht darf nicht leer sein.");
  }

  const conversation = {
    id: conversationId,
    publicToken: conversationToken,
    customerName,
    customerEmail,
    status: "open",
    createdAt: now,
    updatedAt: now,
    lastMessageAt: now,
    lastAdminReplyAt: "",
    closedAt: "",
    messages: [
      {
        id: createMessageId(),
        senderType: "user",
        senderName: customerName || "Website-Besucher",
        senderEmail: customerEmail,
        body,
        createdAt: now
      }
    ]
  };

  db.conversations.push(conversation);
  saveDb(db);

  return {
    conversation: mapConversation(conversation),
    conversationToken
  };
};

const getFallbackConversation = ({ conversationId, conversationToken }) => {
  const db = loadDb();
  return {
    conversation: mapConversation(ensurePublicConversation(db, conversationId, conversationToken))
  };
};

const addFallbackPublicMessage = ({ conversationId, conversationToken, name, email, message }) => {
  const db = loadDb();
  const conversation = ensurePublicConversation(db, conversationId, conversationToken);
  const now = new Date().toISOString();
  const body = normalizeText(message);

  if (!body) {
    throw new Error("Die Nachricht darf nicht leer sein.");
  }

  conversation.customerName = normalizeText(name) || conversation.customerName || "";
  conversation.customerEmail = normalizeEmail(email) || conversation.customerEmail || "";
  conversation.status = "open";
  conversation.updatedAt = now;
  conversation.lastMessageAt = now;
  conversation.closedAt = "";
  conversation.messages.push({
    id: createMessageId(),
    senderType: "user",
    senderName: conversation.customerName || "Website-Besucher",
    senderEmail: conversation.customerEmail,
    body,
    createdAt: now
  });

  saveDb(db);

  return {
    conversation: mapConversation(conversation)
  };
};

const listFallbackAdminConversations = ({ status = "", search = "" } = {}) => {
  const db = loadDb();
  const normalizedStatus = normalizeText(status).toLowerCase();
  const normalizedSearch = normalizeText(search).toLowerCase();

  const filtered = buildAdminList(db.conversations).filter((conversation) => {
    if (normalizedStatus && normalizedStatus !== "all" && conversation.status !== normalizedStatus) {
      return false;
    }

    if (!normalizedSearch) {
      return true;
    }

    return [conversation.id, conversation.customerName, conversation.customerEmail]
      .join(" ")
      .toLowerCase()
      .includes(normalizedSearch);
  });

  return {
    stats: createStats(db.conversations),
    conversations: filtered
  };
};

const getFallbackAdminConversation = (conversationId) => {
  const db = loadDb();
  return {
    conversation: mapConversation(ensureConversation(db, conversationId))
  };
};

const addFallbackAdminMessage = ({ conversationId, adminUser, message }) => {
  const db = loadDb();
  const conversation = ensureConversation(db, conversationId);
  const now = new Date().toISOString();
  const body = normalizeText(message);

  if (!body) {
    throw new Error("Die Nachricht darf nicht leer sein.");
  }

  conversation.status = "answered";
  conversation.updatedAt = now;
  conversation.lastMessageAt = now;
  conversation.lastAdminReplyAt = now;
  conversation.closedAt = "";
  conversation.messages.push({
    id: createMessageId(),
    senderType: "admin",
    senderName: adminUser?.name || FALLBACK_ADMIN_NAME,
    senderEmail: adminUser?.email || FALLBACK_ADMIN_EMAIL,
    body,
    createdAt: now
  });

  saveDb(db);

  return {
    conversation: mapConversation(conversation)
  };
};

const updateFallbackConversationStatus = ({ conversationId, status }) => {
  const db = loadDb();
  const conversation = ensureConversation(db, conversationId);
  const normalizedStatus = normalizeText(status).toLowerCase();
  const now = new Date().toISOString();

  if (!["open", "answered", "closed"].includes(normalizedStatus)) {
    throw new Error("Der Status ist ungueltig.");
  }

  conversation.status = normalizedStatus;
  conversation.updatedAt = now;
  conversation.closedAt = normalizedStatus === "closed" ? now : "";
  saveDb(db);

  return {
    conversation: mapConversation(conversation)
  };
};

const deleteFallbackConversation = (conversationId) => {
  const db = loadDb();
  const nextConversations = db.conversations.filter((conversation) => conversation.id !== conversationId);

  if (nextConversations.length === db.conversations.length) {
    throw new Error("Konversation nicht gefunden.");
  }

  db.conversations = nextConversations;
  saveDb(db);
  return null;
};

const readFallbackAdminSession = () => {
  const stored = safeJsonParse(safeSessionRead(FALLBACK_ADMIN_SESSION_KEY), null);

  if (!stored || normalizeEmail(stored.email) !== FALLBACK_ADMIN_EMAIL) {
    return null;
  }

  return {
    email: FALLBACK_ADMIN_EMAIL,
    name: FALLBACK_ADMIN_NAME
  };
};

const loginFallbackAdmin = ({ email, password }) => {
  if (
    normalizeEmail(email) !== FALLBACK_ADMIN_EMAIL ||
    hashPassword(String(password || "")) !== FALLBACK_ADMIN_PASSWORD_HASH
  ) {
    throw new Error("Die Admin-Anmeldedaten sind ungueltig.");
  }

  const adminUser = {
    email: FALLBACK_ADMIN_EMAIL,
    name: FALLBACK_ADMIN_NAME
  };

  safeSessionWrite(FALLBACK_ADMIN_SESSION_KEY, JSON.stringify(adminUser));
  return {
    adminUser
  };
};

const logoutFallbackAdmin = () => {
  safeSessionRemove(FALLBACK_ADMIN_SESSION_KEY);
  return null;
};

window.HolidailySupportFallback = {
  enabled: isPagesHost,
  modeLabel: "Lokaler Browser-Fallback",
  createConversation: createFallbackConversation,
  getPublicConversation: getFallbackConversation,
  addPublicMessage: addFallbackPublicMessage,
  listAdminConversations: listFallbackAdminConversations,
  getAdminConversation: getFallbackAdminConversation,
  addAdminMessage: addFallbackAdminMessage,
  updateConversationStatus: updateFallbackConversationStatus,
  deleteConversation: deleteFallbackConversation,
  readAdminSession: readFallbackAdminSession,
  loginAdmin: loginFallbackAdmin,
  logoutAdmin: logoutFallbackAdmin
};
