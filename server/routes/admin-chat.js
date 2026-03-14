import { Router } from "express";
import rateLimit from "express-rate-limit";

import {
  clearAdminSession,
  issueAdminSession,
  readAdminFromRequest,
  requireAdmin,
  verifyAdminLogin
} from "../middleware/admin-auth.js";
import {
  addAdminMessage,
  deleteConversation,
  getAdminConversation,
  listAdminConversations,
  updateConversationStatus
} from "../services/chat-service.js";
import { HttpError } from "../utils/http-error.js";
import { validateAdminCredentials } from "../utils/validation.js";

const router = Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: {
    error: {
      message: "Zu viele Login-Versuche. Bitte spaeter erneut versuchen."
    }
  }
});

router.post("/auth/login", loginLimiter, (req, res) => {
  const credentials = validateAdminCredentials(req.body);
  const adminUser = verifyAdminLogin(credentials);

  if (!adminUser) {
    throw new HttpError(401, "Die Admin-Anmeldedaten sind ungueltig.");
  }

  issueAdminSession(res, adminUser);
  res.json({ adminUser });
});

router.get("/auth/session", (req, res) => {
  const adminUser = readAdminFromRequest(req);

  if (!adminUser) {
    return res.status(401).json({
      error: {
        message: "Keine aktive Admin-Sitzung."
      }
    });
  }

  return res.json({ adminUser });
});

router.post("/auth/logout", (req, res) => {
  clearAdminSession(res);
  res.status(204).send();
});

router.get("/conversations", requireAdmin, (req, res) => {
  const payload = listAdminConversations({
    status: String(req.query.status || ""),
    search: String(req.query.search || "")
  });

  res.json(payload);
});

router.get("/conversations/:conversationId", requireAdmin, (req, res) => {
  const conversation = getAdminConversation(req.params.conversationId);
  res.json({ conversation });
});

router.post("/conversations/:conversationId/messages", requireAdmin, (req, res) => {
  const conversation = addAdminMessage({
    conversationId: req.params.conversationId,
    adminUser: req.adminUser,
    message: req.body?.message
  });

  res.status(201).json({ conversation });
});

router.patch("/conversations/:conversationId/status", requireAdmin, (req, res) => {
  const conversation = updateConversationStatus({
    conversationId: req.params.conversationId,
    status: req.body?.status
  });

  res.json({ conversation });
});

router.delete("/conversations/:conversationId", requireAdmin, (req, res) => {
  deleteConversation(req.params.conversationId);
  res.status(204).send();
});

export default router;
