-- Installe d'un coup les messages privés, l'annuaire et l'hôtel de vente.
-- À coller dans Supabase : SQL Editor → New query → Run. Peut être relancé sans risque :
-- ce qui existe déjà est laissé en place, les règles et fonctions sont simplement reposées.

-- ===================== CHAT.sql =====================

-- Annuaire : le pseudo de chaque compte, pour retrouver quelqu'un à qui écrire.
create table if not exists public.joueurs (
  user_id uuid primary key references auth.users on delete cascade,
  nom     text        not null check (char_length(nom) between 1 and 40),
  vu_le   timestamptz not null default now()
);
alter table public.joueurs enable row level security;

drop policy if exists "les comptes voient l annuaire" on public.joueurs;
create policy "les comptes voient l annuaire" on public.joueurs for select to authenticated using (true);
drop policy if exists "chacun s y inscrit" on public.joueurs;
create policy "chacun s y inscrit" on public.joueurs for insert with check (auth.uid() = user_id);
drop policy if exists "chacun tient sa fiche" on public.joueurs;
create policy "chacun tient sa fiche" on public.joueurs for update using (auth.uid() = user_id);

create index if not exists joueurs_nom on public.joueurs (lower(nom));

-- Messages privés : une ligne par message, gardée sans limite de durée.
create table if not exists public.mp (
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
drop policy if exists "chacun lit ses messages" on public.mp;
create policy "chacun lit ses messages" on public.mp for select using (auth.uid() in (de, a));
drop policy if exists "chacun écrit en son nom" on public.mp;
create policy "chacun écrit en son nom" on public.mp for insert with check (auth.uid() = de and not lu);

create index if not exists mp_fil   on public.mp (least(de, a), greatest(de, a), id desc);
create index if not exists mp_recus on public.mp (a, id desc);
create index if not exists mp_emis  on public.mp (de, id desc);

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
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'mp') then
    alter publication supabase_realtime add table public.mp;
  end if;
end $$;

-- ===================== HDV.sql =====================

create table if not exists public.hdv (
  id          bigserial primary key,
  vendeur     uuid        not null references auth.users on delete cascade,
  vendeur_nom text        not null,
  genre       text        not null check (genre in ('g','i')),   -- équipement ou trophée/Dofus
  objet       jsonb       not null,                              -- l'objet entier, jets compris
  nom         text        not null,                              -- pour la recherche
  niveau      int         not null default 1,
  qualite     int         not null default 0,                    -- jet en %, ou rang de rareté
  emplacement text,                                              -- coiffe, anneau… pour filtrer
  prix        bigint      not null check (prix > 0 and prix <= 1000000000),
  acheteur    uuid        references auth.users on delete set null,
  vendu_le    timestamptz,
  encaisse    boolean     not null default false,                -- le vendeur a récupéré ses kamas
  retire      boolean     not null default false,                -- repris avant la vente
  mis_le      timestamptz not null default now(),
  expire_le   timestamptz not null default (now() + interval '14 days')
);

alter table public.hdv enable row level security;

-- Tout le monde voit l'étal ; chacun ne met en vente qu'en son nom.
drop policy if exists "l etal est public" on public.hdv;
create policy "l etal est public" on public.hdv for select using (true);
drop policy if exists "chacun vend en son nom" on public.hdv;
create policy "chacun vend en son nom" on public.hdv for insert with check (auth.uid() = vendeur);
-- Le vendeur peut retirer son objet ou marquer ses kamas encaissés. L'achat passe par la fonction ci-dessous.
drop policy if exists "le vendeur gere son lot" on public.hdv;
create policy "le vendeur gere son lot" on public.hdv for update using (auth.uid() = vendeur);

create index if not exists hdv_en_vente on public.hdv (nom, prix) where acheteur is null and not retire;
create index if not exists hdv_mes_lots on public.hdv (vendeur, mis_le desc);

-- Achat atomique : une seule personne peut emporter un lot, même si deux cliquent en même temps.
-- La condition « acheteur is null » dans le UPDATE fait l'arbitrage, la base garantit le reste.
create or replace function public.hdv_acheter(p_id bigint)
returns public.hdv
language plpgsql
security definer
set search_path = public
as $$
declare lot public.hdv;
begin
  update public.hdv
     set acheteur = auth.uid(), vendu_le = now()
   where id = p_id
     and acheteur is null
     and not retire
     and expire_le > now()
     and vendeur <> auth.uid()          -- on n'achète pas son propre lot
  returning * into lot;

  if lot.id is null then
    raise exception 'Ce lot n''est plus disponible.' using errcode = 'P0002';
  end if;
  return lot;
end $$;

revoke all on function public.hdv_acheter(bigint) from public;
grant execute on function public.hdv_acheter(bigint) to authenticated;

-- Combien de lots ce compte a-t-il en vente ? Sert à faire respecter la limite de vingt.
create or replace function public.hdv_mes_lots()
returns int
language sql
security definer
set search_path = public
as $$
  select count(*)::int from public.hdv
   where vendeur = auth.uid() and acheteur is null and not retire and expire_le > now();
$$;
grant execute on function public.hdv_mes_lots() to authenticated;
