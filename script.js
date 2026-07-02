import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getFirestore, collection, addDoc, deleteDoc, doc, updateDoc, onSnapshot, orderBy, query, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyDywPlYrZTpT7IlGaqzDroapqJfRWdEkNM",
  authDomain: "lyric-sync-a2494.firebaseapp.com",
  projectId: "lyric-sync-a2494",
  storageBucket: "lyric-sync-a2494.firebasestorage.app",
  messagingSenderId: "1008529505319",
  appId: "1:1008529505319:web:d5ba535555cb313c4d6202"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const songsCol = collection(db, "songs");
const configDoc = doc(db, "config", "admin");

let songs=[], currentSong=null, playing=false, currentTime=0, activeIdx=0;
let simInterval=null, editId=null, currentTab='tap';
let tapLines=[], tapIdx=0, tapTime=0, tapInterval=null, tapRunning=false;
let adminPassword="7625";
let isDragging = false;
const audio = document.getElementById('audio');

let calibSong = null;
let calibOffset = 0;
let calibPlaying = false;
let calibActiveIdx = -1;
let calibAudio = new Audio();

// ── THEME ──
window.setTheme = function(t) {
  document.documentElement.setAttribute('data-theme', t);
  const lb = document.getElementById('theme-light-btn');
  const db = document.getElementById('theme-dark-btn');
  if (lb) lb.classList.toggle('active', t === 'light');
  if (db) db.classList.toggle('active', t === 'dark');
  try { localStorage.setItem('hiraycs-theme', t); } catch(e) {}
}

// ── LYRICS APPEARANCE (font + size) ──
window.setLyricFont = function(fontVal) {
  document.documentElement.style.setProperty('--lyric-font', fontVal);
  try { localStorage.setItem('hiraycs-font', fontVal); } catch(e) {}
}

// ── CUSTOM FONT DROPDOWN ──
window.toggleFontDropdown = function() {
  document.getElementById('font-menu').classList.toggle('open');
  document.getElementById('font-trigger').classList.toggle('open');
}
window.selectFont = function(btn) {
  const fontVal = btn.getAttribute('data-font');
  const label = btn.getAttribute('data-label');
  setLyricFont(fontVal);
  document.getElementById('font-trigger-label').textContent = label;
  document.querySelectorAll('#font-menu .dropdown-item').forEach(el => el.classList.remove('selected'));
  btn.classList.add('selected');
  document.getElementById('font-menu').classList.remove('open');
  document.getElementById('font-trigger').classList.remove('open');
}
document.addEventListener('click', (e) => {
  const dd = document.getElementById('font-dropdown');
  if (dd && !dd.contains(e.target)) {
    document.getElementById('font-menu')?.classList.remove('open');
    document.getElementById('font-trigger')?.classList.remove('open');
  }
});

let lyricScale = 1;
window.adjustLyricSize = function(delta) {
  lyricScale = Math.min(1.6, Math.max(0.7, Math.round((lyricScale + delta) * 10) / 10));
  document.documentElement.style.setProperty('--lyric-scale', lyricScale);
  const sd = document.getElementById('size-display');
  if (sd) sd.textContent = Math.round(lyricScale * 100) + '%';
  try { localStorage.setItem('hiraycs-scale', lyricScale); } catch(e) {}
}

