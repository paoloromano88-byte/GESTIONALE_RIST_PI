// Modelli 3D veri (file .glb in public/modelli/). Se ci sono, prendono il posto dei modelli generati dal codice.
// public/modelli/indice.json dice quali file usare, per esempio:
// {
//   "sopravvissuto": { "file": "sopravvissuto.glb", "scala": 30, "animazioni": { "fermo": "Idle", "cammina": "Walk", "attacca": "Punch" } },
//   "camminatore": { "file": "zombie.glb", "scala": 30, "animazioni": { "fermo": "Idle", "cammina": "Walk", "attacca": "Attack", "muore": "Death" } },
//   "albero": { "file": "albero.glb", "scala": 40 },
//   "auto": { "file": "auto.glb", "scala": 22, "rotazione": 0 }
// }
// Nomi riconosciuti: sopravvissuto, camminatore, corridore, corazzato, albero, auto, polizia.

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as clonaConScheletro } from 'three/addons/utils/SkeletonUtils.js';

export async function caricaModelli(base = 'modelli/') {
  let indice;
  try {
    const r = await fetch(`${base}indice.json`);
    if (!r.ok) return {};
    indice = await r.json();
  } catch {
    return {};
  }
  const loader = new GLTFLoader();
  const out = {};
  await Promise.all(
    Object.entries(indice).map(async ([nome, def]) => {
      try {
        const gltf = await loader.loadAsync(base + def.file);
        out[nome] = { scena: gltf.scene, animazioni: gltf.animations, def };
      } catch (e) {
        console.warn(`Modello «${nome}» non caricato:`, e?.message || e);
      }
    }),
  );
  return out;
}

// Una copia del modello pronta da mettere in scena, con le sue animazioni
export function copia(m) {
  const o = clonaConScheletro(m.scena);
  const d = m.def;
  o.scale.setScalar(d.scala ?? 1);
  o.rotation.y = d.rotazione ?? 0;
  o.position.y = d.y ?? 0;
  o.traverse((x) => {
    if (x.isMesh) x.castShadow = x.receiveShadow = true;
  });
  const g = new THREE.Group();
  g.add(o);
  const azioni = {};
  let mixer = null;
  if (m.animazioni.length) {
    mixer = new THREE.AnimationMixer(o);
    for (const [k, clip] of Object.entries(d.animazioni || {})) {
      const c = THREE.AnimationClip.findByName(m.animazioni, clip);
      if (c) azioni[k] = mixer.clipAction(c);
    }
    if (azioni.muore) {
      azioni.muore.setLoop(THREE.LoopOnce);
      azioni.muore.clampWhenFinished = true;
    }
  }
  g.userData.modello = { mixer, azioni, corrente: null };
  return g;
}

// Passa all'animazione richiesta con una breve dissolvenza
export function anima(g, nome, dt, velocita = 1) {
  const m = g.userData.modello;
  if (!m?.mixer) return;
  const a = m.azioni[nome] || m.azioni.fermo;
  if (a && m.corrente !== a) {
    a.reset().fadeIn(0.2).play();
    m.corrente?.fadeOut(0.2);
    m.corrente = a;
  }
  if (a) a.timeScale = velocita;
  m.mixer.update(dt);
}

// Modello fermo ripetuto molte volte (alberi): una InstancedMesh per ogni pezzo del file
export function pezziPerIstanze(m) {
  const pezzi = [];
  const radice = m.scena.clone();
  radice.scale.setScalar(m.def.scala ?? 1);
  radice.rotation.y = m.def.rotazione ?? 0;
  radice.position.y = m.def.y ?? 0;
  radice.updateMatrixWorld(true);
  radice.traverse((x) => {
    if (x.isMesh) pezzi.push({ geometria: x.geometry, materiale: x.material, locale: x.matrixWorld.clone() });
  });
  return pezzi;
}
