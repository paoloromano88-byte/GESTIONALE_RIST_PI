// Scena 3D con three.js: telecamera dall'alto inclinata, modelli generati dal codice, sole con ombre vere,
// notte buia rischiarata solo dai falò e dalla lanterna dello chef.
// Le posizioni arrivano dalla logica 2D: x → X, y → Z, l'altezza è Y (1 unità = 1 unità del gioco).

import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { LATO, CASELLE, ACQUA, OGGETTI, creaCasuale } from './mondo.js';
import { COSTRUZIONI, NEMICI } from './logica.js';
import { dipingiIsola } from './disegno.js';

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

function textureMattoni() {
  const c = tela(256, 128);
  const g = c.getContext('2d');
  g.fillStyle = '#b8a48a';
  g.fillRect(0, 0, 256, 128);
  const caso = creaCasuale(4);
  for (let r = 0; r < 8; r++) {
    for (let k = -1; k < 9; k++) {
      const x = k * 32 + (r % 2) * 16;
      const v = 0.75 + caso() * 0.35;
      g.fillStyle = `rgb(${150 * v},${70 * v},${42 * v})`;
      g.fillRect(x + 1.5, r * 16 + 1.5, 29, 13);
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function textureCipolla() {
  const c = tela(128, 64);
  const g = c.getContext('2d');
  g.fillStyle = '#7a2b55';
  g.fillRect(0, 0, 128, 64);
  for (let i = 0; i < 24; i++) {
    g.fillStyle = i % 2 ? 'rgba(220,150,190,0.35)' : 'rgba(60,10,35,0.35)';
    g.fillRect((i / 24) * 128, 0, 2 + (i % 3), 64);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
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

// Normali dell'acqua: increspature che scorrono
function textureOnde() {
  const n = 128;
  const h = new Float32Array(n * n);
  const caso = creaCasuale(77);
  const onde = Array.from({ length: 8 }, () => ({ kx: Math.round((caso() - 0.5) * 8), ky: Math.round((caso() - 0.5) * 8), f: caso() * TAU, a: caso() }));
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) for (const o of onde) h[y * n + x] += Math.sin(((x * o.kx + y * o.ky) / n) * TAU + o.f) * o.a;
  const c = tela(n, n);
  const g = c.getContext('2d');
  const img = g.createImageData(n, n);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const dx = h[y * n + ((x + 1) % n)] - h[y * n + ((x - 1 + n) % n)];
      const dy = h[((y + 1) % n) * n + x] - h[((y - 1 + n) % n) * n + x];
      const v = new THREE.Vector3(-dx, -dy, 2.5).normalize();
      const i = (y * n + x) * 4;
      img.data[i] = (v.x * 0.5 + 0.5) * 255;
      img.data[i + 1] = (v.y * 0.5 + 0.5) * 255;
      img.data[i + 2] = (v.z * 0.5 + 0.5) * 255;
      img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

// ---------- Modelli dell'isola ----------

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

function geoRoccia(seme) {
  const g = deforma(new THREE.IcosahedronGeometry(20, 1), 6, seme);
  g.scale(1.25, 0.72, 1.05);
  g.translate(0, 9, 0);
  g.computeVertexNormals();
  return colora(g, (v, n, f) => {
    const j = creaCasuale(f * 7 + seme)();
    if (n.y > 0.55 && j > 0.45) return tinta('#4f5a33', 0.9 + j * 0.2);
    const k = 0.55 + j * 0.25 + Math.max(n.y, 0) * 0.2;
    return tinta('#8c877d', k * 1.15);
  });
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

function geoPomodori() {
  const parti = [];
  for (const [x, y, z] of [[-8, 13, 6], [7, 18, 5], [9, 9, -3], [-2, 6, 10], [-10, 9, -5], [2, 21, -4]]) {
    const g = new THREE.SphereGeometry(3.6, 12, 9);
    g.translate(x, y, z);
    parti.push(g);
  }
  return unisci(parti);
}

function geoGrano(seme, rasato) {
  const caso = creaCasuale(seme);
  const parti = [];
  for (let i = 0; i < (rasato ? 12 : 16); i++) {
    const x = (caso() - 0.5) * 24;
    const z = (caso() - 0.5) * 24;
    const h = rasato ? 3 + caso() * 3 : 28 + caso() * 12;
    const s = new THREE.CylinderGeometry(0.45, 0.7, h, 4);
    s.translate(0, h / 2, 0);
    s.rotateZ((caso() - 0.5) * 0.25);
    s.rotateX((caso() - 0.5) * 0.25);
    s.translate(x, 0, z);
    parti.push(colora(s, () => tinta('#9a8346')));
    if (!rasato) {
      const spiga = new THREE.CapsuleGeometry(1.5, 7, 2, 6);
      spiga.translate(x + (caso() - 0.5) * 2, h + 3, z + (caso() - 0.5) * 2);
      parti.push(colora(spiga, (v, n, f) => tinta('#c9a64e', 0.85 + creaCasuale(f + i)() * 0.3)));
    }
  }
  return unisci(parti);
}

function geoFunghi() {
  const parti = [];
  for (const [x, z, s] of [[-6, 2, 0.8], [5, -2, 1]]) {
    const gambo = new THREE.CylinderGeometry(2.6 * s, 3.4 * s, 9 * s, 10);
    gambo.translate(x, 4.5 * s, z);
    parti.push(colora(gambo, () => tinta('#d8cbb0')));
    const cappello = new THREE.SphereGeometry(7.5 * s, 14, 8, 0, TAU, 0, Math.PI / 2);
    cappello.scale(1, 0.7, 1);
    cappello.translate(x, 8.5 * s, z);
    parti.push(colora(cappello, (v, n) => tinta('#6a4224', 0.8 + n.y * 0.35)));
  }
  return unisci(parti);
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

// ---------- Costruzioni ----------

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

function costruisciForno(m) {
  const g = new THREE.Group();
  const base = new THREE.Mesh(new THREE.CylinderGeometry(38, 40, 8, 24), m.pietra);
  base.position.y = 4;
  const cupola = new THREE.Mesh(new THREE.SphereGeometry(36, 28, 14, 0, TAU, 0, Math.PI / 2), m.mattoni);
  cupola.scale.set(1, 0.95, 1);
  cupola.position.y = 8;
  const bocca = new THREE.Mesh(new THREE.CircleGeometry(13, 20, 0, Math.PI), m.bocca);
  bocca.position.set(0, 9, 35.2);
  const brace = new THREE.Mesh(new THREE.CircleGeometry(9, 16, 0, Math.PI), m.braceForno);
  brace.position.set(0, 9, 35.4);
  const camino = new THREE.Mesh(new THREE.CylinderGeometry(5, 6, 26, 10), m.pietra);
  camino.position.set(12, 44, -18);
  for (const x of [base, cupola, camino]) {
    x.castShadow = true;
    x.receiveShadow = true;
  }
  g.add(base, cupola, bocca, brace, camino);
  return g;
}

function costruisciSteccato(m) {
  const g = new THREE.Group();
  for (const x of [-18, 0, 18]) {
    const palo = new THREE.Mesh(new THREE.BoxGeometry(5, 30, 5), m.legno);
    palo.position.set(x, 15, 0);
    const punta = new THREE.Mesh(new THREE.ConeGeometry(3.6, 6, 4), m.legno);
    punta.position.set(x, 33, 0);
    punta.rotation.y = Math.PI / 4;
    g.add(palo, punta);
  }
  for (const y of [9, 21]) {
    const asse = new THREE.Mesh(new THREE.BoxGeometry(48, 5, 3), m.legnoScuro);
    asse.position.set(0, y, 2.5);
    g.add(asse);
  }
  g.traverse((o) => (o.castShadow = o.receiveShadow = true));
  return g;
}

// ---------- Lo chef ----------

function costruisciChef(m) {
  const chef = new THREE.Group();
  const corpo = new THREE.Group();
  chef.add(corpo);
  const gambe = [];
  for (const x of [-4.2, 4.2]) {
    const anca = new THREE.Group();
    anca.position.set(x, 17, 0);
    const gamba = new THREE.Mesh(new THREE.CylinderGeometry(3.4, 2.8, 15, 8), m.pantaloni);
    gamba.position.y = -7.5;
    const scarpa = new THREE.Mesh(new THREE.BoxGeometry(5.5, 3.2, 8.5), m.scarpe);
    scarpa.position.set(0, -15.5, 1.5);
    anca.add(gamba, scarpa);
    corpo.add(anca);
    gambe.push(anca);
  }
  const busto = new THREE.Mesh(new THREE.CylinderGeometry(9.5, 10.5, 24, 14), m.giacca);
  busto.position.y = 29;
  const spalle = new THREE.Mesh(new THREE.SphereGeometry(10, 16, 10, 0, TAU, 0, Math.PI / 2), m.giacca);
  spalle.scale.set(1, 0.5, 0.95);
  spalle.position.y = 40.5;
  const fazzoletto = new THREE.Mesh(new THREE.ConeGeometry(4, 6, 6), m.fazzoletto);
  fazzoletto.rotation.x = Math.PI;
  fazzoletto.position.set(0, 41.5, 7.5);
  corpo.add(busto, spalle, fazzoletto);
  for (const y of [34, 29, 24]) {
    for (const x of [-3, 3]) {
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.9, 6, 4), m.bottoni);
      b.position.set(x, y, 9.8);
      corpo.add(b);
    }
  }
  const testa = new THREE.Group();
  testa.position.y = 50;
  const viso = new THREE.Mesh(new THREE.SphereGeometry(7.6, 18, 14), m.pelle);
  const capelli = new THREE.Mesh(new THREE.SphereGeometry(7.9, 16, 10, 0, TAU, 0, Math.PI * 0.6), m.capelli);
  capelli.rotation.x = -0.5;
  capelli.position.z = -0.8;
  const naso = new THREE.Mesh(new THREE.SphereGeometry(1.6, 8, 6), m.pelle);
  naso.position.set(0, -0.5, 7.4);
  testa.add(viso, capelli, naso);
  for (const x of [-2.6, 2.6]) {
    const occhio = new THREE.Mesh(new THREE.SphereGeometry(0.9, 8, 6), m.occhi);
    occhio.position.set(x, 1.4, 6.9);
    const baffo = new THREE.Mesh(new THREE.CapsuleGeometry(1.2, 4.5, 2, 6), m.capelli);
    baffo.rotation.z = Math.PI / 2 + (x > 0 ? -0.35 : 0.35);
    baffo.position.set(x * 1.05, -2.4, 7.2);
    testa.add(occhio, baffo);
  }
  const fascia = new THREE.Mesh(new THREE.CylinderGeometry(7.2, 7.4, 6, 16), m.cappello);
  fascia.position.y = 8.5;
  testa.add(fascia);
  for (const [x, y, z, r] of [[0, 15, 0, 8.5], [-4, 13, 2, 6], [4, 13, 2, 6], [0, 13.5, -4, 6]]) {
    const sbuffo = new THREE.Mesh(new THREE.SphereGeometry(r, 14, 10), m.cappello);
    sbuffo.scale.y = 0.8;
    sbuffo.position.set(x, y, z);
    testa.add(sbuffo);
  }
  corpo.add(testa);
  const braccia = [];
  for (const x of [-11.5, 11.5]) {
    const spalla = new THREE.Group();
    spalla.position.set(x, 38, 0);
    const braccio = new THREE.Mesh(new THREE.CylinderGeometry(2.7, 2.4, 15, 8), m.giacca);
    braccio.position.y = -7.5;
    const mano = new THREE.Mesh(new THREE.SphereGeometry(2.6, 10, 8), m.pelle);
    mano.position.y = -15.5;
    spalla.add(braccio, mano);
    corpo.add(spalla);
    braccia.push(spalla);
  }
  const attrezzi = {};
  const presa = new THREE.Group();
  presa.position.y = -15.5;
  braccia[1].add(presa);
  attrezzi.mattarello = new THREE.Mesh(new THREE.CylinderGeometry(1.7, 1.7, 24, 8), m.mattarello);
  attrezzi.mattarello.rotation.x = Math.PI / 2;
  attrezzi.mattarello.position.z = 8;
  attrezzi.ascia = new THREE.Group();
  {
    const manico = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 26, 6), m.legnoScuro);
    manico.rotation.x = Math.PI / 2;
    manico.position.z = 9;
    const lama = new THREE.Mesh(new THREE.BoxGeometry(1, 8, 9), m.metallo);
    lama.position.set(0, 3, 19);
    attrezzi.ascia.add(manico, lama);
  }
  attrezzi.piccone = new THREE.Group();
  {
    const manico = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 26, 6), m.legnoScuro);
    manico.rotation.x = Math.PI / 2;
    manico.position.z = 9;
    const testaP = new THREE.Mesh(new THREE.BoxGeometry(1.6, 20, 2.4), m.metallo);
    testaP.position.set(0, 0, 21);
    attrezzi.piccone.add(manico, testaP);
  }
  attrezzi.coltello = new THREE.Group();
  {
    const manico = new THREE.Mesh(new THREE.BoxGeometry(1.8, 2.4, 8), m.scarpe);
    manico.position.z = 3;
    const lama = new THREE.Mesh(new THREE.BoxGeometry(0.6, 4.5, 18), m.metallo);
    lama.position.set(0, 0.8, 15);
    attrezzi.coltello.add(manico, lama);
  }
  for (const a of Object.values(attrezzi)) {
    a.visible = false;
    presa.add(a);
  }
  const lacrime = [];
  for (const x of [-2.6, 2.6]) {
    const l = new THREE.Mesh(new THREE.SphereGeometry(0.8, 6, 4), m.lacrima);
    l.position.set(x, 0, 7.4);
    testa.add(l);
    lacrime.push(l);
  }
  chef.traverse((o) => (o.castShadow = true));
  chef.userData = { corpo, gambe, braccia, attrezzi, lacrime, testa };
  return chef;
}

// ---------- I mostri ----------

function costruisciNemico(tipo, m, id) {
  const def = NEMICI[tipo];
  const r = def.raggio;
  const g = new THREE.Group();
  const forma = new THREE.Group();
  g.add(forma);
  let corpo;
  const caso = creaCasuale(id * 31 + 1);
  const occhi = (y, z, s, materiale) => {
    for (const x of [-s * 1.5, s * 1.5]) {
      const cavo = new THREE.Mesh(new THREE.SphereGeometry(s * 1.15, 10, 8), m.cavo);
      cavo.scale.z = 0.5;
      cavo.position.set(x, y, z);
      const o = new THREE.Mesh(new THREE.SphereGeometry(s * 0.6, 10, 8), materiale);
      o.position.set(x, y, z + s * 0.3);
      const ciglio = new THREE.Mesh(new THREE.BoxGeometry(s * 2.2, s * 0.45, s * 0.5), m.cavo);
      ciglio.position.set(x, y + s * 1.05, z + s * 0.25);
      ciglio.rotation.z = x < 0 ? -0.45 : 0.45;
      forma.add(cavo, o, ciglio);
    }
  };
  if (tipo === 'polpetta' || tipo === 'polpettone') {
    const geo = liscia(deforma(new THREE.IcosahedronGeometry(r, 3), r * 0.12, id));
    colora(geo, (v) => tinta('#6a3a24', 0.65 + casoPunto(v, id) * 0.55));
    corpo = new THREE.Mesh(geo, m.carne.clone());
    corpo.position.y = r;
    const sugo = new THREE.Mesh(new THREE.SphereGeometry(r * 0.62, 18, 10), m.sugo);
    sugo.scale.set(1, 0.32, 1);
    sugo.position.y = r * 1.72;
    forma.add(corpo, sugo);
    occhi(r * 1.15, r * 0.82, r * 0.17, m.occhioBrace);
    if (tipo === 'polpettone') {
      const bocca = new THREE.Mesh(new THREE.SphereGeometry(r * 0.42, 16, 8), m.cavo);
      bocca.scale.set(1, 0.42, 0.4);
      bocca.position.set(0, r * 0.62, r * 0.85);
      forma.add(bocca);
      for (let i = -3; i <= 3; i++) {
        const dente = new THREE.Mesh(new THREE.ConeGeometry(1.8, 5, 5), m.denti);
        dente.rotation.x = Math.PI;
        dente.position.set(i * 4.2, r * 0.74, r * 0.93);
        forma.add(dente);
      }
      for (const a of [-0.5, 0.5]) {
        const foglia = new THREE.Mesh(new THREE.SphereGeometry(7, 10, 6), m.basilico);
        foglia.scale.set(0.5, 0.15, 1.4);
        foglia.rotation.z = a;
        foglia.position.set(a * 10, r * 1.95, 0);
        forma.add(foglia);
      }
    }
  } else if (tipo === 'cipolla') {
    const profilo = [];
    for (let i = 0; i <= 14; i++) {
      const k = i / 14;
      profilo.push(new THREE.Vector2(Math.max(Math.sin(k * Math.PI) * r * 1.05 * (1 - k * 0.25), 0.01), k * r * 2.3));
    }
    corpo = new THREE.Mesh(new THREE.LatheGeometry(profilo, 20), m.cipolla.clone());
    forma.add(corpo);
    for (const a of [-0.3, 0.25]) {
      const germoglio = new THREE.Mesh(new THREE.ConeGeometry(1.4, 12, 6), m.basilico);
      germoglio.position.set(a * 6, r * 2.3 + 5, 0);
      germoglio.rotation.z = a;
      forma.add(germoglio);
    }
    occhi(r * 1.2, r * 0.95, r * 0.16, m.occhioPallido);
    const lacrime = [];
    for (const x of [-r * 0.25, r * 0.25]) {
      const l = new THREE.Mesh(new THREE.SphereGeometry(1, 6, 4), m.lacrima);
      l.position.set(x, r, r * 1.02);
      forma.add(l);
      lacrime.push(l);
    }
    g.userData.lacrime = lacrime;
  } else {
    const profilo = [];
    for (let i = 0; i <= 14; i++) {
      const k = i / 14;
      profilo.push(new THREE.Vector2(Math.max(r * 0.75 * Math.pow(k, 0.6), 0.01), k * r * 2.1));
    }
    const geo = new THREE.LatheGeometry(profilo, 16);
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) p.setX(i, p.getX(i) + Math.pow(1 - p.getY(i) / (r * 2.1), 2) * r * 0.5);
    geo.computeVertexNormals();
    corpo = new THREE.Mesh(geo, m.peperoncino.clone());
    const calice = new THREE.Mesh(new THREE.SphereGeometry(r * 0.78, 14, 8), m.basilico);
    calice.scale.set(1, 0.3, 1);
    calice.position.y = r * 2.1;
    forma.add(corpo, calice);
    occhi(r * 1.45, r * 0.62, r * 0.2, m.occhioGiallo);
    const fuoco = new THREE.Group();
    fuoco.position.y = r * 2.2;
    for (let i = 0; i < 2; i++) {
      const s = new THREE.Sprite(m.fiamma);
      s.center.set(0.5, 0.05);
      fuoco.add(s);
    }
    forma.add(fuoco);
    g.userData.fuoco = fuoco;
  }
  g.traverse((o) => (o.castShadow = true));
  g.userData.forma = forma;
  g.userData.corpo = corpo;
  g.userData.fase = caso() * TAU;
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
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.scena = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(CAMPO, 1, 20, 6000);
    this.mondi = new Map();
    this.strutture = new Map();
    this.nemici = new Map();
    this.fantasmi = {};
    this.v = new THREE.Vector3();
    this.direzioneChef = 0;
    this.ultimaPos = null;

    // Luci: cielo e terra, sole con ombre, luna, lanterna dello chef e luci dei falò (sempre le stesse,
    // così i materiali non devono ricompilarsi quando si accende un fuoco)
    this.cielo = new THREE.HemisphereLight('#c4d0d6', '#3a3426', 1);
    this.sole = new THREE.DirectionalLight('#fff1dc', 2.6);
    this.sole.castShadow = true;
    const ombre = this.renderer.capabilities.maxTextureSize >= 8192 ? 2048 : 1024;
    this.sole.shadow.mapSize.set(ombre, ombre);
    this.sole.shadow.bias = -0.0004;
    this.sole.shadow.normalBias = 0.6;
    this.luna = new THREE.DirectionalLight('#7f93d6', 0);
    this.lanterna = new THREE.PointLight('#ffb070', 0, 190, 1.2);
    this.fuochi = Array.from({ length: LUCI_FUOCO }, () => new THREE.PointLight('#ff8a3a', 0, 300, 1.1));
    this.scena.add(this.cielo, this.sole, this.sole.target, this.luna, this.luna.target, this.lanterna, ...this.fuochi);
    this.nebbia = new THREE.Fog('#a9b6b6', 1000, 3000);
    this.scena.fog = this.nebbia;
    this.scena.background = new THREE.Color('#a9b6b6');

    this.materiali = this.creaMateriali();
    this.chef = costruisciChef(this.materiali);
    this.scena.add(this.chef);
    this.bersaglio = new THREE.Mesh(new THREE.RingGeometry(1, 1.12, 40), new THREE.MeshBasicMaterial({ color: '#fff4e0', transparent: true, opacity: 0.55, depthWrite: false }));
    this.bersaglio.rotation.x = -Math.PI / 2;
    this.scena.add(this.bersaglio);
    this.piazzaAnello = new THREE.Mesh(new THREE.CircleGeometry(1, 32), new THREE.MeshBasicMaterial({ color: '#5ac86e', transparent: true, opacity: 0.3, depthWrite: false }));
    this.piazzaAnello.rotation.x = -Math.PI / 2;
    this.scena.add(this.piazzaAnello);

    const mare = new THREE.Mesh(new THREE.PlaneGeometry(40000, 40000), new THREE.MeshStandardMaterial({ color: '#0f2a33', roughness: 1 }));
    mare.rotation.x = -Math.PI / 2;
    mare.position.y = -9;
    this.onde = textureOnde();
    this.onde.repeat.set(70, 70);
    this.acqua = new THREE.Mesh(
      new THREE.PlaneGeometry(40000, 40000),
      new THREE.MeshStandardMaterial({ color: '#1d4652', transparent: true, opacity: 0.62, roughness: 0.14, metalness: 0.15, normalMap: this.onde, normalScale: new THREE.Vector2(0.35, 0.35), depthWrite: false }),
    );
    this.acqua.rotation.x = -Math.PI / 2;
    this.acqua.position.y = -0.4;
    this.acqua.renderOrder = 1;
    this.scena.add(mare, this.acqua);
  }

  creaMateriali() {
    const std = (o) => new THREE.MeshStandardMaterial({ roughness: 0.85, ...o });
    const fiamma = textureFiamma();
    const bagliore = textureBagliore();
    return {
      foglie: std({ vertexColors: true, roughness: 0.9 }),
      tronco: std({ map: textureCorteccia(), roughness: 0.95 }),
      ceppo: std({ vertexColors: true }),
      roccia: std({ vertexColors: true, flatShading: true, roughness: 0.95 }),
      cespuglio: std({ vertexColors: true, roughness: 0.9 }),
      pomodori: std({ color: '#b3261a', roughness: 0.32 }),
      grano: std({ vertexColors: true, roughness: 0.9 }),
      funghi: std({ vertexColors: true, roughness: 0.8 }),
      cenere: std({ color: '#3a3532', roughness: 1 }),
      carbone: std({ color: '#1e1610', roughness: 0.95, emissive: '#3a1204', emissiveIntensity: 0.6 }),
      pietra: std({ color: '#77736b', roughness: 0.95 }),
      mattoni: std({ map: textureMattoni(), roughness: 0.9 }),
      bocca: new THREE.MeshBasicMaterial({ color: '#0b0705' }),
      braceForno: new THREE.MeshBasicMaterial({ color: '#ff6a1c', transparent: true, opacity: 0.85 }),
      legno: std({ color: '#7a5c3c', roughness: 0.9 }),
      legnoScuro: std({ color: '#4f3a26', roughness: 0.9 }),
      fiamma: new THREE.SpriteMaterial({ map: fiamma, color: '#ffb070', opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false }),
      alone: new THREE.SpriteMaterial({ map: bagliore, color: '#ff7a2a', blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.32, fog: false }),
      fumo: new THREE.SpriteMaterial({ map: bagliore, color: '#8f8f94', depthWrite: false, transparent: true, opacity: 0.25 }),
      scintille: new THREE.PointsMaterial({ map: bagliore, color: '#ffb040', size: 3.5, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false }),
      giacca: std({ color: '#e9e9e3', roughness: 0.8 }),
      pantaloni: std({ color: '#2a2b32' }),
      scarpe: std({ color: '#141414', roughness: 0.5 }),
      pelle: std({ color: '#d39a74', roughness: 0.6 }),
      capelli: std({ color: '#2e1d12', roughness: 0.7 }),
      cappello: std({ color: '#f5f5f0', roughness: 0.75 }),
      fazzoletto: std({ color: '#8f1c1c' }),
      bottoni: std({ color: '#222', roughness: 0.4 }),
      occhi: std({ color: '#111', roughness: 0.2 }),
      mattarello: std({ color: '#c9a576', roughness: 0.6 }),
      metallo: std({ color: '#b8bec6', roughness: 0.3, metalness: 0.85 }),
      lacrima: std({ color: '#9ccfff', roughness: 0.1, transparent: true, opacity: 0.8 }),
      carne: std({ vertexColors: true, roughness: 0.75 }),
      sugo: std({ color: '#8f170e', roughness: 0.22 }),
      cavo: std({ color: '#120604', roughness: 0.9 }),
      occhioBrace: new THREE.MeshBasicMaterial({ color: '#ff5a1e' }),
      occhioPallido: new THREE.MeshBasicMaterial({ color: '#ffe0a0' }),
      occhioGiallo: new THREE.MeshBasicMaterial({ color: '#ffe44a' }),
      denti: std({ color: '#e8dcc6', roughness: 0.5 }),
      basilico: std({ color: '#355e26', roughness: 0.7 }),
      cipolla: std({ map: textureCipolla(), roughness: 0.55 }),
      peperoncino: std({ color: '#b5160c', roughness: 0.25 }),
      fantasmaOk: new THREE.MeshBasicMaterial({ color: '#7fe08f', transparent: true, opacity: 0.45, depthWrite: false }),
      fantasmaNo: new THREE.MeshBasicMaterial({ color: '#ff6a5a', transparent: true, opacity: 0.45, depthWrite: false }),
    };
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
    // Distanza della telecamera: in verticale si vede circa quanto nel gioco 2D
    this.distanza = A / zoom / (2 * Math.tan((CAMPO * Math.PI) / 360)) * 0.78;
    this.vignetta = null;
  }

  // ---------- Il mondo di un'isola: terreno e oggetti ----------

  altezza(isola, x, z) {
    // Terra sopra il mare, fondale sotto; il passaggio segue la costa in modo morbido
    const fx = x / LATO - 0.5;
    const fz = z / LATO - 0.5;
    const x0 = Math.floor(fx);
    const z0 = Math.floor(fz);
    const t = (cx, cz) => (cx < 0 || cz < 0 || cx >= CASELLE || cz >= CASELLE ? 0 : isola.terreno[cz * CASELLE + cx] === ACQUA ? 0 : 1);
    const sx = fx - x0;
    const sz = fz - z0;
    const m = (t(x0, z0) * (1 - sx) + t(x0 + 1, z0) * sx) * (1 - sz) + (t(x0, z0 + 1) * (1 - sx) + t(x0 + 1, z0 + 1) * sx) * sz;
    const ondulato = Math.sin(x * 0.013) * Math.cos(z * 0.011) * 1.6;
    return m > 0.55 ? 1.5 + (m - 0.55) * 4 + ondulato * m : (m - 0.55) * 18;
  }

  mondo(gioco) {
    const isola = gioco.isola;
    let w = this.mondi.get(isola);
    if (w) return w;
    // Al massimo due isole in memoria: quella del menu e la partita
    if (this.mondi.size >= 2) {
      const [vecchia, mondoVecchio] = [...this.mondi].find(([k]) => k !== this.ultimaIsola) || [...this.mondi][0];
      this.scena.remove(mondoVecchio.gruppo);
      mondoVecchio.gruppo.traverse((o) => {
        o.geometry?.dispose();
        if (o.material?.map && o.userData.texturePropria) o.material.map.dispose();
      });
      this.mondi.delete(vecchia);
    }
    const gruppo = new THREE.Group();
    const lato = this.renderer.capabilities.maxTextureSize >= 4096 ? 3072 : 2048;
    const pittura = dipingiIsola(isola, lato);
    const tex = new THREE.CanvasTexture(pittura.tela);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
    const segmenti = Math.round(pittura.lato / 24);
    const geo = new THREE.PlaneGeometry(pittura.lato, pittura.lato, segmenti, segmenti);
    geo.rotateX(-Math.PI / 2);
    const cx = pittura.x + pittura.lato / 2;
    const cz = pittura.y + pittura.lato / 2;
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) p.setY(i, this.altezza(isola, p.getX(i) + cx, p.getZ(i) + cz));
    geo.computeVertexNormals();
    const terreno = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.96 }));
    terreno.userData.texturePropria = true;
    terreno.position.set(cx, 0, cz);
    terreno.receiveShadow = true;
    gruppo.add(terreno);

    // Oggetti come istanze: un modello per tipo, ogni istanza ruotata e scalata un po' a caso
    const conta = {};
    for (const o of gioco.oggetti) conta[o.tipo] = (conta[o.tipo] || 0) + 1;
    const m = this.materiali;
    const chiome = [0, 1, 2].map((v) => new Istanze(geoChioma(v + 1), m.foglie, conta.albero || 0));
    const tronchi = new Istanze(geoTronco(3), m.tronco, conta.albero || 0);
    const ceppi = new Istanze(geoCeppo(), m.ceppo, conta.albero || 0);
    const rocce = [0, 1, 2].map((v) => new Istanze(geoRoccia(v * 7 + 2), m.roccia, conta.roccia || 0));
    const cespugli = new Istanze(geoCespuglio(5), m.cespuglio, conta.pomodori || 0);
    const pomodori = new Istanze(geoPomodori(), m.pomodori, conta.pomodori || 0);
    const grano = new Istanze(geoGrano(8, false), m.grano, conta.grano || 0);
    const stoppie = new Istanze(geoGrano(9, true), m.grano, conta.grano || 0);
    const funghi = new Istanze(geoFunghi(), m.funghi, conta.funghi || 0);
    for (const ist of [...chiome, tronchi, ceppi, ...rocce, cespugli, pomodori, grano, stoppie, funghi]) gruppo.add(ist.mesh);

    const voci = [];
    const mat = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const asse = new THREE.Vector3(0, 1, 0);
    const colore = new THREE.Color();
    for (const o of gioco.oggetti) {
      const y = this.altezza(isola, o.x, o.y);
      q.setFromAxisAngle(asse, o.variante * TAU * 7);
      const s = 0.85 + ((o.variante * 13) % 1) * 0.35;
      mat.compose(new THREE.Vector3(o.x, y - 0.5, o.y), q, new THREE.Vector3(s, s, s));
      const voce = { o, mat: mat.clone(), parti: [] };
      if (o.tipo === 'albero') {
        const ulivo = o.variante > 0.7;
        colore.set(ulivo ? '#8a9878' : (o.variante * 7) % 1 > 0.5 ? '#5d7a3a' : '#4f6e33');
        voce.parti.push([chiome[Math.floor(o.variante * 3) % 3], 'pieno'], [tronchi, 'pieno'], [ceppi, 'vuoto']);
        voce.colore = colore.clone();
      } else if (o.tipo === 'roccia') voce.parti.push([rocce[Math.floor(o.variante * 3) % 3], 'pieno']);
      else if (o.tipo === 'pomodori') voce.parti.push([cespugli, 'sempre'], [pomodori, 'pieno']);
      else if (o.tipo === 'grano') voce.parti.push([grano, 'pieno'], [stoppie, 'vuoto']);
      else if (o.tipo === 'funghi') voce.parti.push([funghi, 'pieno']);
      voce.indici = voce.parti.map(([ist]) => ist.aggiungi(new THREE.Matrix4().makeScale(0, 0, 0), voce.colore || colore.set('#ffffff')));
      voce.visto = null;
      voci.push(voce);
    }
    w = { isola, gruppo, voci, terreno };
    this.mondi.set(isola, w);
    this.scena.add(gruppo);
    return w;
  }

  // Mostra o nasconde le parti di ogni oggetto secondo il suo stato (pieno, tagliato, raccolto)
  aggiornaOggetti(w) {
    const zero = new THREE.Matrix4().makeScale(0, 0, 0);
    const cambiati = new Set();
    for (const v of w.voci) {
      const pieno = v.o.colpi > 0;
      if (v.visto === pieno) continue;
      v.visto = pieno;
      v.parti.forEach(([ist, quando], k) => {
        const vedi = quando === 'sempre' || (quando === 'pieno') === pieno;
        ist.mesh.setMatrixAt(v.indici[k], vedi ? v.mat : zero);
        if (quando === 'sempre') ist.mesh.setColorAt(v.indici[k], new THREE.Color(pieno ? '#ffffff' : '#c9b98a'));
        cambiati.add(ist.mesh);
      });
    }
    for (const mesh of cambiati) {
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  }

  aggiornaStrutture(gioco, t) {
    const presenti = new Set();
    for (const s of gioco.strutture) {
      presenti.add(s.id);
      let o = this.strutture.get(s.id);
      if (!o) {
        o = s.tipo === 'falo' ? costruisciFalo(this.materiali) : s.tipo === 'forno' ? costruisciForno(this.materiali) : costruisciSteccato(this.materiali);
        o.position.set(s.x, this.altezza(gioco.isola, s.x, s.y), s.y);
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
        const w = (i === 0 ? 18 : 11) * forza;
        sp.scale.set(w, w * 2.1 * tr, 1);
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
        sp.material.opacity = 0.25;
      });
    }
  }

  aggiornaNemici(gioco, t) {
    const presenti = new Set();
    for (const n of gioco.nemici) {
      presenti.add(n.id);
      let o = this.nemici.get(n.id);
      if (!o) {
        o = costruisciNemico(n.tipo, this.materiali, n.id);
        this.scena.add(o);
        this.nemici.set(n.id, o);
      }
      const r = NEMICI[n.tipo].raggio;
      const salto = n.tipo === 'polpetta' ? Math.abs(Math.sin(n.fase)) * 7 : n.tipo === 'polpettone' ? Math.abs(Math.sin(n.fase * 0.6)) * 4 : n.tipo === 'peperoncino' ? Math.abs(Math.sin(n.fase * 1.5)) * 4 : 0;
      o.position.set(n.x, this.altezza(gioco.isola, n.x, n.y) + salto, n.y);
      o.rotation.y = Math.atan2(gioco.chef.x - n.x, gioco.chef.y - n.y);
      const { forma, corpo, lacrime, fuoco } = o.userData;
      const sq = 1 + Math.sin(n.fase * 2) * 0.05;
      forma.scale.set(sq, 1 / sq, sq);
      if (n.tipo === 'cipolla') forma.rotation.z = Math.sin(n.fase * 0.7) * 0.08;
      if (n.tipo === 'peperoncino') forma.rotation.z = Math.sin(n.fase * 1.4) * 0.1;
      corpo.material.emissive.set(n.colpito > 0 ? '#ffffff' : '#000000');
      corpo.material.emissiveIntensity = n.colpito > 0 ? n.colpito * 4 : 0;
      if (lacrime) lacrime.forEach((l, i) => (l.position.y = r * 1.05 - ((t * 1.6 + i * 0.5) % 1) * r * 0.9));
      if (fuoco) {
        fuoco.children.forEach((sp, i) => {
          const tr = 1 + Math.sin(t * (14 + i * 5) + n.fase) * 0.15;
          sp.scale.set(9 - i * 3, (18 - i * 5) * tr, 1);
        });
      }
    }
    for (const [id, o] of this.nemici) {
      if (presenti.has(id)) continue;
      this.scena.remove(o);
      o.traverse((x) => x.geometry?.dispose());
      this.nemici.delete(id);
    }
  }

  aggiornaChef(gioco, t, effetti) {
    const c = gioco.chef;
    const o = this.chef;
    const { corpo, gambe, braccia, attrezzi, lacrime } = o.userData;
    const y = this.altezza(gioco.isola, c.x, c.y);
    // Guarda dove cammina; quando colpisce, guarda il bersaglio
    if (this.ultimaPos && this.ultimaPos.isola === gioco.isola) {
      const dx = c.x - this.ultimaPos.x;
      const dz = c.y - this.ultimaPos.y;
      if (Math.hypot(dx, dz) > 0.3) this.direzioneVoluta = Math.atan2(dx, dz);
    }
    if (c.colpo > 0 && effetti.bersaglio) this.direzioneVoluta = Math.atan2(effetti.bersaglio.ref.x - c.x, effetti.bersaglio.ref.y - c.y);
    this.ultimaPos = { x: c.x, y: c.y, isola: gioco.isola };
    if (this.direzioneVoluta !== undefined) {
      let d = this.direzioneVoluta - this.direzioneChef;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      this.direzioneChef += d * 0.25;
    }
    o.position.set(c.x, y, c.y);
    o.rotation.y = this.direzioneChef;
    const passo = c.passo ? Math.sin(c.passo) : 0;
    gambe[0].rotation.x = passo * 0.6;
    gambe[1].rotation.x = -passo * 0.6;
    corpo.position.y = Math.abs(passo) * 1.2;
    braccia[0].rotation.x = -passo * 0.5;
    const k = c.colpo > 0 ? c.colpo / 0.25 : 0;
    braccia[1].rotation.x = k > 0 ? -2.4 + (1 - k) * 2.9 : passo * 0.5 - 0.15;
    for (const [nome, a] of Object.entries(attrezzi)) a.visible = nome === effetti.attrezzo;
    lacrime.forEach((l, i) => {
      l.visible = c.piange;
      l.position.y = 1 - ((t * 2 + i * 0.5) % 1) * 9;
    });
    this.materiali.giacca.emissive.set(c.ferito > 0 ? '#b01010' : '#000000');
    this.materiali.giacca.emissiveIntensity = c.ferito > 0 ? c.ferito * 3 : 0;
  }

  fantasma(tipo) {
    if (!this.fantasmi[tipo]) {
      const o = tipo === 'falo' ? costruisciFalo(this.materiali) : tipo === 'forno' ? costruisciForno(this.materiali) : costruisciSteccato(this.materiali);
      if (o.userData.fuoco) o.userData.fuoco.visible = o.userData.fumo.visible = false;
      o.traverse((x) => {
        if (x.isMesh) x.castShadow = false;
      });
      this.fantasmi[tipo] = o;
      this.scena.add(o);
    }
    return this.fantasmi[tipo];
  }

  // ---------- Luce: giorno, tramonto, notte ----------

  aggiornaLuce(gioco, centro, t) {
    const b = gioco.buio();
    const tramonto = Math.sin(Math.min(b, 1) * Math.PI);
    const giorno = 1 - b;
    this.sole.intensity = 2.6 * giorno;
    this.sole.color.set('#fff1dc').lerp(new THREE.Color('#ff9a5a'), tramonto * 0.8);
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
    this.cielo.intensity = 1.05 * giorno + 0.08 * b;
    this.cielo.color.set('#c4d0d6').lerp(new THREE.Color('#3a4a80'), b);
    this.cielo.groundColor.set('#3a3426').lerp(new THREE.Color('#0a0a12'), b);
    this.luna.intensity = 0.5 * b;
    this.luna.position.set(centro.x + 300, 700, centro.z - 200);
    this.luna.target.position.copy(centro);
    const nebbia = new THREE.Color('#a9b6b6').lerp(new THREE.Color('#c98a62'), tramonto * 0.45).lerp(new THREE.Color('#05070f'), b);
    this.nebbia.color.copy(nebbia);
    this.scena.background.copy(nebbia);
    this.nebbia.near = this.distanza * 0.85;
    this.nebbia.far = this.distanza * (2.2 - b * 0.6);
    // Lanterna dello chef e fuochi accesi più vicini
    const c = gioco.chef;
    this.lanterna.position.set(c.x, this.altezza(gioco.isola, c.x, c.y) + 45, c.y + 8);
    this.lanterna.intensity = 140 * b;
    this.lanterna.distance = 160;
    const luci = gioco.strutture
      .filter((s) => s.tipo === 'falo' && s.fuoco > 0)
      .sort((a, z) => Math.hypot(a.x - centro.x, a.y - centro.z) - Math.hypot(z.x - centro.x, z.y - centro.z));
    this.fuochi.forEach((l, i) => {
      const s = luci[i];
      if (!s) return (l.intensity = 0);
      const raggio = COSTRUZIONI.falo.luce * (0.45 + 0.55 * Math.min(s.fuoco / 60, 1));
      l.position.set(s.x, this.altezza(gioco.isola, s.x, s.y) + 28, s.y);
      l.distance = raggio * 1.8;
      l.intensity = (120 + 480 * b) * (raggio / 170) * (1 + Math.sin(t * 13 + i) * 0.06 + Math.sin(t * 31) * 0.03);
    });
  }

  // ---------- Fotogramma completo ----------

  disegna(gioco, cam, t, effetti) {
    const w = this.mondo(gioco);
    this.ultimaIsola = gioco.isola;
    for (const [isola, m] of this.mondi) m.gruppo.visible = isola === gioco.isola;
    // Strutture e mostri appartengono a una partita sola: si ricreano quando la partita cambia
    if (this.partita !== gioco) {
      for (const o of this.strutture.values()) this.scena.remove(o);
      for (const o of this.nemici.values()) this.scena.remove(o);
      this.strutture.clear();
      this.nemici.clear();
      for (const v of w.voci) v.visto = null;
      this.partita = gioco;
    }
    this.aggiornaOggetti(w);
    this.aggiornaStrutture(gioco, t);
    this.aggiornaNemici(gioco, t);
    this.chef.visible = !effetti.senzaChef;
    this.aggiornaChef(gioco, t, effetti);

    const centro = new THREE.Vector3(cam.x, this.altezza(gioco.isola, cam.x, cam.y), cam.y);
    this.camera.position.set(centro.x, centro.y + this.distanza * Math.sin(INCLINAZIONE), centro.z + this.distanza * Math.cos(INCLINAZIONE));
    this.camera.lookAt(centro);
    this.aggiornaLuce(gioco, centro, t);
    this.onde.offset.set((t * 0.004) % 1, (t * 0.0025) % 1);

    // Anello sotto il bersaglio del tasto azione
    const b = effetti.bersaglio;
    this.bersaglio.visible = !!b && !gioco.piazzamento;
    if (this.bersaglio.visible) {
      const r = (b.ref.raggio || OGGETTI[b.ref.tipo]?.raggio || COSTRUZIONI[b.ref.tipo]?.raggio || 18) + 8;
      this.bersaglio.scale.setScalar(r);
      this.bersaglio.position.set(b.ref.x, this.altezza(gioco.isola, b.ref.x, b.ref.y) + 1, b.ref.y);
      this.bersaglio.material.color.set(b.tipo === 'nemico' ? '#ff5a46' : '#fff4e0');
    }
    // Costruzione da piazzare, in trasparenza
    for (const [tipo, f] of Object.entries(this.fantasmi)) f.visible = tipo === gioco.piazzamento;
    this.piazzaAnello.visible = !!gioco.piazzamento;
    if (gioco.piazzamento) {
      const p = gioco.puntoPiazzamento();
      const ok = gioco.puoPiazzare(p.x, p.y);
      const f = this.fantasma(gioco.piazzamento);
      const y = this.altezza(gioco.isola, p.x, p.y);
      f.position.set(p.x, y, p.y);
      f.traverse((x) => {
        if (x.isMesh) x.material = ok ? this.materiali.fantasmaOk : this.materiali.fantasmaNo;
      });
      this.piazzaAnello.scale.setScalar(COSTRUZIONI[gioco.piazzamento].raggio + 8);
      this.piazzaAnello.position.set(p.x, y + 0.8, p.y);
      this.piazzaAnello.material.color.set(ok ? '#5ac86e' : '#e8503c');
    }

    this.renderer.render(this.scena, this.camera);
    this.disegnaSopra(gioco, t, effetti);
  }

  // Punto del mondo → punto sullo schermo
  schermo(x, h, y) {
    this.v.set(x, h, y).project(this.camera);
    return { x: (this.v.x * 0.5 + 0.5) * this.L, y: (-this.v.y * 0.5 + 0.5) * this.A, dentro: this.v.z < 1 };
  }

  // Sopra il 3D: barre di vita e del fuoco, scritte, particelle, vignettatura
  disegnaSopra(gioco, t, effetti) {
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
    for (const n of gioco.nemici) {
      const max = n.vitaMax || NEMICI[n.tipo].vita;
      if (n.vita < max) barra(n.x, NEMICI[n.tipo].raggio * 2.9 + 8, n.y, NEMICI[n.tipo].raggio * 1.8, n.vita / max, '#d63a2a');
    }
    for (const s of gioco.strutture) {
      if (s.tipo === 'falo') barra(s.x, 62, s.y, 34, s.fuoco / 240, s.fuoco > 20 ? '#e8a020' : '#d63a2a');
      if (s.tipo === 'steccato' && s.vita < 80) barra(s.x, 44, s.y, 30, s.vita / 80, '#7ab055');
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
    const b = gioco.buio();
    if (!this.vignetta) {
      const gr = g.createRadialGradient(this.L / 2, this.A / 2, Math.min(this.L, this.A) * 0.3, this.L / 2, this.A / 2, Math.hypot(this.L, this.A) * 0.6);
      gr.addColorStop(0, 'rgba(0,0,0,0)');
      gr.addColorStop(1, 'rgba(0,0,0,0.5)');
      this.vignetta = gr;
    }
    g.fillStyle = this.vignetta;
    g.fillRect(0, 0, this.L, this.A);
    if (b > 0.02) {
      g.fillStyle = `rgba(4,6,18,${0.32 * b})`;
      g.fillRect(0, 0, this.L, this.A);
    }
    if (gioco.chef.ferito > 0) {
      g.fillStyle = `rgba(150,10,10,${gioco.chef.ferito * 0.5})`;
      g.fillRect(0, 0, this.L, this.A);
    }
  }
}
