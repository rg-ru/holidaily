from __future__ import annotations

import hashlib
import hmac
import json
import os
import re
import secrets
from datetime import datetime, timedelta, timezone
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import RLock
from urllib.parse import unquote, urlparse


ROOT_DIR = Path(__file__).resolve().parents[1]


def resolve_storage_path() -> Path:
    raw_path = os.getenv("HOLIDAILY_DB_DIR", "").strip()
    if not raw_path:
        return ROOT_DIR / "server" / "db"

    configured = Path(raw_path).expanduser()
    if configured.is_absolute():
        return configured

    return (ROOT_DIR / configured).resolve()


DB_DIR = resolve_storage_path()
CHAT_STORE_PATH = DB_DIR / "chat-store.json"
ADMIN_SESSION_PATH = DB_DIR / "admin-sessions.json"
ADMIN_CONTENT_PATH = DB_DIR / "admin-content.json"
USER_STORE_PATH = DB_DIR / "user-store.json"
USER_SESSION_PATH = DB_DIR / "user-sessions.json"
DEFAULT_ADMIN_CREDENTIALS = {
    "name": "Daniil",
    "email": "daniil.siemens@icloud.com",
    "password": "pools.daniil",
}
ADMIN_SESSION_TTL = timedelta(days=14)
USER_SESSION_TTL = timedelta(days=30)
PASSWORD_HASH_ITERATIONS = 200_000
MAX_ADMIN_TEXT_LENGTH = 4_000
MAX_ADMIN_IMAGE_SRC_LENGTH = 4_000_000
MAX_ADMIN_IMAGE_ALT_LENGTH = 300
DB_LOCK = RLock()


def now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def ensure_db_dir() -> None:
    DB_DIR.mkdir(parents=True, exist_ok=True)


def load_json(path: Path, default):
    if not path.exists():
        return default

    try:
        with path.open("r", encoding="utf-8") as file_handle:
            content = json.load(file_handle)
    except (OSError, json.JSONDecodeError):
        return default

    return content if isinstance(content, type(default)) else default


def save_json(path: Path, content) -> None:
    ensure_db_dir()
    with path.open("w", encoding="utf-8") as file_handle:
        json.dump(content, file_handle, ensure_ascii=False, indent=2)


def sanitize_name(value: str) -> str:
    return " ".join((value or "").split()).strip()[:40] or "Besucher"


def sanitize_message(value: str) -> str:
    return (value or "").replace("\u00A0", " ").replace("\r\n", "\n").strip()[:1200]


def create_id(prefix: str) -> str:
    return f"{prefix}_{secrets.token_hex(8)}"


def normalize_message(message: dict) -> dict | None:
    text = sanitize_message(str(message.get("text", "")))
    if len(text) < 2:
        return None

    author = "admin" if message.get("author") == "admin" else "visitor"
    created_at = message.get("createdAt")
    if not isinstance(created_at, str) or not created_at:
        created_at = now_iso()

    return {
        "id": str(message.get("id") or create_id("msg")),
        "author": author,
        "text": text,
        "createdAt": created_at,
        "readByAdmin": bool(message.get("readByAdmin")) or author == "admin",
        "readByVisitor": bool(message.get("readByVisitor")) or author == "visitor",
    }


def normalize_thread(thread_id: str, thread: dict) -> dict:
    raw_messages = thread.get("messages") if isinstance(thread.get("messages"), list) else []
    messages = []
    for raw_message in raw_messages:
        if isinstance(raw_message, dict):
            message = normalize_message(raw_message)
            if message:
                messages.append(message)
    messages.sort(key=lambda item: item.get("createdAt", ""))

    created_at = thread.get("createdAt") if isinstance(thread.get("createdAt"), str) else ""
    updated_at = thread.get("updatedAt") if isinstance(thread.get("updatedAt"), str) else ""
    if not created_at:
        created_at = messages[0]["createdAt"] if messages else now_iso()
    if not updated_at:
        updated_at = messages[-1]["createdAt"] if messages else created_at

    return {
        "id": thread_id,
        "visitorName": sanitize_name(str(thread.get("visitorName", ""))),
        "createdAt": created_at,
        "updatedAt": updated_at,
        "messages": messages,
    }


