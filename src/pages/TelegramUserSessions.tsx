import { useEffect, useState } from 'react';
import { Table, Button, Space, Tag, message, Select, Popconfirm, Skeleton } from 'antd';
import { DeleteOutlined, StopOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { dashboardApi } from '../api';
import { PageHeader } from '../components/PageHeader';

interface Session { id: number; telegram_user_id: number; flow: string; step: string; data: string; status: string; created_at: string; updated_at: string; chat_id: number; username: string; first_name: string; }

export function TelegramUserSessions() {
    const [sessions, setSessions] = useState<Session[]>([]);
    const [loading, setLoading] = useState(true);
    const [statusFilter, setStatusFilter] = useState<string | undefined>(undefined);

    async function fetchSessions() {
        setLoading(true);
        try { setSessions(await dashboardApi.getTelegramSessions(statusFilter)); } finally { setLoading(false); }
    }

    useEffect(() => { fetchSessions(); }, [statusFilter]);

    async function handleDelete(id: number) { await dashboardApi.deleteTelegramSession(id); message.success('حذف شد'); setSessions((prev) => prev.filter((s) => s.id !== id)); }

    async function handleCancel(id: number) { const data = await dashboardApi.cancelTelegramSession(id); if (!data.ok) return message.error(data.error); message.success('لغو شد'); fetchSessions(); }

    const columns: ColumnsType<Session> = [
        { title: 'شناسه', dataIndex: 'id', key: 'id', width: 60 },
        { title: 'کاربر', key: 'user', render: (_, r) => <span>{r.username ? `@${r.username}` : r.first_name || r.chat_id}</span> },
        { title: 'جریان', dataIndex: 'flow', key: 'flow' },
        { title: 'مرحله', dataIndex: 'step', key: 'step' },
        { title: 'وضعیت', dataIndex: 'status', key: 'status', render: (v: string) => <Tag color={v === 'active' ? 'green' : v === 'completed' ? 'blue' : 'red'}>{v === 'active' ? 'فعال' : v === 'completed' ? 'تکمیل' : 'لغو شده'}</Tag> },
        { title: 'تاریخ', dataIndex: 'created_at', key: 'created_at', render: (v: string) => new Date(v).toLocaleString('fa-IR') },
        { title: 'عملیات', key: 'actions', render: (_, record) => (
            <Space>
                {record.status === 'active' && <Popconfirm title="لغو شود؟" onConfirm={() => handleCancel(record.id)}><Button type="link" size="small" danger icon={<StopOutlined />}>لغو</Button></Popconfirm>}
                <Popconfirm title="حذف شود؟" onConfirm={() => handleDelete(record.id)}><Button type="link" size="small" danger icon={<DeleteOutlined />} /></Popconfirm>
            </Space>
        ) },
    ];

    return (
        <div>
            <PageHeader title="نشست‌های تلگرام" extra={<Select placeholder="فیلتر وضعیت" allowClear style={{ width: 150 }} onChange={(v) => setStatusFilter(v)}>
                <Select.Option value="active">فعال</Select.Option><Select.Option value="completed">تکمیل</Select.Option><Select.Option value="cancelled">لغو شده</Select.Option>
            </Select>} />
            {loading ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} active title={{ width: '100%' }} paragraph={{ rows: 1 }} style={{ borderRadius: 8, padding: 16, background: '#fff' }} />)}
                </div>
            ) : (
                <Table dataSource={sessions} columns={columns} rowKey="id" loading={loading} scroll={{ x: 900 }} pagination={{ pageSize: 20 }} />
            )}
        </div>
    );
}
