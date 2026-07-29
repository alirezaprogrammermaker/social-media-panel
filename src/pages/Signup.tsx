import { useState } from 'react';
import { Form, Input, Button, Card, Typography, Alert, Flex } from 'antd';
import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const { Title, Text } = Typography;

export function Signup() {
    const { user, signup } = useAuth();
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);

    if (user) return <Navigate to="/" replace />;

    async function onFinish(values: { email: string; password: string }) {
        setError('');
        setBusy(true);
        try {
            await signup(values.email, values.password);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setBusy(false);
        }
    }

    return (
        <Flex align="center" justify="center" style={{ minHeight: '100vh', background: '#0f172a' }}>
            <Card style={{ width: 360 }}>
                <Title level={3} style={{ marginBottom: 0 }}>ساخت حساب</Title>
                <Text type="secondary">برای دسترسی به پنل ثبت‌نام کن</Text>

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
                        ثبت‌نام
                    </Button>
                </Form>

                <Flex justify="center" gap={4} style={{ marginTop: 16 }}>
                    <Text type="secondary">حساب داری؟</Text>
                    <Link to="/login">وارد شو</Link>
                </Flex>
            </Card>
        </Flex>
    );
}