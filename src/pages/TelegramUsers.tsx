import { useEffect, useState } from 'react';
import { Table, Button, Space, Tag, message, Popconfirm, Modal, Input, Select, Card, Row, Col, Statistic, Skeleton } from 'antd';
import { DeleteOutlined, StopOutlined, CheckCircleOutlined, SendOutlined, UserOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { dashboardApi } from '../api';
import { PageHeader } from '../components/PageHeader';

interface TelegramUser { id: number; chat_id: number; username: string; first_name: string; role: string; blocked: number; balance: number; created_at: string; }
interface UserStats { total: number; today: number; yesterday: number; thisWeek: number; thisMonth: number; }

export function TelegramUsers() {
    const [users, setUsers] = useState<TelegramUser[]>([]);
    const [stats, setStats] = useState<UserStats | null>(null);
    const [loading, setLoading] = useState(true);
    const [selectedUser, setSelectedUser] = useState<TelegramUser | null>(null);
    const [blockModalOpen, setBlockModalOpen] = useState(false);
    const [blockReason, setBlockReason] = useState('');
    const [blockDuration, setBlockDuration] = useState<number | null>(null);
    const [messageModalOpen, setMessageModalOpen] = useState(false);
    const [messageText, setMessageText] = useState('');

    async function fetchUsers() {
        setLoading(true);
        try {
            const [usersData, statsData] = await Promise.all([dashboardApi.getTelegramUsers(), dashboardApi.getStats()]);
            setUsers(usersData); setStats(statsData);
        } finally { setLoading(false); }
    }

    useEffect(() => { fetchUsers(); }, []);

    async function handleDelete(chatId: number) { await dashboardApi.deleteTelegramUser(chatId); message.success('حذف شد'); setUsers((prev) => prev.filter((u) => u.chat_id !== chatId)); }

    async function handleRoleChange(chatId: number, role: string) {
        const data = await dashboardApi.updateTelegramUserRole(chatId, role);
        if (!data.ok) return message.error(data.error);
        message.success('نقش بروزرسانی شد');
        setUsers((prev) => prev.map((u) => (u.chat_id === chatId ? { ...u, role } : u)));
    }

    async function handleBlock() {
        if (!selectedUser) return;
        const data = await dashboardApi.blockTelegramUser(selectedUser.chat_id, blockReason || undefined, blockDuration || undefined);
        if (!data.ok) return message.error(data.error);
        message.success('کاربر مسدود شد'); setBlockModalOpen(false); setBlockReason(''); setBlockDuration(null); fetchUsers();
    }

    async function handleUnblock(chatId: number) {
        const data = await dashboardApi.unblockTelegramUser(chatId);
        if (!data.ok) return message.error(data.error);
        message.success('رفع مسدودیت شد'); fetchUsers();
    }

    async function handleSendMessage() {
        if (!selectedUser || !messageText.trim()) return;
        const data = await dashboardApi.sendTelegramMessage(selectedUser.chat_id, messageText);
        if (!data.ok) return message.error(data.error);
        message.success('پیام ارسال شد'); setMessageModalOpen(false); setMessageText('');
    }

    const columns: ColumnsType<TelegramUser> = [
        { title: 'شناسه', dataIndex: 'chat_id', key: 'chat_id', width: 100 },
        { title: 'نام کاربری', dataIndex: 'username', key: 'username', render: (v: string) => v ? `@${v}` : '-' },
        { title: 'نام', dataIndex: 'first_name', key: 'first_name' },
        { title: 'نقش', dataIndex: 'role', key: 'role', render: (role: string) => <Tag color={role === 'admin' ? 'red' : 'blue'}>{role === 'admin' ? 'مدیر' : 'کاربر'}</Tag> },
        { title: 'موجودی', dataIndex: 'balance', key: 'balance', render: (v: number) => `${(v || 0).toLocaleString()} تومان` },
        { title: 'وضعیت', dataIndex: 'blocked', key: 'blocked', render: (v: number) => <Tag color={v ? 'red' : 'green'}>{v ? 'مسدود' : 'فعال'}</Tag> },
        { title: 'تاریخ', dataIndex: 'created_at', key: 'created_at', render: (v: string) => new Date(v).toLocaleDateString('fa-IR') },
        { title: 'عملیات', key: 'actions', render: (_, record) => (
            <Space>
                <Select size="small" value={record.role} onChange={(v) => handleRoleChange(record.chat_id, v)} style={{ width: 90 }}>
                    <Select.Option value="user">کاربر</Select.Option><Select.Option value="admin">مدیر</Select.Option>
                </Select>
                {record.blocked ? (
                    <Button type="link" size="small" icon={<CheckCircleOutlined />} onClick={() => handleUnblock(record.chat_id)}>رفع مسدودیت</Button>
                ) : (
                    <Button type="link" size="small" danger icon={<StopOutlined />} onClick={() => { setSelectedUser(record); setBlockModalOpen(true); }}>مسدود</Button>
                )}
                <Button type="link" size="small" icon={<SendOutlined />} onClick={() => { setSelectedUser(record); setMessageModalOpen(true); }}>پیام</Button>
                <Popconfirm title="آیا مطمئن هستید؟" onConfirm={() => handleDelete(record.chat_id)}>
                    <Button type="link" size="small" danger icon={<DeleteOutlined />} />
                </Popconfirm>
            </Space>
        ) },
    ];

    return (
        <div>
            <PageHeader title="کاربران تلگرام" />
            {loading ? (
                <Row gutter={16} style={{ marginBottom: 24 }}>
                    {Array.from({ length: 5 }).map((_, i) => (<Col span={4} key={i}><Card><Skeleton active paragraph={{ rows: 1 }} /></Card></Col>))}
                </Row>
            ) : stats && (
                <Row gutter={16} style={{ marginBottom: 24 }}>
                    <Col span={4}><Card><Statistic title="کل" value={stats.total} prefix={<UserOutlined />} /></Card></Col>
                    <Col span={4}><Card><Statistic title="امروز" value={stats.today} valueStyle={{ color: '#10b981' }} /></Card></Col>
                    <Col span={4}><Card><Statistic title="دیروز" value={stats.yesterday} /></Card></Col>
                    <Col span={4}><Card><Statistic title="این هفته" value={stats.thisWeek} /></Card></Col>
                    <Col span={4}><Card><Statistic title="این ماه" value={stats.thisMonth} /></Card></Col>
                </Row>
            )}
            {loading ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} active title={{ width: '100%' }} paragraph={{ rows: 1 }} style={{ borderRadius: 8, padding: 16, background: '#fff' }} />)}
                </div>
            ) : (
                <Table dataSource={users} columns={columns} rowKey="id" loading={loading} scroll={{ x: 1000 }} pagination={{ pageSize: 20 }} />
            )}
            <Modal title="مسدود کردن کاربر" open={blockModalOpen} onOk={handleBlock} onCancel={() => setBlockModalOpen(false)} okText="مسدود کردن" cancelText="لغو">
                <Input placeholder="دلیل مسدودیت (اختیاری)" value={blockReason} onChange={(e) => setBlockReason(e.target.value)} style={{ marginBottom: 12 }} />
                <Input type="number" placeholder="مدت مسدودیت به دقیقه (اختیاری)" value={blockDuration ?? ''} onChange={(e) => setBlockDuration(e.target.value ? Number(e.target.value) : null)} />
            </Modal>
            <Modal title={`ارسال پیام به ${selectedUser?.username || selectedUser?.first_name || ''}`} open={messageModalOpen} onOk={handleSendMessage} onCancel={() => setMessageModalOpen(false)} okText="ارسال" cancelText="لغو">
                <Input.TextArea rows={4} placeholder="متن پیام" value={messageText} onChange={(e) => setMessageText(e.target.value)} />
            </Modal>
        </div>
    );
}
