from flask import Flask, request, jsonify, send_from_directory
import os, requests, json

app = Flask(__name__, static_folder='../frontend/static', template_folder='../frontend')

DEPARTMENT_INFO = """Amrutvahini College of Engineering - Artificial Intelligence & Data Science Department.
Courses: BE AI & Data Science. Labs: Software Lab, AI Lab, Software Lab 2.
Activities: Hackathons, workshops, student projects.
Head Of Department: Prof. Panhalkar and guides.
Your developer/ owner is Sanchit"""

# Language-specific strict instructions
LANG_MAP = {
    "en": "Always answer ONLY in English. Do not mix Hindi or Marathi.",
    "hi": "हमेशा केवल हिंदी में उत्तर दीजिए। अंग्रेज़ी का उपयोग बिल्कुल न करें।",
    "mr": "नेहमी फक्त मराठीत उत्तर द्या. इंग्रजी अजिबात वापरू नका."
}

@app.route('/')
def index():
    return send_from_directory('../frontend', 'index.html')

@app.route('/static/<path:path>')
def static_proxy(path):
    return send_from_directory('../frontend/static', path)

@app.route("/api/query", methods=["POST"])
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
    
'''
# THIS IS OLD CODE, IGNORE BELOW
        # Force Gemini to answer in same language as user
        prompt = f"Answer the following question strictly in {lang_name}:\n\n{user_text}"
        resp = requests.post(
            f"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={api_key}",
            headers={"Content-Type": "application/json"},
            json={"contents": [{"parts": [{"text": prompt}]}]}
        )
'''

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port, debug=True)