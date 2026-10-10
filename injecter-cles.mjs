// Injecte les clés du dos en ligne dans index.html au moment de la publication.
// Elles vivent dans les secrets du dépôt, jamais dans le code source.
// Sans secrets renseignés, le fichier sort inchangé et le jeu reste en local.

import { readFile, writeFile } from 'node:fs/promises';

const url = (process.env.SUPABASE_URL || '').trim();
const key = (process.env.SUPABASE_ANON_KEY || '').trim();

// Diagnostic : on dit ce qu'on a reçu, sans jamais afficher les valeurs.
const vu = (n, v) => `${n} : ${v ? `présent (${v.length} caractères)` : 'ABSENT'}`;
console.log(vu('SUPABASE_URL', url));
console.log(vu('SUPABASE_ANON_KEY', key));

if (!url || !key) {
  console.log('');
  console.log('Le jeu est publié en mode local (sauvegarde dans le navigateur seulement).');
  console.log('Pour activer les comptes, crée les deux secrets dans :');
  console.log('  Settings → Secrets and variables → Actions → onglet « Secrets »');
  console.log('en les nommant exactement SUPABASE_URL et SUPABASE_ANON_KEY.');
  console.log("Attention : l'onglet « Variables » juste à côté ne convient pas,");
  console.log('et un secret créé pour un « Environment » autre que github-pages non plus.');
  process.exit(0);
}
if (!/^https:\/\/[\w-]+\.supabase\.co\/?$/.test(url)) {
  console.error(`URL Supabase inattendue : ${url}`);
  process.exit(1);
}
// Deux formats cohabitent chez Supabase :
//   · les nouvelles clés   sb_publishable_… (publique)  et  sb_secret_… (privée)
//   · les anciennes, des JWT, dont la charge porte role: anon ou role: service_role
// Dans les deux cas, seule la clé publique a le droit de partir dans la page.
if (key.startsWith('sb_secret_')) {
  console.error('Refus de publier une clé « sb_secret_ ». Utilise la clé sb_publishable_.');
  process.exit(1);
}
if (!key.startsWith('sb_publishable_')) {
  if (key.split('.').length !== 3) {
    console.error('La clé ne ressemble ni à sb_publishable_…, ni à une ancienne clé anon.');
    process.exit(1);
  }
  try {
    const role = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString()).role;
    if (role && role !== 'anon') {
      console.error(`Refus de publier une clé « ${role} ». Utilise la clé anon public.`);
      process.exit(1);
    }
  } catch { /* charge illisible : la validation de forme a suffi */ }
}

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