function initUI() {
  let savedTheme = 'light';
  try { savedTheme = localStorage.getItem('hiraycs-theme') || 'light'; } catch(e) {}
  setTheme(savedTheme);

  try {
    const savedFont = localStorage.getItem('hiraycs-font');
    if (savedFont) {
      document.documentElement.style.setProperty('--lyric-font', savedFont);
      const matchBtn = document.querySelector(`#font-menu .dropdown-item[data-font="${savedFont}"]`);
      if (matchBtn) {
        document.querySelectorAll('#font-menu .dropdown-item').forEach(el => el.classList.remove('selected'));
        matchBtn.classList.add('selected');
        const lbl = document.getElementById('font-trigger-label');
        if (lbl) lbl.textContent = matchBtn.getAttribute('data-label');
      }
    }
    const savedScale = parseFloat(localStorage.getItem('hiraycs-scale'));
    if (savedScale) {
      lyricScale = savedScale;
      document.documentElement.style.setProperty('--lyric-scale', lyricScale);
      const sd = document.getElementById('size-display');
      if (sd) sd.textContent = Math.round(lyricScale * 100) + '%';
    }
  } catch(e) {}

  // ── RESTAURER LA VUE APRÈS RAFRAÎCHISSEMENT ──
  try {
    const savedView = localStorage.getItem('hiraycs-view');
    const adminSession = localStorage.getItem('hiraycs-admin-session');
    if (savedView === 'choral') {
      document.getElementById('home').style.display = 'none';
      document.getElementById('nav').classList.add('show');
      document.getElementById('reader').classList.add('show');
      document.getElementById('nav-badge').textContent = 'Choral';
      document.getElementById('nav-badge').className = 'nav-badge choral';
    } else if (savedView === 'admin' && adminSession === '1') {
      document.getElementById('home').style.display = 'none';
      document.getElementById('nav').classList.add('show');
      document.getElementById('admin').classList.add('show');
      document.getElementById('nav-badge').textContent = 'Admin';
      document.getElementById('nav-badge').className = 'nav-badge admin';
    }
  } catch(e) {}
}
initUI();

// ── CONFIG ──
async function loadConfig() {
  try {
    const snap = await getDoc(configDoc);
    if (snap.exists() && snap.data().password) adminPassword = snap.data().password;
    else await setDoc(configDoc, { password: "7625" });
  } catch(e) {}
}

// ── HAMBURGER MENU (mobile) ──
window.toggleSidebar = function() {
  document.getElementById('sidebar').classList.add('show-mobile');
  document.getElementById('sidebar-overlay').classList.add('show');
}
window.closeSidebar = function() {
  document.getElementById('sidebar').classList.remove('show-mobile');
  document.getElementById('sidebar-overlay').classList.remove('show');
}

// ── NAVIGATION ──
window.enterChoral = function() {
  document.getElementById('home').style.display = 'none';
  document.getElementById('nav').classList.add('show');
  document.getElementById('reader').classList.add('show');
  document.getElementById('nav-badge').textContent = 'Choral';
  document.getElementById('nav-badge').className = 'nav-badge choral';
  try { localStorage.setItem('hiraycs-view', 'choral'); } catch(e) {}
}

window.enterAdmin = function() {
  document.getElementById('login-overlay').classList.add('show');
  document.getElementById('login-input').value = '';
  document.getElementById('login-err').style.display = 'none';
  setTimeout(() => document.getElementById('login-input').focus(), 100);
}

window.doLogin = function() {
  const val = document.getElementById('login-input').value;
  if (val === adminPassword) {
    document.getElementById('login-overlay').classList.remove('show');
    document.getElementById('home').style.display = 'none';
    document.getElementById('nav').classList.add('show');
    document.getElementById('admin').classList.add('show');
    document.getElementById('nav-badge').textContent = 'Admin';
    document.getElementById('nav-badge').className = 'nav-badge admin';
    try {
      localStorage.setItem('hiraycs-view', 'admin');
      localStorage.setItem('hiraycs-admin-session', '1');
    } catch(e) {}
  } else {
    document.getElementById('login-err').style.display = 'block';
    document.getElementById('login-input').value = '';
    document.getElementById('login-input').focus();
  }
}

window.closeLogin = function() {
  document.getElementById('login-overlay').classList.remove('show');
}

window.goHome = function() {
  document.getElementById('home').style.display = 'flex';
  document.getElementById('nav').classList.remove('show');
  document.getElementById('reader').classList.remove('show');
  document.getElementById('admin').classList.remove('show');
  stopSim(); playing = false;
  document.getElementById('play-btn').textContent = '▶';
  stopCalibPlayback();
  try {
    localStorage.removeItem('hiraycs-view');
    localStorage.removeItem('hiraycs-admin-session');
  } catch(e) {}
}

