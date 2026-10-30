// Scena 3D con three.js: campagna abbandonata vista dall'alto con la telecamera inclinata, case in cui si entra
// (il tetto sparisce quando si è dentro), auto, boschi, zombie, luce del sole con ombre e notti buie.
// Usa i modelli 3D veri di public/modelli/ quando ci sono (vedi modelli.js), altrimenti li genera dal codice.
// Le posizioni arrivano dalla logica 2D: x → X, y → Z, l'altezza è Y.

import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { OGGETTI, creaCasuale } from './mondo.js';
import { COSTRUZIONI, ZOMBIE } from './logica.js';
import { dipingiMappa } from './disegno.js';
import { copia, anima, pezziPerIstanze } from './modelli.js';

const TAU = Math.PI * 2;
const INCLINAZIONE = (56 * Math.PI) / 180;
const CAMPO = 30;
const LUCI_FUOCO = 4;

// ---------- Geometrie di supporto ----------

// Deforma una geometria lungo le normali con onde sovrapposte: sassi, chiome e polpette irregolari
function deforma(geo, ampiezza, seme) {
  const caso = creaCasuale(seme);
  const onde = Array.from({ length: 5 }, () => ({ k: new THREE.Vector3(caso() - 0.5, caso() - 0.5, caso() - 0.5).normalize().multiplyScalar(0.05 + caso() * 0.25), f: caso() * TAU, a: 0.4 + caso() * 0.6 }));
  const p = geo.attributes.position;
  const v = new THREE.Vector3();
  const n = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    n.copy(v).normalize();
    let d = 0;
    for (const o of onde) d += Math.sin(v.dot(o.k) + o.f) * o.a;
    v.addScaledVector(n, (d / 3) * ampiezza);
    p.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  return geo;
}

// Colori per vertice: f riceve posizione, normale e indice della faccia e restituisce [r, g, b]
function colora(geo, f) {
  const p = geo.attributes.position;
  const n = geo.attributes.normal;
  const col = new Float32Array(p.count * 3);
  const v = new THREE.Vector3();
  const nn = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    nn.fromBufferAttribute(n, i);
    const c = f(v, nn, Math.floor(i / 3));
    col.set(c, i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return geo;
}

// Numero pseudo-casuale fisso per un punto: macchie di colore che non dipendono dall'ordine dei vertici
function casoPunto(v, seme = 0) {
  const x = Math.sin(v.x * 12.9898 + v.y * 78.233 + v.z * 37.719 + seme * 3.17) * 43758.5453;
  return x - Math.floor(x);
}

// Unisce i vertici doppi e ricalcola le normali: superfici morbide invece che sfaccettate
function liscia(geo) {
  geo.deleteAttribute('normal');
  geo.deleteAttribute('uv');
  if (geo.attributes.color) geo.deleteAttribute('color');
  const g = mergeVertices(geo, 0.01);
  g.computeVertexNormals();
  return g;
}

function unisci(lista) {
  const g = mergeGeometries(lista.map((x) => (x.index ? x.toNonIndexed() : x)));
  for (const x of lista) x.dispose();
  return g;
}

const tinta = (hex, k = 1) => {
  const c = new THREE.Color(hex);
  return [c.r * k, c.g * k, c.b * k];
};

// ---------- Texture disegnate su tela ----------

function tela(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function textureCorteccia() {
  const c = tela(64, 256);
  const g = c.getContext('2d');
  g.fillStyle = '#4a3a2a';
  g.fillRect(0, 0, 64, 256);
  const caso = creaCasuale(9);
  for (let i = 0; i < 90; i++) {
    const x = caso() * 64;
    g.strokeStyle = caso() < 0.5 ? 'rgba(25,18,12,0.6)' : 'rgba(120,100,80,0.35)';
    g.lineWidth = 1 + caso() * 2.5;
    g.beginPath();
    g.moveTo(x, 0);
    for (let y = 0; y <= 256; y += 32) g.lineTo(x + Math.sin(y * 0.05 + i) * 3, y);
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function textureFiamma() {
  const c = tela(64, 128);
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 92, 2, 32, 80, 60);
  gr.addColorStop(0, 'rgba(255,250,220,1)');
  gr.addColorStop(0.25, 'rgba(255,200,90,0.95)');
  gr.addColorStop(0.55, 'rgba(255,110,30,0.6)');
  gr.addColorStop(1, 'rgba(180,40,10,0)');
  g.fillStyle = gr;
  g.beginPath();
  g.moveTo(32, 2);
  g.bezierCurveTo(52, 50, 64, 80, 54, 110);
  g.quadraticCurveTo(32, 128, 10, 110);
  g.bezierCurveTo(0, 80, 12, 50, 32, 2);
  g.fill();
  return new THREE.CanvasTexture(c);
}

function textureBagliore() {
  const c = tela(64, 64);
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.3, 'rgba(255,255,255,0.5)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

function geoChioma(seme) {
  const caso = creaCasuale(seme);
  const parti = [];
  for (let i = 0; i < 7; i++) {
    const r = 15 + caso() * 9;
    const g = deforma(new THREE.IcosahedronGeometry(r, 1), r * 0.2, seme * 10 + i);
    g.translate((caso() - 0.5) * 34, 74 + caso() * 26 - (i === 0 ? 0 : 4), (caso() - 0.5) * 34);
    parti.push(g);
  }
  const geo = liscia(unisci(parti));
  return colora(geo, (v, n) => {
    const j = casoPunto(v, seme);
    const luce = 0.5 + Math.max(n.y, 0) * 0.35 + Math.max(-n.x - n.z, 0) * 0.08 + (j - 0.5) * 0.3;
    return [luce, luce, luce];
  });
}

function geoTronco(seme) {
  const g = new THREE.CylinderGeometry(3.6, 7, 82, 9, 6);
  g.translate(0, 41, 0);
  const caso = creaCasuale(seme);
  const p = g.attributes.position;
  const curva = (caso() - 0.5) * 10;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    p.setX(i, p.getX(i) + Math.sin(y * 0.03) * curva * (y / 82));
  }
  g.computeVertexNormals();
  return g;
}

function geoCeppo() {
  const g = new THREE.CylinderGeometry(6.5, 8, 11, 12);
  g.translate(0, 5.5, 0);
  return colora(g, (v, n) => (n.y > 0.9 ? tinta('#b89268') : tinta('#4a3826')));
}

function geoCespuglio(seme) {
  const caso = creaCasuale(seme);
  const parti = [];
  for (let i = 0; i < 9; i++) {
    const r = 6 + caso() * 4;
    const g = deforma(new THREE.IcosahedronGeometry(r, 1), r * 0.25, seme + i);
    const a = caso() * TAU;
    const d = caso() * 11;
    g.translate(Math.cos(a) * d, 9 + caso() * 10, Math.sin(a) * d);
    parti.push(g);
  }
  const geo = liscia(unisci(parti));
  return colora(geo, (v, n) => {
    const k = 0.6 + Math.max(n.y, 0) * 0.3 + (casoPunto(v, seme) - 0.5) * 0.3;
    return tinta('#3d5a26', k * 1.2);
  });
}

// Gruppo di istanze di uno stesso modello: nascondere = scalare a zero
class Istanze {
  constructor(geo, mat, quanti) {
    this.mesh = new THREE.InstancedMesh(geo, mat, Math.max(quanti, 1));
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.mesh.frustumCulled = false;
    this.libero = 0;
    this.mesh.count = quanti;
    const zero = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < quanti; i++) this.mesh.setMatrixAt(i, zero);
  }

  aggiungi(matrice, colore) {
    const i = this.libero++;
    this.mesh.setMatrixAt(i, matrice);
    if (colore) this.mesh.setColorAt(i, colore);
    return i;
  }
}

function costruisciFalo(m) {
  const g = new THREE.Group();
  const pietre = [];
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * TAU;
    const p = deforma(new THREE.DodecahedronGeometry(5, 0), 1.2, i + 3);
    p.scale(1, 0.7, 1);
    p.translate(Math.cos(a) * 20, 3, Math.sin(a) * 20);
    pietre.push(colora(p, (v, n, f) => tinta('#8a857c', 0.7 + creaCasuale(f + i)() * 0.4)));
  }
  const anello = new THREE.Mesh(unisci(pietre), m.roccia);
  anello.castShadow = anello.receiveShadow = true;
  g.add(anello);
  const cenere = new THREE.Mesh(new THREE.CircleGeometry(16, 20), m.cenere);
  cenere.rotation.x = -Math.PI / 2;
  cenere.position.y = 0.6;
  g.add(cenere);
  for (const a of [-0.5, 0.5]) {
    const ciocco = new THREE.Mesh(new THREE.CylinderGeometry(3, 3.4, 30, 8), m.carbone);
    ciocco.rotation.z = Math.PI / 2;
    ciocco.rotation.y = a;
    ciocco.position.y = 4;
    ciocco.castShadow = true;
    g.add(ciocco);
  }
  const fuoco = new THREE.Group();
  fuoco.position.y = 6;
  for (let i = 0; i < 4; i++) {
    const s = new THREE.Sprite(m.fiamma);
    s.center.set(0.5, 0.05);
    fuoco.add(s);
  }
  const alone = new THREE.Sprite(m.alone);
  alone.scale.set(90, 90, 1);
  alone.position.y = 14;
  fuoco.add(alone);
  const braci = new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(14 * 3), 3)), m.scintille);
  fuoco.add(braci);
  g.add(fuoco);
  const fumo = new THREE.Group();
  for (let i = 0; i < 4; i++) fumo.add(new THREE.Sprite(m.fumo));
  g.add(fumo);
  g.userData = { fuoco, braci, fumo };
  return g;
}

