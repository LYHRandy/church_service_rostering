# Product Requirements Document
## Church Duty Management System (with Telegram Integration)

**Version:** 1.1
**Status:** Finalized for implementation
**Last Updated:** 12 July 2026

---

## 1. Overview

### 1.1 Purpose
A web-based duty management system for the church that organizes serving rosters across multiple ministries, with Telegram as the primary member-facing channel. The system supports regular recurring duties, special one-off events, role-based administration, and automatic conflict detection across all assignments.

### 1.2 Problem Statement
Duty rostering is currently manual (spreadsheets, group chats), leading to:
- Double-booking of members serving in multiple ministries
- No single source of truth across ministries
- Missed duties due to lack of reminders
- Swap requests handled ad-hoc with no visibility or approval trail
- Special events (Christmas, baptisms, conferences) requiring separate, duplicated coordination

### 1.3 Goals
- One platform for all ministries' rosters, viewable at appropriate permission levels
- Members interact entirely through Telegram — no app install, no login friction
- Zero accidental double-bookings via automatic cross-ministry conflict detection
- Special events with one-off roles managed in the same system and same flows
- Scalable from one ministry to many without structural changes

### 1.4 Non-Goals (v1)
- Attendance tracking / check-in on the day
- Payroll, finance, or donations
- Sermon/service planning content (song lists, cue sheets)
- Native mobile app (Telegram + responsive web covers this)

---

## 2. Users & Roles

| Role | Scope | Key Permissions |
|---|---|---|
| **Pastor (Overall Head / Admin)** | Global | Full access: manage all ministries, create special events, appoint heads, view all rosters, override anything |
| **Full-Time Staff** | Global (operational) | Update special event rosters on the web dashboard, upload service orders, assist with roster administration |
| **Service Director** | Rostered (via Service Direction ministry) | When rostered to direct a service: runs that service, manages its service order, grants service-order access to additional members |
| **Ministry Head** | Own ministry | Manage members, create duty slots, assign/approve within their ministry; always has access to special-event roster editing; may be appointed **Event Head** for a specific event |
| **IC (In-Charge)** | Own team within ministry | Assign members to slots, approve swap requests within their team |
| **Member** | Self | View own duties, confirm assignments, request swaps, set unavailability — all via Telegram |

Notes:
- Roles are **per-ministry**: one person may be Head of Media and a Member of Ushering.
- Pastor/Admin and Full-Time Staff are global roles, not tied to a ministry.
- **Service Direction is a ministry in its own right** — no special flags or titles. It has its own Ministry Head (who is himself a Service Director), and its members serve in two positions: **Service Director** and **Service Coordinator**. The Head manages the dedicated SD/SC roster exactly like any other ministry roster. Service-order permissions activate only for the service a person is rostered to direct.
- A user can belong to multiple ministries.

---

## 3. Core Features

### 3.1 Ministry & Member Management
- Create/archive ministries (Pastor)
- Add members to a ministry with a role (Head or Pastor)
- Member onboarding via Telegram deep link: admin generates invite → member taps `/start <token>` → Telegram ID linked to their profile
- Member profiles: name, phone (optional), ministries, roles, positions they can serve (e.g., "vocals", "sound", "usher")

### 3.2 Regular Duty Rostering
- **Duty slots**: defined per service (date, time, ministry, position, headcount needed)
- Recurring slot templates (e.g., "Sunday 9am — Sound Crew ×2, weekly")
- Assignment methods:
  - Manual: Head/IC picks members per slot
  - Assisted: system suggests members based on rotation fairness (least recently served) and availability
- Roster publishing: draft → published; publishing triggers Telegram notifications
- **Service Direction roster**: the Service Direction ministry rosters one **Service Director** and **Service Coordinator(s)** per service, managed by its own Ministry Head (himself a Service Director) — same tooling, flows, and conflict detection as every other ministry
- Roster views: by ministry, by service date, by member

### 3.3 Special Events (One-Off)
- Created only by **Pastors/Admins**
- Event fields: name, description, date, start/end time, venue (optional)
- **Event roles**: ad-hoc positions not tied to any ministry (e.g., "Car Park IC", "Photographer", "Welcome Team ×6")
- **Event roster editing is web-only**: Pastors, Full-Time Staff, and **all Ministry Heads** can update special event rosters on the web dashboard (no roster editing via Telegram)
- A Ministry Head may additionally be appointed **Event Head** for a specific event — the named coordinator for that event, receiving swap requests and notifications for its roles
- Event assignments use the same confirm/swap/reminder flows as regular duties
- Events appear on all relevant calendars and are included in conflict detection

### 3.4 Conflict Detection (Cross-System)
**Rule:** No member may be assigned to two overlapping duties/event roles unless explicitly overridden.

- Every duty slot and event role carries a start and end time (default buffer applied if end not set, configurable, e.g. 2h)
- On any assignment attempt (dashboard or bot), the system checks the member's existing assignments — across **all ministries and all events** — for time overlap on that date
- Checks also include the member's declared **unavailability** dates
- On conflict:
  1. Assignment is blocked by default; the conflicting duty is displayed
  2. Assigner may proceed with an explicit **"Allow conflict"** override
  3. Overridden assignments are stored with `conflict_acknowledged = true` and flagged ⚠️ on all roster views
