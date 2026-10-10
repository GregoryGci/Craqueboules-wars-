// Injecte les clés du dos en ligne dans index.html au moment de la publication.
// Elles vivent dans les secrets du dépôt, jamais dans le code source.
// Sans secrets renseignés, le fichier sort inchangé et le jeu reste en local.

import { readFile, writeFile } from 'node:fs/promises';

// Le secret a pu être créé sous plusieurs noms : on prend le premier qui porte une valeur.
const NOMS_URL = ['SUPABASE_URL', 'SUPA_URL', 'SUPABASE_PROJECT_URL'];
const NOMS_KEY = ['SUPABASE_ANON_KEY', 'SUPA_ANON_KEY', 'SUPABASE_KEY', 'SUPABASE_PUBLISHABLE_KEY'];
const premier = noms => { for (const n of noms){ const v = (process.env[n] || '').trim(); if (v) return [n, v]; } return [null, '']; };
const [nomUrl, url] = premier(NOMS_URL);
const [nomKey, key] = premier(NOMS_KEY);

// Diagnostic : on dit ce qu'on a trouvé, sans jamais afficher les valeurs.
// Il est aussi déposé dans la page, pour être lisible depuis le site publié sans accès aux journaux.
const diag = `url=${nomUrl || 'ABSENT'}(${url.length}) key=${nomKey || 'ABSENT'}(${key.length})`;
console.log('Secrets vus : ' + diag);
console.log('Noms cherchés pour l\'URL : ' + NOMS_URL.join(', '));
console.log('Noms cherchés pour la clé : ' + NOMS_KEY.join(', '));
const marquer = async txt => {
  const h = await readFile('index.html', 'utf8');
  await writeFile('index.html', h.replace('<!doctype html>', `<!doctype html>\n<!-- cles: ${txt} -->`));
};

// Ordre de décision : des clés déjà écrites à la main dans index.html l'emportent toujours — sinon
// le script les écraserait, ou échouerait à retrouver son motif si le bloc a été remis en forme.
const lit = async () => readFile('index.html', 'utf8');
const dejaLa = (await lit()).match(/const NET = \{[^}]*?url:\s*'([^']+)'[^}]*?key:\s*'([^']+)'/s);
if (dejaLa) {
  console.log('Clés déjà écrites dans index.html : rien à injecter.');
  await marquer('en dur');
  process.exit(0);
}
if (!url || !key) {
  console.log('');
  console.log('Le jeu est publié en mode local (sauvegarde dans le navigateur seulement).');
  console.log('Pour activer les comptes, écris les clés dans index.html (const NET)');
  console.log('ou crée les secrets SUPABASE_URL et SUPABASE_ANON_KEY dans');
  console.log('  Settings → Secrets and variables → Actions → onglet « Secrets ».');
  await marquer(diag);
  process.exit(0);
}

const esc = s => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
// Tolérant : on ne remplace que les deux valeurs, sans toucher au reste du bloc ni à ses commentaires.
const src = await readFile('index.html', 'utf8');
const bloc = src.match(/const NET = \{[\s\S]*?\n\};/);
const out = bloc
  ? src.replace(bloc[0], bloc[0]
      .replace(/url:\s*'[^']*'/, `url: '${esc(url.replace(/\/$/, ''))}'`)
      .replace(/key:\s*'[^']*'/, `key: '${esc(key)}'`))
  : src;
if (out === src) {
  console.error("Le bloc NET n'a pas été trouvé dans index.html : rien n'a été injecté.");
  process.exit(1);
}
await writeFile('index.html', out);
await marquer(diag + ' OK');
console.log(`Clés injectées (${url}), depuis ${nomUrl} et ${nomKey}.`);