// ── PASSWORD ──
window.changePassword = async function() {
  const np = document.getElementById('new-pwd').value.trim();
  const cp = document.getElementById('confirm-pwd').value.trim();
  if (!np) { toast('Entrez un mot de passe', 'err'); return; }
  if (np !== cp) { toast('Les mots de passe ne correspondent pas', 'err'); return; }
  if (np.length < 4) { toast('Minimum 4 caractères', 'err'); return; }
  await setDoc(configDoc, { password: np });
  adminPassword = np;
  document.getElementById('new-pwd').value = '';
  document.getElementById('confirm-pwd').value = '';
  toast('Mot de passe mis à jour !', 'ok');
}

// ── SONGS ──
function loadSongs() {
  const q = query(songsCol, orderBy("createdAt","desc"));
  onSnapshot(q, snap => {
    songs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderSidebarSongs(); renderAdminSongs();
  });
}

function renderSidebarSongs() {
  const el = document.getElementById('song-list-reader');
  if (!songs.length) { el.innerHTML='<div class="empty-lib">Aucune chanson</div>'; return; }
  el.innerHTML = songs.map(s=>`
    <button class="song-item ${currentSong?.id===s.id?'active':''}" onclick="playSong('${s.id}')">
      <div class="song-cover">${currentSong?.id===s.id ? '<span class="eq-bars" style="height:14px"><span class="eq-bar"></span><span class="eq-bar"></span><span class="eq-bar"></span></span>' : '♪'}</div>
      <div>
        <div class="song-title ${currentSong?.id===s.id?'active':''}">${s.title}</div>
        <div class="song-artist">${s.artist||''}</div>
      </div>
    </button>`).join('');
}

function renderAdminSongs() {
  const el = document.getElementById('song-list-admin');
  document.getElementById('lib-title').textContent = `Bibliothèque (${songs.length})`;
  if (!songs.length) { el.innerHTML='<div class="loading">Aucune chanson — ajoutes-en une !</div>'; return; }
  el.innerHTML = songs.map(s=>`
    <div class="song-row">
      <div class="song-row-cover">♪</div>
      <div class="song-row-info">
        <div class="song-row-title">${s.title}</div>
        <div class="song-row-sub">${s.artist||''} · ${s.lyrics?.length||0} lignes</div>
      </div>
      <button class="btn-edit" onclick="editSong('${s.id}')">Modifier</button>
      <button class="btn-del" onclick="deleteSong('${s.id}')">Supprimer</button>
    </div>`).join('');
  renderCalibSelect();
}

// ── CALIBRAGE ──
function renderCalibSelect() {
  const sel = document.getElementById('calib-song-select');
  if (!sel) return;
  const prevVal = sel.value;
  sel.innerHTML = '<option value="">— Choisis une chanson —</option>' +
    songs.map(s => `<option value="${s.id}">${s.title}${s.artist ? ' — '+s.artist : ''}</option>`).join('');
  if (songs.some(s => s.id === prevVal)) sel.value = prevVal;
}

