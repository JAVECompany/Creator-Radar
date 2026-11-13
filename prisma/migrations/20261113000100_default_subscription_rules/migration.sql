INSERT INTO "SubscriptionPlatform" ("id", "name", "updatedAt")
SELECT gen_random_uuid(), name, CURRENT_TIMESTAMP
FROM (VALUES ('OnlyFans'), ('Fantrie'), ('Patreon'), ('Likey')) AS platforms(name)
ON CONFLICT ("name") DO NOTHING;

INSERT INTO "SubscriptionPlatformAlias" ("id", "platformId", "value", "isDomain", "ambiguous")
SELECT gen_random_uuid(), p.id, rule.value, rule.is_domain, rule.ambiguous
FROM (VALUES
  ('OnlyFans', 'OnlyFans', false, false),
  ('OnlyFans', '온리팬스', false, false),
  ('OnlyFans', 'onlyfans.com', true, false),
  ('Fantrie', 'Fantrie', false, false),
  ('Fantrie', '팬트리', false, false),
  ('Fantrie', 'fantrie.com', true, false),
  ('Patreon', 'Patreon', false, false),
  ('Patreon', '패트리온', false, false),
  ('Patreon', 'patreon.com', true, false),
  ('Likey', 'Likey', false, true),
  ('Likey', '라이키', false, false),
  ('Likey', 'likey.me', true, false)
) AS rule(platform, value, is_domain, ambiguous)
JOIN "SubscriptionPlatform" p ON p.name = rule.platform
ON CONFLICT ("platformId", "value", "isDomain") DO NOTHING;
