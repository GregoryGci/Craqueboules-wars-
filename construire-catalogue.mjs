// Construit catalogue.json pour « Invocateurs des Douze » à partir de l'API publique DofusDB.
// Contenu : tous les monstres jouables, tous les Dofus / Trophées / Prysmaradites, tous les donjons.
// Les images ne sont pas téléchargées : le jeu les affiche directement depuis DofusDB.
//
// Utilisation (Node 18 ou plus), dans ce dossier :
//   node construire-catalogue.mjs
// Durée : quelques minutes (quelques centaines de requêtes, avec une petite pause entre chacune).
// Usage privé et non commercial : données et images © Ankama.

import { writeFile } from 'node:fs/promises';

const API = process.env.DOFUSDB_API || 'https://api.dofusdb.fr';
const PAUSE_MS = Number(process.env.PAUSE_MS ?? 120);
const ITEM_TYPES = { 23: 'Dofus', 151: 'Trophées', 217: 'Prysmaradites' };

// ---- Équipement : les types DofusDB rangés par emplacement du jeu.
// Chaque arme du vrai jeu occupe le même emplacement « arme » chez nous.
const GEAR_TYPES = {
  coiffe:   [16],
  cape:     [17],
  amulette: [1],
  anneau:   [9],
  ceinture: [10],
  bottes:   [11],
  arme:     [2, 3, 4, 5, 6, 7, 8, 19, 21, 22],
};
// Caractéristiques retenues : celles qui ont un sens dans notre moteur. Le reste (pods, portée, prospection…) est ignoré.
const KEEP_CHARS = new Set([1, 10, 11, 12, 13, 14, 15, 16, 18, 23, 25, 44]);

const sleep = ms => new Promise(r => setTimeout(r, ms));
let requests = 0;

async function get(url, tries = 4) {
  for (let t = 1; ; t++) {
    try {
      const r = await fetch(url, { headers: { accept: 'application/json' } });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      requests++;
      await sleep(PAUSE_MS);
      return await r.json();
    } catch (e) {
      if (t >= tries) throw new Error(`${e.message} sur ${url}`);
      await sleep(800 * t);
    }
  }
}

// Parcourt toutes les pages d'un endpoint Feathers (?$limit / $skip)
async function all(path, params, pick, label) {
  const out = [];
  let skip = 0, total = Infinity;
  while (skip < total) {
    const q = new URLSearchParams(params);
    q.set('$limit', '50'); q.set('$skip', String(skip));
    const res = await get(`${API}/${path}?${q}`);
    const data = Array.isArray(res) ? res : (res.data || []);
    total = Array.isArray(res) ? data.length : (res.total ?? data.length);
    for (const x of data) { const v = pick(x); if (v) out.push(v); }
    if (!data.length) break;
    skip += data.length;
    process.stdout.write(`\r${label} : ${Math.min(skip, total)} / ${total}   `);
  }
  process.stdout.write('\n');
  return out;
}

const fr = o => (o && (o.fr || o.en)) || '';

// ---------- Monstres
const monsters = await all('monsters', {}, m => {
  if (!m || m.isQuestMonster || m.hideInBestiary || !m.gfxId || !Array.isArray(m.grades) || !m.grades.length) return null;
  const name = fr(m.name).trim();
  if (!name || name.startsWith('[') || /^(?:invocation|test)\b/i.test(name)) return null;
  const g = m.grades[m.grades.length - 1] || {};
  if (!g.lifePoints) return null;
  return {
    id: m.id, n: name, g: m.gfxId,
    b: m.isBoss ? 1 : 0, mb: m.isMiniBoss ? 1 : 0, r: m.race ?? 0,
    l: g.level ?? 1, hp: g.lifePoints ?? 0, pa: g.actionPoints ?? 0,
    c: [g.strength ?? 0, g.intelligence ?? 0, g.chance ?? 0, g.agility ?? 0],
    sp: (m.spells || []).slice(0, 3),
  };
}, 'Monstres');

// ---------- Noms des sorts (facultatif : le jeu met des noms génériques sinon)
const spellIds = [...new Set(monsters.flatMap(m => m.sp))];
const spells = {}, spellIcons = {};
try {
  for (let i = 0; i < spellIds.length; i += 40) {
    const q = new URLSearchParams();
    for (const id of spellIds.slice(i, i + 40)) q.append('id[$in][]', String(id));
    q.set('$limit', '50');
    const res = await get(`${API}/spells?${q}`);
    for (const s of res.data || []) { const n = fr(s.name).trim(); if (n) spells[s.id] = n; if (s.iconId) spellIcons[s.id] = s.iconId; }
    process.stdout.write(`\rSorts : ${Math.min(i + 40, spellIds.length)} / ${spellIds.length}   `);
  }
  process.stdout.write('\n');
} catch (e) { console.log(`\nNoms de sorts ignorés (${e.message}). Le jeu utilisera des noms génériques.`); }

// ---------- Objets : Dofus, Trophées, Prysmaradites
const items = [];
for (const [typeId, label] of Object.entries(ITEM_TYPES)) {
  items.push(...await all('items', { typeId }, it => {
    const name = fr(it.name).trim();
    if (!name || !it.iconId) return null;
    return { id: it.id, n: name, t: Number(typeId), l: it.level ?? 1, i: it.iconId };
  }, label));
}

// ---------- Équipement : les vrais objets avec leurs fourchettes de jet (from / to par caractéristique)
const gear = [];
for (const [slot, types] of Object.entries(GEAR_TYPES)) {
  for (const typeId of types) {
    gear.push(...await all('items', { typeId }, it => {
      const name = fr(it.name).trim();
      if (!name || !it.iconId || name.startsWith('[')) return null;
      const eff = [];
      for (const e of it.effects || []) {
        const c = e.characteristic;
        if (!KEEP_CHARS.has(c)) continue;
        const a = e.from ?? 0, b = e.to ?? a;
        if (!a && !b) continue;           // effet purement descriptif
        eff.push([c, a, b || a]);
      }
      if (!eff.length) return null;       // sans effet chiffré, l'objet n'a rien à apporter
      return { id: it.id, n: name, s: slot, l: it.level ?? 1, i: it.iconId, e: eff };
    }, `Équipement ${slot} (type ${typeId})`));
  }
}

// ---------- Donjons
const known = new Set(monsters.map(m => m.id));
const dungeons = await all('dungeons', {}, d => {
  const name = fr(d.name).trim();
  const m = (d.monsters || []).filter(id => known.has(id));
  if (!name || !m.length) return null;
  const maps = d.mapIds || [];   // mps : les salles du donjon dans l'ordre (une par vague en campagne) ; mp : la dernière, celle du boss
  return { id: d.id, n: name, l: d.optimalPlayerLevel ?? d.minLevel ?? 1, m, b: (d.bosses || []).filter(id => known.has(id)), mp: maps[maps.length - 1] || 0, mps: maps };
}, 'Donjons');

const cat = { v: 2, source: 'api.dofusdb.fr', date: new Date().toISOString().slice(0, 10), monsters, spells, spellIcons, items, gear, dungeons };
await writeFile('catalogue.json', JSON.stringify(cat));
console.log(`\ncatalogue.json écrit : ${monsters.length} monstres, ${items.length} objets, ${gear.length} équipements, ${dungeons.length} donjons, ${Object.keys(spells).length} noms de sorts (${requests} requêtes).`);
