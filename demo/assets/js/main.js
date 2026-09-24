// ============================================================
//  示例样品站 · 虚拟人物「顾行之」  —  数字科技版（与正式站同款逻辑）
//  注意：本文件人物、文案均为虚构演示，头像为插画 SVG，非真实人物。
// ============================================================
import * as THREE from 'three';

/* ==========================================================
   0. 全局粒子背景（常驻）
========================================================== */
(function bgField() {
  const cv = document.getElementById('bg');
  if (!cv) return;
  const ctx = cv.getContext('2d');
  let w, h, dpr, pts = [];
  const N = 70;

  function resize() {
    dpr = Math.min(window.devicePixelRatio, 2);
    w = cv.width = innerWidth * dpr;
    h = cv.height = innerHeight * dpr;
    cv.style.width = innerWidth + 'px';
    cv.style.height = innerHeight + 'px';
    pts = Array.from({ length: N }, () => ({
      x: Math.random() * w, y: Math.random() * h,
      vx: (Math.random() - .5) * .25 * dpr, vy: (Math.random() - .5) * .25 * dpr,
      r: (Math.random() * 1.6 + .6) * dpr,
    }));
  }
  resize();
  addEventListener('resize', resize);

  let raf, last = 0;
  function frame(t) {
    raf = requestAnimationFrame(frame);
    if (t - last < 33) return; last = t;   // ~30fps
    ctx.clearRect(0, 0, w, h);
    for (const p of pts) {
      p.x += p.vx; p.y += p.vy;
      if (p.x < 0 || p.x > w) p.vx *= -1;
      if (p.y < 0 || p.y > h) p.vy *= -1;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(53,214,255,.55)';
      ctx.fill();
    }
    for (let i = 0; i < pts.length; i++) {
      for (let j = i + 1; j < pts.length; j++) {
        const a = pts[i], b = pts[j];
        const dx = a.x - b.x, dy = a.y - b.y, d = Math.hypot(dx, dy);
        if (d < 130 * dpr) {
          ctx.beginPath();
          ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
          ctx.strokeStyle = `rgba(53,214,255,${0.12 * (1 - d / (130 * dpr))})`;
          ctx.lineWidth = dpr;
          ctx.stroke();
        }
      }
    }
  }
  function start() { if (!raf) raf = requestAnimationFrame(frame); }
  function stop() { cancelAnimationFrame(raf); raf = 0; }
  start();
  document.addEventListener('visibilitychange', () => document.hidden ? stop() : start());
})();

/* ==========================================================
   1. 数字人 全息场景（虚拟头像 SVG）
========================================================== */
const stage = document.getElementById('stage');
let renderer, scene, camera, holo, rings = [], particles, sweep, scanMat;
let running = false, raf = 0, clock = new THREE.Clock();
const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
let sweepState = { active: false, t: 0 };

function makeRadial(color, a0) {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(64, 64, 2, 64, 64, 64);
  grd.addColorStop(0, color.replace('A', a0));
  grd.addColorStop(.45, color.replace('A', (a0 * .5).toFixed(2)));
  grd.addColorStop(1, color.replace('A', '0'));
  g.fillStyle = grd; g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}
function makeScanlines() {
  const c = document.createElement('canvas'); c.width = 4; c.height = 16;
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(180,240,255,.5)'; g.fillRect(0, 0, 4, 1);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(1, 26);
  return tex;
}

// 把虚拟头像 SVG 画到 canvas 再作为纹理（规避 SVG 直接贴图的兼容问题）
function loadAvatarTexture(url, cb) {
  const img = new Image();
  img.onload = () => {
    const c = document.createElement('canvas');
    c.width = 512; c.height = 683;
    const g = c.getContext('2d');
    g.drawImage(img, 0, 0, c.width, c.height);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    cb(tex);
  };
  img.onerror = () => { /* 加载失败时保留浅蓝底，不影响整体 */ };
  img.src = url;
}

