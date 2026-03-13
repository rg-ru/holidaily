const motionElements = document.querySelectorAll("[data-reveal]");
const header = document.querySelector(".site-header");
const navLinks = Array.from(document.querySelectorAll(".site-nav a"));
const sectionLinks = navLinks
  .map((link) => ({ link, section: document.querySelector(link.getAttribute("href")) }))
  .filter(({ section }) => section);
const heroVisual = document.querySelector(".hero-visual");
const accountSection = document.querySelector("#konto");
const saveOfferButtons = Array.from(document.querySelectorAll(".save-offer-button"));
const interactiveSurfaces = document.querySelectorAll(
  ".hero-card, .hero-detail-strip, .hero-stats article, .feature-card, .offer-card, .story-card, .contact-card, .contact-method, .contact-hours, .spotlight-list article, .spotlight-metrics article, .account-highlight, .account-benefit, .account-shell, .auth-card, .account-card, .account-metric, .saved-offer-item, .admin-account, .admin-chat-workspace"
);
const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
const hasFinePointer = window.matchMedia("(pointer: fine)").matches;

const STORAGE_KEY = "holidaily-local-accounts-v1";
const SESSION_KEY = "holidaily-local-session-v1";
const DEFAULT_ADMIN_ACCOUNT = {
  id: "holidaily-admin",
  name: "holidaily Admin",
  email: "admin@holidaily.local",
  passwordHash: "fnv1a-b68f0594",
  role: "admin",
  savedOffers: [],
  projectNote: "",
  chatMessages: [],
  createdAt: "2026-03-13T00:00:00.000Z",
  updatedAt: "2026-03-13T00:00:00.000Z",
  noteUpdatedAt: ""
};
const accountState = {
  accounts: [],
  currentEmail: "",
  pendingOffer: null,
  selectedAdminChatEmail: ""
};

const accountElements = {
  feedback: document.querySelector("#accountFeedback"),
  guestView: document.querySelector("#guestView"),
  userView: document.querySelector("#userView"),
  adminView: document.querySelector("#adminView"),
  signupForm: document.querySelector("#signupForm"),
  loginForm: document.querySelector("#loginForm"),
  notesForm: document.querySelector("#notesForm"),
  userChatForm: document.querySelector("#userChatForm"),
  adminChatForm: document.querySelector("#adminChatForm"),
  logoutButton: document.querySelector("#logoutButton"),
  statusTitle: document.querySelector("#accountStatusTitle"),
  statusText: document.querySelector("#accountStatusText"),
  roleBadge: document.querySelector("#accountRoleBadge"),
  dashboardHeading: document.querySelector("#dashboardHeading"),
  dashboardMeta: document.querySelector("#dashboardMeta"),
  metricSavedCount: document.querySelector("#metricSavedCount"),
  metricRole: document.querySelector("#metricRole"),
  metricUpdatedAt: document.querySelector("#metricUpdatedAt"),
  savedEmptyState: document.querySelector("#savedEmptyState"),
  savedOffersList: document.querySelector("#savedOffersList"),
  projectNote: document.querySelector("#projectNote"),
  noteMeta: document.querySelector("#noteMeta"),
  userChatThread: document.querySelector("#userChatThread"),
  userChatEmptyState: document.querySelector("#userChatEmptyState"),
  userChatMessage: document.querySelector("#userChatMessage"),
  userChatStatus: document.querySelector("#userChatStatus"),
  adminAccountCount: document.querySelector("#adminAccountCount"),
  adminAdminCount: document.querySelector("#adminAdminCount"),
  adminSavedCount: document.querySelector("#adminSavedCount"),
  adminAccountsList: document.querySelector("#adminAccountsList"),
  adminChatThread: document.querySelector("#adminChatThread"),
  adminChatEmptyState: document.querySelector("#adminChatEmptyState"),
  adminChatTitle: document.querySelector("#adminChatTitle"),
  adminChatMeta: document.querySelector("#adminChatMeta"),
  adminChatStatus: document.querySelector("#adminChatStatus"),
  adminChatMessage: document.querySelector("#adminChatMessage"),
  signupName: document.querySelector("#signupName")
};

const revealAll = () => {
  motionElements.forEach((element) => element.classList.add("is-visible"));
};

const setFeedback = (message, tone = "info") => {
  if (!accountElements.feedback) {
    return;
  }

  accountElements.feedback.textContent = message || "";
  accountElements.feedback.className = "account-feedback";

  if (message) {
    accountElements.feedback.classList.add(`is-${tone}`);
  }
};

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
    setFeedback("Lokales Speichern ist in diesem Browser gerade nicht verfuegbar.", "error");
    return false;
  }
};

const safeRemove = (key) => {
  try {
    window.localStorage.removeItem(key);
    return true;
  } catch (error) {
    setFeedback("Lokales Speichern ist in diesem Browser gerade nicht verfuegbar.", "error");
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

const normalizeEmail = (value) => value.trim().toLowerCase();

const hashPassword = (value) => {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619) >>> 0;
  }

  return `fnv1a-${hash.toString(16).padStart(8, "0")}`;
};