window.loadCalibSong = function(id) {
  stopCalibPlayback();
  const s = songs.find(x => x.id === id);
  const body = document.getElementById('calib-body');
  if (!s) {
    calibSong = null;
    body.innerHTML = '<div class="calib-empty">Sélectionne une chanson pour ajuster son timing.</div>';
    return;
  }
  calibSong = s;
  calibOffset = 0;
  calibActiveIdx = -1;

  if (s.audioUrl) { calibAudio.src = s.audioUrl; calibAudio.load(); }
  else { calibAudio.src = ''; }

  body.innerHTML = `
    <div class="calib-live-badge"><span class="calib-live-dot"></span>Aperçu en direct</div>
    <div class="calib-lyrics-mini" id="calib-lyrics-mini"></div>
    <div class="calib-transport">
      <button class="calib-play-btn" id="calib-play-btn" onclick="toggleCalibPlay()">▶</button>
      <span class="calib-time" id="calib-time">0:00 / 0:00</span>
    </div>
    <div class="calib-controls">
      <button class="calib-btn-offset" onclick="adjustCalibOffset(-0.1)" title="Avancer les lyrics (-100ms)">−</button>
      <div class="calib-offset-display">
        <span class="label">Décalage</span>
        <span id="calib-offset-value">0 ms</span>
      </div>
      <button class="calib-btn-offset" onclick="adjustCalibOffset(0.1)" title="Retarder les lyrics (+100ms)">+</button>
    </div>
    <div style="font-size:12px;color:var(--text-muted);font-weight:600;text-align:center;">
      Si le texte s'allume <strong>après</strong> la voix → clique <strong>−</strong> (avance les lyrics).<br>
      Si le texte s'allume <strong>avant</strong> la voix → clique <strong>+</strong> (retarde les lyrics).
    </div>
    <div class="calib-actions">
      <button class="btn-calib-apply" onclick="applyCalibOffset()">✓ Appliquer définitivement</button>
      <button class="btn-calib-reset" onclick="resetCalibOffset()">Annuler le réglage</button>
    </div>
  `;
  renderCalibLyricsDOM();
  updateCalibOffsetDisplay();
}

function renderCalibLyricsDOM() {
  const zone = document.getElementById('calib-lyrics-mini');
  if (!zone || !calibSong) return;
  if (!calibSong.lyrics?.length) {
    zone.innerHTML = '<div class="calib-empty">Aucun lyric pour cette chanson</div>';
    return;
  }
  zone.innerHTML = calibSong.lyrics.map((l, i) =>
    `<div class="calib-line" id="calib-line-${i}" onclick="calibSeekTo(${Number(l.time)})">${l.text}</div>`
  ).join('');
}

function updateCalibActiveIdx() {
  if (!calibSong?.lyrics?.length) return;
  const t = calibAudio.currentTime + calibOffset;
  let idx = -1;
  for (let i = 0; i < calibSong.lyrics.length; i++) {
    if (t >= Number(calibSong.lyrics[i].time)) idx = i;
  }
  if (idx !== calibActiveIdx) {
    calibActiveIdx = idx;
    const lines = document.querySelectorAll('#calib-lyrics-mini .calib-line');
    lines.forEach((el, i) => {
      const diff = i - calibActiveIdx;
      let cls = 'calib-line';
      if (diff === 0) cls += ' active';
      else if (diff === -1) cls += ' prev1';
      else if (diff === 1) cls += ' next1';
      el.className = cls;
    });
    const targetIdx = calibActiveIdx >= 0 ? calibActiveIdx : 0;
    centerLineInZone('calib-lyrics-mini', `calib-line-${targetIdx}`);
  }
}

window.toggleCalibPlay = function() {
  if (!calibSong) return;
  if (calibPlaying) {
    calibAudio.pause();
    calibPlaying = false;
    document.getElementById('calib-play-btn').textContent = '▶';
  } else {
    if (!calibAudio.src) { toast('Aucun audio pour cette chanson', 'err'); return; }
    calibAudio.play().then(() => {
      calibPlaying = true;
      document.getElementById('calib-play-btn').textContent = '⏸';
    }).catch(() => toast("Impossible de lire l'audio", 'err'));
  }
}

function stopCalibPlayback() {
  calibAudio.pause();
  calibPlaying = false;
  const btn = document.getElementById('calib-play-btn');
  if (btn) btn.textContent = '▶';
}

window.calibSeekTo = function(t) {
  if (!calibAudio.src) return;
  calibAudio.currentTime = Math.max(0, t - calibOffset);
  updateCalibActiveIdx();
}

calibAudio.ontimeupdate = () => {
  updateCalibActiveIdx();
  const cur = calibAudio.currentTime, dur = calibAudio.duration || 0;
  const fmtC = s => `${Math.floor(s/60)}:${Math.floor(s%60).toString().padStart(2,'0')}`;
  const el = document.getElementById('calib-time');
  if (el) el.textContent = `${fmtC(cur)} / ${isFinite(dur) ? fmtC(dur) : '0:00'}`;
};
calibAudio.onended = () => stopCalibPlayback();

