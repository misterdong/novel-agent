-- 旧版本只把标题和阶段目标写入 volumes；从项目总纲中回填仍然存在的详细分卷规划。
UPDATE "volumes" AS volume
SET
  "conflict" = COALESCE(NULLIF(volume."conflict", ''), generated.plan->>'conflict', ''),
  "turning_point" = COALESCE(NULLIF(volume."turning_point", ''), generated.plan->>'turningPoint', ''),
  "ending_hook" = COALESCE(NULLIF(volume."ending_hook", ''), generated.plan->>'endingHook', ''),
  "updated_at" = now()
FROM "projects" AS project
CROSS JOIN LATERAL jsonb_array_elements(
  COALESCE(project."settings"->'storyPlan'->'volumes', '[]'::jsonb)
) WITH ORDINALITY AS generated(plan, position)
WHERE volume."project_id" = project."id"
  AND volume."position" = generated.position
  AND (volume."conflict" = '' OR volume."turning_point" = '' OR volume."ending_hook" = '');
