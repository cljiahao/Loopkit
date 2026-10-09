-- Completed-order possession authorizes one stamp, not access to another card.
create function loopkit.qkit_earn_vendor(p_order_id uuid)
returns uuid language sql stable security definer set search_path='' as $$
  select e.vendor_id from merqo.kit_events e
  where e.event_type='order_completed' and e.kit_name='qkit'
    and e.event_data->>'order_id'=p_order_id::text limit 1;
$$;
revoke all on function loopkit.qkit_earn_vendor(uuid) from public,anon,authenticated;
grant execute on function loopkit.qkit_earn_vendor(uuid) to service_role;

create function loopkit.customer_qkit_earn_claim(
  p_order_id uuid,p_phone text,p_name text,p_token text default null
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_vendor uuid;
  v_lookup record;
  v_card loopkit.cards;
  v_new_customer boolean;
  v_inserted_id uuid;
  v_inserted_token text;
begin
  if p_order_id is null or p_phone is null or p_phone !~ '^\+65[3689][0-9]{7}$'
    or length(p_name)>100 then raise exception 'invalid claim'; end if;
  v_vendor:=loopkit.qkit_earn_vendor(p_order_id);
  if v_vendor is null then raise exception 'invalid order'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('customer:'||v_vendor::text||':'||p_phone,0));
  perform 1 from loopkit.programs where vendor_id=v_vendor order by id for share;
  v_new_customer := not exists(select 1 from loopkit.cards c join loopkit.programs p on p.id=c.program_id
    where p.vendor_id=v_vendor and c.phone=p_phone);
  if not v_new_customer then
    perform loopkit._require_customer_capability(v_vendor,p_phone,p_token);
  elsif p_token is not null then
    raise exception 'customer proof required';
  end if;
  select * into v_lookup from loopkit.qkit_earn_lookup(p_order_id,p_phone);
  if not found or v_lookup.program_type <> 'stamp' then raise exception 'not configured'; end if;
  if v_new_customer then
    insert into loopkit.cards(program_id,phone,stamp_count,state,customer_name)
    values(v_lookup.program_id,p_phone,0,'{}'::jsonb,nullif(btrim(p_name),''))
    on conflict(program_id,phone) do nothing
    returning id,card_token into v_inserted_id,v_inserted_token;
    if v_inserted_id is null or exists(select 1 from loopkit.cards c join loopkit.programs p on p.id=c.program_id
      where p.vendor_id=v_vendor and c.phone=p_phone and c.id<>v_inserted_id) then
      raise exception 'customer proof required';
    end if;
  end if;
  select * into v_card from loopkit.qkit_earn_commit(p_order_id,p_phone,p_name,0,'{}'::jsonb);
  if v_new_customer and (v_card.id is distinct from v_inserted_id or v_card.card_token is distinct from v_inserted_token) then
    raise exception 'customer proof required';
  end if;
  return jsonb_build_object('vendor_id',v_vendor,'card_token',v_card.card_token,
    'stamp_count',v_card.stamp_count,'stamps_required',v_lookup.stamps_required,
    'reward_text',v_lookup.reward_text);
end;
$$;
revoke all on function loopkit.customer_qkit_earn_claim(uuid,text,text,text) from public,anon,authenticated;
grant execute on function loopkit.customer_qkit_earn_claim(uuid,text,text,text) to service_role;

-- Only the guarded security-definer wrapper may call these legacy functions.
revoke all on function loopkit.qkit_earn_lookup(uuid,text) from public,anon,authenticated,service_role;
revoke all on function loopkit.qkit_earn_commit(uuid,text,text,int,jsonb) from public,anon,authenticated,service_role;
