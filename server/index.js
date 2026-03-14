import express from "express";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import path from "path";

import { config } from "./config.js";
import "./db/chat-db.js";
import { errorHandler, notFoundHandler } from "./middleware/error-handler.js";
import adminChatRouter from "./routes/admin-chat.js";
import publicChatRouter from "./routes/public-chat.js";

const app = express();

if (config.trustProxy) {
  app.set("trust proxy", 1);
}

app.disable("x-powered-by");

app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false
  })
);
app.use(cookieParser());
app.use(express.json({ limit: "20kb" }));
app.use(express.urlencoded({ extended: false, limit: "20kb" }));

app.use("/api/chat", publicChatRouter);
app.use("/api/admin", adminChatRouter);

app.use(
  "/assets",
  express.static(path.join(config.projectRoot, "assets"), {
    index: false,
    maxAge: config.isProduction ? "7d" : 0
  })
);
app.use(
  "/admin",
  express.static(path.join(config.projectRoot, "admin"), {
    index: false,
    maxAge: config.isProduction ? "1h" : 0
  })
);

["styles.css", "app.js", "support-chat.js"].forEach((fileName) => {
  app.get(`/${fileName}`, (req, res) => {
    res.sendFile(path.join(config.projectRoot, fileName));
  });
});

app.get("/", (req, res) => {
  res.sendFile(path.join(config.projectRoot, "index.html"));
});

app.get("/index.html", (req, res) => {
  res.sendFile(path.join(config.projectRoot, "index.html"));
});

app.get("/admin", (req, res) => {
  res.redirect(302, "/admin/");
});

app.get("/admin/", (req, res) => {
  res.sendFile(path.join(config.projectRoot, "admin", "index.html"));
});

app.get("/health", (req, res) => {
  res.json({
    ok: true
  });
});

app.use(notFoundHandler);
app.use(errorHandler);

app.listen(config.port, () => {
  console.log(
    `holidaily support server listening on http://localhost:${config.port} with chat DB ${config.chatDbPath}`
  );
});
