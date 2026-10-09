-- Local feedback is retained only as historical backfill input. New feedback uses
-- merqo.submit_vendor_feedback, which enforces the current submission contract.
revoke insert on loopkit.feedback from authenticated;