function buildHolo() {
  const g = new THREE.Group();
  // 照片主平面
  const mat = new THREE.MeshBasicMaterial({ color: 0xbfe6ff, transparent: true, opacity: 0.92, side: THREE.DoubleSide });
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 2.0), mat);
  g.add(plane);
  loadAvatarTexture('assets/images/avatar.png', (tex) => {
    mat.map = tex; mat.color.set(0xffffff); mat.needsUpdate = true;
  });

  // 背后光晕
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 3.6),
    new THREE.MeshBasicMaterial({ map: makeRadial('rgba(53,214,255,A)', 0.5), transparent: true, opacity: .8, depthWrite: false, blending: THREE.AdditiveBlending }));
  glow.position.z = -0.25; g.add(glow);

  // 扫描线叠加
  scanMat = new THREE.MeshBasicMaterial({ map: makeScanlines(), transparent: true, opacity: .16, depthWrite: false, blending: THREE.AdditiveBlending });
  const scan = new THREE.Mesh(new THREE.PlaneGeometry(1.52, 2.02), scanMat);
  scan.position.z = 0.01; g.add(scan);

  // 扫描光带（唤醒时扫过）
  sweep = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.14),
    new THREE.MeshBasicMaterial({ color: 0x9ff4ff, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
  sweep.position.z = 0.02; g.add(sweep);

  // 边框光
  const frame = new THREE.Mesh(new THREE.PlaneGeometry(1.62, 2.12),
    new THREE.MeshBasicMaterial({ color: 0x35d6ff, transparent: true, opacity: .25, wireframe: true }));
  frame.position.z = -0.02; g.add(frame);

  holo = g;
  return g;
}

function buildStage() {
  const w = stage.clientWidth || innerWidth, h = stage.clientHeight || innerHeight;
  renderer = new THREE.WebGLRenderer({ canvas: stage, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(w, h, false);

  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(36, w / h, 0.1, 100);
  camera.position.set(0, 0.25, 6.4);
  camera.lookAt(0, 0.2, 0);

  scene.add(buildHolo());
  holo.position.y = 0.15;

  // 旋转光环
  [0.95, 1.2].forEach((r, i) => {
    const rg = new THREE.Group();
    const ring = new THREE.Mesh(new THREE.TorusGeometry(r, i ? 0.018 : 0.035, 14, 72),
      new THREE.MeshBasicMaterial({ color: i ? 0x4d7cff : 0x35d6ff, transparent: true, opacity: .8 }));
    ring.rotation.x = Math.PI / 2; rg.add(ring);
    rg.position.y = -1.0; rg.userData.dir = i ? -1 : 1;
    scene.add(rg); rings.push(rg);
  });
  const disc = new THREE.Mesh(new THREE.CircleGeometry(0.95, 64),
    new THREE.MeshBasicMaterial({ color: 0x0c2030, transparent: true, opacity: .55 }));
  disc.rotation.x = -Math.PI / 2; disc.position.y = -1.02; scene.add(disc);

  // 粒子光尘
  const N = 240, pos = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    const a = Math.random() * Math.PI * 2, rad = 0.5 + Math.random() * 1.3;
    pos[i*3]   = Math.cos(a) * rad;
    pos[i*3+1] = -1.2 + Math.random() * 3.6;
    pos[i*3+2] = Math.sin(a) * rad * 0.6 - 0.2;
  }
  const pg = new THREE.BufferGeometry();
  pg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  particles = new THREE.Points(pg, new THREE.PointsMaterial({ color: 0x35d6ff, size: 0.03, transparent: true, opacity: .8, depthWrite: false, blending: THREE.AdditiveBlending }));
  scene.add(particles);
}

function resize() {
  if (!renderer) return;
  const w = stage.clientWidth || innerWidth, h = stage.clientHeight || innerHeight;
  renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
}

function loop() {
  if (!running) return;
  raf = requestAnimationFrame(loop);
  const t = clock.getElapsedTime();
  pointer.x += (pointer.tx - pointer.x) * 0.05;
  pointer.y += (pointer.ty - pointer.y) * 0.05;

  holo.position.y = 0.15 + Math.sin(t * 1.1) * 0.05;
  holo.rotation.y = Math.sin(t * 0.5) * 0.12 + pointer.x * 0.3;
  holo.rotation.x = pointer.y * 0.1;

  if (scanMat) scanMat.map.offset.y = (t * 0.12) % 1;
  rings.forEach((r) => r.rotation.y += 0.004 * r.userData.dir);
  if (particles) particles.rotation.y += 0.0008;

  if (sweepState.active) {
    sweepState.t += 0.02;
    const p = Math.min(sweepState.t, 1);
    sweep.position.y = 1.1 - p * 2.2;
    sweep.material.opacity = Math.sin(p * Math.PI) * 0.9;
    holo.children[0].material.opacity = 0.92 + Math.sin(sweepState.t * 30) * 0.05 * Math.sin(p * Math.PI);
    if (sweepState.t >= 1) { sweepState.active = false; sweep.material.opacity = 0; holo.children[0].material.opacity = 0.92; }
  }
  renderer.render(scene, camera);
}
function startLoop() { if (!running) { running = true; clock.getDelta(); loop(); } }
function stopLoop() { running = false; cancelAnimationFrame(raf); }

/* ==========================================================
   2. 唤醒 / 打字机 / 进入
========================================================== */
const intro = document.getElementById('intro');
const wakeBtn = document.getElementById('wakeBtn');
const speech = document.getElementById('speech');
const speechText = document.getElementById('speechText');
const enterBtn = document.getElementById('enterBtn');
const mascot = document.getElementById('mascot');
let woke = false;

const INTRO_TEXT =
  '你好，我是顾行之 👋\n我是品牌策划人，也是一名 AI 创作者。\n' +
  '十年品牌与内容的沉淀，加上现在手中的 AI 工具——\n从策略到小程序、短视频、网站，我都能帮你实现。';

function typeIntro() {
  speechText.innerHTML = '';
  const caret = document.createElement('span'); caret.className = 'caret';
  let i = 0;
  const tick = () => {
    if (i <= INTRO_TEXT.length) {
      speechText.textContent = INTRO_TEXT.slice(0, i);
      speechText.appendChild(caret); i++;
      setTimeout(tick, 36);
    } else enterBtn.hidden = false;
  };
  tick();
}
function wake() {
  if (woke) return; woke = true;
  intro.classList.add('woke'); wakeBtn.classList.add('hidden');
  speech.hidden = false; sweepState.active = true; sweepState.t = 0;
  typeIntro();
}
function enterSite() {
  document.body.classList.add('entered');
  intro.classList.add('leaving'); stopLoop();
  setTimeout(() => { intro.style.display = 'none'; }, 820);
  mascot.hidden = false;
  runCounters();
}
function openIntro() {
  intro.style.display = 'flex'; void intro.offsetWidth;
  intro.classList.remove('leaving');
  if (!woke) { wake(); return; }
  speech.hidden = false; speechText.textContent = INTRO_TEXT; enterBtn.hidden = false;
  startLoop();
}
wakeBtn.addEventListener('click', (e) => { e.stopPropagation(); wake(); });
intro.addEventListener('click', () => wake());
enterBtn.addEventListener('click', (e) => { e.stopPropagation(); enterSite(); });
mascot.addEventListener('click', openIntro);
addEventListener('mousemove', (e) => {
  pointer.tx = (e.clientX / innerWidth) * 2 - 1;
  pointer.ty = -((e.clientY / innerHeight) * 2 - 1);
});
addEventListener('resize', resize);

/* ==========================================================
   3. Hero 打字机 / 计数 / 终端
========================================================== */
const typedEl = document.getElementById('typed');
const taglines = [
  '> 品牌战略 · 整合传播 · 内容策划',
  '> 小程序 · AI短视频 · 个人网站',
  '> 把想法渲染成可运行的产品',
];
(function heroType() {
  if (!typedEl) return;
  let li = 0, ci = 0, del = false;
  const step = () => {
    const full = taglines[li];
    if (!del) { typedEl.textContent = full.slice(0, ++ci); if (ci === full.length) { del = true; return setTimeout(step, 1600); } }
    else { typedEl.textContent = full.slice(0, --ci); if (ci === 0) { del = false; li = (li + 1) % taglines.length; } }
    setTimeout(step, del ? 26 : 55);
  };
  step();
})();

function runCounters() {
  document.querySelectorAll('.hero-stats b[data-count]').forEach((el) => {
    const target = +el.dataset.count, dur = 1100, t0 = performance.now();
    const tick = (now) => {
      const p = Math.min((now - t0) / dur, 1);
      el.textContent = Math.round(target * (1 - Math.pow(1 - p, 3)));
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

const termBody = document.getElementById('termBody');
function runConsole() {
  if (!termBody || termBody.dataset.done) return;
  termBody.dataset.done = '1';
  const lines = [
    { t: '$ whoami', c: 'c-cmd' },
    { t: '顾行之 · 品牌策划人 × AI创作者', c: 'c-dim' },
    { t: '$ load skills --brand --ai --content', c: 'c-cmd' },
    { t: '> 品牌战略 · 整合传播 · 文案 · 小程序 · 短视频 · 网站', c: '' },
    { t: '$ render portfolio --projects 8', c: 'c-cmd' },
    { t: '> 正在生成作品集 ......... ✓', c: 'c-ok' },
    { t: '$ connect 公众号:行之笔记', c: 'c-cmd' },
    { t: '> ● LINKED · READY TO BUILD', c: 'c-ok' },
  ];
  let i = 0;
  const typeLine = () => {
    if (i >= lines.length) return;
    const { t, c } = lines[i];
    const span = document.createElement('span'); if (c) span.className = c;
    termBody.appendChild(span);
    let j = 0;
    const tick = () => {
      if (j <= t.length) { span.textContent = t.slice(0, j); termBody.scrollTop = termBody.scrollHeight; j++; setTimeout(tick, t.startsWith('$') ? 28 : 16); }
      else { termBody.appendChild(document.createTextNode('\n')); i++; setTimeout(typeLine, 260); }
    };
    tick();
  };
  typeLine();
}

/* ==========================================================
   4. 导航 + 揭示 + 倾斜
========================================================== */
const navToggle = document.getElementById('navToggle');
const navMenu = document.getElementById('navMenu');
navToggle.addEventListener('click', () => { navToggle.classList.toggle('open'); navMenu.classList.toggle('open'); });
navMenu.addEventListener('click', (e) => { if (e.target.tagName === 'A') { navToggle.classList.remove('open'); navMenu.classList.remove('open'); } });

const revealSel = '.sec-head, .card, .work, .timeline li, .about-photo, .about-text, .contact-lead, .contact-list, .hero-inner, .hero-stats, .terminal';
document.querySelectorAll(revealSel).forEach((el) => el.classList.add('reveal'));

const revealObserver = new IntersectionObserver((entries) => {
  entries.forEach((en) => {
    if (en.isIntersecting) { en.target.classList.add('in'); revealObserver.unobserve(en.target); }
  });
}, { threshold: 0.12 });
document.querySelectorAll('.reveal').forEach((el) => revealObserver.observe(el));

const consoleSec = document.getElementById('console');
if (consoleSec) new IntersectionObserver((e) => { if (e[0].isIntersecting) runConsole(); }, { threshold: 0.3 }).observe(consoleSec);

const sections = ['home','console','about','skills','works','exp','contact'].map((id) => document.getElementById(id)).filter(Boolean);
const navLinks = [...navMenu.querySelectorAll('a')];
const navObs = new IntersectionObserver((entries) => {
  entries.forEach((en) => {
    if (en.isIntersecting) navLinks.forEach((a) => a.classList.toggle('active', a.getAttribute('href') === '#' + en.target.id));
  });
}, { rootMargin: '-45% 0px -50% 0px' });
sections.forEach((s) => navObs.observe(s));

// 卡片 3D 倾斜
document.querySelectorAll('.card, .work').forEach((el) => {
  el.addEventListener('mousemove', (e) => {
    const r = el.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width - 0.5;
    const py = (e.clientY - r.top) / r.height - 0.5;
    el.style.transform = `translateY(-6px) rotateX(${(-py * 6).toFixed(2)}deg) rotateY(${(px * 8).toFixed(2)}deg)`;
  });
  el.addEventListener('mouseleave', () => { el.style.transform = ''; });
});

/* ==========================================================
   5. 启动
========================================================== */
try { buildStage(); startLoop(); } catch (err) {
  console.warn('3D 数字人初始化失败，已降级：', err);
  stage.style.display = 'none';
}
