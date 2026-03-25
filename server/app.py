from __future__ import annotations

import json
import secrets
from datetime import datetime, timedelta, timezone
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse


ROOT_DIR = Path(__file__).resolve().parents[1]
DB_DIR = ROOT_DIR / "server" / "db"
CHAT_STORE_PATH = DB_DIR / "chat-store.json"
ADMIN_SESSION_PATH = DB_DIR / "admin-sessions.json"
ADMIN_CREDENTIALS = {
    "name": "Daniil",
    "email": "daniil.siemens@icloud.com",
    "password": "pools.daniil",
}
ADMIN_SESSION_TTL = timedelta(days=14)


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

        if path == "/api/admin/chat/threads":
            self._handle_admin_threads()
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
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")

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

    def _handle_admin_login(self):
        payload = self._read_json_body()
        name = str(payload.get("name", "")).strip()
        email = str(payload.get("email", "")).strip().lower()
        password = str(payload.get("password", ""))
        if (
            name.casefold() != ADMIN_CREDENTIALS["name"].casefold()
            or email != ADMIN_CREDENTIALS["email"].lower()
            or password != ADMIN_CREDENTIALS["password"]
        ):
            self._send_json({"error": "Invalid admin credentials."}, status=HTTPStatus.UNAUTHORIZED)
            return

        token = create_admin_session()
        self._send_json({"token": token, "expiresInDays": ADMIN_SESSION_TTL.days})

    def _handle_admin_threads(self):
        if not self._require_admin():
            return

        store = load_chat_store()
        threads = sorted(
            store["threads"].values(),
            key=lambda thread: thread.get("updatedAt", ""),
            reverse=True,
        )
        self._send_json({"threads": threads})

    def _handle_public_thread(self, thread_id: str):
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

        store = load_chat_store()
        store["threads"][thread_id] = thread
        save_chat_store(store)
        self._send_json({"thread": thread}, status=HTTPStatus.CREATED)

    def _handle_add_public_message(self, thread_id: str):
        payload = self._read_json_body()
        store = load_chat_store()
        thread = store["threads"].get(thread_id)
        if not thread:
            self._send_json({"error": "Thread not found."}, status=HTTPStatus.NOT_FOUND)
            return

        message_text = sanitize_message(str(payload.get("message", "")))
        if len(message_text) < 2:
            self._send_json({"error": "Message is too short."}, status=HTTPStatus.BAD_REQUEST)
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
        store = load_chat_store()
        thread = store["threads"].get(thread_id)
        if not thread:
            self._send_json({"error": "Thread not found."}, status=HTTPStatus.NOT_FOUND)
            return

        reply = sanitize_message(str(payload.get("message", "")))
        if len(reply) < 2:
            self._send_json({"error": "Message is too short."}, status=HTTPStatus.BAD_REQUEST)
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


if __name__ == "__main__":
    host = "127.0.0.1"
    port = 4173
    server = ThreadingHTTPServer((host, port), HolidailyRequestHandler)
    print(f"Holidaily server running at http://{host}:{port}")
    server.serve_forever()
