import chatDb from "../db/chat-db.js";
import {
  createIdentifier,
  createPublicConversationToken,
  hashValue
} from "../utils/crypto.js";
import { HttpError } from "../utils/http-error.js";
import {
  validateConversationId,
  validateConversationStatus,
  validateMessageBody,
  validateOptionalEmail,
  validateOptionalName,
  validateSearchTerm
} from "../utils/validation.js";

const mapConversationRow = (row) => ({
  id: row.id,
  customerName: row.customer_name || "",
  customerEmail: row.customer_email || "",
  status: row.status,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  lastMessageAt: row.last_message_at,
  lastAdminReplyAt: row.last_admin_reply_at || "",
  closedAt: row.closed_at || ""
});

const mapMessageRow = (row) => ({
  id: row.id,
  senderType: row.sender_type,
  senderName: row.sender_name,
  senderEmail: row.sender_email || "",
  body: row.body,
  createdAt: row.created_at
});

const getConversationRowById = chatDb.prepare(
  `SELECT *
   FROM chat_conversations
   WHERE id = ?`
);

const getConversationRowByIdAndToken = chatDb.prepare(
  `SELECT *
   FROM chat_conversations
   WHERE id = ?
     AND public_token_hash = ?`
);

const getMessageRowsByConversationId = chatDb.prepare(
  `SELECT *
   FROM chat_messages
   WHERE conversation_id = ?
   ORDER BY created_at ASC`
);

const insertConversation = chatDb.prepare(
  `INSERT INTO chat_conversations (
     id,
     public_token_hash,
     customer_name,
     customer_email,
     status,
     created_at,
     updated_at,
     last_message_at,
     last_admin_reply_at,
     closed_at,
     ip_hash,
     user_agent
   ) VALUES (
     @id,
     @publicTokenHash,
     @customerName,
     @customerEmail,
     @status,
     @createdAt,
     @updatedAt,
     @lastMessageAt,
     NULL,
     NULL,
     @ipHash,
     @userAgent
   )`
);

const insertMessage = chatDb.prepare(
  `INSERT INTO chat_messages (
     id,
     conversation_id,
     sender_type,
     sender_name,
     sender_email,
     body,
     created_at
   ) VALUES (
     @id,
     @conversationId,
     @senderType,
     @senderName,
     @senderEmail,
     @body,
     @createdAt
   )`
);

const updateConversationAfterUserMessage = chatDb.prepare(
  `UPDATE chat_conversations
   SET customer_name = @customerName,
       customer_email = @customerEmail,
       status = 'open',
       updated_at = @updatedAt,
       last_message_at = @lastMessageAt,
       closed_at = NULL
   WHERE id = @id`
);

const updateConversationAfterAdminMessage = chatDb.prepare(
  `UPDATE chat_conversations
   SET status = 'answered',
       updated_at = @updatedAt,
       last_message_at = @lastMessageAt,
       last_admin_reply_at = @lastAdminReplyAt,
       closed_at = NULL
   WHERE id = @id`
);

const updateConversationStatusStatement = chatDb.prepare(
  `UPDATE chat_conversations
   SET status = @status,
       updated_at = @updatedAt,
       closed_at = @closedAt
   WHERE id = @id`
);

const deleteConversationStatement = chatDb.prepare(
  `DELETE FROM chat_conversations
   WHERE id = ?`
);

const getStatsStatement = chatDb.prepare(
  `SELECT
     COUNT(*) AS total_count,
     SUM(CASE WHEN status = 'open' THEN 1 ELSE 0 END) AS open_count,
     SUM(CASE WHEN status = 'answered' THEN 1 ELSE 0 END) AS answered_count,
     SUM(CASE WHEN status = 'closed' THEN 1 ELSE 0 END) AS closed_count
   FROM chat_conversations`
);

const createConversationWithFirstMessage = chatDb.transaction(
  ({ conversationRow, messageRow }) => {
    insertConversation.run(conversationRow);
    insertMessage.run(messageRow);
  }
);

const addMessageToConversation = chatDb.transaction(
  ({ updateRow, messageRow, isAdminMessage }) => {
    insertMessage.run(messageRow);

    if (isAdminMessage) {
      updateConversationAfterAdminMessage.run(updateRow);
    } else {
      updateConversationAfterUserMessage.run(updateRow);
    }
  }
);

const loadConversationOrThrow = (conversationId) => {
  const row = getConversationRowById.get(validateConversationId(conversationId));

  if (!row) {
    throw new HttpError(404, "Konversation nicht gefunden.");
  }

  return row;
};

const loadPublicConversationOrThrow = (conversationId, conversationToken) => {
  const row = getConversationRowByIdAndToken.get(
    validateConversationId(conversationId),
    hashValue(conversationToken)
  );

  if (!row) {
    throw new HttpError(404, "Konversation nicht gefunden.");
  }

  return row;
};

const buildConversationPayload = (conversationRow) => ({
  ...mapConversationRow(conversationRow),
  messages: getMessageRowsByConversationId
    .all(conversationRow.id)
    .map((row) => mapMessageRow(row))
});

