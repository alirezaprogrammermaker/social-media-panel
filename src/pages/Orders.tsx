import { useState, useEffect } from 'react';
import { Table, Button, Space, Tag, message, Popconfirm, Card, Row, Col, Statistic, Select, Dropdown, Skeleton } from 'antd';
import { SyncOutlined, StopOutlined, EditOutlined, CheckCircleOutlined, ClockCircleOutlined, CloseCircleOutlined, HourglassOutlined, LoadingOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { smmApi } from '../api';

interface Order { id: number; user_chat_id: number; user_username: string; service_id: number; service_name: string; provider_name: string; link: string; quantity: number; status: string; api_provider_order_id: number; charge: string; start_count: string; remains: string; currency: string; error_message: string; created_at: string; }
interface OrderStats { total: number; pending: number; in_progress: number; completed: number; partial: number; processing: number; canceled: number; }
const statusColors: Record<string, string> = { 'Pending': 'orange', 'In progress': 'blue', 'Completed': 'green', 'Partial': 'purple', 'Processing': 'cyan', 'Canceled': 'red' };
const statusLabels: Record<string, string> = { 'Pending': 'در انتظار', 'In progress': 'در حال انجام', 'Completed': 'تکمیل شده', 'Partial': 'جزئی', 'Processing': 'پردازش', 'Canceled': 'لغو شده' };

export default function Orders() {
    const [orders, setOrders] = useState<Order[]>([]);
    const [stats, setStats] = useState<OrderStats | null>(null);
    const [loading, setLoading] = useState(false);
    const [checking, setChecking] = useState(false);
    const [statusFilter, setStatusFilter] = useState<string | undefined>(undefined);

    const fetchData = async () => {
        setLoading(true);
        try {
            const [ordersData, statsData] = await Promise.all([smmApi.getOrders(statusFilter), smmApi.getOrderStats()]);
            setOrders(ordersData); setStats(statsData);
        } catch { message.error('خطا در دریافت اطلاعات'); }
        setLoading(false);
    };

    useEffect(() => { fetchData(); }, [statusFilter]);

    const handleCheckStatus = async () => {
        setChecking(true);
        try {
            const data = await smmApi.checkOrderStatuses();
            if (data.ok) { message.success(`بررسی شد: ${data.checked} سفارش، ${data.updated} بروزرسانی`); if (data.errors?.length > 0) message.warning(`${data.errors.length} خطا رخ داد`); fetchData(); }
            else message.error(data.error || 'خطا در بررسی وضعیت');
        } catch { message.error('خطا در بررسی وضعیت'); }
        setChecking(false);
    };

    const handleCancel = async (id: number) => {
        try { const data = await smmApi.cancelOrder(id); if (data.ok) { message.success('سفارش لغو شد'); fetchData(); } else message.error(data.error || 'خطا در لغو'); } catch { message.error('خطا در لغو'); }
    };

    const handleStatusChange = async (id: number, newStatus: string) => {
        try { const data = await smmApi.updateOrderStatus(id, newStatus); if (data.ok) { message.success('وضعیت بروزرسانی شد'); fetchData(); } else message.error(data.error || 'خطا'); } catch { message.error('خطا'); }
    };

    const columns: ColumnsType<Order> = [
        { title: 'شناسه', dataIndex: 'id', key: 'id', width: 80 },
        { title: 'کاربر', key: 'user', render: (_, r) => <span>{r.user_username || r.user_chat_id}</span> },
        { title: 'سرویس', dataIndex: 'service_name', key: 'service_name' },
        { title: 'لینک', dataIndex: 'link', key: 'link', ellipsis: true, width: 200 },
        { title: 'تعداد', dataIndex: 'quantity', key: 'quantity', width: 80 },
        { title: 'وضعیت', dataIndex: 'status', key: 'status', render: (s: string) => <Tag color={statusColors[s]}>{statusLabels[s] || s}</Tag> },
        { title: 'هزینه', key: 'charge', render: (_, r) => r.charge ? `${r.charge} ${r.currency || ''}` : '-' },
        { title: 'تاریخ', dataIndex: 'created_at', key: 'created_at', render: (d: string) => new Date(d).toLocaleString('fa-IR') },
        { title: 'عملیات', key: 'actions', width: 200, render: (_, record) => (
            <Space>
                <Dropdown menu={{ items: [
                    { key: 'Pending', label: 'در انتظار', icon: <ClockCircleOutlined />, disabled: record.status === 'Pending' },
                    { key: 'In progress', label: 'در حال انجام', icon: <LoadingOutlined />, disabled: record.status === 'In progress' },
                    { key: 'Processing', label: 'پردازش', icon: <HourglassOutlined />, disabled: record.status === 'Processing' },
                    { key: 'Completed', label: 'تکمیل شده', icon: <CheckCircleOutlined />, disabled: record.status === 'Completed' },
                    { key: 'Partial', label: 'جزئی', icon: <EditOutlined />, disabled: record.status === 'Partial' },
                    { key: 'Canceled', label: 'لغو شده', icon: <CloseCircleOutlined />, disabled: record.status === 'Canceled' },
                ], onClick: ({ key }) => handleStatusChange(record.id, key) }}>
                    <Button type="link" size="small" icon={<EditOutlined />}>تغییر وضعیت</Button>
                </Dropdown>
                {!['Completed', 'Canceled'].includes(record.status) && <Popconfirm title="آیا مطمئن هستید؟" onConfirm={() => handleCancel(record.id)}><Button type="link" size="small" danger icon={<StopOutlined />}>لغو</Button></Popconfirm>}
            </Space>
        ) },
    ];

    return (
        <div>
            <h2 style={{ marginBottom: 16 }}>سفارشات</h2>
            {loading ? (
                <Row gutter={16} style={{ marginBottom: 24 }}>
                    {Array.from({ length: 6 }).map((_, i) => (<Col span={4} key={i}><Card><Skeleton active paragraph={{ rows: 1 }} /></Card></Col>))}
                </Row>
            ) : stats && (
                <Row gutter={16} style={{ marginBottom: 24 }}>
                    <Col span={4}><Card><Statistic title="کل" value={stats.total} /></Card></Col>
                    <Col span={4}><Card><Statistic title="در انتظار" value={stats.pending} valueStyle={{ color: '#faad14' }} /></Card></Col>
                    <Col span={4}><Card><Statistic title="در حال انجام" value={stats.in_progress} valueStyle={{ color: '#1677ff' }} /></Card></Col>
                    <Col span={4}><Card><Statistic title="تکمیل شده" value={stats.completed} valueStyle={{ color: '#52c41a' }} /></Card></Col>
                    <Col span={4}><Card><Statistic title="جزئی" value={stats.partial} valueStyle={{ color: '#722ed1' }} /></Card></Col>
                    <Col span={4}><Card><Statistic title="لغو شده" value={stats.canceled} valueStyle={{ color: '#ff4d4f' }} /></Card></Col>
                </Row>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
                <Space><Select placeholder="فیلتر بر اساس وضعیت" allowClear style={{ width: 200 }} onChange={(v) => setStatusFilter(v)}>
                    <Select.Option value="Pending">در انتظار</Select.Option><Select.Option value="In progress">در حال انجام</Select.Option>
                    <Select.Option value="Completed">تکمیل شده</Select.Option><Select.Option value="Partial">جزئی</Select.Option>
                    <Select.Option value="Processing">پردازش</Select.Option><Select.Option value="Canceled">لغو شده</Select.Option>
                </Select></Space>
                <Button type="primary" icon={<SyncOutlined />} loading={checking} onClick={handleCheckStatus}>بررسی وضعیت سفارشات</Button>
            </div>
            {loading ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} active title={{ width: '100%' }} paragraph={{ rows: 1 }} style={{ borderRadius: 8, padding: 16, background: '#fff' }} />)}
                </div>
            ) : (
                <Table columns={columns} dataSource={orders} rowKey="id" loading={loading} scroll={{ x: 1200 }} />
            )}
        </div>
    );
}