window.adjustCalibOffset = function(delta) {
  if (!calibSong) return;
  calibOffset = Math.round((calibOffset + delta) * 1000) / 1000;
  updateCalibOffsetDisplay();
  calibActiveIdx = -2; // force re-render even if index value coincidentally matches
  updateCalibActiveIdx();
  const disp = document.querySelector('.calib-offset-display');
  if (disp) {
    disp.classList.add('pulse');
    setTimeout(() => disp.classList.remove('pulse'), 150);
  }
}

function updateCalibOffsetDisplay() {
  const el = document.getElementById('calib-offset-value');
  if (!el) return;
  const ms = Math.round(calibOffset * 1000);
  el.textContent = `${ms > 0 ? '+' : ''}${ms} ms`;
}

window.resetCalibOffset = function() {
  calibOffset = 0;
  updateCalibOffsetDisplay();
  updateCalibActiveIdx();
  toast('Réglage annulé', 'ok');
}

window.applyCalibOffset = async function() {
  if (!calibSong) return;
  if (calibOffset === 0) { toast('Aucun décalage à appliquer', 'err'); return; }
  const newLyrics = calibSong.lyrics.map(l => ({
    time: Math.max(0, Number(l.time) + calibOffset),
    text: l.text
  }));
  await updateDoc(doc(db, 'songs', calibSong.id), { lyrics: newLyrics });
  calibSong.lyrics = newLyrics;
  calibOffset = 0;
  updateCalibOffsetDisplay();
  renderCalibLyricsDOM();
  calibActiveIdx = -1;
  updateCalibActiveIdx();
  toast('Timing mis à jour !', 'ok');
}

window.playSong = function(id) {
  const s=songs.find(x=>x.id===id); if(!s) return;
  currentSong=s; currentTime=0; activeIdx=-2; stopSim(); playing=false;
  document.getElementById('play-btn').textContent='▶';
  document.getElementById('bar-title').textContent=s.title;
  document.getElementById('bar-artist').textContent=s.artist||'';
  if(s.audioUrl){audio.src=s.audioUrl;audio.load();}else{audio.src='';}

  renderLyricsDOM();
  updateActiveIdx();
  renderSidebarSongs();
  closeSidebar();
}

// ── PROMPTEUR : calcule le padding-top pour centrer la ligne active ──
function setLyricsZonePadding() {
  const zone = document.getElementById('lyrics-zone');
  if (!zone) return;
  // On veut que le haut de la zone lyrics corresponde au centre visuel
  const mask = zone.parentElement;
  if (mask) {
    const halfH = Math.floor(mask.clientHeight / 2);
    zone.style.paddingTop = halfH + 'px';
  }
}

function renderLyricsDOM() {
  const zone = document.getElementById('lyrics-zone');
  if (!currentSong || !currentSong.lyrics?.length) {
    zone.innerHTML = '<div class="no-song">Sélectionne une chanson dans la bibliothèque</div>';
    zone.style.paddingTop = '';
    return;
  }
  setLyricsZonePadding();
  // Rendu initial : toutes les lignes futures visibles, aucune active encore
  zone.innerHTML = currentSong.lyrics.map((l, i) =>
    `<div class="lyric-line" id="line-${i}" onclick="seekToLine(${Number(l.time)})">${l.text}</div>`
  ).join('');
}

