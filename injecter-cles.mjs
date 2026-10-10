// Injecte les clés du dos en ligne dans index.html au moment de la publication.
// Elles vivent dans les secrets du dépôt, jamais dans le code source.
// Sans secrets renseignés, le fichier sort inchangé et le jeu reste en local.

import { readFile, writeFile } from 'node:fs/promises';

const url = (process.env.SUPABASE_URL || '').trim();
const key = (process.env.SUPABASE_ANON_KEY || '').trim();

if (!url || !key) {
  console.log('Pas de clés fournies : le jeu est publié en mode local.');
  process.exit(0);
}
if (!/^https:\/\/[\w-]+\.supabase\.co\/?$/.test(url)) {
  console.error(`URL Supabase inattendue : ${url}`);
  process.exit(1);
}
// La clé anon est un JWT : trois parties séparées par des points. La clé service_role
// en est un aussi, mais elle ne doit JAMAIS partir dans la page — on refuse de la publier.
if (key.split('.').length !== 3) {
  console.error('La clé ne ressemble pas à une clé Supabase.');
  process.exit(1);
}
try {
  const role = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString()).role;
  if (role && role !== 'anon') {
    console.error(`Refus de publier une clé « ${role} ». Utilise la clé anon public.`);
    process.exit(1);
  }
} catch { /* charge illisible : on laisse passer, la validation de forme a suffi */ }

const esc = s => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
const src = await readFile('index.html', 'utf8');
const out = src.replace(
  /const NET = \{\n(\s*)url: '[^']*',([^\n]*)\n(\s*)key: '[^']*',([^\n]*)\n\};/,
  `const NET = {\n$1url: '${esc(url.replace(/\/$/, ''))}',$2\n$3key: '${esc(key)}',$4\n};`,
);
if (out === src) {
  console.error("Le bloc NET n'a pas été trouvé dans index.html : rien n'a été injecté.");
  process.exit(1);
}
await writeFile('index.html', out);
console.log(`Clés injectées (${url}).`);