const createIdentifier = (prefix) => {
  if (window.crypto && typeof window.crypto.randomUUID === "function") {
    return `${prefix}-${window.crypto.randomUUID()}`;
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
};

const createAccountId = () => createIdentifier("account");
const createMessageId = () => createIdentifier("message");

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

const clearElement = (element) => {
  while (element && element.firstChild) {
    element.removeChild(element.firstChild);
  }
};

const getRoleLabel = (role) => {
  if (role === "admin") {
    return "Admin";
  }

  if (role === "user") {
    return "Kunde";
  }

  return "Gast";
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

const createChip = (label, variant = "") => {
  const chip = document.createElement("span");
  applyChipState(chip, label, variant);
  return chip;
};

const normalizeSavedOffer = (offer) => {
  if (!offer || typeof offer !== "object") {
    return null;
  }

  const id = typeof offer.id === "string" ? offer.id.trim() : "";

  if (!id) {
    return null;
  }

  return {
    id,
    label: typeof offer.label === "string" && offer.label.trim() ? offer.label.trim() : "Gespeichertes Modell",
    description: typeof offer.description === "string" ? offer.description.trim() : "",
    savedAt: typeof offer.savedAt === "string" ? offer.savedAt : new Date().toISOString()
  };
};

const normalizeChatMessage = (message) => {
  if (!message || typeof message !== "object") {
    return null;
  }

  const body = typeof message.body === "string" ? message.body.trim() : "";

  if (!body) {
    return null;
  }

  return {
    id: typeof message.id === "string" && message.id ? message.id : createMessageId(),
    senderRole: message.senderRole === "admin" ? "admin" : "user",
    senderName:
      typeof message.senderName === "string" && message.senderName.trim()
        ? message.senderName.trim()
        : message.senderRole === "admin"
          ? "holidaily Admin"
          : "Kunde",
    body,
    createdAt: typeof message.createdAt === "string" ? message.createdAt : new Date().toISOString()
  };
};

const normalizeAccount = (account) => {
  if (!account || typeof account !== "object") {
    return null;
  }

  const email = normalizeEmail(typeof account.email === "string" ? account.email : "");

  if (!email) {
    return null;
  }

  const savedOffers = Array.isArray(account.savedOffers)
    ? account.savedOffers
        .map((entry) => normalizeSavedOffer(entry))
        .filter(Boolean)
        .filter((entry, index, entries) => entries.findIndex((candidate) => candidate.id === entry.id) === index)
    : [];
  const chatMessages = Array.isArray(account.chatMessages)
    ? account.chatMessages
        .map((entry) => normalizeChatMessage(entry))
        .filter(Boolean)
        .sort((left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime())
    : [];
  const createdAt = typeof account.createdAt === "string" ? account.createdAt : new Date().toISOString();

  return {
    id: typeof account.id === "string" && account.id ? account.id : createAccountId(),
    name: typeof account.name === "string" && account.name.trim() ? account.name.trim() : email.split("@")[0],
    email,
    passwordHash: typeof account.passwordHash === "string" ? account.passwordHash : "",
    role: account.role === "admin" ? "admin" : "user",
    savedOffers,
    projectNote: typeof account.projectNote === "string" ? account.projectNote : "",
    chatMessages,
    createdAt,
    updatedAt: typeof account.updatedAt === "string" ? account.updatedAt : createdAt,
    noteUpdatedAt: typeof account.noteUpdatedAt === "string" ? account.noteUpdatedAt : ""
  };
};

const loadAccounts = () => {
  const stored = safeJsonParse(safeRead(STORAGE_KEY), { accounts: [] });

  if (!stored || !Array.isArray(stored.accounts)) {
    return [];
  }

  return stored.accounts.map((account) => normalizeAccount(account)).filter(Boolean);
};

const persistAccounts = () =>
  safeWrite(
    STORAGE_KEY,
    JSON.stringify({
      version: 1,
      accounts: accountState.accounts
    })
  );

const loadSessionEmail = () => normalizeEmail(safeRead(SESSION_KEY) || "");

const persistSession = (email) => {
  if (!email) {
    return safeRemove(SESSION_KEY);
  }

  return safeWrite(SESSION_KEY, email);
};

const getCurrentUser = () => {
  const user = accountState.accounts.find((account) => account.email === accountState.currentEmail) || null;

  if (!user && accountState.currentEmail) {
    accountState.currentEmail = "";
    persistSession("");
  }

  return user;
};

const ensureAdminAccount = () => {
  const existingAdmin = accountState.accounts.find((account) => account.email === DEFAULT_ADMIN_ACCOUNT.email);

  if (!existingAdmin) {
    accountState.accounts.push({ ...DEFAULT_ADMIN_ACCOUNT });
    persistAccounts();
    return;
  }

  let changed = false;

  if (existingAdmin.role !== "admin") {
    existingAdmin.role = "admin";
    changed = true;
  }

  if (!existingAdmin.passwordHash) {
    existingAdmin.passwordHash = DEFAULT_ADMIN_ACCOUNT.passwordHash;
    changed = true;
  }

  if (!existingAdmin.name) {
    existingAdmin.name = DEFAULT_ADMIN_ACCOUNT.name;
    changed = true;
  }

  if (!Array.isArray(existingAdmin.chatMessages)) {
    existingAdmin.chatMessages = [];
    changed = true;
  }

  if (changed) {
    existingAdmin.updatedAt = new Date().toISOString();
    persistAccounts();
  }
};

const saveOfferForUser = (user, offer) => {
  if (user.savedOffers.some((entry) => entry.id === offer.id)) {
    return false;
  }

  user.savedOffers.push({
    ...offer,
    savedAt: new Date().toISOString()
  });
  user.updatedAt = new Date().toISOString();
  return true;
};

const removeOfferFromUser = (user, offerId) => {
  const nextSavedOffers = user.savedOffers.filter((entry) => entry.id !== offerId);

  if (nextSavedOffers.length === user.savedOffers.length) {
    return false;
  }

  user.savedOffers = nextSavedOffers;
  user.updatedAt = new Date().toISOString();
  return true;
};

const getLastChatMessage = (account) =>
  account.chatMessages.length ? account.chatMessages[account.chatMessages.length - 1] : null;

const getLatestChatTimestamp = (account) => {
  const lastMessage = getLastChatMessage(account);

  if (!lastMessage) {
    return 0;
  }

  const timestamp = new Date(lastMessage.createdAt).getTime();
  return Number.isNaN(timestamp) ? 0 : timestamp;
};

const getUserChatStatus = (account) => {
  const lastMessage = getLastChatMessage(account);

  if (!lastMessage) {
    return {
      label: "Noch kein Chat",
      variant: "is-subtle"
    };
  }

  if (lastMessage.senderRole === "user") {
    return {
      label: "Nachricht gesendet",
      variant: "is-alert"
    };
  }

  return {
    label: "Antwort vorhanden",
    variant: "is-admin"
  };
};

const getAdminChatStatus = (account) => {
  const lastMessage = getLastChatMessage(account);

  if (!lastMessage) {
    return {
      label: "Noch kein Chat",
      variant: "is-subtle"
    };
  }

  if (lastMessage.senderRole === "user") {
    return {
      label: "Antwort noetig",
      variant: "is-alert"
    };
  }

  return {
    label: "Beantwortet",
    variant: "is-admin"
  };
};

const appendChatMessage = (account, senderRole, body, senderName) => {
  const trimmedBody = body.trim();

  if (!trimmedBody) {
    return false;
  }

  const now = new Date().toISOString();
  const normalizedMessage = normalizeChatMessage({
    id: createMessageId(),
    senderRole,
    senderName,
    body: trimmedBody,
    createdAt: now
  });

  if (!normalizedMessage) {
    return false;
  }

  account.chatMessages.push(normalizedMessage);
  account.updatedAt = now;
  return true;
};

const applyPendingOffer = (user) => {
  if (!accountState.pendingOffer) {
    return null;
  }

  const pendingOffer = accountState.pendingOffer;
  const saved = saveOfferForUser(user, pendingOffer);
  accountState.pendingOffer = null;

  return {
    label: pendingOffer.label,
    saved
  };
};

const scrollToAccountSection = () => {
  if (!accountSection) {
    return;
  }

  accountSection.scrollIntoView({
    behavior: prefersReducedMotion.matches ? "auto" : "smooth",
    block: "start"
  });
};

const renderChatThread = (container, messages, options) => {
  clearElement(container);

  if (!messages.length) {
    container.hidden = true;
    return;
  }

  messages.forEach((message) => {
    const item = document.createElement("article");
    item.className = `chat-message is-${message.senderRole}`;

    const meta = document.createElement("div");
    meta.className = "chat-message-meta";

    const sender = document.createElement("strong");

    if (message.senderRole === options.viewerRole) {
      sender.textContent = "Du";
    } else if (message.senderRole === "admin") {
      sender.textContent = message.senderName || "holidaily Admin";
    } else {
      sender.textContent = options.participantName || message.senderName || "Kunde";
    }

    const timestamp = document.createElement("span");
    timestamp.textContent = formatDate(message.createdAt);

    const body = document.createElement("p");
    body.className = "chat-message-body";
    body.textContent = message.body;

    meta.append(sender, timestamp);
    item.append(meta, body);
    container.appendChild(item);
  });

  container.hidden = false;
  container.scrollTop = container.scrollHeight;
};

const renderSavedOffers = (user) => {
  clearElement(accountElements.savedOffersList);

  const sortedOffers = [...user.savedOffers].sort(
    (left, right) => new Date(right.savedAt).getTime() - new Date(left.savedAt).getTime()
  );
  const hasOffers = sortedOffers.length > 0;

  accountElements.savedEmptyState.hidden = hasOffers;

  if (!hasOffers) {
    return;
  }

  sortedOffers.forEach((offer) => {
    const item = document.createElement("li");
    item.className = "saved-offer-item";

    const copy = document.createElement("div");
    copy.className = "saved-offer-copy";

    const title = document.createElement("strong");
    title.textContent = offer.label;

    const description = document.createElement("p");
    description.textContent = offer.description || "Gespeichertes Poolmodell";

    const meta = document.createElement("span");
    meta.className = "saved-offer-meta";
    meta.textContent = `Gespeichert am ${formatDate(offer.savedAt)}`;

    copy.append(title, description, meta);

    const removeButton = document.createElement("button");
    removeButton.className = "button button-ghost button-small";
    removeButton.type = "button";
    removeButton.dataset.removeOffer = offer.id;
    removeButton.textContent = "Entfernen";

    item.append(copy, removeButton);
    accountElements.savedOffersList.appendChild(item);
  });
};

const renderUserChat = (currentUser) => {
  const status = getUserChatStatus(currentUser);
  applyChipState(accountElements.userChatStatus, status.label, status.variant);

  const hasMessages = currentUser.chatMessages.length > 0;
  accountElements.userChatEmptyState.hidden = hasMessages;

  if (!hasMessages) {
    clearElement(accountElements.userChatThread);
    accountElements.userChatThread.hidden = true;
    return;
  }

  renderChatThread(accountElements.userChatThread, currentUser.chatMessages, {
    viewerRole: "user",
    participantName: "holidaily Admin"
  });
};

const renderAdminChatWorkspace = (currentUser, visibleAccounts) => {
  const chatAccounts = visibleAccounts.filter((account) => account.email !== DEFAULT_ADMIN_ACCOUNT.email);
  let selectedAccount = chatAccounts.find((account) => account.email === accountState.selectedAdminChatEmail) || null;

  if (!selectedAccount) {
    selectedAccount = chatAccounts.find((account) => account.chatMessages.length > 0) || chatAccounts[0] || null;
  }

  if (!selectedAccount) {
    accountState.selectedAdminChatEmail = "";
    accountElements.adminChatTitle.textContent = "Chat auswaehlen";
    accountElements.adminChatMeta.textContent =
      "Sobald es weitere Konten gibt, kann der Admin hier Antworten ueber den Website-Chat verfassen.";
    applyChipState(accountElements.adminChatStatus, "Kein Chat aktiv", "is-subtle");
    accountElements.adminChatEmptyState.hidden = false;
    accountElements.adminChatEmptyState.textContent =
      "Aktuell ist kein anderes Konto fuer einen Chat vorhanden.";
    accountElements.adminChatForm.hidden = true;
    clearElement(accountElements.adminChatThread);
    accountElements.adminChatThread.hidden = true;
    return;
  }

  accountState.selectedAdminChatEmail = selectedAccount.email;
  accountElements.adminChatTitle.textContent = `Chat mit ${selectedAccount.name}`;

  const lastMessage = getLastChatMessage(selectedAccount);
  accountElements.adminChatMeta.textContent = lastMessage
    ? `${selectedAccount.email} | Letzte Nachricht am ${formatDate(lastMessage.createdAt)}`
    : `${selectedAccount.email} | Noch keine Nachrichten`;

  const status = getAdminChatStatus(selectedAccount);
  applyChipState(accountElements.adminChatStatus, status.label, status.variant);

  accountElements.adminChatForm.hidden = false;

  const hasMessages = selectedAccount.chatMessages.length > 0;
  accountElements.adminChatEmptyState.hidden = hasMessages;
  accountElements.adminChatEmptyState.textContent = hasMessages
    ? ""
    : "Noch keine Nachrichten in diesem Chat. Der Admin kann hier direkt antworten, sobald die Unterhaltung starten soll.";

  if (!hasMessages) {
    clearElement(accountElements.adminChatThread);
    accountElements.adminChatThread.hidden = true;
    return;
  }

  renderChatThread(accountElements.adminChatThread, selectedAccount.chatMessages, {
    viewerRole: "admin",
    participantName: selectedAccount.name
  });
};

const renderAdminPanel = (currentUser) => {
  const isAdmin = currentUser && currentUser.role === "admin";
  accountElements.adminView.hidden = !isAdmin;

  if (!isAdmin) {
    return;
  }

  const visibleAccounts = [...accountState.accounts]
    .filter((account) => account.email !== currentUser.email && account.email !== DEFAULT_ADMIN_ACCOUNT.email)
    .sort((left, right) => {
      const chatDifference = getLatestChatTimestamp(right) - getLatestChatTimestamp(left);

      if (chatDifference !== 0) {
        return chatDifference;
      }

      if (left.role !== right.role) {
        return left.role === "admin" ? -1 : 1;
      }

      return left.name.localeCompare(right.name, "de-DE");
    });
  const totalSavedOffers = accountState.accounts.reduce((total, account) => total + account.savedOffers.length, 0);

  accountElements.adminAccountCount.textContent = String(accountState.accounts.length);
  accountElements.adminAdminCount.textContent = String(
    accountState.accounts.filter((account) => account.role === "admin").length
  );
  accountElements.adminSavedCount.textContent = String(totalSavedOffers);

  clearElement(accountElements.adminAccountsList);

  visibleAccounts.forEach((account) => {
    const item = document.createElement("article");
    item.className = "admin-account";

    const headerRow = document.createElement("div");
    headerRow.className = "admin-account-header";

    const identity = document.createElement("div");
    const name = document.createElement("strong");
    const email = document.createElement("p");
    name.textContent = account.name;
    email.textContent = account.email;
    identity.append(name, email);

    const chips = document.createElement("div");
    chips.className = "admin-account-meta";
    chips.appendChild(createChip(getRoleLabel(account.role), account.role === "admin" ? "is-admin" : "is-user"));
    chips.appendChild(createChip(`${account.savedOffers.length} Modelle`, "is-muted"));
    const chatStatus = getAdminChatStatus(account);
    chips.appendChild(createChip(chatStatus.label, chatStatus.variant));
    headerRow.append(identity, chips);

    const detailRow = document.createElement("div");
    detailRow.className = "admin-account-details";
    detailRow.appendChild(createChip(`Erstellt: ${formatDate(account.createdAt)}`, "is-subtle"));
    detailRow.appendChild(createChip(`Aktualisiert: ${formatDate(account.updatedAt)}`, "is-subtle"));

    const notePreview = document.createElement("p");
    notePreview.className = "admin-account-note";

    if (account.projectNote.trim()) {
      const shortenedNote =
        account.projectNote.trim().length > 140
          ? `${account.projectNote.trim().slice(0, 140)}...`
          : account.projectNote.trim();
      notePreview.textContent = `Notiz: ${shortenedNote}`;
    } else {
      notePreview.textContent = "Keine Notiz gespeichert.";
    }

    const chatPreview = document.createElement("p");
    chatPreview.className = "admin-account-note";
    const lastMessage = getLastChatMessage(account);

    if (lastMessage) {
      const shortenedMessage =
        lastMessage.body.length > 140 ? `${lastMessage.body.slice(0, 140)}...` : lastMessage.body;
      const senderLabel = lastMessage.senderRole === "admin" ? "Admin" : account.name;
      chatPreview.textContent = `Chat: ${senderLabel} am ${formatDate(lastMessage.createdAt)} - ${shortenedMessage}`;
    } else {
      chatPreview.textContent = "Noch kein Chat gestartet.";
    }

    const actionRow = document.createElement("div");
    actionRow.className = "admin-account-actions";

    const openChatButton = document.createElement("button");
    openChatButton.className = "button button-ghost button-small";
    openChatButton.type = "button";
    openChatButton.dataset.adminAction = "open-chat";
    openChatButton.dataset.accountEmail = account.email;
    openChatButton.textContent = "Chat oeffnen";
    actionRow.appendChild(openChatButton);

    if (account.email !== DEFAULT_ADMIN_ACCOUNT.email) {
      const toggleRoleButton = document.createElement("button");
      toggleRoleButton.className = "button button-ghost button-small";
      toggleRoleButton.type = "button";
      toggleRoleButton.dataset.adminAction = "toggle-role";
      toggleRoleButton.dataset.accountEmail = account.email;
      toggleRoleButton.textContent = account.role === "admin" ? "Admin entfernen" : "Zum Admin machen";
      actionRow.appendChild(toggleRoleButton);
    }

    item.append(headerRow, detailRow, notePreview, chatPreview, actionRow);
    accountElements.adminAccountsList.appendChild(item);
  });

  renderAdminChatWorkspace(currentUser, visibleAccounts);
};

const renderSaveButtons = (currentUser) => {
  const savedIds = new Set((currentUser ? currentUser.savedOffers : []).map((offer) => offer.id));

  saveOfferButtons.forEach((button) => {
    const offerId = button.dataset.saveOffer;
    const saved = savedIds.has(offerId);

    button.classList.toggle("is-saved", saved);
    button.setAttribute("aria-pressed", saved ? "true" : "false");
    button.textContent = saved ? "Gespeichert" : "Im Konto speichern";
  });
};

const resetUserOnlyViews = () => {
  clearElement(accountElements.userChatThread);
  accountElements.userChatThread.hidden = true;
  accountElements.userChatEmptyState.hidden = false;
  accountElements.userChatEmptyState.textContent =
    "Noch keine Nachricht vorhanden. Starte den Chat direkt ueber dieses Formular.";
  applyChipState(accountElements.userChatStatus, "Noch kein Chat", "is-subtle");
};

const renderAccountState = () => {
  const currentUser = getCurrentUser();
  const isLoggedIn = Boolean(currentUser);
  const isAdmin = currentUser && currentUser.role === "admin";

  accountElements.guestView.hidden = isLoggedIn;
  accountElements.userView.hidden = !isLoggedIn;

  if (!isLoggedIn) {
    accountElements.roleBadge.textContent = "Gast";
    accountElements.roleBadge.className = "account-role-badge is-guest";
    accountElements.statusTitle.textContent = "Gastmodus aktiv";
    accountElements.statusText.textContent =
      "Ein Konto ist optional und wird erst benoetigt, wenn du Modelle, Notizen oder den Chat speichern willst.";
    accountElements.adminView.hidden = true;
    resetUserOnlyViews();
    renderSaveButtons(null);
    return;
  }

  accountElements.roleBadge.textContent = getRoleLabel(currentUser.role);
  accountElements.roleBadge.className = "account-role-badge";
  accountElements.roleBadge.classList.add(isAdmin ? "is-admin" : "is-user");
  accountElements.statusTitle.textContent = `${currentUser.name} ist angemeldet`;
  accountElements.statusText.textContent = isAdmin
    ? "Adminzugang aktiv. Du kannst lokale Konten, Rollen, Modelle und Website-Chats auf diesem Geraet verwalten."
    : "Konto aktiv. Du kannst Modelle speichern, Projekt-Notizen sichern und direkt ueber die Website chatten.";

  accountElements.dashboardHeading.textContent = `Hallo ${currentUser.name}`;
  accountElements.dashboardMeta.textContent = `${currentUser.email} | Konto erstellt am ${formatDate(
    currentUser.createdAt
  )}`;
  accountElements.metricSavedCount.textContent = String(currentUser.savedOffers.length);
  accountElements.metricRole.textContent = getRoleLabel(currentUser.role);
  accountElements.metricUpdatedAt.textContent = formatDate(currentUser.updatedAt);
  accountElements.projectNote.value = currentUser.projectNote;
  accountElements.noteMeta.textContent = currentUser.noteUpdatedAt
    ? `Zuletzt gespeichert am ${formatDate(currentUser.noteUpdatedAt)}`
    : "Noch keine Notiz gespeichert.";

  renderSavedOffers(currentUser);
  renderUserChat(currentUser);
  renderAdminPanel(currentUser);
  renderSaveButtons(currentUser);
};

const initializeAccounts = () => {
  accountState.accounts = loadAccounts();
  accountState.currentEmail = loadSessionEmail();
  ensureAdminAccount();
  renderAccountState();
};

const syncHeaderState = () => {
  if (!header) {
    return;
  }

  header.classList.toggle("is-scrolled", window.scrollY > 24);
};

const syncActiveNav = () => {
  if (!sectionLinks.length) {
    return;
  }

  const marker = window.scrollY + window.innerHeight * 0.34;
  let activeLink = null;

  sectionLinks.forEach(({ link, section }) => {
    if (section.offsetTop <= marker) {
      activeLink = link;
    }
  });

  navLinks.forEach((link) => {
    link.classList.toggle("is-active", link === activeLink);
  });
};

let scrollFrame = 0;

const queueScrollSync = () => {
  if (scrollFrame) {
    return;
  }

  scrollFrame = window.requestAnimationFrame(() => {
    syncHeaderState();
    syncActiveNav();
    scrollFrame = 0;
  });
};

syncHeaderState();
syncActiveNav();
window.addEventListener("scroll", queueScrollSync, { passive: true });
window.addEventListener("resize", queueScrollSync);

initializeAccounts();

if (accountElements.signupForm) {
  accountElements.signupForm.addEventListener("submit", (event) => {
    event.preventDefault();

    const formData = new FormData(accountElements.signupForm);
    const name = String(formData.get("name") || "").trim();
    const email = normalizeEmail(String(formData.get("email") || ""));
    const password = String(formData.get("password") || "");

    if (!name || !email || !password) {
      setFeedback("Bitte Name, E-Mail und Passwort ausfuellen.", "error");
      return;
    }

    if (password.length < 8) {
      setFeedback("Das Passwort muss mindestens 8 Zeichen haben.", "error");
      return;
    }

    if (accountState.accounts.some((account) => account.email === email)) {
      setFeedback("Zu dieser E-Mail gibt es bereits ein Konto. Bitte stattdessen anmelden.", "error");
      return;
    }

    const now = new Date().toISOString();
    const newAccount = {
      id: createAccountId(),
      name,
      email,
      passwordHash: hashPassword(password),
      role: "user",
      savedOffers: [],
      projectNote: "",
      chatMessages: [],
      createdAt: now,
      updatedAt: now,
      noteUpdatedAt: ""
    };

    accountState.accounts.push(newAccount);
    accountState.currentEmail = email;

    const pendingOfferResult = applyPendingOffer(newAccount);

    if (!persistAccounts() || !persistSession(accountState.currentEmail)) {
      return;
    }

    accountElements.signupForm.reset();

    if (accountElements.loginForm) {
      accountElements.loginForm.reset();
    }

    renderAccountState();
    setFeedback(
      pendingOfferResult && pendingOfferResult.saved
        ? `Konto erstellt und "${pendingOfferResult.label}" direkt gespeichert.`
        : "Konto erstellt. Du kannst jetzt Modelle, Notizen und den Website-Chat nutzen.",
      "success"
    );
  });
}

if (accountElements.loginForm) {
  accountElements.loginForm.addEventListener("submit", (event) => {
    event.preventDefault();

    const formData = new FormData(accountElements.loginForm);
    const email = normalizeEmail(String(formData.get("email") || ""));
    const password = String(formData.get("password") || "");
    const account = accountState.accounts.find((entry) => entry.email === email);

    if (!account || account.passwordHash !== hashPassword(password)) {
      setFeedback("Die Anmeldedaten stimmen nicht.", "error");
      return;
    }

    accountState.currentEmail = account.email;
    const pendingOfferResult = applyPendingOffer(account);

    if (!persistAccounts() || !persistSession(accountState.currentEmail)) {
      return;
    }

    accountElements.loginForm.reset();

    if (accountElements.signupForm) {
      accountElements.signupForm.reset();
    }

    renderAccountState();
    setFeedback(
      pendingOfferResult && pendingOfferResult.saved
        ? `Angemeldet und "${pendingOfferResult.label}" in deiner Merkliste abgelegt.`
        : `Angemeldet als ${account.name}.`,
      "success"
    );
  });
}

if (accountElements.logoutButton) {
  accountElements.logoutButton.addEventListener("click", () => {
    accountState.currentEmail = "";

    if (!persistSession("")) {
      return;
    }

    renderAccountState();
    setFeedback("Du wurdest abgemeldet.", "info");
  });
}

if (accountElements.notesForm) {
  accountElements.notesForm.addEventListener("submit", (event) => {
    event.preventDefault();

    const currentUser = getCurrentUser();

    if (!currentUser) {
      setFeedback("Bitte zuerst anmelden, um Notizen zu speichern.", "error");
      scrollToAccountSection();
      return;
    }

    const note = accountElements.projectNote.value.trim();
    const now = new Date().toISOString();

    currentUser.projectNote = note;
    currentUser.updatedAt = now;
    currentUser.noteUpdatedAt = note ? now : "";

    if (!persistAccounts()) {
      return;
    }

    renderAccountState();
    setFeedback(note ? "Projekt-Notiz gespeichert." : "Projekt-Notiz geleert.", "success");
  });
}

if (accountElements.userChatForm) {
  accountElements.userChatForm.addEventListener("submit", (event) => {
    event.preventDefault();

    const currentUser = getCurrentUser();

    if (!currentUser) {
      setFeedback("Bitte zuerst anmelden, um den Website-Chat zu nutzen.", "error");
      scrollToAccountSection();
      return;
    }

    const message = accountElements.userChatMessage.value.trim();

    if (!message) {
      setFeedback("Bitte zuerst eine Nachricht eingeben.", "error");
      return;
    }

    appendChatMessage(currentUser, "user", message, currentUser.name);

    if (!persistAccounts()) {
      return;
    }

    accountElements.userChatForm.reset();
    renderAccountState();
    setFeedback("Nachricht im Website-Chat gesendet.", "success");
  });
}

if (accountElements.adminChatForm) {
  accountElements.adminChatForm.addEventListener("submit", (event) => {
    event.preventDefault();

    const currentUser = getCurrentUser();

    if (!currentUser || currentUser.role !== "admin") {
      setFeedback("Nur Admins koennen hier antworten.", "error");
      return;
    }

    const targetAccount = accountState.accounts.find(
      (account) => account.email === accountState.selectedAdminChatEmail
    );

    if (!targetAccount) {
      setFeedback("Bitte zuerst ein Konto fuer den Chat auswaehlen.", "error");
      return;
    }

    const message = accountElements.adminChatMessage.value.trim();

    if (!message) {
      setFeedback("Bitte zuerst eine Antwort eingeben.", "error");
      return;
    }

    appendChatMessage(targetAccount, "admin", message, currentUser.name);

    if (!persistAccounts()) {
      return;
    }

    accountElements.adminChatForm.reset();
    renderAccountState();
    setFeedback(`Antwort an ${targetAccount.name} gesendet.`, "success");
  });
}

if (accountElements.savedOffersList) {
  accountElements.savedOffersList.addEventListener("click", (event) => {
    const button = event.target.closest("[data-remove-offer]");

    if (!button) {
      return;
    }

    const currentUser = getCurrentUser();

    if (!currentUser) {
      return;
    }

    const offerId = button.dataset.removeOffer;
    const removed = removeOfferFromUser(currentUser, offerId);

    if (!removed || !persistAccounts()) {
      return;
    }

    renderAccountState();
    setFeedback("Modell aus der Merkliste entfernt.", "success");
  });
}

saveOfferButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const offer = {
      id: button.dataset.saveOffer,
      label: button.dataset.offerLabel || "Gespeichertes Modell",
      description: button.dataset.offerDescription || ""
    };
    const currentUser = getCurrentUser();

    if (!currentUser) {
      accountState.pendingOffer = offer;
      setFeedback(`Lege ein Konto an oder melde dich an, um "${offer.label}" zu speichern.`, "info");
      scrollToAccountSection();

      if (accountElements.signupName) {
        accountElements.signupName.focus();
      }

      return;
    }

    if (currentUser.savedOffers.some((entry) => entry.id === offer.id)) {
      removeOfferFromUser(currentUser, offer.id);

      if (!persistAccounts()) {
        return;
      }

      renderAccountState();
      setFeedback(`"${offer.label}" wurde aus deiner Merkliste entfernt.`, "success");
      return;
    }

    saveOfferForUser(currentUser, offer);

    if (!persistAccounts()) {
      return;
    }

    renderAccountState();
    setFeedback(`"${offer.label}" wurde gespeichert.`, "success");
  });
});

