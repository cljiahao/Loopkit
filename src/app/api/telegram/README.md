# telegram

## Purpose

Telegram-facing route handlers — currently just the bot's webhook callback.

## Contents

- `webhook/` — `POST` endpoint Telegram calls on every bot update; verifies
  the request, resolves account-linking deep-links, and is the entry point
  for a vendor's Telegram account getting linked to their `vendor_id`.

## Parent

[api](../README.md)