def load_chat_store() -> dict:
    raw_store = load_json(CHAT_STORE_PATH, {"threads": {}})
    raw_threads = raw_store.get("threads") if isinstance(raw_store.get("threads"), dict) else {}
    return {
        "threads": {
            str(thread_id): normalize_thread(str(thread_id), thread)
            for thread_id, thread in raw_threads.items()
            if isinstance(thread, dict)
        }
    }


def save_chat_store(store: dict) -> None:
    save_json(CHAT_STORE_PATH, store)


def load_admin_sessions() -> dict:
    sessions = load_json(ADMIN_SESSION_PATH, {})
    return sessions if isinstance(sessions, dict) else {}


def save_admin_sessions(sessions: dict) -> None:
    save_json(ADMIN_SESSION_PATH, sessions)


def create_admin_session() -> str:
    with DB_LOCK:
        sessions = load_admin_sessions()
        token = secrets.token_urlsafe(32)
        sessions[token] = {
            "expiresAt": (datetime.now(timezone.utc) + ADMIN_SESSION_TTL).isoformat(),
        }
        save_admin_sessions(sessions)
        return token


def is_valid_admin_session(token: str) -> bool:
    if not token:
        return False

    with DB_LOCK:
        sessions = load_admin_sessions()
        session = sessions.get(token)
        if not isinstance(session, dict):
            return False

        expires_at = session.get("expiresAt")
        if not isinstance(expires_at, str):
            sessions.pop(token, None)
            save_admin_sessions(sessions)
            return False

        try:
            is_expired = datetime.fromisoformat(expires_at) <= datetime.now(timezone.utc)
        except ValueError:
            is_expired = True

        if is_expired:
            sessions.pop(token, None)
            save_admin_sessions(sessions)
            return False

        return True


def get_admin_credentials() -> dict:
    return {
        "name": os.getenv("HOLIDAILY_ADMIN_NAME", DEFAULT_ADMIN_CREDENTIALS["name"]).strip(),
        "email": normalize_email(os.getenv("HOLIDAILY_ADMIN_EMAIL", DEFAULT_ADMIN_CREDENTIALS["email"])),
        "password": os.getenv("HOLIDAILY_ADMIN_PASSWORD", DEFAULT_ADMIN_CREDENTIALS["password"]),
    }


def normalize_email(value: str) -> str:
    return str(value or "").strip().lower()[:254]


def sanitize_account_name(value: str) -> str:
    return " ".join(str(value or "").split()).strip()[:80]


def sanitize_model_id(value: str) -> str:
    return re.sub(r"[\s/]+", "-", str(value or "").strip())[:120]


def sanitize_model_name(value: str) -> str:
    return " ".join(str(value or "").split()).strip()[:120]


def collapse_note_breaks(value: str) -> str:
    return re.sub(r"\n{3,}", "\n\n", value)


def sanitize_note_text(value: str) -> str:
    return collapse_note_breaks(
        str(value or "")
        .replace("\u00A0", " ")
        .replace("\r\n", "\n")
        .strip()[:1600]
    )


def sanitize_admin_text(value: str) -> str:
    return " ".join(str(value or "").replace("\u00A0", " ").split())[:MAX_ADMIN_TEXT_LENGTH]


def sanitize_admin_image_alt(value: str) -> str:
    return " ".join(str(value or "").replace("\u00A0", " ").split())[:MAX_ADMIN_IMAGE_ALT_LENGTH]


def sanitize_admin_image_src(value: str) -> str:
    raw_value = str(value or "").strip()
    return raw_value[:MAX_ADMIN_IMAGE_SRC_LENGTH]


