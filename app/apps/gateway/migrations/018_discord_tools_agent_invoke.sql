-- Migration 018: Discord tools, agent_invoke, agent_message_list for all profiles
-- Updates allowed_tools for all profiles and sets Todd's additional workspace path.

-- 1. Add agent_message_list to all profiles that have agent_message_send
UPDATE agent_profiles
SET allowed_tools = (
  SELECT jsonb_agg(elem ORDER BY elem)
  FROM (
    SELECT DISTINCT elem FROM jsonb_array_elements_text(allowed_tools) AS t(elem)
    UNION VALUES ('agent_message_list')
  ) sub
)
WHERE allowed_tools ? 'agent_message_send'
  AND NOT (allowed_tools ? 'agent_message_list');

-- 2. Add discord_post and discord_list_channels to all profiles
UPDATE agent_profiles
SET allowed_tools = (
  SELECT jsonb_agg(elem ORDER BY elem)
  FROM (
    SELECT elem FROM jsonb_array_elements_text(allowed_tools::jsonb) AS t(elem)
    UNION VALUES ('discord_post'), ('discord_list_channels')
  ) sub
)
WHERE NOT (allowed_tools::jsonb ? 'discord_post');

-- 3. Add agent_invoke to executive-tier profiles and personal-assistant
UPDATE agent_profiles
SET allowed_tools = (
  SELECT jsonb_agg(elem ORDER BY elem)
  FROM (
    SELECT elem FROM jsonb_array_elements_text(allowed_tools::jsonb) AS t(elem)
    UNION VALUES ('agent_invoke')
  ) sub
)
WHERE slug IN (
  'todd-orchestrator',
  'personal-assistant',
  'mia-profile', 'elena-profile', 'isla-profile', 'vanessa-profile',
  'sabrina-profile', 'amara-profile', 'ava-profile', 'natalie-profile',
  'zoey-profile', 'executive'
)
AND NOT (allowed_tools::jsonb ? 'agent_invoke');

-- 4. Add agent_message_send/check/list to built-in profiles that lack them
UPDATE agent_profiles
SET allowed_tools = (
  SELECT jsonb_agg(elem ORDER BY elem)
  FROM (
    SELECT elem FROM jsonb_array_elements_text(allowed_tools::jsonb) AS t(elem)
    UNION VALUES ('agent_message_send'), ('agent_message_check'), ('agent_message_list')
  ) sub
)
WHERE slug IN ('analyst', 'developer', 'researcher', 'executive')
AND NOT (allowed_tools::jsonb ? 'agent_message_send');

-- 5. Set Todd's (slug: main) additional workspace path
UPDATE agent_identities
SET additional_workspace_paths = array_append(
  additional_workspace_paths,
  '/home/sinthetix/Desktop/Agency/Agency Main'
)
WHERE slug = 'main'
AND NOT ('/home/sinthetix/Desktop/Agency/Agency Main' = ANY(additional_workspace_paths));
