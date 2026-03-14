import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

import Database from "better-sqlite3";

import { config } from "../config.js";

const DB_DIR = path.dirname(config.chatDbPath);
const DB_ROOT = path.dirname(fileURLToPath(import.meta.url));
const schemaPath = path.join(DB_ROOT, "schema.sql");
const schemaSql = fs.readFileSync(schemaPath, "utf8");

fs.mkdirSync(DB_DIR, { recursive: true });

// This connection is intentionally dedicated to support chat data only.
const chatDb = new Database(config.chatDbPath);

chatDb.pragma("journal_mode = WAL");
chatDb.pragma("foreign_keys = ON");
chatDb.exec(schemaSql);

export default chatDb;
