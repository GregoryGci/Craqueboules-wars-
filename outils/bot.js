// Bot de progression : joue la campagne dans l'ordre, farme quand il bloque, s'équipe, fait des raids.
const RAR = ['normal','magique','rare','heroique','legendaire'];
function rebuild(){ buildCatalog(JSON.parse(CATJSON)); finalizeStages(); }
function runBot(opts = {}){
  const maxRuns = opts.maxRuns || 2500, raids = opts.raids !== false, log = [];
  save = Eco.newSave();
  const sv = save, camp = STAGES.camp, raid = STAGES.raid;
  const team = () => sv.team.map(u => Eco.monByUid(sv, u));
  const defs = () => team().map(m => Eco.monDef(sv, m));
  let seed = 1;
  const lvl = () => Math.round(team().reduce((t, m) => t + m.level, 0) / 3 * 10) / 10;
  const est = (d, n = 6) => { let w = 0; const T = defs(); for (let i = 0; i < n; i++) if (simulate(d, T, seed++).win) w++; return w / n; };
  const gScore = g => { const st = gearStats(g, lvl()); return (st.hp || 0) / 10 + (st.atk || 0) + (st.spd || 0) * pwrAt(gearLvl(g)) * .6; };
  function gearUp(){
    for (const m of team()) for (const sl of GEAR_SLOTS){
      const src = GEAR_SRC[sl] || sl, cur = m.g && m.g[sl] && Eco.gearById(sv, m.g[sl]);
      const best = (sv.gear || []).filter(g => g.s === src && g.owner == null).sort((a, b) => gScore(b) - gScore(a))[0];
      if (best && (!cur || gScore(best) > gScore(cur))) Eco.equipGear(sv, m, best, sl);
    }
    for (const g of (sv.gear || []).filter(g => g.owner == null)) Eco.sellGear(sv, g);
    const iScore = it => RAR.indexOf(it.rarity) * 6 + it.lvl;
    for (const m of team()) for (let sl = 1; sl <= 6; sl++){
      const cur = m.equip[sl] && Eco.itemById(sv, m.equip[sl]);
      const best = sv.items.filter(i => i.slot === sl && i.owner == null).sort((a, b) => iScore(b) - iScore(a))[0];
      if (best && (!cur || iScore(best) > iScore(cur))) Eco.equip(sv, m, best);
    }
    for (const it of sv.items.filter(i => i.owner == null)) Eco.sell(sv, it);
    // forge : on monte le trophée équipé le moins avancé tant que les kamas suivent
    for (let g = 0; g < 40; g++){
      const eq = sv.items.filter(i => i.owner != null && i.lvl < (opts.upTo || 12)).sort((a, b) => a.lvl - b.lvl)[0];
      if (!eq || sv.kamas < Eco.upCost(eq) + 300) break;
      Eco.upgrade(sv, eq);
    }
  }
  const play = d => { const r = simulate(d, defs(), seed++); if (r.win){ Eco.loot(sv, d); gearUp(); } return r.win; };
  let runs = 0, farm = -1, raidBest = -1, farmN = 0, dojo = -1, nD = 0, nF = 0, nR = 0, stuck = 0; const xp = STAGES.xp;
  for (let i = 0; i < camp.length && runs < maxRuns; i++){
    const d = camp[i]; let r0 = runs, losses = 0;
    for (;;){
      if (runs >= maxRuns) break;
      const p = est(d);
      if (p >= .5){ runs++; if (play(d)) break; losses++; continue; }
      // bloqué : on tourne entre dojo (XP), donjon sûr (équipement) et raid (trophées)
      farmN++; runs++; const tour = farmN % 4;
      if (farmN % 8 === 1){
        farm = -1; for (let j = i - 1; j >= Math.max(0, i - 8); j--) if (est(camp[j], 4) >= .75){ farm = j; break; }
        dojo = -1; for (let j = 0; j < xp.length; j++){ if (xp[j].req && !sv.cleared.includes(xp[j].req)) break; if (est(xp[j], 3) >= .6) dojo = j; else break; }
        raidBest = -1; if (raids) for (let j = 0; j < raid.length; j++){ const R = raid[j]; if (R.req && !sv.cleared.includes(R.req)) continue; if (R.lvl > lvl() + 15) continue; if (est(R, 3) >= .67 && (raidBest < 0 || R.lvl > raid[raidBest].lvl)) raidBest = j; }
      }
      if (tour === 3 && raidBest >= 0){ nR++; play(raid[raidBest]); }
      else if (tour === 2 && farm >= 0){ nF++; play(camp[farm]); }
      else if (dojo >= 0 && opts.dojo !== false){ nD++; play(xp[dojo]); }
      else if (farm >= 0){ nF++; play(camp[farm]); }
      else { stuck++; if (stuck > 30) return log; }
    }
    log.push({ i, name:d.name, L:d.lvl, runs:runs - r0, losses, cum:runs, lvl:lvl(), raid:raidBest >= 0 ? raid[raidBest].lvl : 0, nD, nF, nR, tro:Math.round(sv.items.filter(x => x.owner != null).reduce((t, x) => t + x.lvl, 0) / 18 * 10) / 10 });
  }
  return log;
}
function resume(log){
  const tiers = {};
  for (const e of log){ const t = tiers[e.L] = tiers[e.L] || { n:0, runs:0, lvl:0, cum:0, raid:0, tro:0 }; t.n++; t.runs += e.runs; t.lvl = e.lvl; t.cum = e.cum; t.raid = e.raid; t.tro = e.tro; t.mix = `dojo ${e.nD} · farm ${e.nF} · raid ${e.nR}`; }
  return Object.entries(tiers).map(([L, t]) => `L${L}: ${t.n} dj, ${t.runs} combats (${(t.runs / t.n).toFixed(1)}/dj), équipe niv ${t.lvl}, raid L${t.raid}, trophées +${t.tro}, cumul ${t.cum} (${t.mix})`).join('\n');
}

// Joueur de référence au niveau l : les trois monstres de départ (3 ★), un set d'équipement de son niveau,
// et les trophées qu'on a raisonnablement à ce stade.
const troPlan = l => l < 30 ? ['magique', 2, 3] : l < 60 ? ['magique', 4, 6] : l < 100 ? ['rare', 6, 6] : l < 150 ? ['rare', 9, 6] : ['heroique', 11, 6];
function refTeam(l){
  const sv = Eco.newSave(); sv.gear = []; sv.items = [];
  const [rar, up, n] = troPlan(l);
  return sv.monsters.slice(0, 3).map(m => {
    m.level = l; m.g = {}; m.equip = {};
    for (const sl of GEAR_SLOTS){ const g = Eco.genGear(sv, Math.max(8, l - 3), sl); if (g){ sv.gear.push(g); Eco.equipGear(sv, m, g, sl); } }
    for (let s = 1; s <= n; s++){ const it = Eco.genItem(sv, rar, s, l); it.lvl = up; sv.items.push(it); Eco.equip(sv, m, it); }
    return Eco.monDef(sv, m);
  });
}
function refWin(stages, l, teams = 6, fights = 8){
  let w = 0, n = 0;
  for (let t = 0; t < teams; t++){ const T = refTeam(l); for (const d of stages) for (let f = 0; f < fights; f++){ n++; if (simulate(d, T, 1000 * t + f).win) w++; } }
  return w / n;
}
const tierStages = L => { const a = STAGES.camp.filter(d => d.lvl === L); return a.length <= 3 ? a : [a[0], a[a.length >> 1], a[a.length - 1]]; };
