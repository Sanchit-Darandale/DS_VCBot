// Slideshow + Chatbot + 3D View, with settings pulled from backend
(() => {
  "use strict";

  const askBtn = document.getElementById('askBtn');
  const closeBtn = document.getElementById('closeBtn');
  const btn3d = document.getElementById('btn3d');
  const slideshow = document.getElementById('slideshow');
  const micBtn = document.getElementById('mic');
  const overlay = document.getElementById('overlay');
  const langSelect = document.getElementById('lang');
  const status = document.getElementById('status');
  const responseDiv = document.getElementById('response');

  // 3D overlay
  const view3d = document.createElement('div');
  view3d.id = "view3d";
  view3d.innerHTML = `<button class="btn close">Close</button><div id="view3d-stage"></div>`;
  document.body.appendChild(view3d);
  view3d.querySelector('.close').onclick = () => view3d.classList.remove('visible');

  let current = 0;
  let rec = null;
  let recognizing = false;
  let media = { images: [], videos: [], models: [] };
  let settings = { default_language: 'mr-IN', slider_interval_ms: 7000, welcome_message: "" };
  let timer = null;
  let is3DViewActive = false; // Track the state of the 3D view

  function setStatus(text){ if(status) status.textContent = text; }
  function hasDevanagari(text){ return /[\u0900-\u097F]/.test(text); }

  async function loadSettings(){
    const r = await fetch('/api/settings'); const j = await r.json();
    settings = j || settings;
    if(langSelect) langSelect.value = settings.default_language || 'en';
  }

  async function loadMedia(){
    const r = await fetch('/api/media');
    const j = await r.json();
    const items = j.items || [];
    media.images = items.filter(x=>x.type==='image');
    media.videos = items.filter(x=>x.type==='video');
    media.models = items.filter(x=>x.type==='model');
  }

  function clearSlides(){ slideshow.innerHTML=''; }

  function slideEl(item){
    const el = document.createElement('div');
    el.className = 'slide';
    let inner = '';
    if(item.type==='image'){
      inner = `<img src="${item.url}" alt="">`;
    }else{
      inner = `<video src="${item.url}" muted playsinline loop></video>`;
    }
    el.innerHTML = `${inner}<div class="caption-box"><div class="caption">${item.caption||''}</div></div>`;
    return el;
  }

  function buildSlides(){
    clearSlides();
    const items = [...media.images, ...media.videos];
    if(items.length===0){
      const el = document.createElement('div');
      el.className = 'slide visible';
      el.innerHTML = `<div style="color:#9fb3c8">No media uploaded yet. Use Admin Panel &rarr; Media.</div>`;
      slideshow.appendChild(el);
      return;
    }
    items.forEach((s, i) => {
      const el = slideEl(s);
      if(i===0) el.classList.add('visible');
      slideshow.appendChild(el);
    });
  }

  function showSlide(idx){
    const nodes = document.querySelectorAll('.slide');
    if(!nodes.length) return;
    nodes.forEach(n => n.classList.remove('visible'));
    const active = nodes[idx % nodes.length];
    if(active) active.classList.add('visible');
    // play/pause
    nodes.forEach(n => {
      const v = n.querySelector('video');
      if(v){
        if(n.classList.contains('visible')) { try{ v.play(); }catch(e){} }
        else { try{ v.pause(); }catch(e){} }
      }
    });
  }

  function startSlideshow(items) {
    if (timer) clearInterval(timer);

    let currentIndex = 0;

    const nextSlide = async () => {
      if (!items.length) return;

      console.log(`Transitioning to slide ${currentIndex + 1} of ${items.length}`); // Debug log

      const slideNodes = document.querySelectorAll('.slide');
      slideNodes.forEach(n => n.classList.remove('visible'));

      const activeSlide = slideNodes[currentIndex % slideNodes.length];
      if (activeSlide) {
        activeSlide.classList.add('visible');
        console.log(`Showing slide type: ${activeSlide.querySelector('video') ? 'video' : 'image/model'}`); // Debug log
      }

      const video = activeSlide.querySelector('video');
      if (video) {
        // Wait for the video to finish playing or fallback to a timeout
        await new Promise(resolve => {
          let resolved = false; // Track if resolved to prevent overlap

          const cleanup = () => {
            if (resolved) return;
            resolved = true;
            video.pause(); // Ensure the video is paused
            video.currentTime = 0; // Reset playback position
            video.removeEventListener('ended', handleVideoEnd);
            clearTimeout(fallbackTimeout);
            resolve();
          };

          const fallbackTimeout = setTimeout(() => {
            console.log('Fallback: Transitioning to next slide after video timeout'); // Debug log
            cleanup();
          }, (video.duration || 0) * 1000 + 1000); // Add 1 second buffer to video duration

          const handleVideoEnd = () => {
            console.log('Video ended, transitioning to next slide'); // Debug log
            cleanup();
          };

          video.addEventListener('ended', handleVideoEnd);
          video.play();
        });
      } else {
        // Wait for the interval time for images and 3D models
        console.log('Waiting for interval time'); // Debug log
        await new Promise(resolve => setTimeout(resolve, settings.slider_interval_ms || 7000));
      }

      currentIndex = (currentIndex + 1) % items.length; // Increment index after each slide
      nextSlide(); // Continue to the next slide
    };

    nextSlide();
  }

    // utility: detect Devanagari characters (Hindi/Marathi)
  function hasDevanagari(text) {
    return /[\u0900-\u097F]/.test(text);
  }

  // TTS
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

  function showResponse(userText, botText) {
    if (!responseDiv) return;
    let content = '';
    if (userText) content += `You: ${userText}\n\n`;
    if (botText) content += `AI: ${botText}`;
    responseDiv.textContent = content;
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

  // After clicking mic: speak custom welcome, then listen
  async function onMicClick(){
    console.log("onMicClick triggered"); // Debug log
    overlay.classList.remove('hidden');
    // fetch settings if not loaded
    if(!settings.welcome_message) await loadSettings();

    console.log("Settings loaded:", settings); // Debug log

    const lang = langSelect.value || settings.default_language || 'mr-IN';
    console.log("Selected language:", lang); // Debug log

    // Ensure voices are loaded before speaking
    if ('speechSynthesis' in window) {
      const voices = speechSynthesis.getVoices();
      console.log("Available voices:", voices); // Debug log

      await new Promise(resolve => {
        const voicesLoaded = voices.length > 0;
        if (voicesLoaded) resolve();
        else speechSynthesis.onvoiceschanged = resolve;
      });
    }

    // Determine welcome message language
    const welcomeMessage = settings.welcome_message || "Welcome! How can I assist you?";
    console.log("Welcome message:", welcomeMessage); // Debug log

    const u = new SpeechSynthesisUtterance(welcomeMessage);
    let voiceLang = "en-IN"; 
    if(lang.startsWith("hi")) voiceLang = "hi-IN"; 
    if(lang.startsWith("mr")) voiceLang = "mr-IN";
    u.lang = voiceLang;
    console.log("Voice language:", voiceLang); // Debug log

    const voices = speechSynthesis.getVoices();
    let selectedVoice = voices.find(v => v.lang.startsWith(voiceLang));
    if (!selectedVoice) {
      console.warn("No matching voice found for language:", voiceLang); // Debug log
      selectedVoice = voices.find(v => v.lang.startsWith("en")); // Fallback to English voice
      console.log("Fallback voice:", selectedVoice); // Debug log
    }

    if (selectedVoice) {
      u.voice = selectedVoice;
      console.log("Selected voice:", selectedVoice); // Debug log
    }

    u.onend = () => {
      rec = initRecognition(lang);
      try{ if(rec) rec.start(); }catch{}
      setStatus('Listening...');
    };

    console.log("Speaking welcome message..."); // Debug log
    speechSynthesis.speak(u);
  }

  function onAskAgainClick(){
    if(recognizing && rec){ try{ rec.stop(); }catch{} }
    const lang = langSelect.value || settings.default_language || 'en';
    rec = initRecognition(lang); try{ rec.start(); }catch{}
  }

  function onCloseClick(){
    if(recognizing && rec){ try{ rec.stop(); }catch{} }
    overlay.classList.add('hidden');
    try{ speechSynthesis.cancel(); }catch{}
    setStatus('Idle - click ask again to start the chatbot.');
    responseDiv.textContent = '';
  }

  function show3DView(){
    const stage = document.getElementById('view3d-stage');
    stage.innerHTML = '';
    if(!media.models.length){
      stage.innerHTML = `<div style="color:#cbd5e1">No 3D model videos uploaded yet.</div>`;
      view3d.classList.add('visible');
      return;
    }
    // Create a single video element and rotate sources
    const video = document.createElement('video');
    video.controls = true;
    video.autoplay = true;
    video.loop = false;
    video.playsInline = true;
    video.style.width = "100%";
    video.style.height = "100%";
    video.style.objectFit = "cover";
    stage.appendChild(video);
    let i = 0;
    function playNext(){
      const item = media.models[i % media.models.length];
      video.src = item.url;
      video.onended = () => { i++; playNext(); };
      video.play().catch(()=>{});
    }
    playNext();
    view3d.classList.add('visible');
  }

  async function init(){
    await loadSettings();
    await loadMedia();
    buildSlides();
    startSlideshow([...media.images, ...media.videos]); // Pass media items explicitly
    setStatus('Idle - click ask again to start the chatbot.');

    if(micBtn) micBtn.addEventListener('click', onMicClick);
    if(askBtn) askBtn.addEventListener('click', onAskAgainClick);
    if(closeBtn) closeBtn.addEventListener('click', onCloseClick);
    if(langSelect) langSelect.addEventListener('change', () => {});
    if(btn3d) btn3d.addEventListener('click', () => {
      is3DViewActive = !is3DViewActive; // Toggle the 3D view state

      if (is3DViewActive) {
        btn3d.textContent = 'Close'; // Change button text to 'Close'
        clearSlides();
        const items = media.models; // Use 3D models for slideshow
        if (items.length === 0) {
          const el = document.createElement('div');
          el.className = 'slide visible';
          el.innerHTML = `<div style="color:#9fb3c8">No 3D models uploaded yet. Use Admin Panel &rarr; Media.</div>`;
          slideshow.appendChild(el);
          return;
        }
        items.forEach((s, i) => {
          const el = slideEl(s);
          if (i === 0) el.classList.add('visible');
          slideshow.appendChild(el);
        });
        startSlideshow(items); // Start the slideshow for 3D models
      } else {
        btn3d.textContent = '3D View'; // Change button text back to '3D View'
        buildSlides(); // Return to normal slideshow
        startSlideshow([...media.images, ...media.videos]); // Restart normal slideshow
      }
    });

    if ('speechSynthesis' in window) {
      window.speechSynthesis.getVoices();
      window.speechSynthesis.onvoiceschanged = () => { window.speechSynthesis.getVoices(); };
    }
  }

  init();
})();
