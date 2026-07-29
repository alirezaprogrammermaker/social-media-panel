import { useEffect, useState } from 'react';
import { Table, Button, Input, Switch, Form, message, Skeleton } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { dashboardApi } from '../api';
import { PageHeader } from '../components/PageHeader';
import { DeleteButton } from '../components/DeleteButton';

interface BotChannel { id: number; channel_id: number; channel_username: string; channel_title: string; is_mandatory: number; created_at: string; }

export function BotChannels() {
    const [channels, setChannels] = useState<BotChannel[]>([]);
    const [loading, setLoading] = useState(true);
    const [adding, setAdding] = useState(false);
    const [form] = Form.useForm();

    async function fetchChannels() { setLoading(true); try { setChannels(await dashboardApi.getBotChannels()); } finally { setLoading(false); } }
    useEffect(() => { fetchChannels(); }, []);

    async function handleAdd() {
        try {
            const values = await form.validateFields(); setAdding(true);
            const data = await dashboardApi.createBotChannel(values.channel_username);
            if (!data.ok) return message.error(data.error);
            message.success('کانال اضافه شد'); form.resetFields(); fetchChannels();
        } catch {} finally { setAdding(false); }
    }

    async function handleToggleMandatory(id: number, checked: boolean) {
        const data = await dashboardApi.updateBotChannel(id, { is_mandatory: checked });
        if (!data.ok) return message.error(data.error);
        setChannels((prev) => prev.map((ch) => (ch.id === id ? { ...ch, is_mandatory: checked ? 1 : 0 } : ch)));
    }

    async function handleDelete(id: number) { await dashboardApi.deleteBotChannel(id); message.success('حذف شد'); setChannels((prev) => prev.filter((ch) => ch.id !== id)); }

    const columns: ColumnsType<BotChannel> = [
        { title: 'نام کانال', dataIndex: 'channel_title' },
        { title: 'نام کاربری', dataIndex: 'channel_username', render: (v) => `@${v}` },
        { title: 'الزامی', dataIndex: 'is_mandatory', width: 80, render: (val, record) => <Switch checked={val === 1} size="small" onChange={(checked) => handleToggleMandatory(record.id, checked)} /> },
        { title: '', width: 40, render: (_, record) => <DeleteButton onConfirm={() => handleDelete(record.id)} /> },
    ];

    return (
        <div>
            <PageHeader title="کانال‌های ربات" />
            <Form form={form} layout="inline" style={{ marginBottom: 16 }}>
                <Form.Item name="channel_username" rules={[{ required: true, message: 'نام کاربری الزامی' }]}><Input placeholder="@channel_username" style={{ width: 250 }} onPressEnter={handleAdd} /></Form.Item>
                <Form.Item><Button type="primary" icon={<PlusOutlined />} loading={adding} onClick={handleAdd}>افزودن</Button></Form.Item>
            </Form>
            {loading ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} active title={{ width: '100%' }} paragraph={{ rows: 1 }} style={{ borderRadius: 8, padding: 16, background: '#fff' }} />)}
                </div>
            ) : (
                <Table dataSource={channels} columns={columns} rowKey="id" loading={loading} pagination={false} />
            )}
        </div>
    );
}
