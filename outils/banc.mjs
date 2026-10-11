// Banc d'essai de l'équilibrage : charge les données, le moteur de combat et l'économie d'index.html hors
// navigateur, puis exécute les scripts donnés. Rien ici n'est publié avec le jeu.
//
//   node construire-catalogue.mjs                          (une fois : il faut catalogue.json)
//   node outils/banc.mjs outils/bot.js outils/rapport.js   (depuis la racine du dépôt)
//
// Le rapport rejoue toute la campagne avec un bot et vérifie les repères de l'équilibrage. Les réglages
// eux-mêmes sont dans index.html : BAL (difficulté par niveau, XP), POW_STEP, NAT_K, GEAR_K, WB.
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const [html, catPath, ...tests] = ['index.html', 'catalogue.json', ...process.argv.slice(2)];
const src = readFileSync(html, 'utf8');
const a = src.indexOf('<script>\n', src.indexOf('supabase.min.js')) + 9;
const b = src.indexOf('   7. INTERFACE'); const cut = src.lastIndexOf('/* ====', b);
const sim = src.slice(src.indexOf('function simulate(dg, team, seed){'), src.indexOf('function autoStart('));
const stub = new Proxy(function(){}, { get:(t,k) => k === Symbol.toPrimitive ? () => '' : stub, apply:() => stub, construct:() => stub });
const ctx = { console, Math, JSON, setTimeout, clearTimeout, document:stub, window:stub, localStorage:stub, navigator:stub, Image:stub, location:{ search:'', hash:'' }, performance };
ctx.globalThis = ctx;
const code = src.slice(a, cut) + '\nlet save = null; const clsFx = () => ({}); const SAVE_V = 3; const STAT_LONG = new Proxy({}, { get:() => "" });\n' + sim +
  '\nbuildCatalog(JSON.parse(CATJSON)); finalizeStages();\n' + tests.map(t => readFileSync(t, 'utf8')).join('\n') + '\n})();';
ctx.CATJSON = readFileSync(catPath, 'utf8');
vm.runInNewContext(code, ctx, { filename:'jeu.js' });