export const createConversation = ({ name, email, message, ipAddress, userAgent }) => {
  const customerName = validateOptionalName(name);
  const customerEmail = validateOptionalEmail(email);
  const messageBody = validateMessageBody(message);
  const now = new Date().toISOString();
  const conversationId = createIdentifier();
  const conversationToken = createPublicConversationToken();

  // The raw public token only goes back to the browser; the DB stores a hash.
  createConversationWithFirstMessage({
    conversationRow: {
      id: conversationId,
      publicTokenHash: hashValue(conversationToken),
      customerName,
      customerEmail,
      status: "open",
      createdAt: now,
      updatedAt: now,
      lastMessageAt: now,
      ipHash: ipAddress ? hashValue(ipAddress) : "",
      userAgent: String(userAgent || "").slice(0, 255)
    },
    messageRow: {
      id: createIdentifier(),
      conversationId,
      senderType: "user",
      senderName: customerName || "Website-Besucher",
      senderEmail: customerEmail,
      body: messageBody,
      createdAt: now
    }
  });

  return {
    conversation: buildConversationPayload(loadConversationOrThrow(conversationId)),
    conversationToken
  };
};

export const getPublicConversation = ({ conversationId, conversationToken }) =>
  buildConversationPayload(loadPublicConversationOrThrow(conversationId, conversationToken));

export const addPublicMessage = ({ conversationId, conversationToken, name, email, message }) => {
  const existingConversation = loadPublicConversationOrThrow(conversationId, conversationToken);
  const customerName = validateOptionalName(name) || existingConversation.customer_name || "";
  const customerEmail = validateOptionalEmail(email) || existingConversation.customer_email || "";
  const messageBody = validateMessageBody(message);
  const now = new Date().toISOString();

  addMessageToConversation({
    isAdminMessage: false,
    updateRow: {
      id: existingConversation.id,
      customerName,
      customerEmail,
      updatedAt: now,
      lastMessageAt: now
    },
    messageRow: {
      id: createIdentifier(),
      conversationId: existingConversation.id,
      senderType: "user",
      senderName: customerName || "Website-Besucher",
      senderEmail: customerEmail,
      body: messageBody,
      createdAt: now
    }
  });

  return buildConversationPayload(loadConversationOrThrow(existingConversation.id));
};

export const listAdminConversations = ({ status = "", search = "" }) => {
  const normalizedSearch = validateSearchTerm(search);
  const normalizedStatus = status ? validateConversationStatus(status) : "";
  const params = {};
  let sql = `
    SELECT
      c.*,
      (
        SELECT body
        FROM chat_messages AS m
        WHERE m.conversation_id = c.id
        ORDER BY m.created_at DESC
        LIMIT 1
      ) AS last_message_preview,
      (
        SELECT sender_type
        FROM chat_messages AS m
        WHERE m.conversation_id = c.id
        ORDER BY m.created_at DESC
        LIMIT 1
      ) AS last_sender_type,
      (
        SELECT COUNT(*)
        FROM chat_messages AS m
        WHERE m.conversation_id = c.id
      ) AS message_count
    FROM chat_conversations AS c
    WHERE 1 = 1
  `;

  if (normalizedStatus) {
    sql += " AND c.status = @status";
    params.status = normalizedStatus;
  }

  if (normalizedSearch) {
    sql += `
      AND (
        c.id LIKE @search
        OR c.customer_name LIKE @search
        OR c.customer_email LIKE @search
      )
    `;
    params.search = `%${normalizedSearch}%`;
  }

  sql += " ORDER BY CASE WHEN c.status = 'open' THEN 0 ELSE 1 END, c.last_message_at DESC LIMIT 200";

  const statsRow = getStatsStatement.get() || {};
  const rows = chatDb.prepare(sql).all(params);

  return {
    stats: {
      total: Number(statsRow.total_count || 0),
      open: Number(statsRow.open_count || 0),
      answered: Number(statsRow.answered_count || 0),
      closed: Number(statsRow.closed_count || 0)
    },
    conversations: rows.map((row) => ({
      ...mapConversationRow(row),
      messageCount: Number(row.message_count || 0),
      lastMessagePreview: row.last_message_preview || "",
      lastSenderType: row.last_sender_type || ""
    }))
  };
};

export const getAdminConversation = (conversationId) =>
  buildConversationPayload(loadConversationOrThrow(conversationId));

export const addAdminMessage = ({ conversationId, adminUser, message }) => {
  const existingConversation = loadConversationOrThrow(conversationId);
  const messageBody = validateMessageBody(message);
  const now = new Date().toISOString();

  addMessageToConversation({
    isAdminMessage: true,
    updateRow: {
      id: existingConversation.id,
      updatedAt: now,
      lastMessageAt: now,
      lastAdminReplyAt: now
    },
    messageRow: {
      id: createIdentifier(),
      conversationId: existingConversation.id,
      senderType: "admin",
      senderName: adminUser.name || adminUser.email,
      senderEmail: adminUser.email,
      body: messageBody,
      createdAt: now
    }
  });

  return buildConversationPayload(loadConversationOrThrow(existingConversation.id));
};

export const updateConversationStatus = ({ conversationId, status }) => {
  const existingConversation = loadConversationOrThrow(conversationId);
  const normalizedStatus = validateConversationStatus(status);
  const now = new Date().toISOString();

  updateConversationStatusStatement.run({
    id: existingConversation.id,
    status: normalizedStatus,
    updatedAt: now,
    closedAt: normalizedStatus === "closed" ? now : null
  });

  return buildConversationPayload(loadConversationOrThrow(existingConversation.id));
};

export const deleteConversation = (conversationId) => {
  const deletedRow = deleteConversationStatement.run(validateConversationId(conversationId));

  if (!deletedRow.changes) {
    throw new HttpError(404, "Konversation nicht gefunden.");
  }
};