def normalize_admin_content(content: dict | None) -> dict:
    payload = content if isinstance(content, dict) else {}
    raw_texts = payload.get("texts") if isinstance(payload.get("texts"), dict) else {}
    raw_images = payload.get("images") if isinstance(payload.get("images"), dict) else {}

    texts = {
        str(key).strip()[:120]: sanitize_admin_text(value)
        for key, value in raw_texts.items()
        if str(key).strip() and sanitize_admin_text(value)
    }
    images = {
        str(key).strip()[:120]: {
            "src": sanitize_admin_image_src(value.get("src", "")),
            "alt": sanitize_admin_image_alt(value.get("alt", "")),
        }
        for key, value in raw_images.items()
        if isinstance(value, dict) and str(key).strip()
    }

    return {
        "texts": texts,
        "images": images,
        "updatedAt": payload.get("updatedAt") if isinstance(payload.get("updatedAt"), str) else now_iso(),
    }


def create_password_hash(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, PASSWORD_HASH_ITERATIONS)
    return f"pbkdf2_sha256${PASSWORD_HASH_ITERATIONS}${salt.hex()}${digest.hex()}"


def verify_password(password: str, stored_hash: str) -> bool:
    if not password or not stored_hash:
        return False

    try:
        algorithm, raw_iterations, raw_salt, raw_digest = stored_hash.split("$", 3)
        iterations = int(raw_iterations)
        if algorithm != "pbkdf2_sha256" or iterations < 1:
            return False
        salt = bytes.fromhex(raw_salt)
        expected_digest = bytes.fromhex(raw_digest)
    except (ValueError, TypeError):
        return False

    actual_digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, iterations)
    return hmac.compare_digest(actual_digest, expected_digest)


def normalize_saved_model(model: dict) -> dict | None:
    model_id = sanitize_model_id(model.get("id", ""))
    model_name = sanitize_model_name(model.get("name", ""))
    if not model_id or not model_name:
        return None

    saved_at = model.get("savedAt")
    if not isinstance(saved_at, str) or not saved_at:
        saved_at = now_iso()

    return {
        "id": model_id,
        "name": model_name,
        "savedAt": saved_at,
    }


def normalize_note(note: dict) -> dict | None:
    note_id = str(note.get("id", "")).strip()[:120]
    note_text = sanitize_note_text(note.get("text", ""))
    if not note_id or len(note_text) < 3:
        return None

    created_at = note.get("createdAt")
    if not isinstance(created_at, str) or not created_at:
        created_at = now_iso()

    return {
        "id": note_id,
        "text": note_text,
        "createdAt": created_at,
    }


def normalize_user_record(email: str, record: dict) -> dict:
    saved_models = []
    for raw_model in record.get("savedModels", []) if isinstance(record.get("savedModels"), list) else []:
        if isinstance(raw_model, dict):
            model = normalize_saved_model(raw_model)
            if model:
                saved_models.append(model)

    notes = []
    for raw_note in record.get("notes", []) if isinstance(record.get("notes"), list) else []:
        if isinstance(raw_note, dict):
            note = normalize_note(raw_note)
            if note:
                notes.append(note)

    notes.sort(key=lambda item: item.get("createdAt", ""), reverse=True)

    created_at = record.get("createdAt") if isinstance(record.get("createdAt"), str) else ""
    updated_at = record.get("updatedAt") if isinstance(record.get("updatedAt"), str) else ""
    now_value = now_iso()
    if not created_at:
        created_at = now_value
    if not updated_at:
        updated_at = created_at

    return {
        "email": normalize_email(email),
        "name": sanitize_account_name(record.get("name", "")),
        "passwordHash": str(record.get("passwordHash", "")),
        "savedModels": saved_models,
        "notes": notes,
        "createdAt": created_at,
        "updatedAt": updated_at,
    }


