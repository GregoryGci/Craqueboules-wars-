-- Hôtel de vente. À coller dans Supabase : SQL Editor → New query → Run.
-- Reprend les règles du vrai jeu : vingt emplacements par compte, taxe prélevée à la mise
-- en vente et non remboursée, deux semaines de durée, retour au vendeur si invendu.

create table public.hdv (
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
create policy "l etal est public"        on public.hdv for select using (true);
create policy "chacun vend en son nom"   on public.hdv for insert with check (auth.uid() = vendeur);
-- Le vendeur peut retirer son objet ou marquer ses kamas encaissés. L'achat passe par la fonction ci-dessous.
create policy "le vendeur gere son lot"  on public.hdv for update using (auth.uid() = vendeur);

create index hdv_en_vente on public.hdv (nom, prix) where acheteur is null and not retire;
create index hdv_mes_lots on public.hdv (vendeur, mis_le desc);

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