// ---------- Texture della campagna abbandonata ----------

function textureIntonaco() {
  const c = tela(256, 256);
  const g = c.getContext('2d');
  g.fillStyle = '#b9ad94';
  g.fillRect(0, 0, 256, 256);
  const caso = creaCasuale(21);
  for (let i = 0; i < 260; i++) {
    g.fillStyle = caso() < 0.5 ? `rgba(90,80,60,${0.05 + caso() * 0.1})` : `rgba(255,250,235,${0.05 + caso() * 0.08})`;
    g.beginPath();
    g.ellipse(caso() * 256, caso() * 256, 4 + caso() * 30, 3 + caso() * 20, caso() * 3, 0, TAU);
    g.fill();
  }
  // Colature di sporco dall'alto e intonaco caduto
  for (let i = 0; i < 14; i++) {
    const x = caso() * 256;
    const gr = g.createLinearGradient(0, 0, 0, 120 + caso() * 100);
    gr.addColorStop(0, 'rgba(50,40,30,0.35)');
    gr.addColorStop(1, 'rgba(50,40,30,0)');
    g.fillStyle = gr;
    g.fillRect(x, 0, 3 + caso() * 10, 256);
  }
  for (let i = 0; i < 6; i++) {
    g.fillStyle = 'rgba(140,90,70,0.6)';
    const x = caso() * 230;
    const y = 120 + caso() * 120;
    for (let r = 0; r < 3; r++) for (let k = 0; k < 3; k++) g.fillRect(x + k * 9 + (r % 2) * 4, y + r * 5, 8, 4);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function textureTegole() {
  const c = tela(128, 128);
  const g = c.getContext('2d');
  g.fillStyle = '#6e3a2a';
  g.fillRect(0, 0, 128, 128);
  const caso = creaCasuale(8);
  for (let r = 0; r < 8; r++) {
    for (let k = 0; k < 9; k++) {
      const v = 0.7 + caso() * 0.4;
      g.fillStyle = `rgb(${140 * v},${74 * v},${50 * v})`;
      g.beginPath();
      g.ellipse(k * 16 + (r % 2) * 8, r * 16 + 10, 8, 9, 0, 0, Math.PI);
      g.fill();
    }
  }
  g.fillStyle = 'rgba(60,70,40,0.35)';
  for (let i = 0; i < 20; i++) g.fillRect(caso() * 128, caso() * 128, 4 + caso() * 10, 3 + caso() * 6);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function textureLamiera() {
  const c = tela(128, 128);
  const g = c.getContext('2d');
  for (let x = 0; x < 128; x++) {
    const v = 110 + Math.sin(x * 0.6) * 40;
    g.fillStyle = `rgb(${v},${v + 4},${v + 8})`;
    g.fillRect(x, 0, 1, 128);
  }
  const caso = creaCasuale(3);
  for (let i = 0; i < 18; i++) {
    g.fillStyle = `rgba(${130 + caso() * 40},${60 + caso() * 20},20,${0.3 + caso() * 0.3})`;
    g.beginPath();
    g.ellipse(caso() * 128, caso() * 128, 4 + caso() * 14, 3 + caso() * 10, caso() * 3, 0, TAU);
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ---------- Modelli della mappa ----------

function geoMore() {
  const parti = [];
  const caso = creaCasuale(6);
  for (let i = 0; i < 14; i++) {
    const g = new THREE.SphereGeometry(1.8, 6, 5);
    const a = caso() * TAU;
    g.translate(Math.cos(a) * (6 + caso() * 7), 8 + caso() * 12, Math.sin(a) * (6 + caso() * 7));
    parti.push(g);
  }
  return unisci(parti);
}

function geoRottami(seme) {
  const caso = creaCasuale(seme);
  const parti = [];
  for (let i = 0; i < 9; i++) {
    const g = caso() < 0.5 ? new THREE.BoxGeometry(6 + caso() * 14, 2 + caso() * 6, 4 + caso() * 12) : new THREE.CylinderGeometry(2 + caso() * 3, 2 + caso() * 3, 10 + caso() * 14, 8);
    g.rotateX((caso() - 0.5) * 1.5);
    g.rotateY(caso() * TAU);
    g.rotateZ((caso() - 0.5) * 1.5);
    g.translate((caso() - 0.5) * 22, 3 + caso() * 6, (caso() - 0.5) * 22);
    const ruggine = caso() < 0.5;
    parti.push(colora(g, (v, n) => tinta(ruggine ? '#7a4426' : '#6d6f70', 0.75 + Math.max(n.y, 0) * 0.35)));
  }
  return unisci(parti);
}

function costruisciAuto(o, m) {
  const g = new THREE.Group();
  const caso = creaCasuale(o.id * 17 + 3);
  const polizia = o.tipo === 'polizia';
  const colori = ['#5d6266', '#6e3328', '#36465a', '#7d7760', '#2d382b', '#8b8579'];
  const vernice = polizia ? m.autoBianca : new THREE.MeshStandardMaterial({ color: colori[Math.floor(caso() * colori.length)], roughness: 0.55, metalness: 0.35 });
  const scocca = new THREE.Mesh(new THREE.BoxGeometry(42, 16, 88), vernice);
  scocca.position.y = 15;
  const cofano = new THREE.Mesh(new THREE.BoxGeometry(40, 3, 24), vernice);
  cofano.position.set(0, 24, 30);
  cofano.rotation.x = 0.06;
  const abitacolo = new THREE.Mesh(new THREE.BoxGeometry(37, 14, 42), m.vetro);
  abitacolo.position.set(0, 30, -4);
  const tetto = new THREE.Mesh(new THREE.BoxGeometry(37, 2.5, 38), vernice);
  tetto.position.set(0, 38, -5);
  g.add(scocca, cofano, abitacolo, tetto);
  for (const x of [-21, 21]) {
    for (const z of [-29, 29]) {
      const ruota = new THREE.Mesh(new THREE.CylinderGeometry(7.5, 7.5, 6, 14), m.gomma);
      ruota.rotation.z = Math.PI / 2;
      ruota.position.set(x, 7.5, z);
      g.add(ruota);
    }
  }
  for (const x of [-14, 14]) {
    const faro = new THREE.Mesh(new THREE.BoxGeometry(8, 4, 1), m.faro);
    faro.position.set(x, 17, 44.2);
    g.add(faro);
  }
  if (polizia) {
    const porte = new THREE.Mesh(new THREE.BoxGeometry(42.4, 8, 40), m.autoNera);
    porte.position.set(0, 14, -4);
    const rossa = new THREE.Mesh(new THREE.BoxGeometry(8, 3, 5), m.sirenaRossa);
    rossa.position.set(-5, 40.5, -5);
    const blu = new THREE.Mesh(new THREE.BoxGeometry(8, 3, 5), m.sirenaBlu);
    blu.position.set(5, 40.5, -5);
    g.add(porte, rossa, blu);
  }
  // Ruggine e sporco a macchie
  for (let i = 0; i < 5; i++) {
    const macchia = new THREE.Mesh(new THREE.CircleGeometry(3 + caso() * 6, 10), m.ruggine);
    macchia.position.set((caso() < 0.5 ? -1 : 1) * 21.1, 10 + caso() * 10, (caso() - 0.5) * 70);
    macchia.rotation.y = macchia.position.x > 0 ? Math.PI / 2 : -Math.PI / 2;
    g.add(macchia);
  }
  g.traverse((x) => {
    if (x.isMesh) x.castShadow = x.receiveShadow = true;
  });
  g.rotation.y = (o.orizzontale ? Math.PI / 2 : 0) + (caso() - 0.5) * 0.25 + (caso() < 0.5 ? Math.PI : 0);
  return g;
}

const ALTEZZA_MURI = 58;

function costruisciEdificio(e, m) {
  const g = new THREE.Group();
  const muri = new THREE.Group();
  const intonaco = m.intonaco.clone();
  for (const q of e.muri) {
    const muro = new THREE.Mesh(new THREE.BoxGeometry(q.w, ALTEZZA_MURI, q.h), intonaco);
    muro.position.set(q.x + q.w / 2, ALTEZZA_MURI / 2, q.y + q.h / 2);
    muro.castShadow = muro.receiveShadow = true;
    muri.add(muro);
  }
  // Tetto a due falde lungo il lato più lungo
  const lungo = e.w >= e.h;
  const larghezza = (lungo ? e.h : e.w) + 24;
  const lunghezza = (lungo ? e.w : e.h) + 24;
  const forma = new THREE.Shape([new THREE.Vector2(-larghezza / 2, 0), new THREE.Vector2(larghezza / 2, 0), new THREE.Vector2(0, 34)]);
  const geo = new THREE.ExtrudeGeometry(forma, { depth: lunghezza, bevelEnabled: false });
  geo.translate(0, 0, -lunghezza / 2);
  // Gruppi dell'estrusione: 0 = i due triangoli alle testate, 1 = le falde
  const tetto = new THREE.Mesh(geo, [m.timpano, m.tegole]);
  tetto.position.set(e.x + e.w / 2, ALTEZZA_MURI, e.y + e.h / 2);
  if (lungo) tetto.rotation.y = Math.PI / 2;
  tetto.castShadow = true;
  g.add(muri, tetto);
  g.userData = { e, tetto, intonaco };
  return g;
}

function costruisciArredo(o, m) {
  const g = new THREE.Group();
  if (o.tipo === 'frigo') {
    const corpo = new THREE.Mesh(new THREE.BoxGeometry(20, 42, 18), m.smalto);
    corpo.position.y = 21;
    const maniglia = new THREE.Mesh(new THREE.BoxGeometry(1.5, 10, 1.5), m.gomma);
    maniglia.position.set(7, 28, 9.4);
    g.add(corpo, maniglia);
  } else if (o.tipo === 'armadio') {
    const corpo = new THREE.Mesh(new THREE.BoxGeometry(26, 48, 14), m.legnoMobile);
    corpo.position.y = 24;
    const fessura = new THREE.Mesh(new THREE.BoxGeometry(0.8, 44, 0.6), m.gomma);
    fessura.position.set(0, 24, 7.2);
    g.add(corpo, fessura);
  } else {
    const cassa = new THREE.Mesh(new THREE.BoxGeometry(24, 20, 24), m.cassa);
    cassa.position.y = 10;
    g.add(cassa);
    for (const y of [3, 17]) {
      const listello = new THREE.Mesh(new THREE.BoxGeometry(25, 2.5, 25), m.legnoScuro);
      listello.position.y = y;
      g.add(listello);
    }
  }
  g.traverse((x) => {
    if (x.isMesh) x.castShadow = x.receiveShadow = true;
  });
  return g;
}

// ---------- Persone e zombie ----------

function costruisciPersona(m, o) {
  const p = new THREE.Group();
  const corpo = new THREE.Group();
  p.add(corpo);
  const pelle = o.pelle;
  const gambe = [];
  for (const x of [-4.4, 4.4]) {
    const anca = new THREE.Group();
    anca.position.set(x, 18, 0);
    const gamba = new THREE.Mesh(new THREE.CylinderGeometry(3.4, 2.9, 17, 8), o.pantaloni);
    gamba.position.y = -8.5;
    const scarpa = new THREE.Mesh(new THREE.BoxGeometry(5.4, 3.2, 8.5), m.scarpe);
    scarpa.position.set(0, -17, 1.5);
    anca.add(gamba, scarpa);
    corpo.add(anca);
    gambe.push(anca);
  }
  const busto = new THREE.Mesh(new THREE.CylinderGeometry(8.8, 9.6, 23, 12), o.maglia);
  busto.position.y = 30;
  const spalle = new THREE.Mesh(new THREE.SphereGeometry(9.6, 14, 8, 0, TAU, 0, Math.PI / 2), o.maglia);
  spalle.scale.set(1, 0.45, 0.9);
  spalle.position.y = 41;
  corpo.add(busto, spalle);
  if (o.zaino) {
    const zaino = new THREE.Mesh(new THREE.BoxGeometry(13, 16, 6), m.zaino);
    zaino.position.set(0, 32, -10);
    corpo.add(zaino);
  }
  if (o.giubbotto) {
    const g = new THREE.Mesh(new THREE.CylinderGeometry(10, 10.6, 18, 12), m.giubbotto);
    g.position.y = 32;
    corpo.add(g);
  }
  const testa = new THREE.Group();
  testa.position.y = 49;
  const viso = new THREE.Mesh(new THREE.SphereGeometry(7, 16, 12), pelle);
  viso.scale.set(0.95, 1.08, 1);
  testa.add(viso);
  if (o.capelli) {
    const capelli = new THREE.Mesh(new THREE.SphereGeometry(7.3, 14, 8, 0, TAU, 0, Math.PI * 0.55), o.capelli);
    capelli.rotation.x = -0.45;
    testa.add(capelli);
  }
  if (o.berretto) {
    const b = new THREE.Mesh(new THREE.SphereGeometry(7.5, 14, 8, 0, TAU, 0, Math.PI / 2), o.berretto);
    b.position.y = 1.5;
    testa.add(b);
  }
  if (o.elmetto) {
    const b = new THREE.Mesh(new THREE.SphereGeometry(8.6, 14, 8, 0, TAU, 0, Math.PI / 2), m.elmetto);
    b.scale.y = 0.85;
    b.position.y = 1.5;
    testa.add(b);
  }
  for (const x of [-2.5, 2.5]) {
    const occhio = new THREE.Mesh(new THREE.SphereGeometry(o.occhiZombie ? 1.1 : 0.8, 8, 6), o.occhiZombie ? m.occhiZombie : m.occhi);
    occhio.position.set(x, 1.2, 6.5);
    testa.add(occhio);
  }
  corpo.add(testa);
  const braccia = [];
  for (const x of [-11, 11]) {
    const spalla = new THREE.Group();
    spalla.position.set(x, 39, 0);
    const braccio = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 2.3, 16, 8), o.maniche || o.maglia);
    braccio.position.y = -8;
    const mano = new THREE.Mesh(new THREE.SphereGeometry(2.5, 10, 8), pelle);
    mano.position.y = -16.5;
    spalla.add(braccio, mano);
    corpo.add(spalla);
    braccia.push(spalla);
  }
  if (o.scala) p.scale.set(o.scala * (o.magro ? 0.85 : 1), o.scala, o.scala * (o.magro ? 0.85 : 1));
  p.traverse((x) => {
    if (x.isMesh) x.castShadow = true;
  });
  p.userData = { corpo, gambe, braccia, testa };
  return p;
}

function attrezziInMano(braccio, m) {
  const presa = new THREE.Group();
  presa.position.y = -16.5;
  braccio.add(presa);
  const pezzo = (geo, mat, x, y, z, rx = 0) => {
    const o = new THREE.Mesh(geo, mat);
    o.position.set(x, y, z);
    o.rotation.x = rx;
    o.castShadow = true;
    return o;
  };
  const armi = {
    bastone: [pezzo(new THREE.CylinderGeometry(1.6, 2, 26, 7), m.legnoScuro, 0, 0, 11, Math.PI / 2)],
    ascia: [pezzo(new THREE.CylinderGeometry(1, 1, 26, 6), m.legnoScuro, 0, 0, 10, Math.PI / 2), pezzo(new THREE.BoxGeometry(1, 8, 9), m.metallo, 0, 3, 20)],
    machete: [pezzo(new THREE.BoxGeometry(1.8, 2.4, 8), m.gomma, 0, 0, 3), pezzo(new THREE.BoxGeometry(0.6, 4.5, 24), m.metallo, 0, 0.8, 18)],
    balestra: [pezzo(new THREE.BoxGeometry(2.5, 3, 22), m.legnoScuro, 0, 0, 10), pezzo(new THREE.BoxGeometry(22, 1.5, 2), m.legnoScuro, 0, 1, 18)],
    pistola: [pezzo(new THREE.BoxGeometry(2.2, 6, 3), m.gomma, 0, -2, 2), pezzo(new THREE.BoxGeometry(2.2, 3, 11), m.gomma, 0, 1, 6)],
  };
  const gruppi = {};
  for (const [nome, parti] of Object.entries(armi)) {
    gruppi[nome] = new THREE.Group();
    gruppi[nome].add(...parti);
    gruppi[nome].visible = false;
    presa.add(gruppi[nome]);
  }
  return gruppi;
}

// ---------- Costruzioni del rifugio ----------

function costruisciStruttura(tipo, m) {
  if (tipo === 'falo') return costruisciFalo(m);
  const g = new THREE.Group();
  const add = (geo, mat, x, y, z, ry = 0, rz = 0) => {
    const o = new THREE.Mesh(geo, mat);
    o.position.set(x, y, z);
    o.rotation.y = ry;
    o.rotation.z = rz;
    o.castShadow = o.receiveShadow = true;
    g.add(o);
    return o;
  };
  if (tipo === 'barricata') {
    for (const x of [-18, 0, 18]) add(new THREE.BoxGeometry(5, 34, 5), m.legnoScuro, x, 17, 0);
    for (const y of [8, 20, 30]) add(new THREE.BoxGeometry(48, 6, 3), m.legno, 0, y, 3, 0, (y - 19) * 0.01);
    add(new THREE.BoxGeometry(52, 5, 3), m.legno, 0, 18, 5.5, 0, 0.55);
  } else if (tipo === 'muro') {
    for (const x of [-24, 24]) add(new THREE.BoxGeometry(6, 48, 6), m.legnoScuro, x, 24, 0);
    add(new THREE.BoxGeometry(50, 44, 3), m.lamiera, 0, 23, 2);
  } else if (tipo === 'trappola') {
    add(new THREE.BoxGeometry(32, 3, 32), m.legno, 0, 1.5, 0);
    for (let i = 0; i < 9; i++) add(new THREE.ConeGeometry(1.6, 9, 5), m.metallo, ((i % 3) - 1) * 10, 7, (Math.floor(i / 3) - 1) * 10);
  } else if (tipo === 'raccoglitore') {
    add(new THREE.CylinderGeometry(13, 13, 30, 16), m.bidone, 0, 15, 0);
    const imbuto = add(new THREE.ConeGeometry(20, 12, 16, 1, true), m.telo, 0, 36, 0);
    imbuto.rotation.x = Math.PI;
  }
  return g;
}

// ---------- La scena ----------

export class Scena3D {
  constructor(tela3d, telaSopra) {
    this.tela = tela3d;
    this.sopra = telaSopra;
    this.g2 = telaSopra.getContext('2d');
    this.renderer = new THREE.WebGLRenderer({ canvas: tela3d, antialias: true, powerPreference: 'high-performance' });
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.scena = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(CAMPO, 1, 20, 6000);
    this.mondi = new Map();
    this.strutture = new Map();
    this.zombie = new Map();
    this.morenti = [];
    this.fantasmi = {};
    this.modelli = {};
    this.v = new THREE.Vector3();
    this.direzione = 0;
    this.ultimaPos = null;
    this.ultimoT = 0;

    this.cielo = new THREE.HemisphereLight('#b9c2c0', '#3a3426', 1);
    this.sole = new THREE.DirectionalLight('#ffeedd', 2.4);
    this.sole.castShadow = true;
    const ombre = this.renderer.capabilities.maxTextureSize >= 8192 ? 2048 : 1024;
    this.sole.shadow.mapSize.set(ombre, ombre);
    this.sole.shadow.bias = -0.0004;
    this.sole.shadow.normalBias = 0.6;
    this.luna = new THREE.DirectionalLight('#7f93d6', 0);
    this.torcia = new THREE.PointLight('#ffd9a8', 0, 200, 1.2);
    this.fuochi = Array.from({ length: LUCI_FUOCO }, () => new THREE.PointLight('#ff8a3a', 0, 300, 1.1));
    this.scena.add(this.cielo, this.sole, this.sole.target, this.luna, this.luna.target, this.torcia, ...this.fuochi);
    this.nebbia = new THREE.Fog('#9aa39c', 1000, 3000);
    this.scena.fog = this.nebbia;
    this.scena.background = new THREE.Color('#9aa39c');

    this.m = this.creaMateriali();
    this.io = this.creaSopravvissuto();
    this.scena.add(this.io);
    this.bersaglio = new THREE.Mesh(new THREE.RingGeometry(1, 1.12, 40), new THREE.MeshBasicMaterial({ color: '#fff4e0', transparent: true, opacity: 0.55, depthWrite: false }));
    this.bersaglio.rotation.x = -Math.PI / 2;
    this.piazzaAnello = new THREE.Mesh(new THREE.CircleGeometry(1, 32), new THREE.MeshBasicMaterial({ color: '#5ac86e', transparent: true, opacity: 0.3, depthWrite: false }));
    this.piazzaAnello.rotation.x = -Math.PI / 2;
    this.scena.add(this.bersaglio, this.piazzaAnello);
    const fondo = new THREE.Mesh(new THREE.PlaneGeometry(40000, 40000), new THREE.MeshStandardMaterial({ color: '#1c2117', roughness: 1 }));
    fondo.rotation.x = -Math.PI / 2;
    fondo.position.y = -0.5;
    this.scena.add(fondo);
  }

  // Quando arrivano i modelli veri, i personaggi si ricreano con quelli
  usaModelli(modelli) {
    this.modelli = modelli;
    if (modelli.sopravvissuto) {
      this.scena.remove(this.io);
      this.io = this.creaSopravvissuto();
      this.scena.add(this.io);
    }
    for (const o of this.zombie.values()) this.scena.remove(o);
    this.zombie.clear();
    for (const [isola, w] of this.mondi) {
      this.scena.remove(w.gruppo);
      this.mondi.delete(isola);
    }
  }

  creaMateriali() {
    const std = (o) => new THREE.MeshStandardMaterial({ roughness: 0.85, ...o });
    const fiamma = textureFiamma();
    const bagliore = textureBagliore();
    return {
      foglie: std({ vertexColors: true, roughness: 0.9 }),
      tronco: std({ map: textureCorteccia(), roughness: 0.95 }),
      ceppo: std({ vertexColors: true }),
      cespuglio: std({ vertexColors: true, roughness: 0.9 }),
      more: std({ color: '#2a0f1e', roughness: 0.35 }),
      rottami: std({ vertexColors: true, roughness: 0.7, metalness: 0.4 }),
      intonaco: std({ map: textureIntonaco(), roughness: 0.95, transparent: true }),
      tegole: std({ map: textureTegole(), roughness: 0.9 }),
      timpano: std({ color: '#8a7a62', roughness: 0.95 }),
      vetro: std({ color: '#1b2226', roughness: 0.15, metalness: 0.5 }),
      gomma: std({ color: '#141414', roughness: 0.8 }),
      faro: std({ color: '#d8d2b8', roughness: 0.3 }),
      ruggine: std({ color: '#6b3a1c', roughness: 1, transparent: true, opacity: 0.7, side: THREE.DoubleSide }),
      autoBianca: std({ color: '#d8d8d2', roughness: 0.5, metalness: 0.3 }),
      autoNera: std({ color: '#1a1a1c', roughness: 0.5, metalness: 0.3 }),
      sirenaRossa: new THREE.MeshBasicMaterial({ color: '#b01818' }),
      sirenaBlu: new THREE.MeshBasicMaterial({ color: '#1838b0' }),
      smalto: std({ color: '#d9d6cc', roughness: 0.4 }),
      legnoMobile: std({ color: '#5e4128', roughness: 0.8 }),
      cassa: std({ map: textureCorteccia(), color: '#c9a678', roughness: 0.9 }),
      legno: std({ color: '#7a5c3c', roughness: 0.9 }),
      legnoScuro: std({ color: '#4f3a26', roughness: 0.9 }),
      lamiera: std({ map: textureLamiera(), roughness: 0.55, metalness: 0.6 }),
      metallo: std({ color: '#a7adb4', roughness: 0.35, metalness: 0.85 }),
      bidone: std({ color: '#2f5a8a', roughness: 0.5 }),
      telo: std({ color: '#7d7a5e', roughness: 0.9, side: THREE.DoubleSide }),
      roccia: std({ vertexColors: true, flatShading: true, roughness: 0.95 }),
      cenere: std({ color: '#3a3532', roughness: 1 }),
      carbone: std({ color: '#1e1610', roughness: 0.95, emissive: '#3a1204', emissiveIntensity: 0.6 }),
      fiamma: new THREE.SpriteMaterial({ map: fiamma, color: '#ffb070', opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false }),
      alone: new THREE.SpriteMaterial({ map: bagliore, color: '#ff7a2a', blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.32, fog: false }),
      fumo: new THREE.SpriteMaterial({ map: bagliore, color: '#8f8f94', depthWrite: false, transparent: true, opacity: 0.25 }),
      scintille: new THREE.PointsMaterial({ map: bagliore, color: '#ffb040', size: 3.5, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false }),
      scarpe: std({ color: '#1e1a16', roughness: 0.7 }),
      occhi: std({ color: '#111', roughness: 0.2 }),
      occhiZombie: new THREE.MeshBasicMaterial({ color: '#d8e0a0' }),
      zaino: std({ color: '#5a4a32' }),
      giubbotto: std({ color: '#262a26', roughness: 0.6 }),
      elmetto: std({ color: '#3a4030', roughness: 0.5, metalness: 0.4 }),
      fantasmaOk: new THREE.MeshBasicMaterial({ color: '#7fe08f', transparent: true, opacity: 0.45, depthWrite: false }),
      fantasmaNo: new THREE.MeshBasicMaterial({ color: '#ff6a5a', transparent: true, opacity: 0.45, depthWrite: false }),
    };
  }

  creaSopravvissuto() {
    let p;
    if (this.modelli.sopravvissuto) p = copia(this.modelli.sopravvissuto);
    else {
      const std = (c, r = 0.85) => new THREE.MeshStandardMaterial({ color: c, roughness: r });
      p = costruisciPersona(this.m, { pelle: std('#c99474', 0.6), maglia: std('#4d5a3a'), pantaloni: std('#2f3440'), capelli: std('#2a1c12'), berretto: std('#2a2e2a'), zaino: true });
    }
    const braccio = p.userData.braccia?.[1];
    p.userData.armi = braccio ? attrezziInMano(braccio, this.m) : {};
    return p;
  }

  creaZombie(z) {
    if (this.modelli[z.tipo] || this.modelli.camminatore) {
      const g = copia(this.modelli[z.tipo] || this.modelli.camminatore);
      if (!this.modelli[z.tipo] && z.tipo === 'corazzato') g.scale.setScalar(1.35);
      return g;
    }
    const caso = creaCasuale(z.id * 7 + 1);
    const std = (c, r = 0.85) => new THREE.MeshStandardMaterial({ color: c, roughness: r });
    const magliette = ['#4a3a2c', '#34404a', '#5a2a26', '#4a4a3a', '#2e3a2e', '#6a5a48'];
    const pelle = std(caso() < 0.5 ? '#7b8768' : '#8a8a74', 0.7);
    const o = costruisciPersona(this.m, {
      pelle,
      maglia: std(magliette[Math.floor(caso() * magliette.length)]),
      maniche: pelle,
      pantaloni: std(caso() < 0.5 ? '#2a2a2c' : '#3a3428'),
      capelli: caso() < 0.6 ? std('#2a2420') : null,
      elmetto: z.tipo === 'corazzato',
      giubbotto: z.tipo === 'corazzato',
      occhiZombie: true,
      scala: z.tipo === 'corazzato' ? 1.35 : 1,
      magro: z.tipo === 'corridore',
    });
    o.userData.pelle = pelle;
    o.userData.fase = caso() * TAU;
    return o;
  }

  imposta(L, A, dpr, zoom) {
    this.L = L;
    this.A = A;
    this.dpr = dpr;
    this.zoom = zoom;
    this.renderer.setPixelRatio(Math.min(dpr, 2));
    this.renderer.setSize(L, A, false);
    this.camera.aspect = L / A;
    this.camera.updateProjectionMatrix();
    this.sopra.width = Math.round(L * dpr);
    this.sopra.height = Math.round(A * dpr);
    this.distanza = (A / zoom / (2 * Math.tan((CAMPO * Math.PI) / 360))) * 0.8;
    this.vignetta = null;
  }

  altezza() {
    return 0;
  }

  // ---------- Il mondo di una partita ----------

  mondo(partita) {
    const mappa = partita.mappa;
    let w = this.mondi.get(mappa);
    if (w) return w;
    for (const [vecchia, mv] of this.mondi) {
      if (vecchia === this.ultimaMappa) continue;
      this.scena.remove(mv.gruppo);
      mv.gruppo.traverse((o) => o.geometry?.dispose());
      mv.texture.dispose();
      this.mondi.delete(vecchia);
    }
    const gruppo = new THREE.Group();
    const lato = this.renderer.capabilities.maxTextureSize >= 4096 ? 3072 : 2048;
    const pittura = dipingiMappa(mappa, lato);
    const tex = new THREE.CanvasTexture(pittura.tela);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
    const terreno = new THREE.Mesh(new THREE.PlaneGeometry(pittura.lato, pittura.lato), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.96 }));
    terreno.rotation.x = -Math.PI / 2;
    terreno.position.set(pittura.lato / 2, 0, pittura.lato / 2);
    terreno.receiveShadow = true;
    gruppo.add(terreno);

    const m = this.m;
    const conta = {};
    for (const o of partita.oggetti) conta[o.tipo] = (conta[o.tipo] || 0) + 1;
    const nAlberi = (conta.albero || 0) + mappa.sfondo.length;
    // Alberi: dal file .glb se c'è, altrimenti generati
    let alberi;
    if (this.modelli.albero) {
      alberi = [pezziPerIstanze(this.modelli.albero).map((p) => ({ ist: new Istanze(p.geometria, p.materiale, nAlberi), locale: p.locale }))];
    } else {
      alberi = [0, 1, 2].map((v) => [
        { ist: new Istanze(geoChioma(v + 1), m.foglie, nAlberi), locale: new THREE.Matrix4() },
        { ist: new Istanze(geoTronco(v + 3), m.tronco, nAlberi), locale: new THREE.Matrix4() },
      ]);
    }
    const ceppi = new Istanze(geoCeppo(), m.ceppo, conta.albero || 0);
    const cespugli = new Istanze(geoCespuglio(5), m.cespuglio, conta.cespuglio || 0);
    const more = new Istanze(geoMore(), m.more, conta.cespuglio || 0);
    const rottami = [0, 1].map((v) => new Istanze(geoRottami(v + 2), m.rottami, conta.rottami || 0));
    for (const varianti of alberi) for (const p of varianti) gruppo.add(p.ist.mesh);
    for (const ist of [ceppi, cespugli, more, ...rottami]) gruppo.add(ist.mesh);

    const voci = [];
    const mat = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const asse = new THREE.Vector3(0, 1, 0);
    const colore = new THREE.Color();
    const piazzaAlbero = (x, y, variante, grande) => {
      q.setFromAxisAngle(asse, variante * TAU * 7);
      const s = (0.85 + ((variante * 13) % 1) * 0.35) * (grande ? 1.35 : 1);
      mat.compose(new THREE.Vector3(x, 0, y), q, new THREE.Vector3(s, s, s));
      colore.set((variante * 7) % 1 > 0.5 ? '#4f5f34' : '#465a30');
      const varianti = alberi[Math.floor(variante * alberi.length) % alberi.length];
      return varianti.map((p) => ({ ist: p.ist, mat: mat.clone().multiply(p.locale), colore: colore.clone() }));
    };
    for (const s of mappa.sfondo) for (const p of piazzaAlbero(s.x, s.y, s.variante, true)) p.ist.aggiungi(p.mat, p.colore);
    const singoli = new Map();
    for (const o of partita.oggetti) {
      if (o.tipo === 'auto' || o.tipo === 'polizia') {
        const auto = this.modelli[o.tipo] || this.modelli.auto ? copia(this.modelli[o.tipo] || this.modelli.auto) : costruisciAuto(o, m);
        auto.position.set(o.x, 0, o.y);
        if (this.modelli.auto) auto.rotation.y = o.orizzontale ? Math.PI / 2 : 0;
        gruppo.add(auto);
        continue;
      }
      if (o.edificio !== undefined || o.tipo === 'cassa') {
        const a = costruisciArredo(o, m);
        a.position.set(o.x, 0, o.y);
        a.rotation.y = o.edificio !== undefined ? 0 : o.variante * TAU;
        gruppo.add(a);
        singoli.set(o, a);
        continue;
      }
      q.setFromAxisAngle(asse, o.variante * TAU * 7);
      const s = 0.85 + ((o.variante * 13) % 1) * 0.35;
      mat.compose(new THREE.Vector3(o.x, 0, o.y), q, new THREE.Vector3(s, s, s));
      const voce = { o, parti: [] };
      if (o.tipo === 'albero') {
        for (const p of piazzaAlbero(o.x, o.y, o.variante, false)) voce.parti.push({ ...p, quando: 'pieno' });
        voce.parti.push({ ist: ceppi, mat: mat.clone(), quando: 'vuoto' });
      } else if (o.tipo === 'cespuglio') {
        voce.parti.push({ ist: cespugli, mat: mat.clone(), quando: 'sempre' }, { ist: more, mat: mat.clone(), quando: 'pieno' });
      } else if (o.tipo === 'rottami') voce.parti.push({ ist: rottami[Math.floor(o.variante * 2) % 2], mat: mat.clone(), quando: 'pieno' });
      for (const p of voce.parti) p.indice = p.ist.aggiungi(new THREE.Matrix4().makeScale(0, 0, 0), p.colore || colore.set('#ffffff'));
      voce.visto = null;
      voci.push(voce);
    }
    const edifici = mappa.edifici.map((e) => {
      const g = costruisciEdificio(e, m);
      gruppo.add(g);
      return g;
    });
    w = { mappa, gruppo, voci, edifici, texture: tex };
    this.mondi.set(mappa, w);
    this.scena.add(gruppo);
    return w;
  }

  aggiornaOggetti(w) {
    const zero = new THREE.Matrix4().makeScale(0, 0, 0);
    const cambiati = new Set();
    for (const v of w.voci) {
      const pieno = v.o.colpi > 0;
      if (v.visto === pieno) continue;
      v.visto = pieno;
      for (const p of v.parti) {
        const vedi = p.quando === 'sempre' || (p.quando === 'pieno') === pieno;
        p.ist.mesh.setMatrixAt(p.indice, vedi ? p.mat : zero);
        cambiati.add(p.ist.mesh);
      }
    }
    for (const mesh of cambiati) mesh.instanceMatrix.needsUpdate = true;
  }

  // Dentro una casa (o subito dietro) il tetto sparisce e i muri si fanno trasparenti
  aggiornaEdifici(w, partita) {
    const io = partita.io;
    for (const g of w.edifici) {
      const { e, tetto, intonaco } = g.userData;
      const dentro = io.x > e.x - 10 && io.x < e.x + e.w + 10 && io.y > e.y - 70 && io.y < e.y + e.h + 10;
      tetto.visible = !dentro;
      intonaco.opacity = dentro ? 0.35 : 1;
      intonaco.depthWrite = !dentro;
    }
  }

  aggiornaStrutture(partita, t) {
    const presenti = new Set();
    for (const s of partita.strutture) {
      presenti.add(s.id);
      let o = this.strutture.get(s.id);
      if (!o) {
        o = costruisciStruttura(s.tipo, this.m);
        o.position.set(s.x, 0, s.y);
        o.rotation.y = s.tipo === 'barricata' || s.tipo === 'muro' ? Math.round((partita.io.guarda ?? 0) / (Math.PI / 2)) * (Math.PI / 2) : 0;
        this.scena.add(o);
        this.strutture.set(s.id, o);
      }
      if (s.tipo === 'falo') this.animaFuoco(o, s, t);
    }
    for (const [id, o] of this.strutture) {
      if (presenti.has(id)) continue;
      this.scena.remove(o);
      this.strutture.delete(id);
    }
  }

  animaFuoco(o, s, t) {
    const { fuoco, braci, fumo } = o.userData;
    const forza = s.fuoco > 0 ? 0.55 + 0.45 * Math.min(s.fuoco / 60, 1) : 0;
    fuoco.visible = forza > 0;
    fumo.visible = forza === 0;
    if (forza > 0) {
      fuoco.children.forEach((sp, i) => {
        if (!sp.isSprite || i > 3) return;
        const tr = 1 + Math.sin(t * (11 + i * 3) + i) * 0.12 + Math.sin(t * 27 + i * 2) * 0.06;
        const lw = (i === 0 ? 18 : 11) * forza;
        sp.scale.set(lw, lw * 2.1 * tr, 1);
        sp.position.set(Math.sin(i * 2.1) * 5 * forza, 0, Math.cos(i * 2.1) * 5 * forza);
      });
      const p = braci.geometry.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const k = (t * 0.6 + i / p.count) % 1;
        p.setXYZ(i, Math.sin(i * 12.9 + t) * 7, k * 70 * forza, Math.cos(i * 7.3 + t * 0.7) * 7);
      }
      p.needsUpdate = true;
    } else {
      fumo.children.forEach((sp, i) => {
        const k = (t * 0.25 + i / 4) % 1;
        sp.scale.setScalar(10 + k * 30);
        sp.position.set(Math.sin(k * 5 + i) * 6, 8 + k * 60, 0);
      });
    }
  }

  // Cammino, braccia, attacco: per i modelli generati muove gli arti, per quelli veri sceglie l'animazione
  animaPersona(o, stato, dt, t) {
    const { corpo, gambe, braccia } = o.userData;
    if (o.userData.modello) {
      anima(o, stato.muore ? 'muore' : stato.colpo > 0 ? 'attacca' : stato.velocita > 5 ? 'cammina' : 'fermo', dt, stato.velocita > 5 ? Math.max(stato.velocita / 80, 0.6) : 1);
      return;
    }
    const passo = Math.sin(stato.passo);
    gambe[0].rotation.x = passo * 0.6 * stato.ampiezza;
    gambe[1].rotation.x = -passo * 0.6 * stato.ampiezza;
    corpo.position.y = Math.abs(passo) * 1.2 * stato.ampiezza;
    const k = stato.colpo > 0 ? Math.min(stato.colpo / 0.25, 1) : 0;
    if (stato.zombie) {
      // Braccia tese in avanti, che ondeggiano; si piega quando morde
      braccia[0].rotation.x = -1.35 + Math.sin(t * 3 + stato.fase) * 0.15 - k * 0.4;
      braccia[1].rotation.x = -1.4 + Math.sin(t * 3.4 + stato.fase) * 0.15 - k * 0.4;
      corpo.rotation.x = 0.12 + k * 0.25;
      corpo.rotation.z = Math.sin(stato.passo * 0.5) * 0.08;
    } else {
      braccia[0].rotation.x = -passo * 0.5 * stato.ampiezza;
      braccia[1].rotation.x = stato.mira ? -1.45 : k > 0 ? -2.4 + (1 - k) * 2.9 : passo * 0.5 * stato.ampiezza - 0.15;
    }
  }

  aggiornaZombie(partita, t, dt) {
    const presenti = new Set();
    for (const z of partita.zombie) {
      presenti.add(z.id);
      let o = this.zombie.get(z.id);
      if (!o) {
        o = this.creaZombie(z);
        this.scena.add(o);
        this.zombie.set(z.id, o);
        o.userData.ultimo = { x: z.x, y: z.y };
      }
      const mosso = Math.hypot(z.x - o.userData.ultimo.x, z.y - o.userData.ultimo.y) / Math.max(dt, 0.001);
      o.userData.ultimo = { x: z.x, y: z.y };
      o.position.set(z.x, 0, z.y);
      const verso = z.stato === 'insegue' ? Math.atan2(partita.io.x - z.x, partita.io.y - z.y) : z.meta ? Math.atan2(z.meta.x - z.x, z.meta.y - z.y) : o.rotation.y;
      let d = verso - o.rotation.y;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      o.rotation.y += d * Math.min(dt * 6, 1);
      this.animaPersona(o, { passo: z.fase * 1.6, ampiezza: Math.min(mosso / 60, 1), colpo: z.attesa > 0.75 ? (z.attesa - 0.75) : 0, zombie: true, fase: o.userData.fase || 0, velocita: mosso }, dt, t);
      const pelle = o.userData.pelle;
      if (pelle) {
        pelle.emissive.set(z.colpito > 0 ? '#ffffff' : '#000000');
        pelle.emissiveIntensity = z.colpito > 0 ? z.colpito * 3 : 0;
      }
      o.userData.vivo = z;
    }
    // Chi è appena stato ucciso cade a terra e sparisce piano
    for (const [id, o] of this.zombie) {
      if (presenti.has(id)) continue;
      this.zombie.delete(id);
      this.morenti.push({ o, t: 0 });
    }
    this.morenti = this.morenti.filter((m) => {
      m.t += dt;
      if (m.o.userData.modello) anima(m.o, 'muore', dt);
      else {
        m.o.rotation.x = -Math.min(m.t * 4, 1) * Math.PI / 2;
        m.o.position.y = -Math.max(m.t - 1, 0) * 12;
      }
      if (m.t > 2.5) {
        this.scena.remove(m.o);
        return false;
      }
      return true;
    });
  }

  aggiornaSopravvissuto(partita, t, dt, effetti) {
    const io = partita.io;
    const o = this.io;
    let velocita = 0;
    if (this.ultimaPos && this.ultimaPos.mappa === partita.mappa) velocita = Math.hypot(io.x - this.ultimaPos.x, io.y - this.ultimaPos.y) / Math.max(dt, 0.001);
    this.ultimaPos = { x: io.x, y: io.y, mappa: partita.mappa };
    let verso = io.guarda ?? this.direzione;
    const b = effetti.bersaglio;
    if ((io.colpo > 0 || (b?.tipo === 'zombie' && b.azione === 'spara')) && b) verso = Math.atan2(b.ref.x - io.x, b.ref.y - io.y);
    let d = verso - this.direzione;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    this.direzione += d * Math.min(dt * 12, 1);
    o.position.set(io.x, 0, io.y);
    o.rotation.y = this.direzione;
    this.animaPersona(o, { passo: io.passo, ampiezza: Math.min(velocita / 100, 1), colpo: io.colpo, mira: b?.azione === 'spara', velocita }, dt, t);
    for (const [nome, a] of Object.entries(o.userData.armi || {})) a.visible = nome === partita.armaAttiva;
  }

  fantasma(tipo) {
    if (!this.fantasmi[tipo]) {
      const o = costruisciStruttura(tipo, this.m);
      if (o.userData.fuoco) o.userData.fuoco.visible = o.userData.fumo.visible = false;
      o.traverse((x) => {
        if (x.isMesh) x.castShadow = false;
      });
      this.fantasmi[tipo] = o;
      this.scena.add(o);
    }
    return this.fantasmi[tipo];
  }

  aggiornaLuce(partita, centro, t) {
    const b = partita.buio();
    const tramonto = Math.sin(Math.min(b, 1) * Math.PI);
    const giorno = 1 - b;
    this.sole.intensity = 2.4 * giorno;
    this.sole.color.set('#ffeedd').lerp(new THREE.Color('#ff9a5a'), tramonto * 0.8);
    this.sole.position.set(centro.x - 520, 860, centro.z - 430);
    this.sole.target.position.copy(centro);
    const est = this.distanza * 0.75;
    const sc = this.sole.shadow.camera;
    if (sc.right !== est) {
      sc.left = -est;
      sc.right = est;
      sc.top = est;
      sc.bottom = -est;
      sc.near = 100;
      sc.far = 2400;
      sc.updateProjectionMatrix();
    }
    this.cielo.intensity = 0.95 * giorno + 0.08 * b;
    this.cielo.color.set('#b9c2c0').lerp(new THREE.Color('#3a4a80'), b);
    this.cielo.groundColor.set('#3a3426').lerp(new THREE.Color('#0a0a12'), b);
    this.luna.intensity = 0.5 * b;
    this.luna.position.set(centro.x + 300, 700, centro.z - 200);
    this.luna.target.position.copy(centro);
    const nebbia = new THREE.Color('#9aa39c').lerp(new THREE.Color('#c08a66'), tramonto * 0.4).lerp(new THREE.Color('#05070f'), b);
    this.nebbia.color.copy(nebbia);
    this.scena.background.copy(nebbia);
    this.nebbia.near = this.distanza * 0.85;
    this.nebbia.far = this.distanza * (2.1 - b * 0.6);
    const io = partita.io;
    this.torcia.position.set(io.x + Math.sin(this.direzione) * 20, 45, io.y + Math.cos(this.direzione) * 20);
    this.torcia.intensity = 150 * b;
    this.torcia.distance = 170;
    const luci = partita.strutture.filter((s) => s.tipo === 'falo' && s.fuoco > 0).sort((a, z) => Math.hypot(a.x - centro.x, a.y - centro.z) - Math.hypot(z.x - centro.x, z.y - centro.z));
    this.fuochi.forEach((l, i) => {
      const s = luci[i];
      if (!s) return (l.intensity = 0);
      l.position.set(s.x, 28, s.y);
      l.distance = COSTRUZIONI.falo.luce * 1.8;
      l.intensity = (120 + 480 * b) * (1 + Math.sin(t * 13 + i) * 0.06 + Math.sin(t * 31) * 0.03);
    });
  }

  disegna(partita, cam, t, effetti) {
    const dt = Math.min(Math.max(t - this.ultimoT, 0), 0.1);
    this.ultimoT = t;
    const w = this.mondo(partita);
    this.ultimaMappa = partita.mappa;
    for (const [mappa, m] of this.mondi) m.gruppo.visible = mappa === partita.mappa;
    if (this.partita !== partita) {
      for (const o of this.strutture.values()) this.scena.remove(o);
      for (const o of this.zombie.values()) this.scena.remove(o);
      for (const m of this.morenti) this.scena.remove(m.o);
      this.strutture.clear();
      this.zombie.clear();
      this.morenti = [];
      for (const v of w.voci) v.visto = null;
      this.partita = partita;
    }
    this.aggiornaOggetti(w);
    this.aggiornaEdifici(w, partita);
    this.aggiornaStrutture(partita, t);
    this.aggiornaZombie(partita, t, dt);
    this.aggiornaSopravvissuto(partita, t, dt, effetti);

    const centro = new THREE.Vector3(cam.x, 0, cam.y);
    this.camera.position.set(centro.x, this.distanza * Math.sin(INCLINAZIONE), centro.z + this.distanza * Math.cos(INCLINAZIONE));
    this.camera.lookAt(centro);
    this.aggiornaLuce(partita, centro, t);

    const b = effetti.bersaglio;
    this.bersaglio.visible = !!b && !partita.piazzamento;
    if (b) {
      const r = (b.ref.raggio || OGGETTI[b.ref.tipo]?.raggio || COSTRUZIONI[b.ref.tipo]?.raggio || 30) + 8;
      this.bersaglio.scale.setScalar(r);
      this.bersaglio.position.set(b.ref.x, 1, b.ref.y);
      this.bersaglio.material.color.set(b.tipo === 'zombie' ? '#ff5a46' : '#fff4e0');
    }
    for (const [tipo, f] of Object.entries(this.fantasmi)) f.visible = tipo === partita.piazzamento;
    this.piazzaAnello.visible = !!partita.piazzamento;
    if (partita.piazzamento) {
      const p = partita.puntoPiazzamento();
      const ok = partita.puoPiazzare(p.x, p.y);
      const f = this.fantasma(partita.piazzamento);
      f.position.set(p.x, 0, p.y);
      f.rotation.y = Math.round((partita.io.guarda ?? 0) / (Math.PI / 2)) * (Math.PI / 2);
      f.traverse((x) => {
        if (x.isMesh) x.material = ok ? this.m.fantasmaOk : this.m.fantasmaNo;
      });
      this.piazzaAnello.scale.setScalar(COSTRUZIONI[partita.piazzamento].raggio + 8);
      this.piazzaAnello.position.set(p.x, 0.8, p.y);
      this.piazzaAnello.material.color.set(ok ? '#5ac86e' : '#e8503c');
    }
    this.renderer.render(this.scena, this.camera);
    this.disegnaSopra(partita, t, effetti);
  }

  schermo(x, h, y) {
    this.v.set(x, h, y).project(this.camera);
    return { x: (this.v.x * 0.5 + 0.5) * this.L, y: (-this.v.y * 0.5 + 0.5) * this.A, dentro: this.v.z < 1 };
  }

  disegnaSopra(partita, t, effetti) {
    const g = this.g2;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    g.clearRect(0, 0, this.L, this.A);
    const barra = (x, h, y, w, k, colore) => {
      const p = this.schermo(x, h, y);
      if (!p.dentro) return;
      g.fillStyle = 'rgba(0,0,0,0.6)';
      g.fillRect(p.x - w / 2 - 1, p.y - 1, w + 2, 5);
      g.fillStyle = colore;
      g.fillRect(p.x - w / 2, p.y, w * Math.max(Math.min(k, 1), 0), 3);
    };
    // Un luccichio sui contenitori ancora da frugare, vicini
    const io = partita.io;
    for (const o of partita.indice.vicini(io.x, io.y, 330)) {
      if (!OGGETTI[o.tipo].contenitore || o.colpi <= 0) continue;
      const p = this.schermo(o.x, o.tipo === 'auto' || o.tipo === 'polizia' ? 46 : 52, o.y);
      const k = 0.6 + Math.sin(t * 4 + o.id) * 0.4;
      g.fillStyle = `rgba(255,236,190,${0.35 + k * 0.4})`;
      g.beginPath();
      g.moveTo(p.x, p.y - 6 - k * 2);
      g.lineTo(p.x + 3, p.y);
      g.lineTo(p.x, p.y + 6 + k * 2);
      g.lineTo(p.x - 3, p.y);
      g.fill();
    }
    for (const z of partita.zombie) if (z.vita < z.vitaMax) barra(z.x, ZOMBIE[z.tipo].raggio * (z.tipo === 'corazzato' ? 5.4 : 4) + 10, z.y, 26, z.vita / z.vitaMax, '#d63a2a');
    for (const s of partita.strutture) {
      const def = COSTRUZIONI[s.tipo];
      if (s.tipo === 'falo') barra(s.x, 62, s.y, 34, s.fuoco / 270, '#e8a020');
      else if (def.vita && s.vita < def.vita) barra(s.x, 56, s.y, 32, s.vita / def.vita, '#c9b45a');
    }
    // Spari: una scia luminosa e la fiammata
    for (const s of effetti.spari) {
      const k = s.t / 0.12;
      if (k > 1) continue;
      const a = this.schermo(s.da.x, 30, s.da.y);
      const b = this.schermo(s.a.x, 28, s.a.y);
      g.strokeStyle = s.arma === 'balestra' ? `rgba(210,190,150,${1 - k})` : `rgba(255,230,160,${1 - k})`;
      g.lineWidth = s.arma === 'balestra' ? 1.5 : 2;
      g.beginPath();
      g.moveTo(a.x, a.y);
      g.lineTo(b.x, b.y);
      g.stroke();
      if (s.arma === 'pistola') {
        const gr = g.createRadialGradient(a.x, a.y, 0, a.x, a.y, 16);
        gr.addColorStop(0, `rgba(255,220,140,${1 - k})`);
        gr.addColorStop(1, 'rgba(255,160,60,0)');
        g.fillStyle = gr;
        g.fillRect(a.x - 16, a.y - 16, 32, 32);
      }
    }
    for (const q of effetti.particelle) {
      const p = this.schermo(q.x, 18, q.y);
      g.globalAlpha = Math.max(1 - q.t / q.durata, 0) * (q.cresce ? 0.5 : 1);
      g.fillStyle = q.colore;
      g.beginPath();
      g.arc(p.x, p.y, q.r * this.zoom * (q.cresce ? 1 + q.t / q.durata : 0.8), 0, TAU);
      g.fill();
    }
    g.globalAlpha = 1;
    for (const s of effetti.scritte) {
      const k = s.t / s.durata;
      const p = this.schermo(s.x, 70, s.y);
      g.globalAlpha = k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3;
      g.font = `600 ${s.dimensione * 0.85}px system-ui, -apple-system, sans-serif`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      const y = p.y - k * 30;
      g.fillStyle = 'rgba(0,0,0,0.65)';
      g.fillText(s.testo, p.x + 1, y + 1.5);
      g.fillStyle = s.colore;
      g.fillText(s.testo, p.x, y);
    }
    g.globalAlpha = 1;
    const buio = partita.buio();
    if (!this.vignetta) {
      const gr = g.createRadialGradient(this.L / 2, this.A / 2, Math.min(this.L, this.A) * 0.3, this.L / 2, this.A / 2, Math.hypot(this.L, this.A) * 0.6);
      gr.addColorStop(0, 'rgba(0,0,0,0)');
      gr.addColorStop(1, 'rgba(0,0,0,0.55)');
      this.vignetta = gr;
    }
    g.fillStyle = this.vignetta;
    g.fillRect(0, 0, this.L, this.A);
    if (buio > 0.02) {
      g.fillStyle = `rgba(4,6,18,${0.3 * buio})`;
      g.fillRect(0, 0, this.L, this.A);
    }
    if (io.ferito > 0) {
      g.fillStyle = `rgba(150,10,10,${io.ferito * 0.5})`;
      g.fillRect(0, 0, this.L, this.A);
    }
  }
}
