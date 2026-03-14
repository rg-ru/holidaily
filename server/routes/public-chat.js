import { Router } from "express";
import rateLimit from "express-rate-limit";

import {
  addPublicMessage,
  createConversation,
  getPublicConversation
} from "../services/chat-service.js";
import { HttpError } from "../utils/http-error.js";

const router = Router();

const createLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 12,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: {
      message: "Zu viele neue Support-Anfragen. Bitte spaeter erneut versuchen."
    }
  }
});

const messageLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 40,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: {
      message: "Zu viele Nachrichten in kurzer Zeit. Bitte kurz warten."
    }
  }
});

const readConversationToken = (req) => {
  const headerToken = String(req.get("x-conversation-token") || "").trim();
  const bodyToken = String(req.body?.conversationToken || "").trim();
  const token = headerToken || bodyToken;

  if (!token) {
    throw new HttpError(401, "Der Konversations-Token fehlt.");
  }

  return token;
};

router.post("/conversations", createLimiter, (req, res) => {
  const result = createConversation({
    name: req.body?.name,
    email: req.body?.email,
    message: req.body?.message,
    ipAddress: req.ip,
    userAgent: req.get("user-agent")
  });

  res.status(201).json(result);
});

router.get("/conversations/:conversationId", messageLimiter, (req, res) => {
  const conversation = getPublicConversation({
    conversationId: req.params.conversationId,
    conversationToken: readConversationToken(req)
  });

  res.json({ conversation });
});

router.post("/conversations/:conversationId/messages", messageLimiter, (req, res) => {
  const conversation = addPublicMessage({
    conversationId: req.params.conversationId,
    conversationToken: readConversationToken(req),
    name: req.body?.name,
    email: req.body?.email,
    message: req.body?.message
  });

  res.status(201).json({ conversation });
});

export default router;
