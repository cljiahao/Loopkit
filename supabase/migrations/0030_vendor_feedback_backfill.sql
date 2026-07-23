-- One-time copy of existing local feedback rows into the shared
-- merqo.vendor_feedback table (merqo migration 0011). See
-- merqo/docs/superpowers/specs/2026-07-23-cross-kit-vendor-feedback-design.md
insert into merqo.vendor_feedback (kit_slug, vendor_id, nps, message, created_at)
select 'loopkit', vendor_id, nps, message, created_at
from loopkit.feedback f
where not exists (
  select 1 from merqo.vendor_feedback vf
  where vf.kit_slug = 'loopkit'
    and vf.vendor_id = f.vendor_id
    and vf.created_at = f.created_at
);
