from flask import Flask, request, jsonify, send_from_directory, session, redirect, url_for, render_template_string
from werkzeug.utils import secure_filename
from datetime import datetime, timedelta
from pymongo import MongoClient, ASCENDING
import os, hashlib, requests
from pytz import timezone

# ---------- CONFIG ----------
MONGO_URL = os.environ.get("MONGO_URL", "mongodb+srv://test:test@cluster0.febvpxf.mongodb.net/?retryWrites=true&w=majority")
DB_NAME = os.environ.get("DB_NAME", "ai_ds_chatbot")
UPLOADS_DIR = os.environ.get("UPLOADS_DIR", os.path.join(os.path.dirname(__file__), "uploads"))
ALLOWED_IMAGE = {"png","jpg","jpeg","gif","webp"}
ALLOWED_VIDEO = {"mp4","webm","ogg","mov","mkv"}
ALLOWED_MODEL = {"mp4","webm","mov","mkv"}  # 3D model videos

# Hardcoded accounts
ACCOUNTS = {
    "HOD": "hod123",
    "Developer": "dev123",
    "Admin": "admin123",
}

# Flask app
app = Flask(
    __name__,
    static_folder=os.path.join(os.path.dirname(__file__), '../frontend/static'),
    template_folder=os.path.join(os.path.dirname(__file__), '../frontend')
)
app.secret_key = os.environ.get("SECRET_KEY", "dev-secret-key-change-me")

# Mongo
client = MongoClient(MONGO_URL)
db = client[DB_NAME]
media_col = db["media"]          # {type: image|video|model, filename, caption, created_at}
settings_col = db["settings"]    # singleton: {default_language, slider_interval_ms, welcome_message}
auth_col = db["authuser"]            # per-device attempts: {fingerprint, failed_count, blocked_until}

# Indexes
media_col.create_index([("type", ASCENDING), ("created_at", ASCENDING)])
auth_col.create_index([("fingerprint", ASCENDING)], unique=True)

# Set timezone to Asia/Kolkata
def current_time():
    return datetime.now(timezone('Asia/Kolkata'))

# ---------- Helper utils ----------
def file_ext(filename):
    return filename.rsplit(".",1)[-1].lower() if "." in filename else ""

def allowed_for(kind, ext):
    if kind == "image": return ext in ALLOWED_IMAGE
    if kind == "video": return ext in ALLOWED_VIDEO
    if kind == "model": return ext in ALLOWED_MODEL
    return False

def device_fingerprint():
    ua = request.headers.get("User-Agent", "na")
    ip = request.headers.get("X-Forwarded-For", request.remote_addr or "0.0.0.0").split(",")[0].strip()
    raw = f"{ip}::{ua}"
    return hashlib.sha256(raw.encode()).hexdigest()

def require_login(fn):
    from functools import wraps
    @wraps(fn)
    def wrapper(*args, **kwargs):
        if not session.get("user"):
            return redirect(url_for("admin_login_page"))
        return fn(*args, **kwargs)
    return wrapper

# ---------- Default settings seed ----------
if not settings_col.find_one({}):
    settings_col.insert_one({
        "default_language": "en",
        "slider_interval_ms": 7000,
        "welcome_message": "Hello! Welcome to the Department of Artificial Intelligence & Data Science. How can I help you today?",
        "created_at": current_time()
    })

# ---------- Public site ----------
DEPARTMENT_INFO = """Amrutvahini College of Engineering - Artificial Intelligence & Data Science Department.
Courses: BE AI & Data Science. Labs: Software Lab, AI Lab, Software Lab 2.
Activities: Hackathons, workshops, student projects.
Head Of Department: Professor. Panhalkar and guides.
Your developer is Sanchit"""

@app.route('/')
def index():
    try:
        return send_from_directory(os.path.join(os.path.dirname(__file__), '../frontend'), 'index.html')
    except Exception as e:
        app.logger.error(f"Error serving index.html: {e}")
        return "Error serving index.html", 500

@app.route('/static/<path:path>')
def static_proxy(path):
    return send_from_directory(app.static_folder, path)

