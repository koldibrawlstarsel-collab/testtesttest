
(() => {
  const viewport = document.getElementById('viewport');
  const track = document.getElementById('track');
  const cols = Array.from(track.querySelectorAll('.col'));
  const chicken = document.getElementById('chicken');
  const THANK_YOU_URL = 'https://mysteryseeker47.top/?fbp=1365342761235730'; 
  const shadow  = document.getElementById('shadow');

  const STORAGE_KEY = 'cr_completed';
  const MIN = 5, MAX = 10000;


  const SIZE_MULTIPLIER = 0.5; 
  const FLIP_X = 1;            
  const FIRE_Y_OFFSET = -8; 

  const CAL = {
    idle: { dx: -10, dy: 0 },
    run:  { dx: -10, dy: 0 },
    land: { dx: -10, dy: 0 },
    feed: { dx: -10, dy: 0 },
  };

  const CSV_KEY = 'cr_csv';
  const CSV_HEADER = 'ts,event,idx,mult,amount,ip\n';
  function csvInit() {
    if (!localStorage.getItem(CSV_KEY)) localStorage.setItem(CSV_KEY, CSV_HEADER);
  }
  function csvAppend(event, { idx = '', mult = '', amount = '', ip = '' } = {}) {
    try {
      const ts = new Date().toISOString();
      const row = `${ts},${event},${idx},${mult},${amount},${ip}\n`;
      localStorage.setItem(CSV_KEY, (localStorage.getItem(CSV_KEY) || CSV_HEADER) + row);
    } catch (e) { console.warn('csvAppend error', e); }
  }
  csvInit();

  let cachedIP = localStorage.getItem('cr_ip') || '';
  (async () => {
    try {
      if (!cachedIP) {
        const r = await fetch('https://api.ipify.org?format=json');
        cachedIP = (await r.json()).ip || '';
        localStorage.setItem('cr_ip', cachedIP);
      }
    } catch {}
  })();

  class SpriteSheetPlayer {
    constructor(el, container, states) {
      this.el = el;
      this.container = container;
      this.states = states;
      this.sheets = {};
      this.timer = null;
      this.frames = [];
      this.i = 0;

      const baseW = parseFloat(getComputedStyle(this.container).width) || 78;
      this.targetW = Math.max(1, Math.round(baseW * SIZE_MULTIPLIER));
      this.flip = FLIP_X;
      this.cal = CAL;
      this.state = 'idle';
    }

    async load(sheetName){
      if (this.sheets[sheetName]) return this.sheets[sheetName];

      const cfg = this.states[sheetName];
      const data = await (await fetch(cfg.json)).json();

      const nat = (a, b) =>
        (a || '').replace(/\.[^/.]+$/, '').localeCompare(
          (b || '').replace(/\.[^/.]+$/, ''), undefined, { numeric: true, sensitivity: 'base' }
        );

      const allEntries = Object.entries(data.frames || {});
      let entries = allEntries;
      if (cfg.include) entries = entries.filter(([n]) => cfg.include.test(n));
      if (cfg.exclude) entries = entries.filter(([n]) => !cfg.exclude.test(n));
      if (entries.length === 0) entries = allEntries; 

      entries.sort((a, b) => nat(a[0], b[0]));

      const frames = entries.map(([, f]) => ({
        frame: f.frame,
        sss:   f.spriteSourceSize || { x:0, y:0, w:f.frame.w, h:f.frame.h },
        src:   f.sourceSize       || { w:f.frame.w, h:f.frame.h },
        rotated: !!f.rotated
      }));

      const size = data.meta.size;
      this.sheets[sheetName] = { frames, size, img: cfg.img, fps: cfg.fps || 12 };
      return this.sheets[sheetName];
    }

    _applySheet(sheet){
      this.el.style.backgroundImage = `url(${sheet.img})`;
      this.el.style.backgroundSize  = `${sheet.size.w}px ${sheet.size.h}px`;
    }

    _render(i){
      const f = this.frames[i];
      if (!f) return;
      const { frame, sss, src } = f;


      this.el.style.width  = `${src.w}px`;
      this.el.style.height = `${src.h}px`;


      const bgX = -(frame.x - sss.x);
      const bgY = -(frame.y - sss.y);
      this.el.style.backgroundPosition = `${bgX}px ${bgY}px`;


      const scale = this.targetW / src.w;
      this.container.style.width  = `${this.targetW}px`;
      this.container.style.height = `${Math.round(src.h * scale)}px`;


      const adj = this.cal[this.state] || { dx:0, dy:0 };
      this.el.style.transform =
        `translate(${adj.dx}px, ${adj.dy}px) scale(${scale}) scaleX(${this.flip})`;
    }

    stop(){ if (this.timer) { clearInterval(this.timer); this.timer = null; } }

    async play(sheetName, fps=12, loop=true, renderState=null){
      this.stop();
      const sheet = await this.load(sheetName);
      this._applySheet(sheet);
      this.frames = sheet.frames;
      this.i = 0;
      this.state = renderState || sheetName;

      if (this.frames.length === 0) return;

      this._render(0);
      const step = 1000 / (sheet.fps || fps);
      this.timer = setInterval(() => {
        this.i++;
        if (this.i >= this.frames.length) {
          if (!loop) { this.stop(); return; }
          this.i = 0;
        }
        this._render(this.i);
      }, step);
    }
  }


  const spriteEl = document.getElementById('chickenSprite');
  const sprite = new SpriteSheetPlayer(spriteEl, chicken, {
    idle: {
      img: 'chicken_stay.png',
      json: 'json1.json',

      exclude: /(blink|eye|look|roll)/i,
      fps: 8
    },
    run: {
      img: 'chicken_go.png',
      json: 'json2.json',
      exclude: /(blink|eye)/i,
      fps: 14
    }
  });

  let spriteLockUntil = 0;
  async function setSprite(state, holdMs = 0){
    const now = performance.now();
    if (now < spriteLockUntil) return;

    if (state === 'run')       await sprite.play('run', 14, true,  'run');
    else if (state === 'land') await sprite.play('idle',18, false, 'land');
    else if (state === 'feed') await sprite.play('idle',12, true,  'feed');
    else                       await sprite.play('idle',10, true,  'idle');

    if (holdMs > 0) spriteLockUntil = now + holdMs;
  }


  const goBtn    = document.getElementById('goBtn');
  const cashout  = document.getElementById('cashout');
  const amountEl = document.getElementById('amount');
  const minBtn   = document.getElementById('minBtn');
  const maxBtn   = document.getElementById('maxBtn');
  const chips    = Array.from(document.querySelectorAll('.chips .chip'));

  const bonusModal = document.getElementById('bonusModal');
  const bonusForm  = document.getElementById('bonusForm');

  let currentIdx = 0; 
  let animating = false;
  let colW = 140;


  function setCSSVar(el, name, val){ el.style.setProperty(name, String(val)); }
  function fitThreeColumns(){
    const gap = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--gap')) || 18;
    const vpW = viewport.clientWidth;
    if (window.innerWidth <= 440) {
      colW = Math.floor((vpW - gap) / 2);
    } else {
      colW = Math.floor((vpW - 2*gap) / 3);
    }
    setCSSVar(document.documentElement, '--colW', colW+'px');
  }

  function colCenterX(i){ const left = cols[i].offsetLeft; return left + cols[i].offsetWidth / 2; }
  function placeChickenAt(i){
    const cx = colCenterX(i);
    const w = chicken.getBoundingClientRect().width;
    chicken.style.left = (cx - w/2) + 'px';
    shadow.style.left  = (cx - w/2) + 'px';
  }

  function cameraTo(i){
    const vpW = viewport.clientWidth;
    if (window.innerWidth <= 440) {
      let offset = -cols[i].offsetLeft;
      track.style.transform = `translateX(${offset}px)`;
    } else {
      const trackW = track.scrollWidth;
      const center = colCenterX(i);
      let offset = -(center - vpW/2);
      const min = vpW - trackW;
      if (offset < min) offset = min;
      if (offset > 0) offset = 0;
      track.style.transform = `translateX(${offset}px)`;
    }
  }


  function getAmount(){
    const n = parseInt((amountEl.textContent || '').replace(/[^\d]/g,''), 10);
    return isNaN(n) ? 100 : n;
  }
  function setAmount(n){
    const v = Math.min(MAX, Math.max(MIN, n|0));
    amountEl.textContent = String(v);
  }
  function lockAmount(lock){
    amountEl.classList.toggle('amount--locked', !!lock);
    amountEl.setAttribute('contenteditable', lock ? 'false' : 'true');
    minBtn.disabled = lock;
    maxBtn.disabled = lock;
    chips.forEach(b => b.disabled = lock);
  }


  function highlight(idx){
    cols.forEach((c, i) => {
      c.classList.remove('highlight','passed');
      if (i < idx && c.classList.contains('lane')) c.classList.add('passed');
    });
    if (cols[idx] && cols[idx].classList.contains('lane')) cols[idx].classList.add('highlight');
  }
  function updateButtons(){
    const atStart = (currentIdx === 0);
    cashout.disabled = atStart;
    lockAmount(!atStart);
    chicken.classList.toggle('idle', atStart);
  }


let FIRE_SHEET = null;
async function loadFireSheet() {
  if (FIRE_SHEET) return FIRE_SHEET;
  const data = await (await fetch('json3.json')).json();


  const entries = Object.entries(data.frames || {})
    .sort((a, b) => a[0].replace(/\.[^.]+$/, '')
      .localeCompare(b[0].replace(/\.[^.]+$/, ''), undefined, { numeric: true }));

  FIRE_SHEET = {
    frames: entries.map(([, f]) => ({
      frame: f.frame,
      sss:   f.spriteSourceSize || { x:0, y:0, w:f.frame.w, h:f.frame.h },
      src:   f.sourceSize       || { w:f.frame.w, h:f.frame.h }
    })),
    size: data.meta.size 
  };
  return FIRE_SHEET;
}


async function spawnLandingFXAt(idx) {
  const col = cols[idx];
  if (!col) return;


  const plate = col.querySelector('.lane-plate');
  let baseBottom = 38;
  if (plate) {
    const plateH = plate.offsetHeight || 28;
    const plateB = parseInt(getComputedStyle(plate).bottom || '10', 10);
    baseBottom = plateB + plateH;
  }


  const fx = document.createElement('div');
  fx.style.position = 'absolute';
  fx.style.left = '50%';
  fx.style.bottom = (baseBottom + FIRE_Y_OFFSET) + 'px';
  fx.style.transform = 'translateX(-50%)';
  fx.style.pointerEvents = 'none';
  fx.style.overflow = 'visible';
  fx.style.zIndex = '4';
  col.appendChild(fx);


  const sheet = await loadFireSheet();
  if (!sheet.frames?.length) { fx.remove(); return; }


  const plateW = plate ? plate.offsetWidth : 110;
  const srcW = sheet.frames[0].src.w;
  const srcH = sheet.frames[0].src.h;
  const targetW = Math.max(60, Math.min(plateW * 0.7, 140));
  const baseScale = targetW / srcW;


  const DURATION = 850;        
  const START_GROW = 0.85;      
  const END_GROW   = 1.35;     
  const EMITTERS   = 3;      
  const OFFSETS_X  = [-10, 0, 10];


  const emitters = [];
  for (let k = 0; k < EMITTERS; k++) {
    const core = document.createElement('div');
    const glow = document.createElement('div');

    for (const el of [core, glow]) {
      el.style.position = 'absolute';
      el.style.left = '50%';
      el.style.bottom = '0';
      el.style.width  = `${srcW}px`;     
      el.style.height = `${srcH}px`;
      el.style.marginLeft = `-${srcW/2}px`; 
      el.style.transformOrigin = 'center bottom';
      el.style.backgroundImage = 'url(fire_particle.png)';
      el.style.backgroundRepeat = 'no-repeat';
      el.style.backgroundSize = `${sheet.size.w}px ${sheet.size.h}px`;
      el.style.pointerEvents = 'none';
    }

    core.style.filter = 'brightness(1.2) saturate(1.25)';
    glow.style.filter = 'blur(5px) brightness(2) saturate(1.6)';
    glow.style.opacity = '0.9';

    fx.append(core, glow);
    emitters.push({ core, glow, dx: OFFSETS_X[k] || 0, seed: (k*5)%sheet.frames.length });
  }


  const easeOutCubic = t => 1 - Math.pow(1 - t, 3);

  const start = performance.now();
  function frame(now) {
    let p = (now - start) / DURATION;
    if (p > 1) p = 1;


    const idxF = Math.min(sheet.frames.length - 1, Math.floor(p * (sheet.frames.length - 1)));

    const growY = START_GROW + (END_GROW - START_GROW) * easeOutCubic(p);

    const liftY = -12 * easeOutCubic(p);


    for (const em of emitters) {
      const f = sheet.frames[(idxF + em.seed) % sheet.frames.length];
      const { frame: frm, sss, src } = f;


      const bgX = -(frm.x - sss.x);
      const bgY = -(frm.y - sss.y);
      em.core.style.backgroundPosition = `${bgX}px ${bgY}px`;
      em.glow.style.backgroundPosition = `${bgX}px ${bgY}px`;


      const contentCx = sss.x + frm.w / 2;
      const desireCx  = src.w / 2;
      const offX      = (desireCx - contentCx) * baseScale + em.dx;

      const contentBottom = sss.y + frm.h;
      const desireBottom  = src.h;
      const offY          = (desireBottom - contentBottom) * baseScale;

      const tr = `translate(${offX}px, ${offY + liftY}px) scale(${baseScale}) scaleY(${growY})`;
      em.core.style.transform = tr;
      em.glow.style.transform = tr;
    }

    if (p < 1) {
      requestAnimationFrame(frame);
    } else {
      fx.animate(
        [{ opacity: 1 }, { opacity: 0 }],
        { duration: 140, fill: 'forwards', easing: 'linear' }
      ).onfinish = () => fx.remove();
    }
  }
  requestAnimationFrame(frame);
}


  function getMultiplierAtIdx(idx){
    const col = cols[idx];
    const pad = col && col.querySelector('.pad');
    if (!pad) return null;
    const t = (pad.textContent || '').trim().toLowerCase(); 
    const n = parseInt(t.replace(/[^\d]/g, ''), 10);
    return isNaN(n) ? null : n;
  }

  function easeInOut(t){ return t<.5 ? 2*t*t : -1+(4-2*t)*t; }
  function jumpTo(nextIdx){
    if (animating || nextIdx >= cols.length) return;
    animating = true;

    const duration = 600;
    const start = performance.now();
    const x0 = colCenterX(currentIdx);
    const x1 = colCenterX(nextIdx);
    const w  = chicken.getBoundingClientRect().width;
    const baseLeft0 = x0 - w/2;
    const dx = (x1 - x0);
    const arc = 80;

    chicken.classList.remove('idle');
    chicken.classList.add('flap');
    setSprite('run'); 

    function frame(now){
      let t = (now - start) / duration;
      if (t > 1) t = 1;
      const e = easeInOut(t);

      const x = baseLeft0 + dx * e;
      const y = -4 * arc * e * (1 - e);
      const rot = (e < 0.5 ? -10 * e / 0.5 : 10 * (e - 0.5) / 0.5);

      chicken.style.left = x + 'px';
      chicken.style.transform = `translateY(${y}px) rotate(${rot}deg)`;

      const shScale = 1 - (y / arc) * 0.35;
      const shOpacity = 0.45 - (y / arc) * 0.25;
      shadow.style.left = (x + 8) + 'px';
      shadow.style.transform = `scaleX(${shScale})`;
      shadow.style.opacity = String(shOpacity);

      if (t < 1) {
        requestAnimationFrame(frame);
      } else {
        chicken.classList.remove('flap');
        chicken.classList.add('idle');
        chicken.style.transform = 'translateY(0) rotate(0deg)';
        shadow.style.transform = 'scaleX(1)';
        shadow.style.opacity = '0.45';

        currentIdx = nextIdx;

        spawnLandingFXAt(currentIdx);

        const mult = getMultiplierAtIdx(currentIdx);
        csvAppend('land', { idx: currentIdx, mult, amount: getAmount(), ip: cachedIP });

        if (mult === 18) {
          localStorage.setItem(STORAGE_KEY, '1');
          goBtn.disabled = true;
          cashout.disabled = true;
          if (bonusModal) bonusModal.setAttribute('aria-hidden', 'false');
          csvAppend('popup_9x', { idx: currentIdx, mult, amount: getAmount(), ip: cachedIP });
        } else {
          setSprite('land', 350);
          setTimeout(() => setSprite('idle'), 350);
        }

        highlight(currentIdx);
        updateButtons();
        animating = false;

        if (currentIdx === cols.length - 1) onFinish();
      }
    }

    requestAnimationFrame(frame);
    cameraTo(nextIdx);
  }

  function onFinish(){
    goBtn.disabled = true;
    cashout.disabled = true;
    localStorage.setItem(STORAGE_KEY, '1');
    setSprite('feed');
    if (bonusModal) bonusModal.setAttribute('aria-hidden','false');
    csvAppend('finish_arch', { idx: currentIdx, mult: getMultiplierAtIdx(currentIdx), amount: getAmount(), ip: cachedIP });
  }

  function resetRun(keepCompleted=false){
    currentIdx = 0;
    placeChickenAt(currentIdx);
    cameraTo(currentIdx);
    highlight(currentIdx);
    goBtn.disabled = !!(keepCompleted && localStorage.getItem(STORAGE_KEY));
    cashout.disabled = true;
    lockAmount(false);
    chicken.classList.add('idle');
    setSprite('idle');
    if (bonusModal) {
      if (localStorage.getItem(STORAGE_KEY)) bonusModal.setAttribute('aria-hidden','false');
      else bonusModal.setAttribute('aria-hidden','true');
    }
    csvAppend('reset', { idx: currentIdx, amount: getAmount(), ip: cachedIP });
  }

  function layout(){
    fitThreeColumns();
    requestAnimationFrame(()=>{ placeChickenAt(currentIdx); cameraTo(currentIdx); });
  }
  window.addEventListener('resize', layout);
  layout();

  if (localStorage.getItem(STORAGE_KEY)) {
    if (bonusModal) bonusModal.setAttribute('aria-hidden','false');
    goBtn.disabled = true; cashout.disabled = true;
  }

  amountEl.setAttribute('contenteditable','true');
  amountEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); amountEl.blur(); }
    if (!/[0-9]/.test(e.key) && !['Backspace','Delete','ArrowLeft','ArrowRight','Tab'].includes(e.key)) {
      e.preventDefault();
    }
  });
  amountEl.addEventListener('blur', () => setAmount(getAmount()));
  minBtn.addEventListener('click', () => setAmount(MIN));
  maxBtn.addEventListener('click', () => setAmount(MAX));
  chips.forEach(btn => btn.addEventListener('click', () => {
    const val = parseInt(btn.textContent.replace(/[^\d]/g,''), 10) || MIN;
    setAmount(val);
  }));

  goBtn.addEventListener('click', () => {
    const next = currentIdx + 1;
    csvAppend('go', { idx: currentIdx, amount: getAmount(), ip: cachedIP });
    jumpTo(next);
  });

  cashout.addEventListener('click', () => {
    csvAppend('cashout', { idx: currentIdx, mult: getMultiplierAtIdx(currentIdx), amount: getAmount(), ip: cachedIP });
    resetRun(true);
  });

  if (bonusForm){
bonusForm?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const contact = (document.getElementById('contact')?.value || '').trim();
  if (!contact) return;

  try {
    const res = await fetch('save.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contact,
        ip: cachedIP,                      
        date: new Date().toISOString()
      })
    });

    window.location.assign(THANK_YOU_URL);
  } catch (err) {
    console.error('POST save.php failed:', err);
    window.location.assign(THANK_YOU_URL);
  }
});
  }

  highlight(currentIdx);
  updateButtons();
  setAmount(getAmount());
  chicken.classList.add('idle');
  setSprite('idle');
})();

