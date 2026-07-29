import { useEffect, useState } from 'react';
import { Card, Input, Button, Typography, Space, Switch, Select, InputNumber, message, Row, Col, Table, Tag, Skeleton } from 'antd';
import { SaveOutlined, RobotOutlined, SendOutlined, BarChartOutlined, SafetyOutlined, ThunderboltOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { aiApi } from '../api';

const { Text } = Typography;
const { TextArea } = Input;

interface AiSettings { enabled: string; system_prompt: string; model: string; max_tokens: string; temperature: string; daily_limit: string; allowed_tables: string; translate_prompt?: string; description_prompt?: string; }
interface AiUsageStat { user_role: string; date: string; total_tokens: number; total_requests: number; }
interface AllSettings { admin: AiSettings; user: AiSettings; }

const AI_MODELS = [
    { value: '@cf/meta/llama-4-scout-17b-16e-instruct', label: 'Llama 4 Scout 17B' },
    { value: '@cf/meta/llama-3.3-70b-instruct-fp8-fast', label: 'Llama 3.3 70B' },
    { value: '@cf/mistralai/mistral-small-3.1-24b-instruct', label: 'Mistral Small 3.1 24B' },
    { value: '@cf/meta/llama-3.2-3b-instruct', label: 'Llama 3.2 3B' },
    { value: '@cf/qwen/qwen3-30b-a3b-fp8', label: 'Qwen3 30B' },
    { value: '@cf/deepseek-ai/deepseek-r1-distill-qwen-32b', label: 'DeepSeek R1 32B' },
];

function SettingsPanel({ title, icon, roleKey, settings, onSave }: { title: string; icon: React.ReactNode; roleKey: 'admin' | 'user'; settings: AiSettings; onSave: (role: 'admin' | 'user', values: Record<string, string>) => Promise<void>; }) {
    const [local, setLocal] = useState<AiSettings>(settings);
    const [saving, setSaving] = useState(false);
    useEffect(() => { setLocal(settings); }, [settings]);
    const update = (key: keyof AiSettings, value: string) => setLocal((prev) => ({ ...prev, [key]: value }));
    const handleSave = async () => { setSaving(true); try { await onSave(roleKey, local as unknown as Record<string, string>); message.success(`${title} ذخیره شد`); } catch { message.error('خطا'); } finally { setSaving(false); } };

    return (
        <Card title={<Space>{icon}<span>{title}</span></Space>} extra={<Switch checked={local.enabled === 'true'} onChange={(c) => update('enabled', c ? 'true' : 'false')} checkedChildren="فعال" unCheckedChildren="غیرفعال" />} bordered={false} style={{ borderRadius: 12 }}>
            <Space direction="vertical" size="middle" style={{ width: '100%' }}>
                <div><Text strong>پرامپت سیستم:</Text><TextArea rows={4} value={local.system_prompt} onChange={(e) => update('system_prompt', e.target.value)} style={{ marginTop: 8 }} /></div>
                <Row gutter={16}>
                    <Col xs={24} md={12}><Text strong>مدل:</Text><Select value={local.model} onChange={(v) => update('model', v)} options={AI_MODELS} style={{ width: '100%', marginTop: 8 }} /></Col>
                    <Col xs={12} md={6}><Text strong>حداکثر توکن:</Text><InputNumber value={parseInt(local.max_tokens || '512')} onChange={(v) => update('max_tokens', String(v || 512))} min={64} max={4096} style={{ width: '100%', marginTop: 8 }} /></Col>
                    <Col xs={12} md={6}><Text strong>دما:</Text><InputNumber value={parseFloat(local.temperature || '0.7')} onChange={(v) => update('temperature', String(v || 0.7))} min={0} max={2} step={0.1} style={{ width: '100%', marginTop: 8 }} /></Col>
                </Row>
                <Row gutter={16}>
                    <Col xs={24} md={12}><Text strong>محدودیت روزانه:</Text><InputNumber value={parseInt(local.daily_limit || '0')} onChange={(v) => update('daily_limit', String(v || 0))} min={0} max={10000} style={{ width: '100%', marginTop: 8 }} addonAfter="درخواست/روز" /></Col>
                </Row>
                {roleKey === 'admin' && (
                    <>
                        <div><Text strong>پرامپت ترجمه نام سرویس:</Text><TextArea rows={2} value={local.translate_prompt} onChange={(e) => update('translate_prompt', e.target.value)} placeholder="پرامپت ترجمه نام سرویس با هوش مصنوعی" style={{ marginTop: 8 }} /></div>
                        <div><Text strong>پرامپت تولید توضیحات سرویس:</Text><TextArea rows={2} value={local.description_prompt} onChange={(e) => update('description_prompt', e.target.value)} placeholder="پرامپت تولید توضیحات سرویس با هوش مصنوعی" style={{ marginTop: 8 }} /></div>
                    </>
                )}
                <Button type="primary" icon={<SaveOutlined />} loading={saving} onClick={handleSave} block>ذخیره {title}</Button>
            </Space>
        </Card>
    );
}

export function AISettings() {
    const [allSettings, setAllSettings] = useState<AllSettings>({ admin: { enabled: 'true', system_prompt: '', model: '@cf/meta/llama-4-scout-17b-16e-instruct', max_tokens: '1024', temperature: '0.7', daily_limit: '100', allowed_tables: '[]' }, user: { enabled: 'true', system_prompt: '', model: '@cf/meta/llama-4-scout-17b-16e-instruct', max_tokens: '512', temperature: '0.7', daily_limit: '20', allowed_tables: '[]' } });
    const [loading, setLoading] = useState(true);
    const [usageStats, setUsageStats] = useState<AiUsageStat[]>([]);
    const [testMessage, setTestMessage] = useState('');
    const [testResponse, setTestResponse] = useState('');
    const [testLoading, setTestLoading] = useState(false);
    const [testRole, setTestRole] = useState<'admin' | 'user'>('admin');

    useEffect(() => { fetchSettings(); fetchUsageStats(); }, []);

    async function fetchSettings() {
        setLoading(true);
        try {
            const data = await aiApi.getSettings();
            if (data.admin || data.user) setAllSettings({ admin: { enabled: data.admin?.enabled ?? 'true', system_prompt: data.admin?.system_prompt ?? '', model: data.admin?.model ?? '', max_tokens: data.admin?.max_tokens ?? '1024', temperature: data.admin?.temperature ?? '0.7', daily_limit: data.admin?.daily_limit ?? '100', allowed_tables: data.admin?.allowed_tables ?? '[]', translate_prompt: data.admin?.ai_admin_translate_prompt ?? '', description_prompt: data.admin?.ai_admin_description_prompt ?? '' }, user: { enabled: data.user?.enabled ?? 'true', system_prompt: data.user?.system_prompt ?? '', model: data.user?.model ?? '', max_tokens: data.user?.max_tokens ?? '512', temperature: data.user?.temperature ?? '0.7', daily_limit: data.user?.daily_limit ?? '20', allowed_tables: data.user?.allowed_tables ?? '[]' } });
        } catch { message.error('خطا'); } finally { setLoading(false); }
    }

    async function fetchUsageStats() { try { setUsageStats(await aiApi.getUsage()); } catch {} }

    async function handleSaveSettings(role: 'admin' | 'user', values: Record<string, string>) {
        const saveValues: Record<string, string> = { ...values };
        if (values.translate_prompt !== undefined) saveValues.ai_admin_translate_prompt = values.translate_prompt;
        if (values.description_prompt !== undefined) saveValues.ai_admin_description_prompt = values.description_prompt;
        await aiApi.updateSettings({ [role]: saveValues }); fetchSettings(); fetchUsageStats();
    }

    async function handleTestChat() {
        if (!testMessage.trim()) return message.error('پیام را وارد کنید');
        setTestLoading(true); setTestResponse('');
        try { const data = await aiApi.chat(testMessage, testRole); if (!data.ok) return message.error(data.error); setTestResponse(data.response); } catch { message.error('خطا'); } finally { setTestLoading(false); }
    }

    const usageColumns: ColumnsType<AiUsageStat> = [
        { title: 'نقش', dataIndex: 'user_role', render: (v) => <Tag color={v === 'admin' ? 'purple' : 'blue'}>{v === 'admin' ? 'مدیر' : 'کاربر'}</Tag> },
        { title: 'تاریخ', dataIndex: 'date' }, { title: 'درخواست‌ها', dataIndex: 'total_requests' },
        { title: 'توکن', dataIndex: 'total_tokens', render: (v) => v?.toLocaleString() },
    ];

    return (
        <div>
            <h2 style={{ marginBottom: 24 }}><Space><RobotOutlined /><span>تنظیمات هوش مصنوعی</span></Space></h2>
            {loading ? (
                <Row gutter={[24, 24]}>
                    {[1, 2].map((i) => (<Col xs={24} lg={12} key={i}><Card bordered={false} style={{ borderRadius: 12 }}><Skeleton active paragraph={{ rows: 6 }} /></Card></Col>))}
                    <Col xs={24}><Card bordered={false} style={{ borderRadius: 12 }}><Skeleton active paragraph={{ rows: 4 }} /></Card></Col>
                </Row>
            ) : (
                <Row gutter={[24, 24]}>
                    <Col xs={24} lg={12}><SettingsPanel title="هوش مصنوعی مدیر" icon={<SafetyOutlined style={{ color: '#722ed1' }} />} roleKey="admin" settings={allSettings.admin} onSave={handleSaveSettings} /></Col>
                    <Col xs={24} lg={12}><SettingsPanel title="هوش مصنوعی کاربر" icon={<ThunderboltOutlined style={{ color: '#1677ff' }} />} roleKey="user" settings={allSettings.user} onSave={handleSaveSettings} /></Col>
                    <Col xs={24}>
                        <Card title={<Space><SendOutlined /><span>تست هوش مصنوعی</span></Space>} bordered={false} style={{ borderRadius: 12 }}>
                            <Space direction="vertical" size="middle" style={{ width: '100%' }}>
                                <Space><Text strong>آزمایش با نقش:</Text><Select value={testRole} onChange={setTestRole} options={[{ value: 'admin', label: 'مدیر' }, { value: 'user', label: 'کاربر' }]} style={{ width: 120 }} /></Space>
                                <Space.Compact style={{ width: '100%' }}>
                                    <TextArea rows={2} value={testMessage} onChange={(e) => setTestMessage(e.target.value)} placeholder="پیام..." onPressEnter={(e) => { if (!e.shiftKey) { e.preventDefault(); handleTestChat(); } }} />
                                    <Button type="primary" icon={<SendOutlined />} loading={testLoading} onClick={handleTestChat}>ارسال</Button>
                                </Space.Compact>
                                {testResponse && <Card size="small" style={{ background: '#f6f8fa', marginTop: 8 }}><Text style={{ whiteSpace: 'pre-wrap' }}>{testResponse}</Text></Card>}
                            </Space>
                        </Card>
                    </Col>
                    <Col xs={24}>
                        <Card title={<Space><BarChartOutlined /><span>آمار استفاده</span></Space>} bordered={false} style={{ borderRadius: 12 }}>
                            {usageStats.length > 0 ? <Table dataSource={usageStats} columns={usageColumns} rowKey={(r) => `${r.user_role}-${r.date}`} pagination={{ pageSize: 10 }} size="small" /> : <Text type="secondary">هنوز آماری ثبت نشده.</Text>}
                        </Card>
                    </Col>
                </Row>
            )}
        </div>
    );
}
