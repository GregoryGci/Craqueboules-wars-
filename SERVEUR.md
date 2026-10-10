# Brancher le dos en ligne (Supabase)

Le jeu fonctionne entièrement en local tant que les clés ne sont pas renseignées.
Une fois ces trois étapes faites, les comptes et la sauvegarde en ligne s'activent.

## 1. Créer le projet

1. Va sur <https://supabase.com>, crée un compte, puis **New project**.
2. Choisis une région proche (Paris ou Francfort), note le mot de passe de la base.
3. Une fois le projet prêt : **Project Settings → API**. Tu y trouves
   l'**URL du projet** et la clé **`anon` `public`**.

La clé `anon` est faite pour être publique : elle part dans la page, et c'est la
base de données qui décide ce que chacun a le droit de lire ou d'écrire (étape 2).
**Ne mets jamais la clé `service_role` dans le jeu** — celle-là contourne toutes
les règles.

## 2. Créer les tables

**SQL Editor → New query**, colle ceci, puis **Run** :

```sql
-- Sauvegardes : une ligne par joueur, que lui seul peut lire et écrire.
create table public.saves (
  user_id    uuid primary key references auth.users on delete cascade,
  data       jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.saves enable row level security;

create policy "chacun lit sa sauvegarde"   on public.saves for select using  (auth.uid() = user_id);
create policy "chacun écrit sa sauvegarde" on public.saves for insert with check (auth.uid() = user_id);
create policy "chacun met à jour la sienne" on public.saves for update using  (auth.uid() = user_id);

-- Chat public : tout le monde lit, chacun n'écrit qu'en son nom.
create table public.chat (
  id      bigserial primary key,
  user_id uuid not null references auth.users on delete cascade,
  nom     text not null,
  texte   text not null check (char_length(texte) between 1 and 300),
  cree_le timestamptz not null default now()
);
alter table public.chat enable row level security;

create policy "le chat est public"       on public.chat for select using (true);
create policy "chacun écrit en son nom"  on public.chat for insert with check (auth.uid() = user_id);

-- Le chat se met à jour en direct chez tout le monde.
alter publication supabase_realtime add table public.chat;

create index chat_recent on public.chat (cree_le desc);
```

## 3. Coller les clés dans le jeu

Dans `index.html`, cherche `const NET = {` (vers le début du script) et remplis :

```js
const NET = {
  url: 'https://xxxxxxxxxxxx.supabase.co',
  key: 'eyJhbGciOi…',   // la clé anon public
};
```

Commite, pousse : le launcher proposera alors un écran de compte avant la
création du personnage.

## Bon à savoir

- **Confirmation par courriel** : par défaut Supabase envoie un courriel de
  confirmation. Pour tester plus vite, désactive-la dans
  **Authentication → Providers → Email → Confirm email**.
- **Partie existante** : au premier démarrage avec un compte, la partie locale
  est envoyée en ligne. Ensuite, c'est la plus récente des deux qui gagne —
  l'horodatage est dans `save.at`.
- **Jouer sans compte** reste possible : le bouton est sur l'écran de compte, et
  la partie reste alors dans le navigateur, comme avant.

## Reste à faire

- Le **chat** : les tables sont prêtes, l'interface n'est pas encore branchée.
- Le **RTA** (1 contre 1, équipes de 3, pick et ban) : c'est le plus gros
  morceau, il demande un salon temps réel par match et un protocole d'échange
  des actions. À faire une fois les comptes en service.