function updateActiveIdx() {
  if (!currentSong?.lyrics?.length) return;
  let idx = -1;
  for (let i = 0; i < currentSong.lyrics.length; i++) {
    if (currentTime >= Number(currentSong.lyrics[i].time)) idx = i;
  }

  if (idx !== activeIdx) {
    // Effacement sur place de l'ancienne ligne active
    if (activeIdx >= 0) {
      const oldLine = document.getElementById(`line-${activeIdx}`);
      if (oldLine) {
        oldLine.classList.add('lyric-fade-out');
        setTimeout(() => { if (oldLine.parentNode) oldLine.parentNode.removeChild(oldLine); }, 160);
      }
      // Supprimer toutes les lignes AVANT l'ancienne ligne active
      for (let p = 0; p < activeIdx; p++) {
        const pastLine = document.getElementById(`line-${p}`);
        if (pastLine && pastLine.parentNode) pastLine.parentNode.removeChild(pastLine);
      }
    }

    activeIdx = idx;

    const zone = document.getElementById('lyrics-zone');
    if (!zone) return;
    const remaining = zone.querySelectorAll('.lyric-line:not(.lyric-fade-out)');
    remaining.forEach((el) => {
      const elIdx = parseInt(el.id.replace('line-', ''));
      const diff = elIdx - activeIdx;
      let cls = 'lyric-line';
      if (diff === 0) cls += ' active';
      else if (diff === 1) cls += ' next1';
      else if (diff === 2) cls += ' next2';
      else if (diff >= 3) cls += ' next3';
      el.className = cls;
    });

    setLyricsZonePadding();
  }
}

window.addEventListener('resize', () => {
  if (currentSong) setLyricsZonePadding();
});

audio.ontimeupdate = () => {
  if (!isDragging) {
    currentTime = audio.currentTime;
    updateActiveIdx();
    updateProgress();
  }
};
audio.onloadedmetadata = () => updateProgress();
audio.onended = () => { playing = false; document.getElementById('play-btn').textContent = '▶'; };

function stopSim() { clearInterval(simInterval); simInterval = null; }
function startSim() {
  stopSim();
  simInterval = setInterval(() => {
    if (!isDragging) {
      currentTime += 0.25;
      updateActiveIdx();
      updateProgress();
    }
  }, 250);
}

window.togglePlay = function() {
  if (!currentSong) return;

  if (playing) {
    stopSim();
    if (audio.src) {
      currentTime = audio.currentTime;
      audio.pause();
    }
    playing = false;
    document.getElementById('play-btn').textContent = '▶';
  } else {
    playing = true;
    document.getElementById('play-btn').textContent = '⏸';
    if (audio.src) {
      if (isFinite(audio.duration)) audio.currentTime = currentTime;
      audio.play().then(() => {
        stopSim();
      }).catch(() => {
        startSim();
      });
    } else {
      startSim();
    }
  }
}

window.skip = function(s) {
  currentTime = Math.max(0, currentTime + s);
  if (audio.src) audio.currentTime = currentTime;
  activeIdx = -2;
  renderLyricsDOM();
  updateActiveIdx();
  updateProgress();
}

window.seekToLine = function(t) {
  currentTime = t;
  if (audio.src) audio.currentTime = t;
  activeIdx = -2;
  renderLyricsDOM();
  updateActiveIdx();
  updateProgress();
}

window.onProgressDrag = function(val) {
  isDragging = true;
  const dur = audio.duration || (currentSong?.lyrics?.slice(-1)[0]?.time + 5) || 60;
  currentTime = (val / 1000) * dur;
  document.getElementById('time-cur').textContent = fmt(currentTime);
  updateProgressFill();
  if (audio.src && isFinite(audio.duration)) audio.currentTime = currentTime;
  activeIdx = -2;
  renderLyricsDOM();
  updateActiveIdx();
  clearTimeout(window._dragTimeout);
  window._dragTimeout = setTimeout(() => { isDragging = false; }, 150);
}

window.setVol = function(v) { audio.volume = parseFloat(v); }

function fmt(s) { return `${Math.floor(s/60)}:${Math.floor(s%60).toString().padStart(2,'0')}`; }

function updateProgressFill() {
  const dur = audio.duration || (currentSong?.lyrics?.slice(-1)[0]?.time + 5) || 60;
  const pct = Math.min(100, (currentTime / dur) * 100);
  const range = document.getElementById('progress-range');
  range.style.background = `linear-gradient(to right, var(--accent) 0%, var(--accent) ${pct}%, rgba(0,0,0,0.3) ${pct}%, rgba(0,0,0,0.3) 100%)`;
  range.value = Math.round((currentTime / dur) * 1000);
}