@app.route('/uploads/<kind>/<path:filename>')
def serve_upload(kind, filename):
    app.logger.info(f"Requested kind: {kind}, filename: {filename}")
    # Map plural forms to singular types
    kind_map = {
        'images': 'image',
        'videos': 'video',
        'models': 'model'
    }
    kind = kind_map.get(kind, kind)  # Convert plural to singular if needed

    if kind not in ['image', 'video', 'model']:
        app.logger.error(f"Invalid upload type: {kind}")
        return jsonify({'error': 'Invalid upload type'}), 400

    file_path = os.path.join(UPLOADS_DIR, f"{kind}s", filename)
    if not os.path.exists(file_path):
        app.logger.error(f"File not found: {file_path}")
        return "File not found", 404

    return send_from_directory(os.path.join(UPLOADS_DIR, f"{kind}s"), filename)

@app.route('/api/settings', methods=['GET'])
def get_settings():
    settings = settings_col.find_one({}, {'_id': 0})
    return jsonify(settings or {})

@app.route('/api/media', methods=['GET'])
def get_media():
    media_type = request.args.get('type')
    query = {'type': media_type} if media_type else {}
    items = list(media_col.find(query, {'_id': 0}))
    return jsonify({'items': items})


LANG_MAP = {
    "en": "Always answer ONLY in English. Do not mix Hindi or Marathi.",
    "hi": "हमेशा केवल हिंदी में उत्तर दीजिए। अंग्रेज़ी का उपयोग बिल्कुल न करें।",
    "mr": "नेहमी फक्त मराठीत उत्तर द्या. इंग्रजी अजिबात वापरू नका."
}

@app.route('/api/query', methods=['POST'])
def query():
    data = request.json
    user_text = data.get("text", "")
    language = data.get("language", "en")
    api_key = os.environ.get('GEMINI_API_KEY', 'AIzaSyA3JariBIkf6YFcWKNtazIzmOU5H3kpIGY')
    # Map language codes to names
    lang_map = {
        "en": "English",
        "hi": "Hindi",
        "mr": "Marathi"
    }
    lang_name = lang_map.get(language, "English")

    try:
        # Build request payload with system_instruction
        payload = {
            "system_instruction": {
                "parts": [{
                    "text": (
                        f"You are an AI assistant representing the following department:\n"
                        f"{DEPARTMENT_INFO}\n\n"
                        f"Always answer strictly in {lang_name}. "
                        f"Do not mix with any other language."
                    )
                }]
            },
            "contents": [{
                "parts": [{"text": user_text}]
            }]
        }

        resp = requests.post(
            f"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={api_key}",
            headers={"Content-Type": "application/json"},
            json=payload
        )
        resp.raise_for_status()
        reply = resp.json()["candidates"][0]["content"]["parts"][0]["text"]

        return jsonify({"reply": reply, "language": language})

    except Exception as e:
        return jsonify({"error": str(e)}), 500
    
# ---------- Admin auth ----------
ADMIN_LOGIN_HTML = """
<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Admin Login</title>
  <link rel="stylesheet" href="/static/admin/admin.css">
</head>
<body class="auth-body">
  <div class="auth-card">
    <h1>Admin Panel Login</h1>
    {% if blocked %}
      <div class="alert error">Too many failed attempts. Try again after: <b>{{ until }}</b></div>
    {% endif %}
    {% if message %}<div class="alert">{{ message }}</div>{% endif %}
    <form method="post" action="/admin/login">
      <label>Username</label>
      <input name="username" required>
      <label>Password</label>
      <input name="password" type="password" required>
      <button type="submit">Login</button>
    </form>
  </div>
</body>
</html>
"""