if (accountElements.adminAccountsList) {
  accountElements.adminAccountsList.addEventListener("click", (event) => {
    const button = event.target.closest("[data-admin-action]");

    if (!button) {
      return;
    }

    const currentUser = getCurrentUser();

    if (!currentUser || currentUser.role !== "admin") {
      setFeedback("Nur Admins koennen Konten verwalten.", "error");
      return;
    }

    const targetEmail = normalizeEmail(button.dataset.accountEmail || "");
    const targetAccount = accountState.accounts.find((account) => account.email === targetEmail);

    if (!targetAccount || targetAccount.email === currentUser.email) {
      setFeedback("Dieses Konto kann nicht angepasst werden.", "error");
      return;
    }

    if (button.dataset.adminAction === "open-chat") {
      accountState.selectedAdminChatEmail = targetAccount.email;
      renderAccountState();

      if (accountElements.adminChatMessage) {
        accountElements.adminChatMessage.focus();
      }

      return;
    }

    if (button.dataset.adminAction === "toggle-role") {
      if (targetAccount.email === DEFAULT_ADMIN_ACCOUNT.email) {
        setFeedback("Das Standard-Adminkonto kann nicht geaendert werden.", "error");
        return;
      }

      targetAccount.role = targetAccount.role === "admin" ? "user" : "admin";
      targetAccount.updatedAt = new Date().toISOString();

      if (!persistAccounts()) {
        return;
      }

      renderAccountState();
      setFeedback(`${targetAccount.name} ist jetzt ${getRoleLabel(targetAccount.role)}.`, "success");
    }
  });
}

