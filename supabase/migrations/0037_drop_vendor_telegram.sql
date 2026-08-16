-- 0037 — Vendor Telegram Connect (Phase A2): retires loopkit's own Telegram
-- bot in favor of merqo's shared one. Drops the two tables 0036 created —
-- no data carries over; a vendor who'd linked loopkit's own bot must
-- reconnect once via merqo's profile page. See docs/superpowers/specs/
-- 2026-08-16-vendor-telegram-connect-design.md.

drop table loopkit.telegram_link_tokens;
drop table loopkit.vendor_telegram;
