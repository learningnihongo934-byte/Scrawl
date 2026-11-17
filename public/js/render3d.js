// Scrawl 3D: an open spellbook on a desk. The page texture (ink, stains, sigils) comes from PageLayer;
// wizards, spells and particles are low-poly painted meshes standing on the paper. Fixed angled camera.
import * as THREE from '../vendor/three.module.js';
import { W, H } from './data.js';
import { wallEnds } from './sim.js';
import { PageLayer, elc } from './render.js';

const U = 0.01;                                   // page px -> world units (page is 16 x 9)
export const pageH = x => { const d = Math.min(1, Math.abs(x / W - 0.5) * 2); return 0.03 + 0.15 * Math.sin(Math.PI * d * 0.92); };
const X = x => (x - W / 2) * U, Z = y => (y - H / 2) * U;
const R = Math.random;

const matCache = new Map();
function mat(color, o = {}) {
  const key = color + JSON.stringify(o);
  if (!matCache.has(key)) matCache.set(key, new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0, flatShading: true, ...o }));
  return matCache.get(key);
}
const glow = (color, k = 0.45, o = {}) => mat(color, { emissive: color, emissiveIntensity: k, ...o });
const at = (m, x, y, z) => { m.position.set(x, y, z); return m; };
function mesh(geo, m, cast = true) { const x = new THREE.Mesh(geo, m); x.castShadow = cast; x.receiveShadow = true; return x; }
const WALL_LOOK = {
  earth: ['#8a6a3e', {}], frost: ['#a9cbe6', { transparent: true, opacity: 0.85, roughness: 0.3 }], fire: ['#7d2412', { emissive: '#e0531e', emissiveIntensity: 0.55 }],
  storm: ['#7c5cc0', { emissive: '#7c5cc0', emissiveIntensity: 0.35 }], void: ['#2b2534', { metalness: 0.3, roughness: 0.4 }], life: ['#4f8a3c', {}],
  venom: ['#6f8a2a', { emissive: '#6f8a2a', emissiveIntensity: 0.2 }], gale: ['#9fcfc9', { transparent: true, opacity: 0.7 }], iron: ['#6f7883', { metalness: 0.6, roughness: 0.4 }],
  radiant: ['#e3b23c', { emissive: '#e3b23c', emissiveIntensity: 0.4 }], umbral: ['#3c2244', { emissive: '#3c2244', emissiveIntensity: 0.3 }],
};

function woodTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 1024;
  const g = c.getContext('2d');
  for (let i = 0; i < 6; i++) {
    const y = i * 1024 / 6, l = 28 + R() * 8;
    g.fillStyle = `hsl(24, 42%, ${l}%)`; g.fillRect(0, y, 1024, 1024 / 6);
    for (let k = 0; k < 70; k++) {
      g.strokeStyle = `rgba(30,15,5,${0.05 + R() * 0.12})`; g.lineWidth = 0.6 + R() * 1.6;
      const yy = y + R() * 1024 / 6, amp = 2 + R() * 5, f = 0.004 + R() * 0.01, ph = R() * 9;
      g.beginPath(); for (let x = 0; x <= 1024; x += 16) g.lineTo(x, yy + Math.sin(x * f + ph) * amp); g.stroke();
    }
    g.fillStyle = 'rgba(10,5,2,0.6)'; g.fillRect(0, y, 1024, 3);
  }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(3, 2); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class Book3D {
  constructor(gl, hud) {
    this.layer = new PageLayer();
    this.gl = gl; this.hud = hud; this.hg = hud.getContext('2d');
    const r = this.r = new THREE.WebGLRenderer({ canvas: gl, antialias: true, powerPreference: 'high-performance' });
    r.setPixelRatio(Math.min(1.5, window.devicePixelRatio || 1));
    r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.outputColorSpace = THREE.SRGBColorSpace; r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.1;
    const s = this.scene = new THREE.Scene();
    s.background = new THREE.Color('#150d08'); s.fog = new THREE.Fog('#150d08', 24, 44);
    this.cam = new THREE.PerspectiveCamera(46, 16 / 9, 0.1, 100);
    this.side = 0; this.camBase = new THREE.Vector3(); this.camLook = new THREE.Vector3(); this.placeCamera();

    s.add(new THREE.HemisphereLight('#ffe9c7', '#2a1a10', 0.6));
    const key = new THREE.DirectionalLight('#ffe2b8', 2.1); key.position.set(-7, 14, 7); key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024); Object.assign(key.shadow.camera, { left: -12, right: 12, top: 9, bottom: -9, near: 1, far: 40 });
    key.shadow.bias = -0.0004; key.shadow.normalBias = 0.02; s.add(key);
    const fill = new THREE.DirectionalLight('#9fb4d8', 0.35); fill.position.set(8, 6, -6); s.add(fill);

    this.buildDesk(); this.buildBook(); this.buildProps();
    this.wiz = [this.makeWizard(), this.makeWizard()];
    this.wiz.forEach(m => { m.g.visible = false; s.add(m.g); });
    this.tether = mesh(new THREE.CylinderGeometry(0.035, 0.035, 1, 5, 1, true), glow('#3c6d37', 0.8, { transparent: true, opacity: 0.8 }), false);
    this.tether.visible = false; s.add(this.tether);
    this.ents = new Map(); this.fx = []; this.ray = new THREE.Raycaster(); this.t = 0; this.upT = 0;
    this.inkLive = new Map(); this.inkAnims = [];
    this.inkMat = new THREE.MeshStandardMaterial({ color: '#1a120c', roughness: 0.28, metalness: 0.15, flatShading: true, side: THREE.DoubleSide });
    this.shardGeo = new THREE.TetrahedronGeometry(1, 0);
    this.setView(0);
    this.resize();
  }

  placeCamera() {
    const sgn = this.side === 0 ? 1 : -1;
    this.camBase.set(-14.4 * sgn, 6.6, 1.7 * sgn); this.camLook.set(1.2 * sgn, -0.9, 0);   // third person: over your wizard's shoulder
    this.cam.position.copy(this.camBase); this.cam.lookAt(this.camLook);
  }
  setView(me) {
    this.side = me; this.placeCamera();
    this.wiz.forEach((m, p) => { const mine = p === me; m.robe.material = m.arm.material = new THREE.MeshStandardMaterial({ color: mine ? '#34507a' : '#8a3324', roughness: 0.85, flatShading: true }); m.hat.material = mat(mine ? '#22324d' : '#5a1f16'); m.brim.material = m.hat.material; });
  }
  resize() {
    const rect = this.gl.getBoundingClientRect(), dpr = Math.min(1.5, window.devicePixelRatio || 1);
    this.r.setPixelRatio(dpr); this.r.setSize(Math.max(1, rect.width), Math.max(1, rect.height), false);
    this.cam.aspect = rect.width / Math.max(1, rect.height); this.cam.updateProjectionMatrix();
    this.hud.width = Math.round(rect.width * dpr); this.hud.height = Math.round(rect.height * dpr);
  }

  buildDesk() {
    const desk = mesh(new THREE.PlaneGeometry(70, 46), new THREE.MeshStandardMaterial({ map: woodTexture(), roughness: 0.78 }), false);
    desk.rotation.x = -Math.PI / 2; desk.position.y = -0.42; this.scene.add(desk);
  }
  buildBook() {
    const s = this.scene;
    const leather = mat('#5b2216', { roughness: 0.7 });
    const cover = mesh(new THREE.BoxGeometry(17.1, 0.1, 9.9), leather); cover.position.y = -0.37; s.add(cover);
    const spine = mesh(new THREE.CylinderGeometry(0.32, 0.32, 9.9, 10), leather); spine.rotation.x = Math.PI / 2; spine.position.set(0, -0.42, 0); s.add(spine);
    // page block edges that follow the curl of the paper
    const edge = mat('#d9c59b', { flatShading: false });
    const skirt = (z) => {
      const pos = [], idx = [], n = 96;
      for (let i = 0; i <= n; i++) { const px = i / n * W; pos.push(X(px), pageH(px), z, X(px), -0.32, z); if (i) { const a = (i - 1) * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); } }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
      const m = new THREE.Mesh(g, edge); m.material.side = THREE.DoubleSide; m.receiveShadow = true; s.add(m);
    };
    skirt(Z(H)); skirt(Z(0));
    for (const px of [0, W]) { const m = mesh(new THREE.BoxGeometry(0.02, 0.4, 9), edge); m.position.set(X(px), -0.12, 0); s.add(m); }
    for (const sx of [-1, 1]) { const b = mesh(new THREE.BoxGeometry(7.96, 0.3, 8.98), edge); b.position.set(sx * 4.0, -0.18, 0); s.add(b); }
    // the curled page carrying the live texture
    const geo = new THREE.PlaneGeometry(16, 9, 128, 4); geo.rotateX(-Math.PI / 2);
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) p.setY(i, pageH(p.getX(i) / U + W / 2));
    geo.computeVertexNormals();
    this.tex = new THREE.CanvasTexture(this.layer.cv); this.tex.colorSpace = THREE.SRGBColorSpace;
    this.tex.anisotropy = this.r.capabilities.getMaxAnisotropy();
    this.page = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: this.tex, roughness: 0.95 }));
    this.page.receiveShadow = true; s.add(this.page);
  }
  buildProps() {
    const s = this.scene;
    // candle
    const c = new THREE.Group(); c.position.set(-9.8, -0.42, -3.4);
    c.add(at(mesh(new THREE.CylinderGeometry(0.6, 0.7, 0.12, 10), mat('#a07a3a', { metalness: 0.6, roughness: 0.45 })), 0, 0.06, 0));
    c.add(at(mesh(new THREE.CylinderGeometry(0.22, 0.25, 1.5, 9), mat('#efe6cf')), 0, 0.87, 0));
    this.flame = mesh(new THREE.ConeGeometry(0.09, 0.3, 6), new THREE.MeshBasicMaterial({ color: '#ffbe5c' }), false); this.flame.position.set(0, 1.78, 0); c.add(this.flame);
    this.candle = new THREE.PointLight('#ffad5a', 3, 16, 1.6); this.candle.position.set(0, 1.9, 0); c.add(this.candle);
    s.add(c);
    // ink pot and quill
    const ink = new THREE.Group(); ink.position.set(9.7, -0.42, -3.1);
    ink.add(at(mesh(new THREE.CylinderGeometry(0.5, 0.58, 0.62, 8), mat('#1f2633', { roughness: 0.25, metalness: 0.2 })), 0, 0.31, 0));
    ink.add(at(mesh(new THREE.CylinderGeometry(0.27, 0.32, 0.2, 8), mat('#1f2633', { roughness: 0.25 })), 0, 0.72, 0));
    const quill = new THREE.Group(); quill.position.set(0, 0.7, 0); quill.rotation.set(0.25, 0, -0.45);
    quill.add(at(mesh(new THREE.CylinderGeometry(0.02, 0.025, 2.6, 4), mat('#d9cfb8')), 0, 1.1, 0));
    const vane = mesh(new THREE.ConeGeometry(0.22, 2.0, 4), mat('#efe8d8')); vane.scale.set(1, 1, 0.22); vane.position.set(0, 1.5, 0); quill.add(vane);
    ink.add(quill); s.add(ink);
    // a couple of closed books
    const b1 = mesh(new THREE.BoxGeometry(3, 0.45, 2.2), mat('#2f3d52')); b1.position.set(-10.4, -0.2, 2.8); b1.rotation.y = 0.25; s.add(b1);
    const b2 = mesh(new THREE.BoxGeometry(2.7, 0.4, 2), mat('#6a5a2c')); b2.position.set(-10.3, 0.22, 2.75); b2.rotation.y = -0.1; s.add(b2);
  }

  makeWizard() {
    const g = new THREE.Group(), body = new THREE.Group(); g.add(body);
    const robe = mesh(new THREE.ConeGeometry(0.46, 1.15, 7), mat('#34507a')); robe.position.y = 0.575; body.add(robe);
    const belt = mesh(new THREE.CylinderGeometry(0.29, 0.31, 0.09, 7), mat('#c9a24a', { metalness: 0.4, roughness: 0.5 })); belt.position.y = 0.66; body.add(belt);
    const head = mesh(new THREE.IcosahedronGeometry(0.21, 0), mat('#e2b48c')); head.position.y = 1.3; body.add(head);
    const beard = mesh(new THREE.ConeGeometry(0.17, 0.42, 5), mat('#ece6d6')); beard.rotation.x = Math.PI; beard.position.set(0, 1.1, 0.11); body.add(beard);
    const brim = mesh(new THREE.CylinderGeometry(0.43, 0.43, 0.05, 8), mat('#22324d')); brim.position.y = 1.47; body.add(brim);
    const hat = mesh(new THREE.ConeGeometry(0.27, 0.9, 7), mat('#22324d')); hat.position.set(0, 1.92, -0.03); hat.rotation.x = -0.14; body.add(hat);
    const staff = new THREE.Group(); staff.position.set(0.44, 0, 0.14); body.add(staff);
    staff.add(at(mesh(new THREE.CylinderGeometry(0.035, 0.045, 1.9, 5), mat('#6b4a2b')), 0, 0.95, 0));
    const gemM = new THREE.MeshStandardMaterial({ color: '#e7d6b0', emissive: '#e7d6b0', emissiveIntensity: 0.3, flatShading: true });
    const gem = mesh(new THREE.OctahedronGeometry(0.12, 0), gemM); gem.position.y = 1.97; staff.add(gem);
    const arm = mesh(new THREE.CylinderGeometry(0.07, 0.1, 0.55, 5), mat('#34507a')); arm.position.set(0.28, 0.98, 0.1); arm.rotation.z = -0.9; body.add(arm);
    const shieldM = new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#ffffff', emissiveIntensity: 0.4, transparent: true, opacity: 0.22, flatShading: true, depthWrite: false });
    const shield = new THREE.Mesh(new THREE.IcosahedronGeometry(1.05, 1), shieldM); shield.position.y = 0.95; shield.visible = false; g.add(shield);
    const spikes = new THREE.Group(); for (let i = 0; i < 10; i++) { const sp = mesh(new THREE.ConeGeometry(0.06, 0.3, 4), mat('#7d5a22'), false); const a = i / 10 * Math.PI * 2; sp.position.set(Math.cos(a) * 1.05, 0.95 + Math.sin(i * 1.7) * 0.4, Math.sin(a) * 1.05); sp.lookAt(0, 0.95, 0); sp.rotateX(-Math.PI / 2); spikes.add(sp); } spikes.visible = false; g.add(spikes);
    // status marks
    const flames = new THREE.Group(); for (let i = 0; i < 3; i++) { const f = mesh(new THREE.ConeGeometry(0.08, 0.3, 5), glow('#e0531e', 0.9), false); f.position.set(-0.2 + i * 0.2, 0.3, 0.3); flames.add(f); } g.add(flames);
    const ice = new THREE.Group(); for (let i = 0; i < 5; i++) { const c = mesh(new THREE.OctahedronGeometry(0.1, 0), mat('#bfe0f5', { transparent: true, opacity: 0.85 }), false); const a = i / 5 * Math.PI * 2; c.position.set(Math.cos(a) * 0.55, 0.08, Math.sin(a) * 0.55); c.scale.y = 1.8; ice.add(c); } g.add(ice);
    const bubbles = new THREE.Group(); for (let i = 0; i < 4; i++) { const b = mesh(new THREE.IcosahedronGeometry(0.06, 0), glow('#8fae2c', 0.6), false); bubbles.add(b); } g.add(bubbles);
    const ring = (color, y, r = 0.45) => { const m = mesh(new THREE.TorusGeometry(r, 0.03, 4, 18), glow(color, 0.8), false); m.rotation.x = Math.PI / 2; m.position.y = y; g.add(m); return m; };
    const hexR = ring('#6a3a75', 2.55, 0.3), markR = ring('#c0392b', 0.04, 0.75), silR = ring('#9a9088', 2.4, 0.38), hasteR = ring('#3f8580', 0.1, 0.6), regenR = ring('#5aa04a', 0.5, 0.6), dazR = ring('#e3b23c', 1.3, 0.32);
    return { g, body, robe, arm, hat, brim, staff, gem, gemM, shield, shieldM, spikes, flames, ice, bubbles, hexR, markR, silR, hasteR, regenR, dazR, fall: 0 };
  }

  // ---------- spells ----------
  makeEnt(e) {
    const c = elc(e.els), c2 = elc(e.els, 1), el = e.els[0], g = new THREE.Group();
    const o = { g, k: e.k, spin: R() * 6 };
    const em = el === 'fire' || el === 'radiant' ? 0.7 : el === 'storm' ? 0.6 : 0.35;
    switch (e.k) {
      case 'bolt': {
        const r = e.r * U * 1.2;
        const geo = e.ram ? new THREE.DodecahedronGeometry(r, 0) : el === 'earth' || el === 'iron' ? new THREE.DodecahedronGeometry(r, 0) : el === 'frost' ? new THREE.OctahedronGeometry(r, 0) : el === 'storm' || el === 'gale' ? new THREE.TetrahedronGeometry(r * 1.2, 0) : new THREE.IcosahedronGeometry(r, 0);
        const m = mesh(geo, glow(c, em)); if (el === 'frost') m.scale.set(1, 1, 1.9); g.add(m);
        if (c2 !== c) { const m2 = mesh(new THREE.IcosahedronGeometry(r * 0.55, 0), glow(c2, 0.8)); m2.position.y = r * 0.4; g.add(m2); }
        o.h = 0.45 + (e.ram ? r : 0); o.r = r; o.trail = e.ram ? 2 : 1; o.core = m;
        break;
      }
      case 'orb': {
        const r = e.r * U * 1.3;
        g.add(mesh(new THREE.IcosahedronGeometry(r, 1), glow(c, 0.5, { transparent: true, opacity: 0.5, depthWrite: false }), false));
        g.add(mesh(new THREE.IcosahedronGeometry(r * 0.45, 0), glow(c2, 1)));
        o.moons = []; for (let i = 0; i < 3; i++) { const m = mesh(new THREE.BoxGeometry(0.06, 0.06, 0.06), glow(c2, 0.9), false); g.add(m); o.moons.push(m); }
        o.h = 0.65; o.r = r; o.trail = 1;
        break;
      }
      case 'fam': {
        const bodyM = mat(c), body = mesh(new THREE.IcosahedronGeometry(0.22, 0), bodyM); body.scale.set(1, 0.8, 1.3); body.position.y = 0.24; g.add(body);
        const head = mesh(new THREE.IcosahedronGeometry(0.15, 0), bodyM); head.position.set(0, 0.36, 0.26); g.add(head);
        for (const s of [-1, 1]) {
          const ear = mesh(new THREE.ConeGeometry(0.05, 0.14, 4), bodyM); ear.position.set(s * 0.08, 0.5, 0.24); g.add(ear);
          const eye = mesh(new THREE.IcosahedronGeometry(0.025, 0), new THREE.MeshBasicMaterial({ color: '#fff3c4' }), false); eye.position.set(s * 0.06, 0.38, 0.39); g.add(eye);
        }
        o.legs = []; for (let i = 0; i < 4; i++) { const l = mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.18, 4), mat(c2)); l.position.set(i % 2 ? 0.1 : -0.1, 0.09, i < 2 ? 0.12 : -0.12); g.add(l); o.legs.push(l); }
        o.h = 0; o.face = true;
        break;
      }
      case 'wall': {
        const n = Math.max(2, Math.ceil(e.len / 38)), seg = e.len * U / n;
        for (let i = 0; i < n; i++) {
          const elx = e.els[i % e.els.length], [col, extra] = WALL_LOOK[elx] || WALL_LOOK.earth;
          const h = 0.5 + ((i * 37 + e.id) % 7) / 7 * 0.3;
          const m = e.mirror ? mat('#c9ccd2', { metalness: 0.9, roughness: 0.12, emissive: elc([elx]), emissiveIntensity: 0.15 }) : mat(col, extra);
          const b = mesh(new THREE.BoxGeometry(seg * 0.93, h, e.mirror ? 0.1 : 0.26), m);
          b.position.set(-e.len * U / 2 + seg * (i + 0.5), h / 2, 0); b.rotation.y = ((i * 13 + e.id) % 5 - 2) * 0.03; g.add(b);
        }
        g.rotation.y = -e.ang; o.h = 0;
        break;
      }
      case 'totem': {
        g.add(at(mesh(new THREE.BoxGeometry(0.5, 0.16, 0.5), mat('#6d6152')), 0, 0.08, 0));
        g.add(at(mesh(new THREE.CylinderGeometry(0.15, 0.22, 1.0, 6), mat(c)), 0, 0.66, 0));
        o.cap = mesh(new THREE.OctahedronGeometry(0.22, 0), glow(c2, 0.9)); o.cap.position.y = 1.4; g.add(o.cap);
        o.h = 0;
        break;
      }
      case 'mine': {
        g.add(at(mesh(new THREE.DodecahedronGeometry(0.2, 0), mat('#4a4540', { metalness: 0.4 })), 0, 0.1, 0));
        for (let i = 0; i < 6; i++) { const sp = mesh(new THREE.ConeGeometry(0.04, 0.16, 4), mat('#4a4540'), false); const a = i / 6 * Math.PI * 2; sp.position.set(Math.cos(a) * 0.2, 0.12, Math.sin(a) * 0.2); sp.rotation.z = -Math.cos(a) * 1.4; sp.rotation.x = Math.sin(a) * 1.4; g.add(sp); }
        o.blink = mesh(new THREE.IcosahedronGeometry(0.05, 0), new THREE.MeshBasicMaterial({ color: c }), false); o.blink.position.y = 0.3; g.add(o.blink);
        o.h = 0;
        break;
      }
      case 'sigil': case 'comet': {
        const ring = mesh(new THREE.TorusGeometry(e.r * U * 0.62, 0.035, 4, 28), glow(c, 0.8), false); ring.rotation.x = Math.PI / 2; g.add(ring); o.ring = ring;
        if (e.k === 'comet') {
          const rock = new THREE.Group();
          rock.add(mesh(new THREE.DodecahedronGeometry(0.42, 0), glow(c, 0.6)));
          const tail = mesh(new THREE.ConeGeometry(0.36, 1.6, 6), glow(c2, 0.9, { transparent: true, opacity: 0.55, depthWrite: false }), false); tail.position.y = 0.95; rock.add(tail);
          g.add(rock); o.rock = rock;
        }
        o.h = 0;
        break;
      }
      case 'rain': {
        const cloud = new THREE.Group(); cloud.position.y = 3.2;
        for (let i = 0; i < 6; i++) { const p = mesh(new THREE.IcosahedronGeometry(0.4 + R() * 0.3, 0), mat('#cfc6b8'), true); p.position.set((R() - 0.5) * e.r * U * 1.4, R() * 0.2, (R() - 0.5) * e.r * U * 0.9); p.scale.y = 0.6; cloud.add(p); }
        g.add(cloud); o.cloud = cloud; o.h = 0; o.rr = e.r * U;
        break;
      }
      case 'zone': {
        if (e.z === 'vortex') {
          o.rings = [];
          for (let i = 0; i < 3; i++) { const t = mesh(new THREE.TorusGeometry(e.r * U * (0.9 - i * 0.25), 0.04, 4, 24), glow(i % 2 ? c2 : c, 0.7), false); t.rotation.x = Math.PI / 2; t.position.y = 0.15 + i * 0.25; g.add(t); o.rings.push(t); }
        } else {
          const d = mesh(new THREE.CylinderGeometry(e.r * U, e.r * U, 0.04, 16), mat('#4b5a2a', { transparent: true, opacity: 0.55 }), false); d.position.y = 0.03; g.add(d);
          o.bub = []; for (let i = 0; i < 6; i++) { const b = mesh(new THREE.IcosahedronGeometry(0.07, 0), mat(c), false); g.add(b); o.bub.push({ m: b, a: R() * 6, r: R() * e.r * U * 0.8, ph: R() * 6 }); }
        }
        o.h = 0;
        break;
      }
    }
    return o;
  }
  updateEnt(o, e, dt) {
    const g = o.g, t = this.t;
    g.position.set(X(e.x), pageH(e.x) + (o.h || 0), Z(e.y));
    switch (e.k) {
      case 'bolt': case 'orb':
        g.rotation.x += dt * 6; g.rotation.y += dt * 4;
        if (o.moons) o.moons.forEach((m, i) => { const a = t * 3 + i * 2.1; m.position.set(Math.cos(a) * o.r * 1.6, Math.sin(a * 1.3) * o.r * 0.6, Math.sin(a) * o.r * 1.6); });
        if (R() < 0.8) this.shard(g.position.x, g.position.y, g.position.z, elc(e.els, R() < 0.5 ? 0 : 1), 0.03 + o.r * 0.25 * o.trail, 0, 0.2, 0.35);
        break;
      case 'fam': {
        g.rotation.y = Math.atan2(e.vx, e.vy);
        o.legs.forEach((l, i) => { l.rotation.x = Math.sin(t * 16 + i * Math.PI) * 0.6; });
        g.position.y += Math.abs(Math.sin(t * 16)) * 0.05;
        break;
      }
      case 'wall': {
        const rise = Math.min(1, e.t / 0.2) * Math.min(1, (e.life - e.t) / 0.5);
        g.scale.y = Math.max(0.02, rise * (0.45 + 0.55 * Math.max(0, e.hp) / e.maxhp));
        break;
      }
      case 'totem': o.cap.rotation.y += dt * 3; o.cap.position.y = 1.4 + Math.sin(t * 3) * 0.05; g.scale.setScalar(Math.min(1, e.t / 0.2)); break;
      case 'mine': o.blink.visible = Math.sin(t * 8 + e.id) > 0; break;
      case 'sigil': case 'comet': {
        const k = Math.min(1, e.t / e.delay);
        o.ring.position.y = 0.15 + k * 0.6; o.ring.rotation.z += dt * (1 + k * 6); o.ring.scale.setScalar(0.6 + k * 0.4);
        if (o.rock) { o.rock.position.set(-1.5 * (1 - k * k) * (this.side ? -1 : 1), 9 * (1 - k * k) + 0.3, -1.2 * (1 - k * k)); o.rock.rotation.x += dt * 3; }
        break;
      }
      case 'rain':
        o.cloud.position.y = 3.2 + Math.sin(t * 2) * 0.08;
        for (let i = 0; i < 3; i++) {
          const a = R() * Math.PI * 2, rr = Math.sqrt(R()) * o.rr;
          this.drop(g.position.x + Math.cos(a) * rr, 3, g.position.z + Math.sin(a) * rr, elc(e.els, i % 2));
        }
        break;
      case 'zone':
        if (o.rings) o.rings.forEach((r, i) => { r.rotation.z += dt * (3 + i * 2); });
        if (o.bub) o.bub.forEach(b => { b.m.position.set(Math.cos(b.a) * b.r, 0.05 + Math.abs(Math.sin(t * 2 + b.ph)) * 0.12, Math.sin(b.a) * b.r); });
        g.scale.setScalar(Math.min(1, e.t / 0.25, (e.life - e.t) / 0.4 + 0.01));
        break;
    }
  }
  sync(S, dt) {
    const seen = new Set();
    for (const e of S.ents) {
      seen.add(e.id);
      let o = this.ents.get(e.id);
      if (!o) { o = this.makeEnt(e); this.ents.set(e.id, o); this.scene.add(o.g); }
      this.updateEnt(o, e, dt);
    }
    for (const [id, o] of this.ents) if (!seen.has(id)) this.drop3d(id, o);
  }
  drop3d(id, o) {
    this.scene.remove(o.g);
    o.g.traverse(m => { if (m.geometry) m.geometry.dispose(); });
    this.ents.delete(id);
  }
  clearEnts() { for (const [id, o] of this.ents) this.drop3d(id, o); for (const f of this.fx) this.scene.remove(f.m); this.fx = []; this.clearInk(); }

  // ---------- 3D ink: raised wet-ink ribbons standing on the paper ----------
  ribbon(pts, lift = 0.015) {
    const n = pts.length, pos = new Float32Array(Math.max(2, n) * 12), idx = [];
    const P = n === 1 ? [pts[0], [pts[0][0] + 0.5, pts[0][1], pts[0][2]]] : pts;
    for (let i = 0; i < P.length; i++) {
      const [x, y, w] = P[i], a = P[Math.max(0, i - 1)], b = P[Math.min(P.length - 1, i + 1)];
      let dx = b[0] - a[0], dy = b[1] - a[1]; const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l;
      const hw = (w || 4) * U * 1.6, ox = -dy * hw, oz = dx * hw, wx = X(x), wz = Z(y);
      const base = pageH(x) + lift, top = base + 0.07 + (w || 4) * 0.016;
      pos.set([wx + ox, top, wz + oz, wx - ox, top, wz - oz, wx + ox, base, wz + oz, wx - ox, base, wz - oz], i * 12);
      if (i) { const p0 = (i - 1) * 4, q = i * 4; idx.push(p0, q, p0 + 1, p0 + 1, q, q + 1, p0 + 2, q + 2, p0, p0, q + 2, q, p0 + 1, q + 1, p0 + 3, p0 + 3, q + 1, q + 3); }
    }
    const last = (P.length - 1) * 4; idx.push(0, 1, 2, 2, 1, 3, last, last + 1, last + 2, last + 2, last + 1, last + 3);
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos.subarray(0, P.length * 12), 3)); g.setIndex(idx); g.computeVertexNormals();
    return g;
  }
  liveInk(key, strokes) {
    let L = this.inkLive.get(key);
    if (!strokes || !strokes.length) { if (L) { L.meshes.forEach(m => { this.scene.remove(m); m.geometry.dispose(); }); this.inkLive.delete(key); } return; }
    if (!L) { L = { strokes, meshes: [], ns: [] }; this.inkLive.set(key, L); }
    L.strokes = strokes;
  }
  updateLiveInk() {
    for (const L of this.inkLive.values()) {
      L.strokes.forEach((s, i) => {
        if (L.ns[i] === s.length || !s.length) return;
        let m = L.meshes[i];
        if (!m) { m = new THREE.Mesh(undefined, this.inkMat); m.castShadow = true; this.scene.add(m); L.meshes[i] = m; }
        else m.geometry.dispose();
        m.geometry = this.ribbon(s, 0.03); L.ns[i] = s.length;
      });
      while (L.meshes.length > L.strokes.length) { const m = L.meshes.pop(); L.ns.pop(); this.scene.remove(m); m.geometry.dispose(); }
    }
  }
  glyphDone(strokes, mode, els) {
    if (!strokes || !strokes.length) return;
    const cast = mode === 'cast', c = new THREE.Color(cast ? elc(els) : '#7a6a58');
    const m = new THREE.MeshStandardMaterial({ color: '#1a120c', emissive: c, emissiveIntensity: 0, roughness: 0.3, metalness: 0.15, flatShading: true, side: THREE.DoubleSide, transparent: true });
    const g = new THREE.Group();
    for (const s of strokes) if (s.length) { const x = new THREE.Mesh(this.ribbon(s, 0.03), m); x.castShadow = true; g.add(x); }
    this.scene.add(g);
    this.inkAnims.push({ g, m, c, cast, t: 0, life: cast ? 0.75 : 0.8, strokes, els });
    if (cast) this.layer.stamp(strokes, elc(els));
  }
  updateInkAnims(dt) {
    for (const a of this.inkAnims) {
      a.t += dt; const k = Math.min(1, a.t / a.life);
      if (a.cast) {
        a.m.color.lerpColors(new THREE.Color('#1a120c'), a.c, Math.min(1, k * 2.5));
        a.m.emissiveIntensity = 1.6 * Math.min(1, k * 3); a.g.position.y = k * k * 1.4; a.m.opacity = 1 - k * k * k;
        if (a.t >= a.life && !a.burst) {
          a.burst = true;
          for (const s of a.strokes) for (let i = 0; i < s.length; i += Math.max(1, Math.floor(s.length / 6))) this.shard(X(s[i][0]), pageH(s[i][0]) + 1.4, Z(s[i][1]), elc(a.els, i % 2), 0.06, 1.8, 1.5, 0.6, 6);
        }
      } else {
        a.m.color.lerp(a.c, Math.min(1, k * 3)); a.g.position.y = -k * 0.08; a.g.rotation.z = k * 0.03; a.m.opacity = 1 - k;
        a.g.children.forEach((x, i) => { x.position.y = -k * k * 0.3 * (1 + (i % 3) * 0.4); });
      }
    }
    const done = this.inkAnims.filter(a => a.t >= a.life);
    for (const a of done) { this.scene.remove(a.g); a.g.children.forEach(x => x.geometry.dispose()); a.m.dispose(); }
    if (done.length) this.inkAnims = this.inkAnims.filter(a => a.t < a.life);
  }
  clearInk() { for (const k of [...this.inkLive.keys()]) this.liveInk(k, null); for (const a of this.inkAnims) a.t = a.life + 1; this.updateInkAnims(0); }

  // ---------- particles ----------
  shard(x, y, z, color, size, speed, up, life = 0.7, grav = 0) {
    if (this.fx.length > 500) return;
    const m = new THREE.Mesh(this.shardGeo, mat(color, { emissive: color, emissiveIntensity: 0.4 }));
    m.position.set(x, y, z); m.scale.setScalar(size); m.rotation.set(R() * 6, R() * 6, 0);
    const a = R() * Math.PI * 2, s = speed * (0.4 + R());
    this.scene.add(m);
    this.fx.push({ m, vx: Math.cos(a) * s, vy: up * (0.5 + R()), vz: Math.sin(a) * s, t: 0, life, grav, size });
  }
  drop(x, y, z, color) {
    if (this.fx.length > 500) return;
    const m = new THREE.Mesh(this.dropGeo ||= new THREE.BoxGeometry(0.025, 0.22, 0.025), mat(color));
    m.position.set(x, y, z); this.scene.add(m);
    this.fx.push({ m, vx: 0, vy: -9, vz: 0, t: 0, life: 0.34, grav: 0, size: 1, keep: true });
  }
  burst(x, y, els, n, speed = 3, up = 3, h = 0.5, size = 0.08) {
    const px = X(x), pz = Z(y), py = pageH(x) + h;
    for (let i = 0; i < n; i++) this.shard(px, py, pz, elc(els, i % 2), size * (0.6 + R() * 0.8), speed, up, 0.6 + R() * 0.5, 9);
  }
  flash(x, y, r, els, life = 0.5) {
    const m = new THREE.Mesh(new THREE.TorusGeometry(1, 0.06, 4, 32), glow(elc(els), 1, { transparent: true, opacity: 0.9 }));
    m.rotation.x = Math.PI / 2; m.position.set(X(x), pageH(x) + 0.1, Z(y)); this.scene.add(m);
    this.fx.push({ m, ring: r * U, t: 0, life, own: true });
  }
  beam(e) {
    const a = new THREE.Vector3(X(e.x1), pageH(e.x1) + 0.5, Z(e.y1)), b = new THREE.Vector3(X(e.x2), pageH(e.x2) + 0.5, Z(e.y2));
    const len = a.distanceTo(b), m = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, len, 6, 1, true), glow(elc(e.els), 1.2, { transparent: true, opacity: 0.95 }));
    m.position.copy(a).lerp(b, 0.5); m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
    this.scene.add(m); this.fx.push({ m, t: 0, life: 0.35, beam: true, own: true });
  }
  updateFx(dt) {
    for (const f of this.fx) {
      f.t += dt; const k = f.t / f.life;
      if (f.ring !== undefined) { f.m.scale.setScalar(f.ring * (0.3 + k * 0.9)); f.m.material.opacity = 1 - k; }
      else if (f.beam) { f.m.material.opacity = 1 - k; f.m.scale.x = f.m.scale.z = 1 - k * 0.7; }
      else {
        f.vy -= (f.grav || 0) * dt; f.m.position.x += f.vx * dt; f.m.position.y += f.vy * dt; f.m.position.z += f.vz * dt;
        const floor = pageH((f.m.position.x / U) + W / 2) + 0.02;
        if (f.m.position.y < floor) { f.m.position.y = floor; f.vy *= -0.3; f.vx *= 0.6; f.vz *= 0.6; }
        if (!f.keep) { f.m.scale.setScalar(f.size * (1 - k)); f.m.rotation.x += dt * 5; }
      }
    }
    const done = this.fx.filter(f => f.t >= f.life);
    for (const f of done) { this.scene.remove(f.m); if (f.own) { f.m.geometry.dispose(); f.m.material.dispose(); } }
    if (done.length) this.fx = this.fx.filter(f => f.t < f.life);
  }

  // sim event -> 3D effect (the page layer handles ink and text)
  event(e) {
    this.layer.event(e);
    switch (e.type) {
      case 'cast': {
        const m = this.wiz[e.p]; if (m) { m.gemM.color.set(elc(e.els)); m.gemM.emissive.set(elc(e.els)); m.gemM.emissiveIntensity = 2; }
        if (['wall', 'mirror', 'totem', 'mine', 'mire', 'vortex'].includes(e.form)) this.burst(e.x, e.y, e.els, 10, 1.5, 3, 0.1, 0.06);
        break;
      }
      case 'hit': if (e.amt > 0) this.burst(e.x, e.y, e.els, 8 + Math.min(16, e.amt), 3, 3.5, 0.9); break;
      case 'clash': this.burst(e.x, e.y, e.els, 12, 3.5, 3); this.flash(e.x, e.y, 40, e.els, 0.35); break;
      case 'wallhit': this.burst(e.x, e.y, e.els, 5, 2, 2.5, 0.4); break;
      case 'wallbreak': { const [ax, ay, bx, by] = wallEnds(e); for (let i = 0; i <= 5; i++) this.burst(ax + (bx - ax) * i / 5, ay + (by - ay) * i / 5, e.els, 4, 2.5, 4, 0.4, 0.12); break; }
      case 'blast': this.flash(e.x, e.y, e.r, e.els, 0.6); this.burst(e.x, e.y, e.els, e.small ? 10 : e.comet ? 40 : 24, e.comet ? 5 : 3.5, 6, 0.2, 0.1); break;
      case 'beam': this.beam(e); break;
      case 'reflect': case 'pierce': this.flash(e.x, e.y, 26, e.els, 0.3); break;
      case 'buff': case 'curse': {
        const w = this.lastS?.wiz[e.p]; if (!w) break;
        for (let i = 0; i < 3; i++) setTimeout(() => this.flash(w.x, w.y, 70 - i * 15, e.els, 0.5), i * 90);
        this.burst(w.x, w.y, e.els, 10, 1.2, 4, 1.2, 0.06);
        break;
      }
      case 'shot': this.burst(e.x, e.y, e.els, 3, 1, 2, 1.4, 0.05); break;
      case 'round': this.clearEnts(); break;
    }
  }

  wizards(S, dt) {
    const t = this.t;
    for (let p = 0; p < 2; p++) {
      const w = S.wiz[p], m = this.wiz[p];
      m.g.visible = true;
      m.g.position.set(X(w.x) + (w.hurtT > 0 ? (R() - 0.5) * 0.08 : 0), pageH(w.x), Z(w.y));
      m.g.rotation.y = p === 0 ? Math.PI / 2 : -Math.PI / 2;
      m.body.position.y = Math.sin(t * 2.4 + p * 2) * 0.03;
      const lift = w.castT > 0 ? Math.sin(w.castT / 0.4 * Math.PI) : 0;
      m.staff.rotation.x = -lift * 0.5; m.staff.position.y = lift * 0.15;
      m.gemM.emissiveIntensity += (0.35 - m.gemM.emissiveIntensity) * Math.min(1, dt * 3);
      m.robe.material.emissive.set(w.hurtT > 0 ? '#5a0d05' : '#000000');
      const down = w.hp <= 0 ? 1 : 0; m.fall += (down - m.fall) * Math.min(1, dt * 4);
      m.body.rotation.z = m.fall * 1.35;
      m.shield.visible = w.shield > 0;
      if (w.shield > 0) {
        const k = Math.min(1, w.shield / Math.max(1, w.shieldMax)), c = elc(w.shieldEls);
        m.shieldM.color.set(c); m.shieldM.emissive.set(c); m.shieldM.opacity = 0.12 + 0.22 * k;
        m.shield.rotation.y += dt * 0.6; m.shield.scale.setScalar(1 + Math.sin(t * 4) * 0.02);
      }
      m.spikes.visible = w.shield > 0 && w.thorns; m.spikes.rotation.y -= dt * 0.8;
      m.flames.visible = w.burnT > 0; m.flames.children.forEach((f, i) => { f.scale.y = 0.7 + Math.abs(Math.sin(t * 12 + i * 2)) * 0.8; f.position.y = 0.3 + (i % 2) * 0.5 + Math.sin(t * 5 + i) * 0.05; });
      m.ice.visible = w.chillT > 0;
      m.bubbles.visible = w.poisonN > 0; m.bubbles.children.forEach((b, i) => { const k = ((t * 0.6 + i / 4) % 1); b.position.set(Math.cos(i * 1.6) * 0.35, 0.2 + k * 1.8, Math.sin(i * 1.6) * 0.35); b.visible = i < w.poisonN + 1; });
      m.hexR.visible = w.hexT > 0; m.hexR.rotation.z += dt * 2;
      m.markR.visible = w.markT > 0; m.markR.scale.setScalar(1 + Math.sin(t * 6) * 0.08);
      m.silR.visible = w.silenceT > 0 || w.shockT > 0; m.silR.rotation.z -= dt * 4;
      m.hasteR.visible = w.hasteT > 0; m.hasteR.rotation.z += dt * 8; m.hasteR.position.y = 0.1 + ((t * 1.5) % 1) * 1.6;
      m.regenR.visible = w.regenT > 0; m.regenR.position.y = 0.2 + ((t * 0.8) % 1) * 1.8; m.regenR.scale.setScalar(1 - ((t * 0.8) % 1) * 0.4);
      m.dazR.visible = w.dazzleT > 0; m.dazR.rotation.x = Math.PI / 2 + Math.sin(t * 3) * 0.4;
    }
    // leech tether
    const lp = S.wiz[0].leechT > 0 ? 0 : S.wiz[1].leechT > 0 ? 1 : -1;
    this.tether.visible = lp >= 0;
    if (lp >= 0) {
      const a = new THREE.Vector3(X(S.wiz[lp].x), 1.2, Z(S.wiz[lp].y)), b = new THREE.Vector3(X(S.wiz[1 - lp].x), 1.2, Z(S.wiz[1 - lp].y));
      a.y += Math.sin(this.t * 6) * 0.1;
      this.tether.position.copy(a).lerp(b, 0.5); this.tether.scale.y = a.distanceTo(b);
      this.tether.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
    }
  }

  // screen point (client px) -> page coords [x, y], or null if off the page
  pick(cx, cy) {
    const r = this.gl.getBoundingClientRect();
    const v = new THREE.Vector2((cx - r.left) / r.width * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
    this.ray.setFromCamera(v, this.cam);
    const hit = this.ray.intersectObject(this.page)[0];
    return hit ? [hit.uv.x * W, (1 - hit.uv.y) * H] : null;
  }
  // client px -> overlay space (W x H)
  toOverlay(cx, cy) { const r = this.gl.getBoundingClientRect(); return [(cx - r.left) / r.width * W, (cy - r.top) / r.height * H]; }
  project(x, y, h = 1.2) {
    const v = new THREE.Vector3(X(x), pageH(x) + h, Z(y)).project(this.cam);
    return v.z > 1 ? null : [(v.x + 1) / 2 * W, (1 - v.y) / 2 * H];
  }

  frame(S, view, dt) {
    this.t += dt; this.lastS = S;
    // the page texture is only re-sent to the GPU when it changed, at most ~30 times a second
    this.upT += dt;
    if (this.upT >= 1 / 30 && this.layer.drawPage(S, this.upT)) { this.tex.needsUpdate = true; }
    if (this.upT >= 1 / 30) this.upT = 0;
    this.updateLiveInk(); this.updateInkAnims(dt);
    if (S) { this.wizards(S, dt); this.sync(S, dt); }
    else { this.wiz.forEach(m => { m.g.visible = false; }); this.tether.visible = false; if (this.ents.size) this.clearEnts(); }
    this.updateFx(dt);
    const sh = this.layer.shake * 0.12;
    this.cam.position.set(this.camBase.x + (R() - 0.5) * sh, this.camBase.y + (R() - 0.5) * sh, this.camBase.z + (R() - 0.5) * sh);
    this.cam.lookAt(this.camLook);
    const fl = 0.85 + Math.sin(this.t * 13) * 0.08 + Math.sin(this.t * 7.3) * 0.07 + (R() - 0.5) * 0.05;
    this.candle.intensity = 3 * fl; this.flame.scale.set(1, fl, 1);
    this.r.render(this.scene, this.cam);
    this.layer.drawOverlay(this.hg, S, view, dt, (x, y) => this.project(x, y));
  }
}
