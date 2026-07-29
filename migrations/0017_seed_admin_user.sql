INSERT INTO users (id, email, password_hash, role)
VALUES (
    'admin-001-0000-0000-000000000000',
    'alireza1238@gmail.com',
    '1c119822e4f2558703039253ed886138:ae76b7dad75f23a85318b6f1c725f841195a002421bfea84dbec7608b9991ffe',
    'admin'
)
ON CONFLICT(email) DO UPDATE SET
    password_hash = excluded.password_hash,
    role = excluded.role;
