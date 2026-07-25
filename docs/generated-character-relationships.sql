BEGIN;

-- 根据人物档案提炼的初始关系。这里保存的是故事开局状态与后续规划，
-- 不把人物弧终点提前写成已经发生的事实。
WITH relationship_data (
  character_a_id,
  character_b_id,
  relation_type,
  status,
  a_to_b_attitude,
  b_to_a_attitude,
  description,
  next_direction
) AS (
  VALUES
    (
      '6103db5b-ecac-4d5b-8266-8ddf89787c63'::uuid,
      'e3ff25db-c63c-4e73-9fc8-461ff6be518e'::uuid,
      '潜在盟友 / 理念对立',
      '尚未建立信任',
      '陈野认可许青禾的信息能力，但警惕她坚持公开和程序正义，认为她的理想主义可能暴露行动。',
      '许青禾将陈野视为揭开黑色悬赏和天衡真相的关键对象，既希望协助他，也会监督他是否越过无辜者底线。',
      '两人会因调查天衡而合作，但在隐瞒真相、利用无辜者和传播责任上多次发生冲突。',
      '从互相利用发展为主角团队盟友；中期因陈野牺牲无辜者的错误选择决裂，之后在责任边界明确后重建合作。'
    ),
    (
      '6103db5b-ecac-4d5b-8266-8ddf89787c63'::uuid,
      '1d3202d7-97eb-4d5f-b0d9-af2185c5c994'::uuid,
      '旧友 / 背叛者',
      '友情破裂',
      '陈野曾把周烈视为最可信任的朋友；遭到追杀后会把他的参与视为背叛，难以接受其“别无选择”的解释。',
      '周烈重视陈野却因救治母亲和摆脱贫困参与追杀，对陈野怀有强烈愧疚，并在第一次出手时暗中放水。',
      '高中旧友因今日最弱者猎杀站到对立面。关系核心不是单纯敌对，而是现实压力、背叛责任与是否值得原谅的冲突。',
      '周烈停止用环境开脱并公开承担背叛责任，放弃猎杀利益后，双方才可能从敌对重新走向并肩作战。'
    ),
    (
      '6103db5b-ecac-4d5b-8266-8ddf89787c63'::uuid,
      '67e5f1b6-e23d-4061-9036-03eef525abfc'::uuid,
      '制度反抗者 / 秩序维护者',
      '潜在敌对',
      '陈野将顾承岳视为把少数人定义为可牺牲对象的制度代表，反感其用文明存续合理化不公。',
      '顾承岳警惕陈野颠覆制度的可能，同时欣赏他的生存能力，希望逼迫或培养他成为新的天衡载体。',
      '双方围绕“是否可以牺牲少数维持城市结界”形成核心价值冲突。顾承岳不会简单追杀陈野，而会不断制造必须付出代价的选择。',
      '从试探、招揽和两难考验升级为制度层面的正面对抗，最终迫使双方证明是否存在牺牲逻辑之外的道路。'
    ),
    (
      '6103db5b-ecac-4d5b-8266-8ddf89787c63'::uuid,
      '6185d52e-9799-4e77-921b-2c4ed7e9ca96'::uuid,
      '兄妹',
      '亲密但保护权冲突',
      '陈野深爱并保护妹妹，却容易把保护理解为替她决定一切，并可能为了她牺牲其他无辜者。',
      '陈安然依赖哥哥但不崇拜他，关心他是否正在成为自己曾痛恨的裁决者，坚持拥有自己的选择权。',
      '兄妹相依为命，是陈野最重要的情感关系。关系矛盾集中在保护是否等于控制，以及能否用他人的牺牲换取亲人的安全。',
      '陈安然被选为今日最弱者后拒绝赦免替代方案，迫使陈野从“替弱者决定”转向尊重弱者自身的尊严和选择。'
    ),
    (
      '6103db5b-ecac-4d5b-8266-8ddf89787c63'::uuid,
      '7d5b5011-35b9-456d-afd7-d3f02e198d36'::uuid,
      '父子 / 隐秘对立',
      '陈野认定父亲已死亡',
      '陈野表面把父亲视为失败者，实际始终受其死亡阴影影响，并隐约怀疑父亲可能没有真正死亡。',
      '陈观山仍想保护儿子，却被天衡规则约束，只能保持敌对姿态，以致命考验逼迫陈野成长。',
      '陈观山十年前代替陈野成为今日最弱者，反抗失败后化为天衡执行人格。父子双方掌握的信息严重不对称。',
      '从死亡误认和敌对试炼逐步揭示替代真相；陈观山最终需要在系统指令与父亲本能之间选择，陈野则需重新理解父亲的失败。'
    ),
    (
      '6185d52e-9799-4e77-921b-2c4ed7e9ca96'::uuid,
      '7d5b5011-35b9-456d-afd7-d3f02e198d36'::uuid,
      '父女',
      '失联 / 死亡误认',
      '陈安然将父亲视为十年前被制度牺牲的受害者，目前不知道他仍以天衡执行人格存在。',
      '陈观山希望家人能够存活，但受系统约束无法公开身份，也无法以正常父亲身份保护女儿。',
      '父女关系被陈观山的官方死亡和意识体真相切断；陈安然也是检验陈观山是否真正摆脱牺牲逻辑的重要对象。',
      '随着陈观山真实状态暴露，陈安然不会仅因血缘接受他的选择，而会要求他正面回答是否仍认可牺牲无辜者的制度。'
    )
)
INSERT INTO character_relationships (
  project_id,
  character_a_id,
  character_b_id,
  relation_type,
  status,
  a_to_b_attitude,
  b_to_a_attitude,
  description,
  next_direction,
  active,
  created_at,
  updated_at
)
SELECT
  a.project_id,
  data.character_a_id,
  data.character_b_id,
  data.relation_type,
  data.status,
  data.a_to_b_attitude,
  data.b_to_a_attitude,
  data.description,
  data.next_direction,
  true,
  now(),
  now()
FROM relationship_data AS data
JOIN characters AS a ON a.id = data.character_a_id
JOIN characters AS b ON b.id = data.character_b_id AND b.project_id = a.project_id
WHERE a.project_id = 'bc83f94d-3204-43d1-aaa3-6fec03636546'::uuid
ON CONFLICT (project_id, character_a_id, character_b_id)
DO UPDATE SET
  relation_type = EXCLUDED.relation_type,
  status = EXCLUDED.status,
  a_to_b_attitude = EXCLUDED.a_to_b_attitude,
  b_to_a_attitude = EXCLUDED.b_to_a_attitude,
  description = EXCLUDED.description,
  next_direction = EXCLUDED.next_direction,
  active = true,
  updated_at = now();

COMMIT;

-- 执行后可用以下查询核对结果：
-- SELECT a.name AS character_a, b.name AS character_b, r.relation_type,
--        r.status, r.a_to_b_attitude, r.b_to_a_attitude, r.next_direction
-- FROM character_relationships r
-- JOIN characters a ON a.id = r.character_a_id
-- JOIN characters b ON b.id = r.character_b_id
-- WHERE r.project_id = 'bc83f94d-3204-43d1-aaa3-6fec03636546'::uuid
-- ORDER BY a.name, b.name;
