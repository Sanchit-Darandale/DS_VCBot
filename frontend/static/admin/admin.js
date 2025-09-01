const $ = (q,root=document)=>root.querySelector(q);
const $$ = (q,root=document)=>Array.from(root.querySelectorAll(q));

function setFlash(msg, ok=true){
  const el = $("#flash");
  if(!el) return;
  el.innerHTML = `<div class="alert ${ok?"":"error"}">${msg}</div>`;
  setTimeout(()=>{ el.innerHTML=""; }, 3500);
}

function switchTab(tab){
  $$(".nav-btn").forEach(b=>b.classList.toggle("active", b.dataset.tab===tab));
  $$(".tab").forEach(t=>t.classList.toggle("visible", t.id===`tab-${tab}`));
}

async function fetchJSON(url, opts={}){
  const r = await fetch(url, opts);
  if(!r.ok) throw new Error(await r.text());
  return await r.json();
}

async function refreshStats(){
  const imgs = await fetchJSON("/api/media?type=image");
  const vids = await fetchJSON("/api/media?type=video");
  const mods = await fetchJSON("/api/media?type=model");
  $("#stats-images").textContent = `Images: ${imgs.items.length}`;
  $("#stats-videos").textContent = `Videos: ${vids.items.length}`;
  $("#stats-models").textContent = `3D Models: ${mods.items.length}`;
}

function renderMediaList(items){
  const wrap = $("#mediaList");
  wrap.innerHTML = "";
  for(const it of items){
    const card = document.createElement("div");
    card.className = "media-item";
    const mediaEl = it.type==="image"
      ? `<img src="${it.url}">`
      : `<video src="${it.url}" controls></video>`;
    card.innerHTML = `
      ${mediaEl}
      <div class="caption">${it.caption||""}</div>
      <div class="row">
        <button data-del>Delete</button>
        <a href="${it.url}" target="_blank" class="btn">Open</a>
      </div>
    `;
    card.querySelector("[data-del]").onclick = async () => {
      try{
        const r = await fetch("/api/admin/media/delete", {
          method: "POST",
          headers: {"Content-Type":"application/json"},
          body: JSON.stringify({type: it.type, filename: it.filename})
        });
        const j = await r.json();
        if(!j.ok) throw new Error(j.error||"Delete failed");
        setFlash("Deleted successfully");
        loadMedia(); refreshStats();
      }catch(e){ setFlash(e.message, false); }
    };
    wrap.appendChild(card);
  }
}

async function loadMedia(){
  const j = await fetchJSON("/api/media");
  renderMediaList(j.items);
}

/* Convert slider interval from milliseconds to seconds */
async function loadSettings(){
  const j = await fetchJSON("/api/admin/settings");
  if(j.settings){
    const s = j.settings;
    const f = $("#settingsForm");
    f.default_language.value = s.default_language || "en";
    f.slider_interval_ms.value = (s.slider_interval_ms || 7000) / 1000; // Convert ms to seconds
    f.welcome_message.value = s.welcome_message || "";
  }
}

async function main(){
  // nav
  $$(".nav-btn").forEach(b => b.onclick = () => switchTab(b.dataset.tab));
  switchTab("dashboard");
  refreshStats(); loadMedia(); loadSettings();

  // upload
  $("#uploadForm").onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    try{
      const r = await fetch("/api/admin/media/upload", { method:"POST", body: fd });
      const j = await r.json();
      if(!j.ok) throw new Error(j.error||"Upload failed");
      setFlash("Uploaded successfully");
      e.target.reset();
      loadMedia(); refreshStats();
    }catch(err){ setFlash(err.message, false); }
  };

  // settings
  $("#settingsForm").onsubmit = async (e) => {
    e.preventDefault();
    const f = e.target;
    const payload = {
      default_language: f.default_language.value,
      slider_interval_ms: +f.slider_interval_ms.value * 1000, // Convert seconds back to ms
      welcome_message: f.welcome_message.value
    };
    try{
      const j = await fetchJSON("/api/admin/settings", {
        method: "POST",
        headers: {"Content-Type":"application/json"},
        body: JSON.stringify(payload)
      });
      setFlash(j.message || "Saved");
    }catch(err){ setFlash(err.message, false); }
  };
}

main();
