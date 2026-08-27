import { useEffect, useState } from 'react';
import { Table, Button, Space, Tag, message, Popconfirm, Card, Row, Col, Statistic, Select, Modal, Input, Skeleton, Typography, Descriptions } from 'antd';
import { CheckOutlined, CloseOutlined, EyeOutlined, DeleteOutlined, ReloadOutlined, LinkOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { dashboardApi } from '../api';
import { PageHeader } from '../components/PageHeader';

interface Payment {
    id: number;
    user_chat_id: number;
    user_username: string;
    amount: number;
    card_number: string;
    card_holder: string;
    receipt_image_url: string;
    status: string;
    admin_note: string;
    created_at: string;
    payment_type?: string;
    gateway_payment_id?: string;
    network_id?: string;
    wallet_address?: string;
    crypto_amount?: number;
    crypto_amount_formatted?: string;
    checkout_url?: string;
    expires_at?: string;
    tx_hash?: string;
    confirmations?: number;
    crypto_status?: string;
    fiat_currency?: string;
}

interface PaymentStats { total: number; pending: number; approved: number; rejected: number; totalAmount: number; approvedAmount: number; }

function statusTag(status: string) {
    const map: Record<string, { color: string; label: string }> = {
        pending: { color: 'orange', label: 'در انتظار' },
        approved: { color: 'green', label: 'تایید شده' },
        rejected: { color: 'red', label: 'رد شده' },
        expired: { color: 'default', label: 'منقضی' },
        failed: { color: 'red', label: 'ناموفق' },
    };
    const m = map[status] || { color: 'default', label: status };
    return <Tag color={m.color}>{m.label}</Tag>;
}

function cryptoStatusTag(status?: string) {
    if (!status) return null;
    const map: Record<string, string> = {
        pending: 'orange',
        confirming: 'blue',
        confirmed: 'green',
        expired: 'default',
        failed: 'red',
        refunded: 'purple',
    };
    return <Tag color={map[status] || 'default'}>{status}</Tag>;
}

export function Payments() {
    const [payments, setPayments] = useState<Payment[]>([]);
    const [stats, setStats] = useState<PaymentStats | null>(null);
    const [loading, setLoading] = useState(true);
    const [statusFilter, setStatusFilter] = useState<string | undefined>(undefined);
    const [typeFilter, setTypeFilter] = useState<string | undefined>(undefined);
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(20);
    const [total, setTotal] = useState(0);
    const [rejectModalOpen, setRejectModalOpen] = useState(false);
    const [selectedPayment, setSelectedPayment] = useState<Payment | null>(null);
    const [rejectReason, setRejectReason] = useState('');
    const [previewImage, setPreviewImage] = useState<string | null>(null);
    const [previewLoading, setPreviewLoading] = useState(false);
    const [detailPayment, setDetailPayment] = useState<Payment | null>(null);
    const [refreshingId, setRefreshingId] = useState<number | null>(null);

    async function fetchData() {
        setLoading(true);
        try {
            const [paymentsData, statsData] = await Promise.all([
                dashboardApi.getPayments(statusFilter, typeFilter, page, pageSize),
                dashboardApi.getPaymentStats(),
            ]);
            setPayments(paymentsData.data);
            setTotal(paymentsData.total);
            setStats(statsData);
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => { setPage(1); }, [statusFilter, typeFilter]);
    useEffect(() => { fetchData(); }, [statusFilter, typeFilter, page, pageSize]);

    async function handleApprove(id: number) {
        const data = await dashboardApi.approvePayment(id);
        if (!data.ok) return message.error(data.error);
        message.success('تایید شد');
        fetchData();
    }

    async function handleReject() {
        if (!selectedPayment) return;
        const data = await dashboardApi.rejectPayment(selectedPayment.id, rejectReason || undefined);
        if (!data.ok) return message.error(data.error);
        message.success('رد شد');
        setRejectModalOpen(false);
        setRejectReason('');
        fetchData();
    }

    async function handleDelete(id: number) {
        await dashboardApi.deletePayment(id);
        message.success('حذف شد');
        setPayments((prev) => prev.filter((p) => p.id !== id));
    }

    async function handleRefreshCrypto(id: number) {
        setRefreshingId(id);
        try {
            const data = await dashboardApi.refreshCryptoPayment(id);
            if (!data.ok) return message.error(data.error || 'خطا');
            message.success('وضعیت از درگاه بروزرسانی شد');
            if (data.payment) {
                setPayments((prev) => prev.map((p) => (p.id === id ? { ...p, ...data.payment } : p)));
                if (detailPayment?.id === id) setDetailPayment({ ...detailPayment, ...data.payment });
            } else {
                fetchData();
            }
        } catch (e: any) {
            message.error(e?.message || 'خطا در بروزرسانی');
        } finally {
            setRefreshingId(null);
        }
    }

    const handlePreviewReceipt = (fileId: string) => {
        setPreviewLoading(true);
        setPreviewImage(`/api/dashboard/payments/receipt/${fileId}?t=${Date.now()}`);
    };

    const columns: ColumnsType<Payment> = [
        { title: 'شناسه', dataIndex: 'id', key: 'id', width: 60 },
        {
            title: 'نوع',
            key: 'type',
            width: 90,
            render: (_, r) =>
                r.payment_type === 'crypto' ? <Tag color="blue">کریپتو</Tag> : <Tag>کارت</Tag>,
        },
        { title: 'کاربر', key: 'user', render: (_, r) => <span>{r.user_username ? `@${r.user_username}` : r.user_chat_id}</span> },
        { title: 'مبلغ', dataIndex: 'amount', key: 'amount', render: (v: number) => `${v?.toLocaleString()} تومان` },
        {
            title: 'جزئیات',
            key: 'details',
            render: (_, r) =>
                r.payment_type === 'crypto' ? (
                    <span style={{ direction: 'ltr', fontSize: 12 }}>
                        {r.network_id || '-'}
                        {r.crypto_amount_formatted ? ` · ${r.crypto_amount_formatted}` : ''}
                    </span>
                ) : (
                    <span style={{ direction: 'ltr' }}>{r.card_number}</span>
                ),
        },
        {
            title: 'وضعیت',
            key: 'status',
            render: (_, r) => (
                <Space size={4}>
                    {statusTag(r.status)}
                    {r.payment_type === 'crypto' && cryptoStatusTag(r.crypto_status || undefined)}
                </Space>
            ),
        },
        { title: 'تاریخ', dataIndex: 'created_at', key: 'created_at', render: (v: string) => new Date(v).toLocaleString('fa-IR') },
        {
            title: 'عملیات',
            key: 'actions',
            render: (_, record) => (
                <Space wrap>
                    {record.payment_type === 'crypto' && (
                        <>
                            <Button type="link" size="small" onClick={() => setDetailPayment(record)}>جزئیات</Button>
                            <Button
                                type="link"
                                size="small"
                                icon={<ReloadOutlined />}
                                loading={refreshingId === record.id}
                                onClick={() => handleRefreshCrypto(record.id)}
                            >
                                بروزرسانی
                            </Button>
                        </>
                    )}
                    {record.receipt_image_url && record.payment_type !== 'crypto' && (
                        <Button type="link" size="small" icon={<EyeOutlined />} onClick={() => handlePreviewReceipt(record.receipt_image_url)}>رسید</Button>
                    )}
                    {record.status === 'pending' && (
                        <>
                            <Popconfirm title="تایید شود؟" onConfirm={() => handleApprove(record.id)}>
                                <Button type="link" size="small" icon={<CheckOutlined />}>تایید</Button>
                            </Popconfirm>
                            <Button
                                type="link"
                                size="small"
                                danger
                                icon={<CloseOutlined />}
                                onClick={() => { setSelectedPayment(record); setRejectModalOpen(true); }}
                            >
                                رد
                            </Button>
                        </>
                    )}
                    <Popconfirm title="حذف شود؟" onConfirm={() => handleDelete(record.id)}>
                        <Button type="link" size="small" danger icon={<DeleteOutlined />} />
                    </Popconfirm>
                </Space>
            ),
        },
    ];

    return (
        <div>
            <PageHeader
                title="پرداخت‌ها"
                extra={
                    <Space>
                        <Select
                            placeholder="نوع پرداخت"
                            allowClear
                            style={{ width: 140 }}
                            onChange={(v) => setTypeFilter(v)}
                        >
                            <Select.Option value="crypto">کریپتو</Select.Option>
                            <Select.Option value="card">کارت</Select.Option>
                        </Select>
                        <Select
                            placeholder="فیلتر وضعیت"
                            allowClear
                            style={{ width: 150 }}
                            onChange={(v) => setStatusFilter(v)}
                        >
                            <Select.Option value="pending">در انتظار</Select.Option>
                            <Select.Option value="approved">تایید شده</Select.Option>
                            <Select.Option value="rejected">رد شده</Select.Option>
                            <Select.Option value="expired">منقضی</Select.Option>
                            <Select.Option value="failed">ناموفق</Select.Option>
                        </Select>
                    </Space>
                }
            />
            {loading ? (
                <>
                    <Row gutter={16} style={{ marginBottom: 24 }}>
                        {Array.from({ length: 4 }).map((_, i) => (
                            <Col span={6} key={i}><Card><Skeleton active paragraph={{ rows: 1 }} /></Card></Col>
                        ))}
                    </Row>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                        {Array.from({ length: 5 }).map((_, i) => (
                            <Skeleton key={i} active title={{ width: '100%' }} paragraph={{ rows: 1 }} style={{ borderRadius: 8, padding: 16, background: '#fff' }} />
                        ))}
                    </div>
                </>
            ) : (
                <>
                    {stats && (
                        <Row gutter={16} style={{ marginBottom: 24 }}>
                            <Col span={6}><Card><Statistic title="کل" value={stats.total} /></Card></Col>
                            <Col span={6}><Card><Statistic title="در انتظار" value={stats.pending} valueStyle={{ color: '#faad14' }} /></Card></Col>
                            <Col span={6}><Card><Statistic title="تایید شده" value={stats.approved} valueStyle={{ color: '#52c41a' }} /></Card></Col>
                            <Col span={6}><Card><Statistic title="رد / منقضی" value={stats.rejected} valueStyle={{ color: '#ff4d4f' }} /></Card></Col>
                        </Row>
                    )}
                    <Table
                        dataSource={payments}
                        columns={columns}
                        rowKey="id"
                        loading={loading}
                        scroll={{ x: 1100 }}
                        pagination={{
                            current: page,
                            pageSize,
                            total,
                            showSizeChanger: true,
                            showTotal: (t) => `${t} مورد`,
                            onChange: (p, ps) => {
                                setPage(p);
                                setPageSize(ps);
                            },
                        }}
                    />
                </>
            )}
            <Modal title="رد پرداخت" open={rejectModalOpen} onOk={handleReject} onCancel={() => setRejectModalOpen(false)} okText="رد کردن" cancelText="لغو">
                <Input.TextArea rows={3} placeholder="دلیل رد (اختیاری)" value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} />
            </Modal>
            <Modal
                title="رسید پرداخت"
                open={!!previewImage}
                footer={null}
                onCancel={() => { setPreviewImage(null); setPreviewLoading(false); }}
                width={600}
                centered
            >
                {previewLoading && <div style={{ textAlign: 'center', padding: 40 }}><Skeleton active paragraph={{ rows: 4 }} /></div>}
                {previewImage && (
                    <img
                        src={previewImage}
                        alt="رسید پرداخت"
                        style={{ width: '100%', display: previewLoading ? 'none' : 'block' }}
                        onLoad={() => setPreviewLoading(false)}
                        onError={() => { setPreviewLoading(false); message.error('خطا در بارگذاری تصویر'); }}
                    />
                )}
            </Modal>
            <Modal
                title="جزئیات پرداخت کریپتو"
                open={!!detailPayment}
                onCancel={() => setDetailPayment(null)}
                footer={[
                    detailPayment && (
                        <Button
                            key="refresh"
                            icon={<ReloadOutlined />}
                            loading={refreshingId === detailPayment.id}
                            onClick={() => handleRefreshCrypto(detailPayment.id)}
                        >
                            بروزرسانی از درگاه
                        </Button>
                    ),
                    <Button key="close" onClick={() => setDetailPayment(null)}>بستن</Button>,
                ]}
                width={640}
            >
                {detailPayment && (
                    <Descriptions column={1} size="small" bordered>
                        <Descriptions.Item label="شناسه محلی">{detailPayment.id}</Descriptions.Item>
                        <Descriptions.Item label="Gateway Payment ID">
                            <Typography.Text copyable style={{ direction: 'ltr' }}>
                                {detailPayment.gateway_payment_id || '-'}
                            </Typography.Text>
                        </Descriptions.Item>
                        <Descriptions.Item label="وضعیت">{statusTag(detailPayment.status)} {cryptoStatusTag(detailPayment.crypto_status)}</Descriptions.Item>
                        <Descriptions.Item label="شبکه">{detailPayment.network_id || '-'}</Descriptions.Item>
                        <Descriptions.Item label="آدرس واریز">
                            <Typography.Text copyable style={{ direction: 'ltr', fontSize: 12 }}>
                                {detailPayment.wallet_address || '-'}
                            </Typography.Text>
                        </Descriptions.Item>
                        <Descriptions.Item label="مبلغ کریپتو">
                            {detailPayment.crypto_amount_formatted || detailPayment.crypto_amount || '-'}
                        </Descriptions.Item>
                        <Descriptions.Item label="مبلغ تومان">{detailPayment.amount?.toLocaleString()} تومان</Descriptions.Item>
                        <Descriptions.Item label="Tx Hash">
                            <Typography.Text copyable={!!detailPayment.tx_hash} style={{ direction: 'ltr', fontSize: 12 }}>
                                {detailPayment.tx_hash || '-'}
                            </Typography.Text>
                        </Descriptions.Item>
                        <Descriptions.Item label="Confirmations">{detailPayment.confirmations ?? 0}</Descriptions.Item>
                        <Descriptions.Item label="Checkout">
                            {detailPayment.checkout_url ? (
                                <a href={detailPayment.checkout_url} target="_blank" rel="noreferrer">
                                    <LinkOutlined /> باز کردن
                                </a>
                            ) : '-'}
                        </Descriptions.Item>
                        <Descriptions.Item label="انقضا">
                            {detailPayment.expires_at ? new Date(detailPayment.expires_at).toLocaleString('fa-IR') : '-'}
                        </Descriptions.Item>
                    </Descriptions>
                )}
            </Modal>
        </div>
    );
}
