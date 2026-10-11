-- Messages privés et annuaire des joueurs. À coller dans Supabase : SQL Editor → New query → Run.
-- Le chat monde (table « chat », voir SERVEUR.md) est déjà en place et garde tout son historique.

-- Annuaire : le pseudo de chaque compte, pour retrouver quelqu'un à qui écrire.
create table public.joueurs (
  user_id uuid primary key references auth.users on delete cascade,
  nom     text        not null check (char_length(nom) between 1 and 40),
  vu_le   timestamptz not null default now()
);
alter table public.joueurs enable row level security;

create policy "les comptes voient l annuaire" on public.joueurs for select to authenticated using (true);
create policy "chacun s y inscrit"            on public.joueurs for insert with check (auth.uid() = user_id);
create policy "chacun tient sa fiche"         on public.joueurs for update using (auth.uid() = user_id);

create index joueurs_nom on public.joueurs (lower(nom));

-- Messages privés : une ligne par message, gardée sans limite de durée.
create table public.mp (
  id      bigserial primary key,
  de      uuid        not null references auth.users on delete cascade,
  de_nom  text        not null,
  a       uuid        not null references auth.users on delete cascade,
  a_nom   text        not null,
  texte   text        not null check (char_length(texte) between 1 and 300),
  lu      boolean     not null default false,
  cree_le timestamptz not null default now(),
  check (de <> a)
);
alter table public.mp enable row level security;

-- Seuls l'expéditeur et le destinataire voient un message ; on n'écrit qu'en son nom.
-- Aucune règle de modification ni de suppression : un message envoyé ne se réécrit pas.
create policy "chacun lit ses messages"  on public.mp for select using (auth.uid() in (de, a));
create policy "chacun écrit en son nom"  on public.mp for insert with check (auth.uid() = de and not lu);

create index mp_fil   on public.mp (least(de, a), greatest(de, a), id desc);
create index mp_recus on public.mp (a, id desc);
create index mp_emis  on public.mp (de, id desc);

-- Marquer une conversation comme lue. Passe par une fonction pour que le destinataire
-- ne puisse toucher qu'à la colonne « lu », et jamais au texte.
create or replace function public.mp_lire(p_de uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.mp set lu = true where a = auth.uid() and de = p_de and not lu;
$$;
revoke all on function public.mp_lire(uuid) from public;
grant execute on function public.mp_lire(uuid) to authenticated;

-- Les messages arrivent en direct. Les règles ci-dessus s'appliquent aussi au direct :
-- chacun ne reçoit que ce qui lui est adressé.
alter publication supabase_realtime add table public.mp;