- Conflict logic implemented once (database function) and shared by web dashboard and Telegram bot

### 3.5 Telegram Bot (Notification & Reminder Channel)
**Telegram's primary role is sending reminders and notifications.** All roster *editing* happens on the web dashboard; Telegram provides lightweight member interactions on top.

| Interaction | Behavior |
|---|---|
| Reminders (primary) | Automatic ping day before duty (time configurable), second ping morning-of (optional) |
| New assignment / roster published | Push notification with ✅ Confirm / 🔄 Request Swap inline buttons |
| Swap request | Can be initiated here (or on web); routed to IC/Head, who may approve via bot buttons or dashboard |
| Service order available | Notification with link when a service order is uploaded for a duty the member ICs/heads that week |
| `/start <token>` | Link Telegram account to member profile |
| `/duties` | List upcoming assigned duties & event roles |
| `/roster` | View published roster for member's ministries (read-only) |
| `/unavailable <date(s)>` | Mark blackout dates (feeds conflict detection) |

### 3.6 Swap Workflow (Web or Telegram)
Swaps can be **initiated and approved on either channel** — web dashboard or Telegram — and both stay in sync since they act on the same records.

1. Member requests a swap via Telegram inline button *or* the web dashboard (optionally nominating a replacement)
2. If replacement nominated → conflict check runs on the replacement first
3. IC/Head receives the request on both channels (Telegram push + dashboard queue); approves or rejects on either
4. On approval, assignment transfers; both parties + approver notified via Telegram
5. All swaps logged for audit

### 3.7 Service Order Documents
- Pastors, Full-Time Staff, and the **rostered Service Director** for that service can upload/manage the service order (PDF/doc/image) attached to a specific service date or special event
- **Default access is duty-scoped**: only the ICs and Heads rostered *for that week's service* (plus Pastors, Staff, and the Service Director) can view/download it
- **Regular members have no access by default** — a Pastor, Staff member, or the Service Director can specially grant access to named members when needed (e.g., worship team needing the service flow)
- When uploaded or updated, everyone with access receives a Telegram notification with a secure link
- Version history kept — re-uploads replace the visible copy but prior versions remain retrievable by Pastors/Staff
- Files stored in Supabase Storage with access rules matching the scoping above

### 3.8 Web Dashboard
- **Login via Telegram** for all users (Telegram Login Widget — user taps "Log in with Telegram", the already-linked account authenticates them; no passwords to manage). Full-year roster and all views require login.
- **Full-year duty roster viewable by everyone** — all published rosters for the calendar year, read-only, filterable by ministry/date/member
- Drag-and-drop or click-to-assign with live conflict warnings (admin roles)
- Special event creation wizard (Pastors) and **event roster editing** (Pastors, Staff, all Heads)
- Swap request queue — view, approve, reject (mirrors Telegram actions); members can initiate swaps here too
- Service order upload and management (Pastors, Staff, Service Director) with member access grants
- Member management, invite link generation
- Basic reports: serving frequency per member, unfilled slots, conflict overrides log

---

## 4. Permissions Matrix

| Action | Member | IC | Head | Svc Director* | Staff | Pastor |
|---|:-:|:-:|:-:|:-:|:-:|:-:|
| View full-year published roster (web) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| View own duties | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Confirm / request swap (own, web or Telegram) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Set own unavailability | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Assign members (own team) | — | ✅ | ✅ | — | — | ✅ |
| Approve swaps (own team, web or Telegram) | — | ✅ | ✅ | — | — | ✅ |
| Create duty slots (own ministry) | — | — | ✅ | — | — | ✅ |
| Manage ministry members | — | — | ✅ | — | — | ✅ |
| Override conflicts | — | ✅ | ✅ | — | ✅ | ✅ |
| Update special event roster (web) | — | — | ✅ | — | ✅ | ✅ |
| View service order (own service week) | grant only | ✅ | ✅ | ✅ | ✅ | ✅ |
| Upload/manage service order (own service) | — | — | — | ✅ | ✅ | ✅ |
| Grant service-order access to members | — | — | — | ✅ | ✅ | ✅ |
| Create special events / appoint Event Heads | — | — | — | — | — | ✅ |
| Create/archive ministries, appoint heads | — | — | — | — | — | ✅ |
| View all ministries & reports | — | — | — | — | ✅ | ✅ |

*Service Director permissions apply only to the specific service(s) they are rostered to direct via the Service Direction ministry; otherwise they act with their underlying role. The Service Direction ministry's Head has standard Head permissions over the SD/SC roster.

---

## 5. Data Model (Summary)

