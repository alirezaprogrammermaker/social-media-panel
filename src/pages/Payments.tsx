import { useEffect, useState } from 'react';
import { Table, Button, Space, Tag, message, Popconfirm, Card, Row, Col, Statistic, Select, Modal, Input, Skeleton } from 'antd';
import { CheckOutlined, CloseOutlined, EyeOutlined, DeleteOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { dashboardApi } from '../api';
import { PageHeader } from '../components/PageHeader';

interface Payment { id: number; user_chat_id: number; user_username: string; amount: number; card_number: string; card_holder: string; receipt_image_url: string; status: string; admin_note: string; created_at: string; }
interface PaymentStats { total: number; pending: number; approved: number; rejected: number; totalAmount: number; approvedAmount: number; }

export function Payments() {
    const [payments, setPayments] = useState<Payment[]>([]);
    const [stats, setStats] = useState<PaymentStats | null>(null);
    const [loading, setLoading] = useState(true);
    const [statusFilter, setStatusFilter] = useState<string | undefined>(undefined);
    const [rejectModalOpen, setRejectModalOpen] = useState(false);
    const [selectedPayment, setSelectedPayment] = useState<Payment | null>(null);
    const [rejectReason, setRejectReason] = useState('');
    const [previewImage, setPreviewImage] = useState<string | null>(null);
    const [previewLoading, setPreviewLoading] = useState(false);

    async function fetchData() {
        setLoading(true);
        try {
            const [paymentsData, statsData] = await Promise.all([dashboardApi.getPayments(statusFilter), dashboardApi.getPaymentStats()]);
            setPayments(paymentsData); setStats(statsData);
        } finally { setLoading(false); }
    }

    useEffect(() => { fetchData(); }, [statusFilter]);

    async function handleApprove(id: number) {
        const data = await dashboardApi.approvePayment(id);
        if (!data.ok) return message.error(data.error);
        message.success('تایید شد'); fetchData();
    }

    async function handleReject() {
        if (!selectedPayment) return;
        const data = await dashboardApi.rejectPayment(selectedPayment.id, rejectReason || undefined);
        if (!data.ok) return message.error(data.error);
        message.success('رد شد'); setRejectModalOpen(false); setRejectReason(''); fetchData();
    }

    async function handleDelete(id: number) { await dashboardApi.deletePayment(id); message.success('حذف شد'); setPayments((prev) => prev.filter((p) => p.id !== id)); }

    const handlePreviewReceipt = (fileId: string) => {
        setPreviewLoading(true);
        setPreviewImage(`/api/dashboard/payments/receipt/${fileId}?t=${Date.now()}`);
    };

    const columns: ColumnsType<Payment> = [
        { title: 'شناسه', dataIndex: 'id', key: 'id', width: 60 },
        { title: 'کاربر', key: 'user', render: (_, r) => <span>{r.user_username ? `@${r.user_username}` : r.user_chat_id}</span> },
        { title: 'مبلغ', dataIndex: 'amount', key: 'amount', render: (v: number) => `${v?.toLocaleString()} تومان` },
        { title: 'کارت', key: 'card', render: (_, r) => <span style={{ direction: 'ltr' }}>{r.card_number}</span> },
        { title: 'وضعیت', dataIndex: 'status', key: 'status', render: (v: string) => <Tag color={v === 'pending' ? 'orange' : v === 'approved' ? 'green' : 'red'}>{v === 'pending' ? 'در انتظار' : v === 'approved' ? 'تایید شده' : 'رد شده'}</Tag> },
        { title: 'تاریخ', dataIndex: 'created_at', key: 'created_at', render: (v: string) => new Date(v).toLocaleString('fa-IR') },
        { title: 'عملیات', key: 'actions', render: (_, record) => (
            <Space>
                {record.receipt_image_url && <Button type="link" size="small" icon={<EyeOutlined />} onClick={() => handlePreviewReceipt(record.receipt_image_url)}>رسید</Button>}
                {record.status === 'pending' && <>
                    <Popconfirm title="تایید شود؟" onConfirm={() => handleApprove(record.id)}><Button type="link" size="small" icon={<CheckOutlined />}>تایید</Button></Popconfirm>
                    <Button type="link" size="small" danger icon={<CloseOutlined />} onClick={() => { setSelectedPayment(record); setRejectModalOpen(true); }}>رد</Button>
                </>}
                <Popconfirm title="حذف شود؟" onConfirm={() => handleDelete(record.id)}><Button type="link" size="small" danger icon={<DeleteOutlined />} /></Popconfirm>
            </Space>
        ) },
    ];

    return (
        <div>
            <PageHeader title="پرداخت‌ها" extra={<Select placeholder="فیلتر وضعیت" allowClear style={{ width: 150 }} onChange={(v) => setStatusFilter(v)}>
                <Select.Option value="pending">در انتظار</Select.Option><Select.Option value="approved">تایید شده</Select.Option><Select.Option value="rejected">رد شده</Select.Option>
            </Select>} />
            {loading ? (
                <>
                    <Row gutter={16} style={{ marginBottom: 24 }}>
                        {Array.from({ length: 4 }).map((_, i) => (<Col span={6} key={i}><Card><Skeleton active paragraph={{ rows: 1 }} /></Card></Col>))}
                    </Row>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                        {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} active title={{ width: '100%' }} paragraph={{ rows: 1 }} style={{ borderRadius: 8, padding: 16, background: '#fff' }} />)}
                    </div>
                </>
            ) : (
                <>
                    {stats && (
                        <Row gutter={16} style={{ marginBottom: 24 }}>
                            <Col span={6}><Card><Statistic title="کل" value={stats.total} /></Card></Col>
                            <Col span={6}><Card><Statistic title="در انتظار" value={stats.pending} valueStyle={{ color: '#faad14' }} /></Card></Col>
                            <Col span={6}><Card><Statistic title="تایید شده" value={stats.approved} valueStyle={{ color: '#52c41a' }} /></Card></Col>
                            <Col span={6}><Card><Statistic title="رد شده" value={stats.rejected} valueStyle={{ color: '#ff4d4f' }} /></Card></Col>
                        </Row>
                    )}
                    <Table dataSource={payments} columns={columns} rowKey="id" loading={loading} scroll={{ x: 1000 }} pagination={{ pageSize: 20 }} />
                </>
            )}
            <Modal title="رد پرداخت" open={rejectModalOpen} onOk={handleReject} onCancel={() => setRejectModalOpen(false)} okText="رد کردن" cancelText="لغو">
                <Input.TextArea rows={3} placeholder="دلیل رد (اختیاری)" value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} />
            </Modal>
            <Modal title="رسید پرداخت" open={!!previewImage} footer={null} onCancel={() => { setPreviewImage(null); setPreviewLoading(false); }}
                width={600} centered>
                {previewLoading && <div style={{ textAlign: 'center', padding: 40 }}><Skeleton active paragraph={{ rows: 4 }} /></div>}
                {previewImage && (
                    <img src={previewImage} alt="رسید پرداخت"
                        style={{ width: '100%', display: previewLoading ? 'none' : 'block' }}
                        onLoad={() => setPreviewLoading(false)}
                        onError={() => { setPreviewLoading(false); message.error('خطا در بارگذاری تصویر'); }}
                    />
                )}
            </Modal>
        </div>
    );
}