def serialize_user(email: str, record: dict) -> dict:
    normalized = normalize_user_record(email, record)
    return {
        "email": normalized["email"],
        "name": normalized["name"] or normalized["email"].split("@")[0],
        "savedModels": normalized["savedModels"],
        "notes": normalized["notes"],
        "createdAt": normalized["createdAt"],
        "updatedAt": normalized["updatedAt"],
    }


def load_user_store() -> dict:
    raw_store = load_json(USER_STORE_PATH, {"accounts": {}})
    raw_accounts = raw_store.get("accounts") if isinstance(raw_store.get("accounts"), dict) else {}
    return {
        "accounts": {
            normalize_email(email): normalize_user_record(email, record)
            for email, record in raw_accounts.items()
            if isinstance(record, dict) and normalize_email(email)
        }
    }


def save_user_store(store: dict) -> None:
    save_json(USER_STORE_PATH, store)


def load_user_sessions() -> dict:
    sessions = load_json(USER_SESSION_PATH, {})
    return sessions if isinstance(sessions, dict) else {}


def save_user_sessions(sessions: dict) -> None:
    save_json(USER_SESSION_PATH, sessions)


def create_user_session(email: str) -> str:
    with DB_LOCK:
        sessions = load_user_sessions()
        token = secrets.token_urlsafe(32)
        sessions[token] = {
            "email": normalize_email(email),
            "expiresAt": (datetime.now(timezone.utc) + USER_SESSION_TTL).isoformat(),
        }
        save_user_sessions(sessions)
        return token


def revoke_user_session(token: str) -> None:
    if not token:
        return

    with DB_LOCK:
        sessions = load_user_sessions()
        if token in sessions:
            sessions.pop(token, None)
            save_user_sessions(sessions)


def resolve_user_session(token: str) -> tuple[str, dict] | None:
    if not token:
        return None

    with DB_LOCK:
        sessions = load_user_sessions()
        session = sessions.get(token)
        if not isinstance(session, dict):
            return None

        email = normalize_email(session.get("email", ""))
        expires_at = session.get("expiresAt")
        if not email or not isinstance(expires_at, str):
            sessions.pop(token, None)
            save_user_sessions(sessions)
            return None

        try:
            is_expired = datetime.fromisoformat(expires_at) <= datetime.now(timezone.utc)
        except ValueError:
            is_expired = True

        if is_expired:
            sessions.pop(token, None)
            save_user_sessions(sessions)
            return None

        store = load_user_store()
        account = store["accounts"].get(email)
        if not account:
            sessions.pop(token, None)
            save_user_sessions(sessions)
            return None

        return email, account


def load_admin_content() -> dict:
    return normalize_admin_content(load_json(ADMIN_CONTENT_PATH, {"texts": {}, "images": {}, "updatedAt": now_iso()}))


def save_admin_content(content: dict) -> dict:
    normalized = normalize_admin_content(content)
    save_json(ADMIN_CONTENT_PATH, normalized)
    return normalized


class HolidailyRequestHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT_DIR), **kwargs)

    def do_OPTIONS(self):
        self.send_response(HTTPStatus.NO_CONTENT)
        self._send_json_headers()
        self.end_headers()

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path

        if path == "/api/content":
            self._handle_public_content()
            return

        if path == "/api/admin/chat/threads":
            self._handle_admin_threads()
            return

        if path == "/api/admin/content":
            self._handle_admin_content()
            return

        if path == "/api/account/me":
            self._handle_account_me()
            return

        if path.startswith("/api/chat/threads/"):
            thread_id = path.removeprefix("/api/chat/threads/").strip("/")
            if thread_id:
                self._handle_public_thread(thread_id)
                return

        super().do_GET()

    def do_POST(self):
        parsed = urlparse(self.path)
        path = parsed.path

        if path == "/api/admin/login":
            self._handle_admin_login()
            return

        if path == "/api/admin/content":
            self._handle_save_admin_content()
            return

        if path == "/api/account/register":
            self._handle_account_register()
            return

        if path == "/api/account/login":
            self._handle_account_login()
            return

        if path == "/api/account/logout":
            self._handle_account_logout()
            return

        if path == "/api/account/saved-models/toggle":
            self._handle_account_toggle_saved_model()
            return

        if path == "/api/account/notes":
            self._handle_account_add_note()
            return

        if path == "/api/chat/threads":
            self._handle_create_thread()
            return

        if path.startswith("/api/chat/threads/") and path.endswith("/messages"):
            thread_id = path.removeprefix("/api/chat/threads/").removesuffix("/messages").strip("/")
            self._handle_add_public_message(thread_id)
            return

        if path.startswith("/api/chat/threads/") and path.endswith("/read"):
            thread_id = path.removeprefix("/api/chat/threads/").removesuffix("/read").strip("/")
            self._handle_mark_read(thread_id, viewer="visitor")
            return

        if path.startswith("/api/admin/chat/threads/") and path.endswith("/messages"):
            thread_id = path.removeprefix("/api/admin/chat/threads/").removesuffix("/messages").strip("/")
            self._handle_add_admin_message(thread_id)
            return

        if path.startswith("/api/admin/chat/threads/") and path.endswith("/read"):
            thread_id = path.removeprefix("/api/admin/chat/threads/").removesuffix("/read").strip("/")
            self._handle_mark_read(thread_id, viewer="admin")
            return

        self._send_json({"error": "Not found."}, status=HTTPStatus.NOT_FOUND)

    def do_DELETE(self):
        parsed = urlparse(self.path)
        path = parsed.path

        if path == "/api/admin/content":
            self._handle_reset_admin_content()
            return

        if path.startswith("/api/account/notes/"):
            note_id = unquote(path.removeprefix("/api/account/notes/")).strip("/")
            self._handle_account_delete_note(note_id)
            return

        self._send_json({"error": "Not found."}, status=HTTPStatus.NOT_FOUND)

    def _read_json_body(self) -> dict:
        try:
            content_length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            content_length = 0

        raw_body = self.rfile.read(content_length) if content_length > 0 else b"{}"
        try:
            payload = json.loads(raw_body.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError):
            payload = {}
        return payload if isinstance(payload, dict) else {}

    def _send_json_headers(self):
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")

    def _send_json(self, payload: dict, status: HTTPStatus = HTTPStatus.OK):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self._send_json_headers()
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _bearer_token(self) -> str:
        authorization = self.headers.get("Authorization", "")
        prefix = "Bearer "
        return authorization[len(prefix):].strip() if authorization.startswith(prefix) else ""

    def _require_admin(self) -> bool:
        if is_valid_admin_session(self._bearer_token()):
            return True
        self._send_json({"error": "Admin authentication is required."}, status=HTTPStatus.UNAUTHORIZED)
        return False

    def _require_user(self) -> tuple[str, dict] | None:
        session = resolve_user_session(self._bearer_token())
        if session:
            return session

        self._send_json({"error": "User authentication is required."}, status=HTTPStatus.UNAUTHORIZED)
        return None

    def _handle_admin_login(self):
        payload = self._read_json_body()
        credentials = get_admin_credentials()
        name = str(payload.get("name", "")).strip()
        email = str(payload.get("email", "")).strip().lower()
        password = str(payload.get("password", ""))
        if (
            name.casefold() != credentials["name"].casefold()
            or email != credentials["email"]
            or password != credentials["password"]
        ):
            self._send_json({"error": "Invalid admin credentials."}, status=HTTPStatus.UNAUTHORIZED)
            return

        token = create_admin_session()
        self._send_json({"token": token, "expiresInDays": ADMIN_SESSION_TTL.days})

    def _handle_public_content(self):
        with DB_LOCK:
            content = load_admin_content()
        self._send_json({"content": content})

    def _handle_admin_content(self):
        if not self._require_admin():
            return

        with DB_LOCK:
            content = load_admin_content()
        self._send_json({"content": content})

    def _handle_save_admin_content(self):
        if not self._require_admin():
            return

        payload = self._read_json_body()
        content = payload.get("content") if isinstance(payload.get("content"), dict) else payload

        with DB_LOCK:
            saved_content = save_admin_content(
                {
                    "texts": content.get("texts", {}) if isinstance(content, dict) else {},
                    "images": content.get("images", {}) if isinstance(content, dict) else {},
                    "updatedAt": now_iso(),
                }
            )

        self._send_json({"content": saved_content})

    def _handle_reset_admin_content(self):
        if not self._require_admin():
            return

        with DB_LOCK:
            saved_content = save_admin_content({"texts": {}, "images": {}, "updatedAt": now_iso()})

        self._send_json({"content": saved_content})

    def _handle_admin_threads(self):
        if not self._require_admin():
            return

        with DB_LOCK:
            store = load_chat_store()
            threads = sorted(
                store["threads"].values(),
                key=lambda thread: thread.get("updatedAt", ""),
                reverse=True,
            )
        self._send_json({"threads": threads})

    def _handle_public_thread(self, thread_id: str):
        with DB_LOCK:
            store = load_chat_store()
            thread = store["threads"].get(thread_id)
        if not thread:
            self._send_json({"error": "Thread not found."}, status=HTTPStatus.NOT_FOUND)
            return

        self._send_json({"thread": thread})

    def _handle_create_thread(self):
        payload = self._read_json_body()
        visitor_name = sanitize_name(str(payload.get("visitorName", "")))
        message_text = sanitize_message(str(payload.get("message", "")))
        if len(message_text) < 2:
            self._send_json({"error": "Message is too short."}, status=HTTPStatus.BAD_REQUEST)
            return

        sent_at = now_iso()
        thread_id = create_id("thread")
        message = {
            "id": create_id("msg"),
            "author": "visitor",
            "text": message_text,
            "createdAt": sent_at,
            "readByAdmin": False,
            "readByVisitor": True,
        }
        thread = {
            "id": thread_id,
            "visitorName": visitor_name,
            "createdAt": sent_at,
            "updatedAt": sent_at,
            "messages": [message],
        }

        with DB_LOCK:
            store = load_chat_store()
            store["threads"][thread_id] = thread
            save_chat_store(store)
        self._send_json({"thread": thread}, status=HTTPStatus.CREATED)

    def _handle_add_public_message(self, thread_id: str):
        payload = self._read_json_body()
        message_text = sanitize_message(str(payload.get("message", "")))
        if len(message_text) < 2:
            self._send_json({"error": "Message is too short."}, status=HTTPStatus.BAD_REQUEST)
            return

        with DB_LOCK:
            store = load_chat_store()
            thread = store["threads"].get(thread_id)
            if not thread:
                self._send_json({"error": "Thread not found."}, status=HTTPStatus.NOT_FOUND)
                return

            visitor_name = sanitize_name(str(payload.get("visitorName", thread.get("visitorName", "Besucher"))))
            sent_at = now_iso()
            thread["visitorName"] = visitor_name
            thread["updatedAt"] = sent_at
            thread["messages"].append(
                {
                    "id": create_id("msg"),
                    "author": "visitor",
                    "text": message_text,
                    "createdAt": sent_at,
                    "readByAdmin": False,
                    "readByVisitor": True,
                }
            )
            save_chat_store(store)

        self._send_json({"thread": thread})

    def _handle_add_admin_message(self, thread_id: str):
        if not self._require_admin():
            return

        payload = self._read_json_body()
        reply = sanitize_message(str(payload.get("message", "")))
        if len(reply) < 2:
            self._send_json({"error": "Message is too short."}, status=HTTPStatus.BAD_REQUEST)
            return

        with DB_LOCK:
            store = load_chat_store()
            thread = store["threads"].get(thread_id)
            if not thread:
                self._send_json({"error": "Thread not found."}, status=HTTPStatus.NOT_FOUND)
                return

            sent_at = now_iso()
            thread["updatedAt"] = sent_at
            thread["messages"].append(
                {
                    "id": create_id("msg"),
                    "author": "admin",
                    "text": reply,
                    "createdAt": sent_at,
                    "readByAdmin": True,
                    "readByVisitor": False,
                }
            )
            save_chat_store(store)

        self._send_json({"thread": thread})

    def _handle_mark_read(self, thread_id: str, viewer: str):
        if viewer == "admin" and not self._require_admin():
            return

        with DB_LOCK:
            store = load_chat_store()
            thread = store["threads"].get(thread_id)
            if not thread:
                self._send_json({"error": "Thread not found."}, status=HTTPStatus.NOT_FOUND)
                return

            did_change = False
            for message in thread["messages"]:
                if viewer == "admin" and message["author"] == "visitor" and not message["readByAdmin"]:
                    message["readByAdmin"] = True
                    did_change = True
                if viewer == "visitor" and message["author"] == "admin" and not message["readByVisitor"]:
                    message["readByVisitor"] = True
                    did_change = True

            if did_change:
                save_chat_store(store)

        self._send_json({"thread": thread, "updated": did_change})

    def _handle_account_me(self):
        session = self._require_user()
        if not session:
            return

        email, user_record = session
        self._send_json({"user": serialize_user(email, user_record)})

    def _handle_account_register(self):
        payload = self._read_json_body()
        email = normalize_email(payload.get("email", ""))
        password = str(payload.get("password", ""))
        name = sanitize_account_name(payload.get("name", ""))

        if not email or "@" not in email:
            self._send_json({"error": "Bitte gib eine gültige E-Mail-Adresse ein."}, status=HTTPStatus.BAD_REQUEST)
            return

        if len(password) < 6:
            self._send_json({"error": "Das Passwort muss mindestens 6 Zeichen lang sein."}, status=HTTPStatus.BAD_REQUEST)
            return

        with DB_LOCK:
            store = load_user_store()
            if email in store["accounts"]:
                self._send_json(
                    {"error": "Zu dieser E-Mail gibt es bereits ein Konto. Bitte logge dich ein."},
                    status=HTTPStatus.CONFLICT,
                )
                return

            created_at = now_iso()
            store["accounts"][email] = {
                "email": email,
                "name": name or email.split("@")[0],
                "passwordHash": create_password_hash(password),
                "savedModels": [],
                "notes": [],
                "createdAt": created_at,
                "updatedAt": created_at,
            }
            save_user_store(store)
            token = create_user_session(email)
            user = serialize_user(email, store["accounts"][email])

        self._send_json({"token": token, "user": user}, status=HTTPStatus.CREATED)

    def _handle_account_login(self):
        payload = self._read_json_body()
        email = normalize_email(payload.get("email", ""))
        password = str(payload.get("password", ""))

        if not email or "@" not in email:
            self._send_json({"error": "Bitte gib eine gültige E-Mail-Adresse ein."}, status=HTTPStatus.BAD_REQUEST)
            return

        with DB_LOCK:
            store = load_user_store()
            user_record = store["accounts"].get(email)
            if not user_record:
                self._send_json(
                    {"error": "Kein Konto zu dieser E-Mail gefunden. Bitte zuerst registrieren."},
                    status=HTTPStatus.NOT_FOUND,
                )
                return

            if not verify_password(password, str(user_record.get("passwordHash", ""))):
                self._send_json(
                    {"error": "Das Passwort passt nicht zu diesem Konto."},
                    status=HTTPStatus.UNAUTHORIZED,
                )
                return

            token = create_user_session(email)
            user = serialize_user(email, user_record)

        self._send_json({"token": token, "user": user})

    def _handle_account_logout(self):
        revoke_user_session(self._bearer_token())
        self._send_json({"success": True})

    def _handle_account_toggle_saved_model(self):
        session = self._require_user()
        if not session:
            return

        email, _ = session
        payload = self._read_json_body()
        model = normalize_saved_model(
            {
                "id": payload.get("id", ""),
                "name": payload.get("name", ""),
                "savedAt": now_iso(),
            }
        )
        if not model:
            self._send_json({"error": "Ungültiges Modell."}, status=HTTPStatus.BAD_REQUEST)
            return

        with DB_LOCK:
            store = load_user_store()
            user_record = store["accounts"].get(email)
            if not user_record:
                self._send_json({"error": "Konto nicht gefunden."}, status=HTTPStatus.NOT_FOUND)
                return

            saved_models = list(user_record.get("savedModels", []))
            existing_index = next((index for index, entry in enumerate(saved_models) if entry.get("id") == model["id"]), -1)
            did_save = existing_index == -1

            if did_save:
                saved_models.append(model)
            else:
                saved_models.pop(existing_index)

            user_record["savedModels"] = saved_models
            user_record["updatedAt"] = now_iso()
            store["accounts"][email] = normalize_user_record(email, user_record)
            save_user_store(store)
            user = serialize_user(email, store["accounts"][email])

        self._send_json({"saved": did_save, "user": user})

    def _handle_account_add_note(self):
        session = self._require_user()
        if not session:
            return

        email, _ = session
        payload = self._read_json_body()
        note = normalize_note(
            {
                "id": payload.get("id") or create_id("note"),
                "text": payload.get("text", ""),
                "createdAt": now_iso(),
            }
        )
        if not note:
            self._send_json(
                {"error": "Bitte schreibe eine etwas aussagekräftigere Notiz."},
                status=HTTPStatus.BAD_REQUEST,
            )
            return

        with DB_LOCK:
            store = load_user_store()
            user_record = store["accounts"].get(email)
            if not user_record:
                self._send_json({"error": "Konto nicht gefunden."}, status=HTTPStatus.NOT_FOUND)
                return

            notes = [note] + list(user_record.get("notes", []))
            user_record["notes"] = notes
            user_record["updatedAt"] = now_iso()
            store["accounts"][email] = normalize_user_record(email, user_record)
            save_user_store(store)
            user = serialize_user(email, store["accounts"][email])

        self._send_json({"user": user}, status=HTTPStatus.CREATED)

    def _handle_account_delete_note(self, note_id: str):
        session = self._require_user()
        if not session:
            return

        email, _ = session
        normalized_note_id = str(note_id or "").strip()[:120]
        if not normalized_note_id:
            self._send_json({"error": "Ungültige Notiz."}, status=HTTPStatus.BAD_REQUEST)
            return

        with DB_LOCK:
            store = load_user_store()
            user_record = store["accounts"].get(email)
            if not user_record:
                self._send_json({"error": "Konto nicht gefunden."}, status=HTTPStatus.NOT_FOUND)
                return

            notes = list(user_record.get("notes", []))
            next_notes = [note for note in notes if note.get("id") != normalized_note_id]
            if len(next_notes) == len(notes):
                self._send_json({"error": "Notiz nicht gefunden."}, status=HTTPStatus.NOT_FOUND)
                return

            user_record["notes"] = next_notes
            user_record["updatedAt"] = now_iso()
            store["accounts"][email] = normalize_user_record(email, user_record)
            save_user_store(store)
            user = serialize_user(email, store["accounts"][email])

        self._send_json({"user": user})


if __name__ == "__main__":
    host = os.getenv("HOST", "127.0.0.1")
    port = int(os.getenv("PORT", "4173"))
    server = ThreadingHTTPServer((host, port), HolidailyRequestHandler)
    print(f"Holidaily server running at http://{host}:{port}")
    server.serve_forever()
