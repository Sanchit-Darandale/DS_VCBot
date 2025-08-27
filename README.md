# Voice Chatbot — Smart TV (AI & DS Department)

This project implements a voice-enabled chatbot interface for a Smart TV display for the Artificial Intelligence & Data Science department.

## Features implemented
- Fullscreen slideshow (images & video) with fade animation.
- Bottom-right circular mic button to activate chatbot.
- Client-side speech-to-text & text-to-speech via Web Speech API (preferred for local use).
- Backend Flask API `/api/query` to call Google Gemini / Generative API (requires `GEMINI_API_KEY`).
- Department info injected into the system prompt for context-aware answers.
- Manual language selection (English / Hindi / Marathi) + Auto-detect heuristics.
- Deployable on Render.

## Quick Setup (Windows 10, VS Code)
1. Open project in VS Code.
2. Create virtual environment and activate it:
```powershell
python -m venv venv
venv\Scripts\activate
pip install -r backend/requirements.txt
```
3. Run the Flask app locally:
```powershell
cd backend
set GEMINI_API_KEY=your_api_key_here
python app.py
```
4. Open `http://localhost:5000` in Chrome/Edge for Web Speech API support.

## Deployment to Render (summary)
1. Push repository to GitHub.
2. On Render, create a **Web Service** and connect the repo.
3. Use `backend` as the root; build command: `pip install -r backend/requirements.txt`; start command: `gunicorn backend.app:app --bind 0.0.0.0:$PORT`
4. Set environment variable `GEMINI_API_KEY` on Render.

Resources cited in README:
- Render: Deploy a Flask App on Render. (Render docs). citeturn0search0turn0search4
- Gemini API quickstart (Google). citeturn0search1turn0search13
- Web Speech API (MDN). citeturn0search14

## Notes & next steps
- Browser STT auto-detection is limited. For production-grade auto language detection and best accuracy, add server-side Google Cloud Speech-to-Text endpoints and upload recorded audio to them. See Google Cloud Speech docs.
