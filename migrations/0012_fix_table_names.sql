UPDATE ai_settings SET setting_value = '["users","sessions","settings","telegram_users","telegram_user_sessions","bot_channels","telegram_bot_helps","ai_settings","ai_role_settings"]' WHERE setting_key = 'ai_admin_allowed_tables';

UPDATE ai_settings SET setting_value = '["telegram_bot_helps"]' WHERE setting_key = 'ai_user_allowed_tables';