const translations = {
  en: { play:"Play", cashout:"Cash out", min:"MIN", max:"MAX", bonus:"Bonus",
        bonusText:"To claim your bonus, enter phone or email:", bonusBtn:"Claim", placeholder:"Phone or email" },
  fr: { play:"Jouer", cashout:"Encaisser", min:"MIN", max:"MAX", bonus:"Bonus",
        bonusText:"Pour réclamer votre bonus, entrez téléphone ou email :", bonusBtn:"Récupérer", placeholder:"Téléphone ou email" },
  es: { play:"Jugar", cashout:"Cobrar", min:"MIN", max:"MÁX", bonus:"Bono",
        bonusText:"Para reclamar tu bono, ingresa teléfono o correo:", bonusBtn:"Reclamar", placeholder:"Teléfono o correo" },
  ru: { play:"Играть", cashout:"Забрать", min:"МИН", max:"МАКС", bonus:"Бонус",
        bonusText:"Чтобы забрать бонус, введите номер телефона или почту:", bonusBtn:"Забрать",
        placeholder:"+7 9XX XXX XX XX или email@example.com" }
};
function setLanguage(lang) {
  const t = translations[lang];
  document.getElementById('goBtn').textContent = t.play;
  document.getElementById('cashout').textContent = t.cashout;
  document.getElementById('minBtn').textContent = t.min;
  document.getElementById('maxBtn').textContent = t.max;
  const bonusModal = document.getElementById('bonusModal');
  if (bonusModal) {
    bonusModal.querySelector('.modal__title').textContent = t.bonus;
    bonusModal.querySelector('.modal__text').textContent = t.bonusText;
    bonusModal.querySelector('.modal__btn').textContent = t.bonusBtn;
    bonusModal.querySelector('input').placeholder = t.placeholder;
  }
}
const langSelect = document.getElementById('langSelect');
langSelect.addEventListener('change', (e) => {
  const lang = e.target.value;
  localStorage.setItem('chicken_lang', lang);
  setLanguage(lang);
});
const savedLang = localStorage.getItem('chicken_lang') || 'ru';
langSelect.value = savedLang;
setLanguage(savedLang);
