# customers

## Purpose

Vendor-facing customer list at `/dashboard/customers` — a searchable directory of everyone with a card at the shop, either merged across all programs or scoped to one via `?p=`.

## Contents

- `customer-controls.tsx` — `CustomerControls`, a `"use client"` sort `<Select>` (Last visit / Longest away / Closest to reward) for the vendor-wide list; on change it `router.push`es `?sort=` while keeping the current `q` and `seg` params. The segment chips beside it are plain server-rendered `<Link>`s, so only this onChange navigation needs a client.
- `customer-controls.dom.test.tsx` — jsdom test: renders the three options and pushes `sort=progress` (or `away`) with the preserved `q`/`seg` kept and empty params dropped.
- `customers-page.dom.test.tsx` — jsdom tests for `VendorCustomerList` (name, phone, badges, totals; phone-only fallback; empty state; a Serve link to the row's recent program at the counter) and the vendor-wide `CustomersPage` (segment chips render with per-segment counts and a `?seg=ready` link; `?seg=lapsed` filters to lapsed rows only; `?sort=away` orders oldest-last-seen first; every row has a Serve link; the one-program redirect still carries `q`; the `?p=` branch still renders its card list).
- `loading.tsx` — `CustomersLoading`, a static skeleton (animated-pulse blocks, root `<div className="space-y-8">`) shown while the customers page streams in.
- `page.tsx` — exports `VendorCustomerList` (props-only merged-customer list component) and default `CustomersPage` server component; requires a vendor, redirects to the single program when there's exactly one, and renders `ProgramSwitcher` beside the phone search form below the page header. The vendor-wide branch (no `?p=`) then reads `?seg=` / `?sort=` (validated by `parseSegment` / `parseSort`), renders the four segment chips (all / reward ready / new this week / not seen 30d+) as `<Link>`s with counts from `segmentCounts` plus `CustomerControls`, and passes the `filterBySegment` + `sortCustomers` result to `VendorCustomerList`. Each row shows an avatar, a mini progress hint (a Ready badge when `rewardReady`, else "n to go" from `bestGap`), and a Serve `<Link>` to `/dashboard/counter?p=<recentProgramId>&phone=<phone>`. The program-scoped `?p=` branch is unchanged: a per-program card list (`listCards`). Both branches' root element is a plain `<div className="space-y-8">`; the enclosing `../layout.tsx` `<main>` owns the shared `max-w-7xl` width and padding. Every customer name/phone in both branches links to `[phone]/page.tsx`.
- `[phone]/` — one customer's detail view: every card they hold across the vendor's own programs, a per-program manual stamp-adjustment tool, and their full activity history. See its own README.

## Parent

[dashboard](../README.md)
