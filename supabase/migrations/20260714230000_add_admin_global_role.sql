-- Adds an 'admin' global role: a non-clergy system administrator with the
-- same rights as Pastor. Deviation from PRD §4 (which lists Pastor/Staff as
-- the only global roles), requested 2026-07-15: the deploying admin is not a
-- pastor. 'pastor' remains for actual pastors.
--
-- The value is added in its own migration because a new enum value cannot be
-- referenced in the same transaction that creates it; the policy/RPC updates
-- that use it live in the follow-up migration.

alter type public.global_role add value if not exists 'admin';