function updateProgress() {
  const dur = audio.duration || (currentSong?.lyrics?.slice(-1)[0]?.time + 5) || 60;
  document.getElementById('time-cur').textContent = fmt(currentTime);
  document.getElementById('time-dur').textContent = fmt(dur);
  updateProgressFill();
}

window.openForm = function() {
  editId = null;
  document.getElementById('form-title').textContent = 'Nouvelle chanson';
  ['f-title','f-artist','f-audio','f-raw','f-lrc'].forEach(id => document.getElementById(id).value = '');
  resetTap();
  document.getElementById('form-card').scrollIntoView({behavior:'smooth'});
}

window.editSong = function(id) {
  const s = songs.find(x => x.id === id); if (!s) return;
  editId = id;
  document.getElementById('form-title').textContent = `Modifier : ${s.title}`;
  document.getElementById('f-title').value = s.title;
  document.getElementById('f-artist').value = s.artist || '';
  document.getElementById('f-audio').value = s.audioUrl || '';
  document.getElementById('f-lrc').value = (s.lyrics || []).map(l => `[${fmtLRC(l.time)}] ${l.text}`).join('\n');
  switchTab('lrc');
  document.getElementById('form-card').scrollIntoView({behavior:'smooth'});
}

window.deleteSong = async function(id) {
  if (!confirm('Supprimer cette chanson ?')) return;
  await deleteDoc(doc(db, 'songs', id));
  if (currentSong?.id === id) {
    currentSong = null;
    document.getElementById('lyrics-zone').innerHTML = '<div class="no-song">Sélectionne une chanson</div>';
  }
  toast('Chanson supprimée', 'ok');
}

window.switchTab = function(t) {
  currentTab = t;
  document.getElementById('tap-panel').style.display = t === 'tap' ? 'block' : 'none';
  document.getElementById('lrc-panel').style.display = t === 'lrc' ? 'block' : 'none';
  document.getElementById('tab-tap').classList.toggle('active', t === 'tap');
  document.getElementById('tab-lrc').classList.toggle('active', t === 'lrc');
}

function resetTap() {
  tapLines=[]; tapIdx=0; tapTime=0; tapRunning=false; clearInterval(tapInterval);
  document.getElementById('tap-input-area').style.display = 'block';
  document.getElementById('tap-sync-area').style.display = 'none';
  document.getElementById('tap-actions').innerHTML = '<button class="btn-start" onclick="startTap()">▶ Lancer la synchro</button>';
  document.getElementById('tap-hint').textContent = '';
}

window.startTap = function() {
  const raw = document.getElementById('f-raw').value.trim().split('\n').filter(Boolean);
  if (!raw.length) { toast("Colle les paroles d'abord", 'err'); return; }
  const inputUrl = document.getElementById('f-audio').value.trim();
  if (inputUrl) { audio.src = inputUrl; audio.load(); }
  tapLines = raw.map(text => ({text, time: null})); tapIdx=0; tapTime=0; tapRunning=true;
  document.getElementById('tap-input-area').style.display = 'none';
  document.getElementById('tap-sync-area').style.display = 'block';
  renderTapLines();
  document.getElementById('tap-actions').innerHTML = `<button class="btn-tap" id="tap-btn" onclick="doTap()">TAP</button><span style="font-size:13px;color:var(--text-muted);min-width:50px;font-family:monospace;font-weight:700;" id="tap-timer">0:00</span><button class="btn-reset" onclick="resetTap()">Reset</button>`;
  const tapBtnEl = document.getElementById('tap-btn');
  if (tapBtnEl) {
    tapBtnEl.addEventListener('touchstart', (e) => { e.preventDefault(); doTap(); }, { passive: false });
  }
  document.getElementById('tap-hint').textContent = `Ligne 1/${tapLines.length} — Appuie TAP à chaque nouvelle ligne`;
  clearInterval(tapInterval);

  if (audio.src) {
    audio.currentTime = 0;
    audio.play().then(() => {
      tapInterval = setInterval(() => {
        tapTime = audio.currentTime;
        const el = document.getElementById('tap-timer');
        if (el) el.textContent = fmt(tapTime);
      }, 50);
    }).catch(() => {
      tapInterval = setInterval(() => { tapTime+=0.1; const el=document.getElementById('tap-timer'); if(el) el.textContent=fmt(tapTime); }, 100);
    });
  } else {
    tapInterval = setInterval(() => { tapTime+=0.1; const el=document.getElementById('tap-timer'); if(el) el.textContent=fmt(tapTime); }, 100);
  }
}