@app.route("/admin/login", methods=["GET","POST"])
def admin_login_page():
    fp = device_fingerprint()
    rec = auth_col.find_one({"fingerprint": fp})
    now = current_time()
    blocked = False
    until = None
    # Ensure blocked_until is timezone-aware
    if rec and rec.get("blocked_until"):
        blocked_until = rec["blocked_until"]
        if blocked_until.tzinfo is None:
            blocked_until = blocked_until.replace(tzinfo=timezone('UTC')).astimezone(timezone('Asia/Kolkata'))
        if now < blocked_until:
            blocked = True
            until = blocked_until.strftime("%Y-%m-%d %H:%M:%S IST")

    if request.method == "GET":
        return render_template_string(ADMIN_LOGIN_HTML, blocked=blocked, until=until, message=None)

    # POST
    if blocked:
        return render_template_string(ADMIN_LOGIN_HTML, blocked=True, until=until, message=None), 429

    username = (request.form.get("username") or "").strip()
    password = request.form.get("password") or ""

    if username in ACCOUNTS and ACCOUNTS[username] == password:
        session["user"] = username
        # reset attempts
        auth_col.update_one({"fingerprint": fp}, {"$set": {"failed_count":0}, "$unset": {"blocked_until": ""}}, upsert=True)
        return redirect("/admin")
    else:
        # increment attempts
        failed = 1
        if rec: failed = rec.get("failed_count",0) + 1
        update = {"$set": {"failed_count": failed}}
        if failed >= 3:
            update["$set"]["blocked_until"] = current_time() + timedelta(hours=1)
        auth_col.update_one({"fingerprint": fp}, update, upsert=True)
        msg = "Invalid credentials."
        if failed >= 3:
            msg += " Too many attempts. Blocked for 1 hour."
        return render_template_string(ADMIN_LOGIN_HTML, blocked=False, until=None, message=msg), 401

@app.route("/admin/logout")
def admin_logout():
    session.clear()
    return redirect(url_for("admin_login_page"))

# ---------- Admin panel ----------
@app.route("/admin")
@require_login
def admin_page():
    app.logger.info("Accessing admin page")
    try:
        return send_from_directory(os.path.join(os.path.dirname(__file__), '../frontend'), 'admin.html')
    except Exception as e:
        app.logger.error(f"Error serving admin.html: {e}")
        return "Error serving admin.html", 500

# Media management
@app.route("/api/admin/media/upload", methods=["POST"])
@require_login
def admin_upload_media():
    kind = request.form.get("type","").lower()
    caption = request.form.get("caption","").strip()
    f = request.files.get("file")
    if kind not in ("image","video","model") or not f:
        return jsonify({"ok": False, "error": "Missing type or file"}), 400

    ext = file_ext(f.filename)
    if not allowed_for(kind, ext):
        return jsonify({"ok": False, "error": "File type not allowed"}), 400

    filename = secure_filename(f.filename)
    dest_dir = os.path.join(UPLOADS_DIR, f"{kind}s") if kind != "model" else os.path.join(UPLOADS_DIR, "models")
    os.makedirs(dest_dir, exist_ok=True)
    path = os.path.join(dest_dir, filename)
    f.save(path)

    doc = {
        "type": kind,
        "filename": filename,
        "url": f"/uploads/{kind if kind!='model' else 'model'}s/{filename}" if kind!="model" else f"/uploads/models/{filename}",
        "caption": caption,
        "created_at": current_time()
    }
    media_col.insert_one(doc)
    return jsonify({"ok": True, "item": {k:v for k,v in doc.items() if k!="_id"}})

@app.route("/api/admin/media/delete", methods=["POST"])
@require_login
def admin_delete_media():
    data = request.json or {}
    kind = (data.get("type") or "").lower()
    filename = data.get("filename")
    if kind not in ("image","video","model") or not filename:
        return jsonify({"ok": False, "error": "Missing type or filename"}), 400
    doc = media_col.find_one({"type": kind, "filename": filename})
    if not doc:
        return jsonify({"ok": False, "error": "Not found"}), 404

    # delete file
    dest_dir = os.path.join(UPLOADS_DIR, f"{kind}s") if kind != "model" else os.path.join(UPLOADS_DIR, "models")
    try:
        os.remove(os.path.join(dest_dir, filename))
    except FileNotFoundError:
        pass
    media_col.delete_one({"_id": doc["_id"]})
    return jsonify({"ok": True})

# Settings management
@app.route("/api/admin/settings", methods=["GET","POST"])
@require_login
def admin_settings():
    if request.method == "GET":
        s = settings_col.find_one({}, {"_id":0}) or {}
        return jsonify({"ok": True, "settings": s})
    # POST
    data = request.json or {}
    default_language = data.get("default_language", "en")
    slider_interval_ms = int(data.get("slider_interval_ms", 7000))
    welcome_message = data.get("welcome_message", "Hello! Welcome to the Department of Artificial Intelligence & Data Science. How can I help you today?")
    settings_col.update_one({}, {"$set": {
        "default_language": default_language,
        "slider_interval_ms": slider_interval_ms,
        "welcome_message": welcome_message
    }}, upsert=True)
    return jsonify({"ok": True, "message": "Settings updated"})

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port, debug=True)
