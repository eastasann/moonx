-- The KPI counts of 01_prd.md 5章, taken as SDD 11章 says: make kpi runs this file, and
-- kpi.yml puts the table into the run's summary. Only counts leave the database: no
-- answer, amount, history value, comment body, name or e-mail is selected, and the only
-- JSON read is the state of each missing check in a decision's snapshot.
--
-- Weeks (Monday to Sunday, labelled by the Monday's date) and months are those of
-- Asia/Manila, where the pilot runs and the users' default time zone. Periodic rows cover
-- the current month and the 3 before it, or the current week and the 12 before it (K-12:
-- the sign-up weeks from 20 to 8 weeks before it), with 0 for an empty period; 'all' is
-- all time.
--
-- Shared definitions:
-- - The workspace kept for the post-deploy checks (psql variable check_workspace_id, from
--   CHECK_WORKSPACE_ID; 03_dev-setup.md 5.4 K) is left out: its memberships, its ideas
--   and whatever is recorded in it. Self-analysis history has no workspace and counts.
-- - An idea or plan with deleted_at had its creation undone, so it was never made.
-- - Team members hold owner or member, and viewers hold viewer, in a workspace that is
--   not personal.
-- - A person records something (K-07, K-12, K-13) by a change history row, a comment
--   (deleted ones too: the comment was written) or a decision. A history row that merges
--   one person's consecutive edits spans from its first change to its last (ADR-020) and
--   counts in every period it touches.

-- Guards a run on a connection that can write; production runs on a read-only role.
SET default_transaction_read_only = on;

WITH
-- Cast once, so a value that is not a UUID stops the run.
check_workspace (id) AS (
  SELECT :'check_workspace_id'::uuid
),
all_time (label, starts, ends) AS (
  VALUES ('all', '-infinity'::timestamptz, 'infinity'::timestamptz)
),
months (label, starts, ends) AS (
  SELECT
    to_char(m, 'YYYY-MM'),
    m AT TIME ZONE 'Asia/Manila',
    (m + interval '1 month') AT TIME ZONE 'Asia/Manila'
  FROM generate_series(
    date_trunc('month', now() AT TIME ZONE 'Asia/Manila') - interval '3 months',
    date_trunc('month', now() AT TIME ZONE 'Asia/Manila'),
    interval '1 month'
  ) AS m
),
weeks (label, starts, ends) AS (
  SELECT
    to_char(w, 'YYYY-MM-DD'),
    w AT TIME ZONE 'Asia/Manila',
    (w + interval '7 days') AT TIME ZONE 'Asia/Manila'
  FROM generate_series(
    date_trunc('week', now() AT TIME ZONE 'Asia/Manila') - interval '12 weeks',
    date_trunc('week', now() AT TIME ZONE 'Asia/Manila'),
    interval '1 week'
  ) AS w
),
signup_weeks (label, starts, ends) AS (
  SELECT
    to_char(w, 'YYYY-MM-DD'),
    w AT TIME ZONE 'Asia/Manila',
    (w + interval '7 days') AT TIME ZONE 'Asia/Manila'
  FROM generate_series(
    date_trunc('week', now() AT TIME ZONE 'Asia/Manila') - interval '20 weeks',
    date_trunc('week', now() AT TIME ZONE 'Asia/Manila') - interval '8 weeks',
    interval '1 week'
  ) AS w
),
counted_workspaces AS (
  SELECT id, is_personal
  FROM workspaces
  WHERE id <> (SELECT id FROM check_workspace)
),
live_ideas AS (
  SELECT id, created_at, archived_at
  FROM ideas
  WHERE deleted_at IS NULL AND workspace_id <> (SELECT id FROM check_workspace)
),
history AS (
  SELECT *
  FROM change_history
  WHERE workspace_id IS DISTINCT FROM (SELECT id FROM check_workspace)
),
counted_comments AS (
  SELECT author_id, workspace_id, created_at
  FROM comments
  WHERE workspace_id <> (SELECT id FROM check_workspace)
),
decisions AS (
  SELECT *
  FROM decision_log_entries
  WHERE workspace_id <> (SELECT id FROM check_workspace)
),
team_memberships AS (
  SELECT m.user_id, m.workspace_id, m.created_at
  FROM memberships m
  JOIN counted_workspaces w ON w.id = m.workspace_id
  WHERE NOT w.is_personal AND m.role IN ('owner', 'member')
),
viewer_memberships AS (
  SELECT m.user_id, m.workspace_id, m.created_at
  FROM memberships m
  JOIN counted_workspaces w ON w.id = m.workspace_id
  WHERE NOT w.is_personal AND m.role = 'viewer'
),
records (user_id, workspace_id, starts, ends) AS (
  SELECT changed_by_id, workspace_id, coalesce(first_changed_at, changed_at), changed_at
  FROM history
  UNION ALL
  SELECT author_id, workspace_id, created_at, created_at FROM counted_comments
  UNION ALL
  SELECT recorded_by_id, workspace_id, recorded_at, recorded_at FROM decisions
),
proceed_decisions AS (
  SELECT id, snapshot
  FROM decisions
  WHERE kind = 'validation_decision' AND value = 'proceed'
),
-- Operators are not users who sign up.
signups AS (
  SELECT id, created_at FROM users WHERE NOT is_admin
),
counts (kpi, period_starts, period, measure_order, measure, count) AS (
  SELECT 'K-01', p.starts, p.label, v.*
  FROM all_time p
  CROSS JOIN LATERAL (
    SELECT
      (SELECT count(*) FROM self_analyses WHERE status <> 'not_started') AS started,
      (SELECT count(*) FROM live_ideas) AS ideas,
      (
        SELECT count(*)
        FROM live_ideas i
        WHERE EXISTS (
          SELECT 1
          FROM validations va
          JOIN validation_answers a ON a.validation_id = va.id
          WHERE va.idea_id = i.id
        )
      ) AS answered
  ) c
  CROSS JOIN LATERAL (VALUES
    (1, 'self-analyses started', c.started),
    (2, 'ideas', c.ideas),
    (3, 'ideas with a validation answer', c.answered)
  ) v

  UNION ALL
  SELECT 'K-02', p.starts, p.label, v.*
  FROM months p
  CROSS JOIN LATERAL (
    SELECT count(*) AS created
    FROM live_ideas i
    WHERE i.created_at >= p.starts AND i.created_at < p.ends
  ) c
  CROSS JOIN LATERAL (VALUES (1, 'ideas created', c.created)) v

  -- Per membership: someone in two teams completes once but shares with each.
  UNION ALL
  SELECT 'K-03', p.starts, p.label, v.*
  FROM all_time p
  CROSS JOIN LATERAL (
    SELECT
      count(*) AS memberships,
      count(*) FILTER (WHERE a.status = 'done') AS done,
      count(*) FILTER (
        WHERE a.status = 'done' AND EXISTS (
          SELECT 1
          FROM self_analysis_shares s
          WHERE s.self_analysis_id = a.id AND s.workspace_id = t.workspace_id
        )
      ) AS shared
    FROM team_memberships t
    LEFT JOIN self_analyses a ON a.user_id = t.user_id
  ) c
  CROSS JOIN LATERAL (VALUES
    (1, 'team memberships', c.memberships),
    (2, 'self-analysis done', c.done),
    (3, 'done and shared with the workspace', c.shared)
  ) v

  -- The snapshot lists the checks that were not done when the decision was recorded.
  UNION ALL
  SELECT 'K-04 K-15', p.starts, p.label, v.*
  FROM all_time p
  CROSS JOIN LATERAL (
    SELECT
      count(*) AS decisions,
      count(*) FILTER (
        WHERE NOT EXISTS (
          SELECT 1
          FROM jsonb_array_elements(d.snapshot -> 'missingChecks') AS e (missing)
          WHERE e.missing ->> 'state' = 'not_started'
        )
      ) AS checked
    FROM proceed_decisions d
  ) c
  CROSS JOIN LATERAL (VALUES
    (1, 'proceed decisions', c.decisions),
    (2, 'with no check not started', c.checked)
  ) v

  UNION ALL
  SELECT 'K-05', p.starts, p.label, v.*
  FROM all_time p
  CROSS JOIN LATERAL (
    SELECT
      count(*) AS ideas,
      count(*) FILTER (
        WHERE EXISTS (
          SELECT 1
          FROM decisions d
          WHERE d.idea_id = i.id AND d.kind = 'validation_decision'
        )
      ) AS decided
    FROM live_ideas i
    WHERE i.archived_at IS NULL AND i.created_at <= now() - interval '28 days'
  ) c
  CROSS JOIN LATERAL (VALUES
    (1, 'ideas 4+ weeks old', c.ideas),
    (2, 'with a decision', c.decided)
  ) v

  UNION ALL
  SELECT 'K-06', p.starts, p.label, v.*
  FROM all_time p
  CROSS JOIN LATERAL (
    SELECT
      count(*) AS decisions,
      count(*) FILTER (
        WHERE EXISTS (
          SELECT 1
          FROM business_plans b
          WHERE b.created_from_decision_id = d.id AND b.deleted_at IS NULL
        )
      ) AS planned,
      (
        SELECT count(*)
        FROM business_plans b
        JOIN proceed_decisions pd ON pd.id = b.created_from_decision_id
        WHERE b.deleted_at IS NULL
      ) AS plans
    FROM proceed_decisions d
  ) c
  CROSS JOIN LATERAL (VALUES
    (1, 'proceed decisions', c.decisions),
    (2, 'with a plan made from it', c.planned),
    (3, 'plans made from proceed decisions', c.plans)
  ) v

  -- Members as of the week's end. A removed member leaves memberships, and so every week.
  UNION ALL
  SELECT 'K-07', p.starts, p.label, v.*
  FROM weeks p
  CROSS JOIN LATERAL (
    SELECT
      count(*) AS members,
      count(*) FILTER (
        WHERE EXISTS (
          SELECT 1
          FROM records r
          WHERE r.user_id = t.user_id AND r.starts < p.ends AND r.ends >= p.starts
        )
      ) AS recorded
    FROM (
      SELECT DISTINCT user_id FROM team_memberships WHERE created_at < p.ends
    ) t
  ) c
  CROSS JOIN LATERAL (VALUES
    (1, 'team members', c.members),
    (2, 'who recorded', c.recorded)
  ) v

  -- A merged history row is one save, made when its last change was and from that
  -- change's client (ADR-020).
  UNION ALL
  SELECT 'K-08 K-16', p.starts, p.label, v.*
  FROM (SELECT * FROM all_time UNION ALL SELECT * FROM months) p
  CROSS JOIN LATERAL (
    SELECT
      count(*) AS saves,
      count(*) FILTER (WHERE h.client = 'web_mobile') AS mobile,
      count(*) FILTER (WHERE h.client = 'unknown') AS unknown
    FROM history h
    WHERE h.target_type IN ('self_analysis_answer', 'validation_answer', 'plan_answer')
      AND h.source = 'manual'
      AND h.changed_at >= p.starts AND h.changed_at < p.ends
  ) c
  CROSS JOIN LATERAL (VALUES
    (1, 'manual answer saves', c.saves),
    (2, 'from a phone-width screen', c.mobile),
    (3, 'client unknown', c.unknown)
  ) v

  -- An AI import made anywhere counts, the importer's own self-analysis included.
  UNION ALL
  SELECT 'K-09', p.starts, p.label, v.*
  FROM all_time p
  CROSS JOIN LATERAL (
    SELECT
      count(*) AS members,
      count(*) FILTER (
        WHERE EXISTS (
          SELECT 1
          FROM history h
          WHERE h.changed_by_id = t.user_id AND h.source = 'ai_import'
        )
      ) AS imported
    FROM (SELECT DISTINCT user_id FROM team_memberships) t
  ) c
  CROSS JOIN LATERAL (VALUES
    (1, 'team members', c.members),
    (2, 'with an AI import', c.imported)
  ) v

  -- Viewers as of the month's end, and only their comments in a workspace where they
  -- are a viewer.
  UNION ALL
  SELECT 'K-10', p.starts, p.label, v.*
  FROM months p
  CROSS JOIN LATERAL (
    SELECT
      count(DISTINCT vm.user_id) AS viewers,
      count(DISTINCT vm.user_id) FILTER (
        WHERE EXISTS (
          SELECT 1
          FROM counted_comments cm
          WHERE cm.author_id = vm.user_id
            AND cm.workspace_id = vm.workspace_id
            AND cm.created_at >= p.starts AND cm.created_at < p.ends
        )
      ) AS commented
    FROM viewer_memberships vm
    WHERE vm.created_at < p.ends
  ) c
  CROSS JOIN LATERAL (VALUES
    (1, 'viewers', c.viewers),
    (2, 'who commented', c.commented)
  ) v

  -- Only those who signed up 30+ days ago, whose 30 days are over. Starting is a save in
  -- one's self-analysis, from any source, or creating an idea: creating (I1) and
  -- duplicating (I3) both write the new idea's history row with action create. A merged
  -- row's first change is the first save.
  UNION ALL
  SELECT 'K-11', p.starts, p.label, v.*
  FROM months p
  CROSS JOIN LATERAL (
    SELECT
      count(*) AS signed_up,
      count(*) FILTER (
        WHERE EXISTS (
          SELECT 1
          FROM history h
          WHERE h.changed_by_id = u.id
            AND coalesce(h.first_changed_at, h.changed_at)
              < u.created_at + interval '30 days'
            AND (
              h.container_type = 'self_analysis'
              OR (
                h.target_type = 'idea' AND h.action = 'create'
                AND EXISTS (SELECT 1 FROM live_ideas i WHERE i.id = h.target_id)
              )
            )
        )
      ) AS started
    FROM signups u
    WHERE u.created_at >= p.starts AND u.created_at < p.ends
      AND u.created_at <= now() - interval '30 days'
  ) c
  CROSS JOIN LATERAL (VALUES
    (1, 'signed up 30+ days ago', c.signed_up),
    (2, 'started within 30 days', c.started)
  ) v

  -- Only those who signed up 8+ weeks ago, whose weeks 5 to 8 (days 28 to 56 from the
  -- sign-up) are over; the weeks end 8 weeks back for the same reason.
  UNION ALL
  SELECT 'K-12', p.starts, p.label, v.*
  FROM signup_weeks p
  CROSS JOIN LATERAL (
    SELECT
      count(*) AS signed_up,
      count(*) FILTER (
        WHERE EXISTS (
          SELECT 1
          FROM records r
          WHERE r.user_id = u.id
            AND r.starts < u.created_at + interval '56 days'
            AND r.ends >= u.created_at + interval '28 days'
        )
      ) AS recorded
    FROM signups u
    WHERE u.created_at >= p.starts AND u.created_at < p.ends
      AND u.created_at <= now() - interval '56 days'
  ) c
  CROSS JOIN LATERAL (VALUES
    (1, 'signed up 8+ weeks ago', c.signed_up),
    (2, 'recorded in weeks 5-8', c.recorded)
  ) v

  -- Whoever records in the workspace counts, viewers and removed members too.
  UNION ALL
  SELECT 'K-13', p.starts, p.label, v.*
  FROM months p
  CROSS JOIN LATERAL (
    SELECT count(*) AS workspaces
    FROM (
      SELECT r.workspace_id
      FROM records r
      JOIN counted_workspaces w ON w.id = r.workspace_id
      WHERE NOT w.is_personal AND r.starts < p.ends AND r.ends >= p.starts
      GROUP BY r.workspace_id
      HAVING count(DISTINCT r.user_id) >= 2
    ) x
  ) c
  CROSS JOIN LATERAL (VALUES (1, 'workspaces with 2+ recorders', c.workspaces)) v

  -- K-05 with 8 weeks.
  UNION ALL
  SELECT 'K-14', p.starts, p.label, v.*
  FROM all_time p
  CROSS JOIN LATERAL (
    SELECT
      count(*) AS ideas,
      count(*) FILTER (
        WHERE EXISTS (
          SELECT 1
          FROM decisions d
          WHERE d.idea_id = i.id AND d.kind = 'validation_decision'
        )
      ) AS decided
    FROM live_ideas i
    WHERE i.archived_at IS NULL AND i.created_at <= now() - interval '56 days'
  ) c
  CROSS JOIN LATERAL (VALUES
    (1, 'ideas 8+ weeks old', c.ideas),
    (2, 'with a decision', c.decided)
  ) v
)
SELECT kpi, period, measure, count
FROM counts
ORDER BY kpi COLLATE "C", period_starts, measure_order;