window.doTap = function() {
  if (!tapRunning || tapIdx >= tapLines.length) return;
  const t = (audio.src && !audio.paused) ? audio.currentTime : tapTime;
  tapLines[tapIdx].time = t; tapIdx++; renderTapLines();
  if (tapIdx >= tapLines.length) {
    clearInterval(tapInterval); tapRunning=false; audio.pause();
    document.getElementById('tap-actions').innerHTML = '<button class="btn-reset" onclick="resetTap()">Recommencer</button>';
    document.getElementById('tap-hint').textContent = 'Synchronisation terminée ! Tu peux publier.';
    toast('Synchro terminée !', 'ok');
  } else {
    document.getElementById('tap-hint').textContent = `Ligne ${tapIdx+1}/${tapLines.length}`;
  }
}

function renderTapLines() {
  const el = document.getElementById('tap-lines-view');
  el.innerHTML = tapLines.map((l,i) => {
    let cls = i < tapIdx ? 'done' : i === tapIdx ? 'current' : 'pending';
    return `<div class="tap-line ${cls}"><span class="tap-time">[${l.time!==null?fmtLRC(l.time):'--:--.--'}]</span><span>${l.text}</span></div>`;
  }).join('');
  const cur = el.querySelectorAll('.tap-line')[tapIdx];
  if (cur) cur.scrollIntoView({block:'nearest'});
}

function parseLRC(text) {
  const lines = [];
  for (const raw of text.split('\n')) {
    const m = raw.match(/^\[(\d+):(\d+)\.?(\d*)\]\s*(.*)$/);
    if (m) { const t=parseInt(m[1])*60+parseInt(m[2])+(m[3]?parseInt(m[3].padEnd(2,'0'))/100:0); if(m[4].trim()) lines.push({time:t,text:m[4]}); }
  }
  return lines.sort((a,b)=>a.time-b.time);
}

function fmtLRC(s) { const m=Math.floor(s/60),sec=Math.floor(s%60),cs=Math.round((s%1)*100); return `${m.toString().padStart(2,'0')}:${sec.toString().padStart(2,'0')}.${cs.toString().padStart(2,'0')}`; }

window.saveSong = async function() {
  const title = document.getElementById('f-title').value.trim();
  if (!title) { toast('Titre requis', 'err'); return; }
  let lyrics = [];
  if (currentTab==='lrc') { lyrics=parseLRC(document.getElementById('f-lrc').value); if(!lyrics.length){toast('Format LRC invalide','err');return;} }
  else { lyrics=tapLines.filter(l=>l.time!==null).map(l=>({time:l.time,text:l.text})); if(!lyrics.length){toast("Lance la synchro d'abord",'err');return;} }
  const data = {title, artist:document.getElementById('f-artist').value.trim(), audioUrl:document.getElementById('f-audio').value.trim(), lyrics, createdAt:Date.now()};
  if (editId) { await updateDoc(doc(db,'songs',editId),data); toast('Chanson mise à jour !','ok'); }
  else { await addDoc(songsCol,data); toast('Chanson publiée !','ok'); }
  openForm();
}

function toast(msg, type) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = `toast ${type} show`;
  setTimeout(() => el.classList.remove('show'), 3000);
}

function centerLineInZone(zoneId, lineId) {
  // Optionnel : Gérer le scroll du calibrage si implémenté manuellement.
  // (actuellement l'UI le fait via le positionnement absolu/padding, 
  // mais vous avez appelé la fonction dans le code d'origine)
}

await loadConfig();
loadSongs();
