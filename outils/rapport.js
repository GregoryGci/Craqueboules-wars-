// Rapport d'équilibrage. Chaque bloc donne un repère à tenir quand on touche aux réglages.
console.log('== 1. Campagne jouée par le bot (3 monstres de départ, équipement et trophées ramassés en route)');
console.log('   Repère : 1 combat par donjon au tout début, 2 à 9 ensuite, mur vers le milieu du palier 200.');
{ const log = runBot({ maxRuns: 900 }); console.log(resume(log)); console.log('donjons passés :', log.length, '/', STAGES.camp.length); }
console.log('\n== 2. Étoiles contre niveaux. Repère : un 3★ niveau 15 ne bat pas un 5★ niveau 1.');
const by = {}; for (const k of ROSTER){ (by[MONSTERS[k].stars] = by[MONSTERS[k].stars] || []).push(k); }
let seed = 7; const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
const pick = (st, lv) => Array.from({ length:3 }, () => ({ key:by[st][Math.floor(rnd() * by[st].length)], level:lv }));
const duel = (a, la, b, lb, N = 500) => { let w = 0; for (let i = 0; i < N; i++){ const A = pick(a, la), B = pick(b, lb); w += (simulate({ waves:[B] }, A, i).win ? .5 : 0) + (simulate({ waves:[A] }, B, i).win ? 0 : .5); } return Math.round(w / N * 100); };
const st = (s, l) => { const ks = by[s]; const a = ks.map(k => computeStats(MONSTERS[k], { key:k, level:l })); const m = f => Math.round(a.reduce((t, x) => t + x[f], 0) / a.length); return `pv ${m('hp')} atk ${m('atk')} def ${m('def')}`; };
console.log('3★ niv 15 :', st(3, 15), '| 5★ niv 1 :', st(5, 1), '| 4★ niv 1 :', st(4, 1));
console.log(`duel 3★ niv 15 contre 5★ niv 1 : les 3★ gagnent ${duel(3, 15, 5, 1)} %`);
console.log(`duel 3★ niv 15 contre 4★ niv 1 : les 3★ gagnent ${duel(3, 15, 4, 1)} %`);
console.log(`duel 3★ niv 30 contre 5★ niv 1 : les 3★ gagnent ${duel(3, 30, 5, 1)} %`);
console.log(`à niveau égal (60) : 4★ contre 3★ ${duel(4, 60, 3, 60)} % · 5★ contre 4★ ${duel(5, 60, 4, 60)} %`);
console.log('\n== 3. Partie neuve. Repère : 100 % au premier donjon.');
let w = 0, N = 0; for (let k = 0; k < 25; k++){ const sv = Eco.newSave(); save = sv; const T = sv.team.map(u => Eco.monDef(sv, Eco.monByUid(sv, u))); for (let s = 0; s < 8; s++){ N++; if (simulate(STAGES.camp[0], T, s).win) w++; } }
console.log(`partie neuve, 1er donjon : ${Math.round(w / N * 100)} % · dojo niveau 10 : ` + (() => { let w = 0, N = 0; for (let k = 0; k < 20; k++){ const sv = Eco.newSave(); const T = sv.team.map(u => Eco.monDef(sv, Eco.monByUid(sv, u))); for (let s = 0; s < 6; s++){ N++; if (simulate(STAGES.xp[0], T, s).win) w++; } } return Math.round(w / N * 100); })() + ' %');
console.log('\n== 4. Boss mondial. Repère : 4 à 5 barres pour un joueur type, 7 pour dix monstres équipés à fond,');
console.log('   et personne ne tombe avant la moitié de l\'assaut.');
function wbSim(T, B, seed){
  const st = Engine.createBattle(T, [B], seed); let firstDeath = 0;
  while (!st.over && st.turn < WB_TURNS){ const a = Engine.advance(st); if (Engine.beginTurn(st, a).skipped) continue; const c = Engine.aiChoose(st, a); Engine.act(st, a, c.skill, c.target); if (!firstDeath && st.A.some(u => !u.alive)) firstDeath = st.turn; }
  return { score:wbScore(st.B[0]), turns:st.turn, alive:st.A.filter(u => u.alive).length, firstDeath };
}
// joueur type : 10 monstres invoqués au hasard, les 3 meilleurs équipés, les autres nus et un peu en retard
function wbTeam(l, full, minStars){
  const sv = Eco.newSave(); sv.stones = 400; sv.gear = []; sv.items = [];
  for (let i = 0; i < 60; i++) Eco.summon(sv);
  save = sv;
  let ms = sv.monsters.slice().sort((a, b) => MONSTERS[b.key].stars - MONSTERS[a.key].stars);
  if (minStars) ms = ms.slice(0, 10); else ms = ms.filter(m => MONSTERS[m.key].stars <= 4).slice(2);
  ms = ms.slice(0, 10);
  const [rar, up, n] = troPlan(l);
  ms.forEach((m, i) => {
    const geared = full || i < 3; m.level = geared ? l : Math.max(1, l - 10); m.g = {}; m.equip = {};
    if (!geared) return;
    for (const sl of GEAR_SLOTS){ const g = Eco.genGear(sv, Math.max(8, l - 3), sl); if (g){ sv.gear.push(g); Eco.equipGear(sv, m, g, sl); } }
    for (let s = 1; s <= n; s++){ const it = Eco.genItem(sv, full ? 'heroique' : rar, s, l); it.lvl = full ? 15 : up; sv.items.push(it); Eco.equip(sv, m, it); }
  });
  sv.monsters = ms;
  return ms.map(m => Eco.monDef(sv, m));
}
for (const l of [10, 40, 100, 200]) for (const [nom, full, st] of [['type', false, 0], ['10 meilleurs +15', true, 5]]){
  const R = []; for (let k = 0; k < 6; k++){ const T = wbTeam(l, full, st); const B = wbBoss().def; for (let s = 0; s < 4; s++) R.push(wbSim(T, B, k * 10 + s)); }
  const m = f => (R.reduce((t, r) => t + f(r), 0) / R.length).toFixed(1);
  console.log(`niv ${l} ${nom.padEnd(15)} : barres ${m(r => r.score)} (min ${Math.min(...R.map(r => r.score)).toFixed(1)}, max ${Math.max(...R.map(r => r.score)).toFixed(1)}) · tours ${m(r => r.turns)} · survivants ${m(r => r.alive)} · 1re mort au tour ${m(r => r.firstDeath)} · rang ${wbTier(+m(r => r.score)).rank}`);
}
