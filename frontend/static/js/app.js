// frontend/static/js/app.js
// Full working frontend: slideshow + mic UI + language selection + STT/TTS + /api/query integration

(() => {
  "use strict";

  const slides = [
    { type: 'image', src: '/static/media/bolly.jpeg', caption: 'AI&DS ❤️ BollyWood Day 2024' },
    { type: 'image', src: '/static/media/bappa.jpeg', caption: 'AI&DS ❤️ Bappa 2025' },
    { type: 'image', src: '/static/media/hg.jpeg', caption: 'AI&DS ❤️ Induction Program - Tracking' },
    { type: 'image', src: '/static/media/iks.jpeg', caption: 'AI&DS ❤️ IKS Trip 2024' },
    { type: 'image', src: '/static/media/sem2.jpeg', caption: 'AI&DS ❤️ Second Sem Memory' },
    { type: 'video', src: '/static/media/bappa.mp4', caption: 'AI&DS ❤️ Bappa 2025' }
  ];

  // DOM elements
  const askBtn = document.getElementById('askBtn'); // FIXED case
  const closeBtn = document.getElementById('closeBtn');
  const slideshow = document.getElementById('slideshow');
  const micBtn = document.getElementById('mic');
  const overlay = document.getElementById('overlay');
  const langSelect = document.getElementById('lang');
  const status = document.getElementById('status');
  const responseDiv = document.getElementById('response');

  // state
  let current = 0;
  let recognition = null;
  let recognizing = false;

  // utility: detect Devanagari characters (Hindi/Marathi)
  function hasDevanagari(text) {
    return /[\u0900-\u097F]/.test(text);
  }

  // build slideshow DOM
  function buildSlides() {
    slides.forEach((s, i) => {
      const el = document.createElement('div');
      el.className = 'slide' + (i === 0 ? ' visible' : '');
      el.dataset.index = i;
      if (s.type === 'image') {
        el.style.backgroundImage = `url('${s.src}')`;
        el.innerHTML = `<div style="position:absolute;bottom:6%;left:6%">
                          <div class="caption" style="color:black;background:rgb(6, 182, 212);padding:8px 18px;border-radius:10px;box-shadow:0 2px 8px rgba(0,0,0,0.12);font-weight:500;display:inline-block;">${s.caption}</div>
                        </div>`;
      } else {
        el.innerHTML = `<video muted playsinline loop style="max-width:100%;max-height:100%;border-radius:8px">
                          <source src="${s.src}" type="video/mp4">
                        </video>
                        <div style="position:absolute;bottom:6%;left:6%">
                          <div class="caption" style="color:black;background:rgb(6, 182, 212);padding:8px 18px;border-radius:10px;box-shadow:0 2px 8px rgba(0,0,0,0.12);font-weight:500;display:inline-block;">${s.caption}</div>
                        </div>`;
      }
      slideshow.appendChild(el);
    });
  }

  function showSlide(idx) {
    const nodes = document.querySelectorAll('.slide');
    if (!nodes || nodes.length === 0) return;
    nodes.forEach(n => n.classList.remove('visible'));
    const active = nodes[idx % nodes.length];
    if (active) active.classList.add('visible');
    // play/pause videos
    nodes.forEach(n => {
      const v = n.querySelector('video');
      if (v) {
        if (n.classList.contains('visible')) {
          try { v.play(); } catch (e) {}
        } else {
          try { v.pause(); } catch (e) {}
        }
      }
    });
  }

  // slideshow cycle
  function startSlideshow() {
    setInterval(() => {
      current = (current + 1) % slides.length;
      showSlide(current);
    }, 7000);
  }

  // UI helpers
  function setStatus(text) {
    if (status) status.textContent = text;
  }

  function showResponse(userText, botText) {
    if (!responseDiv) return;
    let content = '';
    if (userText) content += `You: ${userText}\n\n`;
    if (botText) content += `AI: ${botText}`;
    responseDiv.textContent = content;
  }

  // Text-to-speech: speak text in requested language
  function speak(text, lang) {
    const utterance = new SpeechSynthesisUtterance(text);

    let voiceLang = "en-IN";
    if (lang === "hi") voiceLang = "hi-IN";
    if (lang === "mr") voiceLang = "mr-IN";

    utterance.lang = voiceLang;
    utterance.rate = 1;
    utterance.pitch = 1;

    const voices = speechSynthesis.getVoices();
    let match = voices.find(v => v.lang.startsWith(voiceLang));

    // fallback: if Marathi voice not found, use Hindi
    if (!match && lang === "mr") {
      match = voices.find(v => v.lang.startsWith("hi-IN"));
      utterance.lang = "hi-IN";
    }

    if (match) utterance.voice = match;

    speechSynthesis.speak(utterance);
  }

  // Send text + language to backend and handle response
  async function sendQueryToServer(text, language) {
    try {
      setStatus('Fetching answer...');
      showResponse(text, 'Preparing answer...');
      const resp = await fetch('/api/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, language })
      });

      if (!resp.ok) {
        const t = await resp.text();
        throw new Error(`Server returned ${resp.status}: ${t}`);
      }

      const j = await resp.json();
      const botText = j.reply || '(no reply)';
      const returnedLang = j.language || language || 'en';
      showResponse(text, botText);
      setStatus('Answer ready');
      speak(botText, returnedLang);
    } catch (err) {
      console.error('Query error', err);
      setStatus('Error');
      responseDiv.textContent = 'Error contacting server: ' + (err.message || err);
    }
  }

  // Initialize speech recognition (single-shot)
  function initRecognition(preferredLang) {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return null;

    const r = new SpeechRecognition();
    r.interimResults = false;
    r.maxAlternatives = 1;

    if (preferredLang && preferredLang !== 'auto') {
      r.lang = preferredLang === 'hi' ? 'hi-IN' : preferredLang === 'mr' ? 'mr-IN' : 'en-IN';
    }

    r.onstart = () => {
      recognizing = true;
      setStatus('Listening...');
      micBtn.classList.add('listening');
    };

    r.onerror = (ev) => {
      console.warn('Recognition error', ev);
      setStatus('Recognition error: ' + (ev.error || ev.message || 'unknown'));
      recognizing = false;
      micBtn.classList.remove('listening');
    };

    r.onend = () => {
      recognizing = false;
      micBtn.classList.remove('listening');
      if (overlay && !overlay.classList.contains('hidden')) setStatus('Processing...');
    };

    r.onresult = async (ev) => {
      try {
        try { r.stop(); } catch (e) {}
        recognizing = false;
        micBtn.classList.remove('listening');

        const txt = (ev.results[0][0].transcript || '').trim();
        if (!txt) {
          setStatus('No speech detected.');
          return;
        }

        let chosenLang = (langSelect && langSelect.value) ? langSelect.value : 'auto';
        if (chosenLang === 'auto') {
          chosenLang = hasDevanagari(txt) ? 'hi' : 'en';
        }

        setStatus('Recognized — sending to server...');
        await sendQueryToServer(txt, chosenLang);
      } catch (e) {
        console.error('onresult handling error', e);
        setStatus('Error processing speech');
      }
    };

    return r;
  }

  // Mic click (first start)
  function onMicClick() {
    const isHidden = overlay.classList.contains('hidden');
    if (!isHidden) {
      return; // overlay already open, don’t toggle
    }

    overlay.classList.remove('hidden');
    setStatus('Chatbot active — please speak.');

    const sel = (langSelect && langSelect.value) ? langSelect.value : 'auto';
    recognition = initRecognition(sel);
    try {
      if (recognition) recognition.start();
      else setStatus('Voice recognition not supported in this browser.');
    } catch (e) {
      console.warn('recognition.start() failed', e);
      setStatus('Recognition failed to start: ' + (e.message || e));
    }
  }

  // Ask Again button
  function onAskAgainClick() {
    if (recognition && recognizing) {
      try { recognition.stop(); } catch (e) {}
    }
    const sel = langSelect.value || 'auto';
    recognition = initRecognition(sel);
    try { if (recognition) recognition.start(); } catch (e) {}
  }

  // Close button
  function onCloseClick() {
    if (recognition && recognizing) {
      try { recognition.stop(); } catch (e) {}
    }
    overlay.classList.add('hidden');
    try { window.speechSynthesis.cancel(); } catch (e) {}
    setStatus('Idle - click ask again button to start the chatbot.');
    responseDiv.textContent = "";
  }

  // Language change during active session
  function onLangChange() {
    if (!overlay.classList.contains('hidden')) {
      if (recognition && recognizing) {
        try { recognition.stop(); } catch (e) {}
      }
      const sel = langSelect.value || 'auto';
      recognition = initRecognition(sel);
      try { if (recognition) recognition.start(); } catch (e) {}
    }
  }

  // init UI & event listeners
  function init() {
    buildSlides();
    startSlideshow();
    setStatus('Idle - click ask agin button to start the chatbot.');
    if (micBtn) micBtn.addEventListener('click', onMicClick);
    if (askBtn) askBtn.addEventListener('click', onAskAgainClick); // FIXED
    if (closeBtn) closeBtn.addEventListener('click', onCloseClick);
    if (langSelect) langSelect.addEventListener('change', onLangChange);

    if ('speechSynthesis' in window) {
      window.speechSynthesis.getVoices();
      window.speechSynthesis.onvoiceschanged = () => { window.speechSynthesis.getVoices(); };
    }
  }

  // run
  init();

})();
