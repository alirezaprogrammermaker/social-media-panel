import { useState } from 'react';
import { Form, Input, Button, Card, Typography, Alert, Flex } from 'antd';
import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const { Title, Text } = Typography;

export function Login() {
    const { user, login } = useAuth();
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);

    if (user) return <Navigate to="/" replace />;

    async function onFinish(values: { email: string; password: string }) {
        setError('');
        setBusy(true);
        try {
            await login(values.email, values.password);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setBusy(false);
        }
    }

    return (
        <Flex align="center" justify="center" style={{ minHeight: '100vh', background: '#0f172a' }}>
            <Card style={{ width: 360 }}>
                <Title level={3} style={{ marginBottom: 0 }}>ورود به پنل</Title>
                <Text type="secondary">با ایمیل و رمز عبورت وارد شو</Text>

                <Form layout="vertical" onFinish={onFinish} style={{ marginTop: 20 }}>
                    <Form.Item
                        name="email"
                        label="ایمیل"
                        rules={[{ required: true, type: 'email', message: 'ایمیل معتبر وارد کن' }]}
                    >
                        <Input size="large" />
                    </Form.Item>

                    <Form.Item
                        name="password"
                        label="رمز عبور"
                        rules={[{ required: true, min: 8, message: 'حداقل ۸ کاراکتر' }]}
                    >
                        <Input.Password size="large" />
                    </Form.Item>

                    {error && <Alert type="error" message={error} style={{ marginBottom: 16 }} showIcon />}

                    <Button type="primary" htmlType="submit" block size="large" loading={busy}>
                        ورود
                    </Button>
                </Form>

                <Flex justify="center" gap={4} style={{ marginTop: 16 }}>
                    <Text type="secondary">حساب نداری؟</Text>
                    <Link to="/signup">ثبت‌نام کن</Link>
                </Flex>
            </Card>
        </Flex>
    );
}