window.addEventListener("storage", (event) => {
  if (event.key && event.key !== STORAGE_KEY && event.key !== SESSION_KEY) {
    return;
  }

  accountState.accounts = loadAccounts();
  accountState.currentEmail = loadSessionEmail();
  ensureAdminAccount();
  renderAccountState();
});

if (!prefersReducedMotion.matches) {
  const revealObserver = new IntersectionObserver(
    (entries, observer) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) {
          return;
        }

        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      });
    },
    {
      threshold: 0.18,
      rootMargin: "0px 0px -8% 0px"
    }
  );

  motionElements.forEach((element) => revealObserver.observe(element));
} else {
  revealAll();
}

if (!prefersReducedMotion.matches && hasFinePointer) {
  interactiveSurfaces.forEach((surface) => {
    let pointerFrame = 0;
    let lastEvent;

    const updateGlow = (event) => {
      const rect = surface.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;

      surface.style.setProperty("--glow-x", `${x}px`);
      surface.style.setProperty("--glow-y", `${y}px`);
      surface.style.setProperty("--glow-alpha", "1");
    };

    surface.addEventListener("pointerenter", (event) => {
      updateGlow(event);
    });

    surface.addEventListener("pointermove", (event) => {
      lastEvent = event;

      if (pointerFrame) {
        return;
      }

      pointerFrame = window.requestAnimationFrame(() => {
        updateGlow(lastEvent);
        pointerFrame = 0;
      });
    });

    surface.addEventListener("pointerleave", () => {
      surface.style.setProperty("--glow-alpha", "0");
    });
  });

  if (heroVisual) {
    let heroFrame = 0;

    const setHeroShift = (xRatio, yRatio) => {
      heroVisual.style.setProperty("--hero-shift-x", `${(xRatio - 0.5) * 24}px`);
      heroVisual.style.setProperty("--hero-shift-y", `${(yRatio - 0.5) * 18}px`);
    };

    setHeroShift(0.5, 0.5);

    heroVisual.addEventListener("pointermove", (event) => {
      const rect = heroVisual.getBoundingClientRect();
      const xRatio = (event.clientX - rect.left) / rect.width;
      const yRatio = (event.clientY - rect.top) / rect.height;

      if (heroFrame) {
        window.cancelAnimationFrame(heroFrame);
      }

      heroFrame = window.requestAnimationFrame(() => {
        setHeroShift(xRatio, yRatio);
      });
    });

    heroVisual.addEventListener("pointerleave", () => {
      setHeroShift(0.5, 0.5);
    });
  }
} else if (heroVisual) {
  heroVisual.style.setProperty("--hero-shift-x", "0px");
  heroVisual.style.setProperty("--hero-shift-y", "0px");
}

prefersReducedMotion.addEventListener("change", (event) => {
  if (!event.matches) {
    return;
  }

  revealAll();

  interactiveSurfaces.forEach((surface) => {
    surface.style.setProperty("--glow-alpha", "0");
  });

  if (heroVisual) {
    heroVisual.style.setProperty("--hero-shift-x", "0px");
    heroVisual.style.setProperty("--hero-shift-y", "0px");
  }
});