- **users** — id, name, telegram_id, phone, global_role (pastor / staff / none)
- **ministries** — id, name, status
- **memberships** — user_id, ministry_id, role (head / ic / member), positions[]
- **duty_slots** — id, ministry_id, service_date, start_time, end_time, position, headcount, recurring_template_id (nullable)
- **events** — id, name, description, date, start_time, end_time, created_by, event_head_id (nullable)
- **event_roles** — id, event_id, title, headcount
- *Service Direction is a regular row in **ministries*** — its duty slots use positions `service_director` and `service_coordinator`; no dedicated tables needed. Service-order permissions are derived from holding a confirmed `service_director` assignment for that service date.
- **assignments** — id, user_id, duty_slot_id *or* event_role_id, status (pending / confirmed / swap_requested / swapped), conflict_acknowledged (bool), assigned_by
- **unavailability** — user_id, date_range, reason (optional)
- **swap_requests** — assignment_id, requested_by, nominated_replacement (nullable), status, decided_by, channel (web / telegram)
- **service_orders** — id, service_date *or* event_id, file_url, version, uploaded_by, uploaded_at
- **service_order_access** — service_order_id, user_id, granted_by (explicit member grants beyond default duty-scoped access)
- **notification_queue** — user_id, type (reminder / published / swap_outcome / service_order), payload, scheduled_for, sent_at (nullable)
- **audit_log** — actor, action, target, timestamp

Access control enforced with Postgres Row-Level Security matching the permissions matrix.

---

## 6. Technical Architecture

**Principle:** Everything lives on Supabase except the frontend, which is a stateless Next.js app on Vercel.

| Layer | Choice | Details |
|---|---|---|
| Frontend | Next.js on Vercel | Dashboard only; talks directly to Supabase via client library (no custom API routes needed for most operations) |
| Database | Supabase Postgres + Row-Level Security | RLS policies implement the permissions matrix (§4); single source of truth |
| Bot webhook | **Supabase Edge Function** (Deno) running grammY | Telegram pushes updates to `https://<project>.supabase.co/functions/v1/telegram-bot`; handles /start linking, confirm buttons, swap buttons, /duties, /roster, /unavailable |
| Scheduler | **pg_cron** (+ pg_net) inside Postgres | Queries upcoming duties, queues notifications, invokes an Edge Function to send Telegram reminders (day-before, optional morning-of) |
| File storage | Supabase Storage | Service orders; bucket policies mirror duty-scoped access + explicit grants |
| Auth | Telegram Login Widget → Edge Function verifies HMAC payload against bot token → mints Supabase session | One identity across bot and web; no passwords |
| Conflict engine | Single Postgres function | Called by dashboard, bot, and swap flows alike |
| Secrets | Supabase secrets manager | Bot token, webhook secret |

**Notifications flow:** DB event (publish/assign/swap/upload) → `notification_queue` row → pg_cron worker → Edge Function → Telegram Bot API.

**Implementation notes:**
- Edge Functions run on Deno — use npm specifiers for dependencies; grammY officially supports this runtime
- Set Telegram's `secret_token` on the webhook registration and validate it in the Edge Function to reject forged updates
- Webhook handler must respond fast (< a few seconds): write to DB, acknowledge, let cron/queue handle slow sends
- Free-tier note: Supabase pauses free projects after ~1 week of inactivity; the weekly cron job itself prevents this
- All state-changing operations (assign, confirm, swap approve, conflict override) go through Postgres functions so RLS + conflict rules are enforced identically from web and bot

**Suggested build order:**
1. Schema + RLS policies (permissions matrix §4)
2. Conflict-check Postgres function + unavailability integration
3. Edge Function: Telegram webhook (linking, confirm, swap buttons)
4. pg_cron reminder pipeline + notification queue
5. Telegram Login auth flow for dashboard
6. Next.js dashboard: roster views → assignment UI → event wizard → service orders → reports

---

## 7. Success Metrics

- ≥ 90% of duties confirmed via Telegram before service day
- Zero unflagged double-bookings after launch
- Swap requests resolved (approved/rejected) within 24h median
- Roster creation time per ministry reduced vs. spreadsheet baseline
- Adoption: all active ministries onboarded within first 2 months

---

## 8. Rollout Plan

| Phase | Scope |
|---|---|
| **Phase 1 — MVP** | Users, ministries, roles, duty slots, manual assignment, Telegram linking, confirm flow, conflict detection with override, reminders |
| **Phase 2** | Swap workflow (web + Telegram), unavailability, special events + event roles, delegation, service order uploads |
| **Phase 3** | Assisted rotation suggestions, reports, recurring templates, audit log UI |

Pilot with one ministry (suggest: worship or ushering) for 2–3 weeks before church-wide rollout.

---

## 9. Open Questions

1. Default duty duration buffer — is 2h right, or does it vary by ministry?
2. Should members see other members' rosters (transparency) or only their own (privacy)?
3. Reminder timing — day before only, or also morning-of?
4. Should ICs be allowed to create duty slots, or only assign to Head-created slots?
5. How should the system handle members without Telegram (fallback: SMS? printed roster?)
6. Data retention — how long to keep past rosters and audit logs?
7. Login fallback — Telegram login covers everyone linked, but is a backup method (email magic link) needed for e.g. a pastor whose Telegram is unavailable?
8. Service order formats — PDF only, or also Word/Google Docs links/images?
