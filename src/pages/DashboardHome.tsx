import { useEffect, useState } from 'react';
import { Row, Col, Card, Statistic, Table, Tag, Space, Typography, Divider, Skeleton, Spin } from 'antd';
import {
    TeamOutlined,
    CalendarOutlined,
    ApiOutlined,
    OrderedListOutlined,
    DollarOutlined,
    CheckCircleOutlined,
    ClockCircleOutlined,
    SyncOutlined,
    CloseCircleOutlined,
    ShoppingCartOutlined,
    UserOutlined,
    RobotOutlined,
    ThunderboltOutlined,
    WalletOutlined,
    SafetyOutlined,
    BarChartOutlined,
    RiseOutlined,
    MinusCircleOutlined,
    MessageOutlined,
    FileTextOutlined,
    LockOutlined,
} from '@ant-design/icons';
import { Line, Pie } from '@ant-design/charts';
import type { ColumnsType } from 'antd/es/table';

const { Text } = Typography;

// --- Interfaces ---

interface DashboardSummary {
    users: {
        total: number;
        today: number;
        yesterday: number;
        thisWeek: number;
        thisMonth: number;
    };
    payments: {
        total: number;
        pending: number;
        approved: number;
        rejected: number;
        totalAmount: number;
        approvedAmount: number;
    };
    bot: {
        hasToken: boolean;
        botInfo: any;
        totalChannels: number;
        mandatoryChannels: number;
        totalHelps: number;
    };
    ai: {
        adminTodayTokens: number;
        adminTodayRequests: number;
        userTodayTokens: number;
        userTodayRequests: number;
    };
}

interface OrderStats {
    total: number;
    pending: number;
    in_progress: number;
    completed: number;
    partial: number;
    processing: number;
    canceled: number;
}

interface RevenueStats {
    total_revenue: number;
    today_revenue: number;
    today_orders: number;
    yesterday_orders: number;
}

interface ServiceStats {
    total: number;
    active: number;
    linked: number;
}

interface CategoryStats {
    total: number;
    active: number;
}

interface ProviderStats {
    total: number;
    active: number;
    total_balance: number;
}

interface RecentActivity {
    recentUsers: any[];
    recentPayments: any[];
    activeSessions: number;
    blockedUsers: number;
}

interface DailyOrder {
    date: string;
    count: number;
    completed: number;
}

interface ApiProvider {
    id: number;
    name: string;
    balance: string;
    currency: string;
    is_active: number;
}

// --- Status Helpers ---

const statusColors: Record<string, string> = {
    'Pending': 'orange',
    'In progress': 'blue',
    'Completed': 'green',
    'Partial': 'purple',
    'Processing': 'cyan',
    'Canceled': 'red',
    'pending': 'orange',
    'approved': 'green',
    'rejected': 'red',
};

const statusLabels: Record<string, string> = {
    'Pending': 'در انتظار',
    'In progress': 'در حال انجام',
    'Completed': 'تکمیل شده',
    'Partial': 'جزئی',
    'Processing': 'پردازش',
    'Canceled': 'لغو شده',
    'pending': 'در انتظار',
    'approved': 'تایید شده',
    'rejected': 'رد شده',
};

// --- Main Component ---

export function DashboardHome() {
    const [summary, setSummary] = useState<DashboardSummary | null>(null);
    const [orderStats, setOrderStats] = useState<OrderStats | null>(null);
    const [revenueStats, setRevenueStats] = useState<RevenueStats | null>(null);
    const [serviceStats, setServiceStats] = useState<ServiceStats | null>(null);
    const [categoryStats, setCategoryStats] = useState<CategoryStats | null>(null);
    const [providerStats, setProviderStats] = useState<ProviderStats | null>(null);
    const [providers, setProviders] = useState<ApiProvider[]>([]);
    const [recentActivity, setRecentActivity] = useState<RecentActivity | null>(null);
    const [dailyOrders, setDailyOrders] = useState<DailyOrder[]>([]);
    const [loading, setLoading] = useState(true);
    const [chartLoading, setChartLoading] = useState(true);
    const [days, setDays] = useState(7);

    async function fetchAllData() {
        setLoading(true);
        try {
            const [summaryRes, orderStatsRes, revenueRes, serviceRes, categoryRes, providerRes, providersRes, activityRes] = await Promise.all([
                fetch('/api/dashboard/summary', { credentials: 'include' }),
                fetch('/api/smm/orders/stats', { credentials: 'include' }),
                fetch('/api/smm/orders/stats/revenue', { credentials: 'include' }),
                fetch('/api/smm/services/stats', { credentials: 'include' }),
                fetch('/api/smm/categories/stats', { credentials: 'include' }),
                fetch('/api/smm/api-providers/stats', { credentials: 'include' }),
                fetch('/api/smm/api-providers', { credentials: 'include' }),
                fetch('/api/dashboard/recent-activity', { credentials: 'include' }),
            ]);

            setSummary(await summaryRes.json());
            setOrderStats(await orderStatsRes.json());
            setRevenueStats(await revenueRes.json());
            setServiceStats(await serviceRes.json());
            setCategoryStats(await categoryRes.json());
            setProviderStats(await providerRes.json());
            setProviders(await providersRes.json());
            setRecentActivity(await activityRes.json());
        } finally {
            setLoading(false);
        }
    }

    async function fetchDailyOrders() {
        setChartLoading(true);
        try {
            const res = await fetch(`/api/smm/orders/stats/daily?days=${days}`, { credentials: 'include' });
            setDailyOrders(await res.json());
        } finally {
            setChartLoading(false);
        }
    }

    useEffect(() => {
        fetchAllData();
    }, []);

    useEffect(() => {
        fetchDailyOrders();
    }, [days]);

    // --- Chart Configs ---

    const orderPieData = orderStats ? [
        { type: 'در انتظار', value: orderStats.pending },
        { type: 'در حال انجام', value: orderStats.in_progress },
        { type: 'تکمیل شده', value: orderStats.completed },
        { type: 'جزئی', value: orderStats.partial },
        { type: 'پردازش', value: orderStats.processing },
        { type: 'لغو شده', value: orderStats.canceled },
    ].filter(item => item.value > 0) : [];

    const orderPieConfig = {
        data: orderPieData,
        angleField: 'value',
        colorField: 'type',
        radius: 0.8,
        innerRadius: 0.6,
        label: {
            text: 'type',
            position: 'outside' as const,
        },
        legend: {
            position: 'bottom' as const,
        },
        color: ['#faad14', '#1677ff', '#10b981', '#722ed1', '#13c2c2', '#ff4d4f'],
    };

    // --- Table Columns ---

    const userColumns: ColumnsType<any> = [
        { title: 'شناسه', dataIndex: 'chat_id', key: 'chat_id', width: 100 },
        { title: 'نام کاربری', dataIndex: 'username', key: 'username', render: (v: string) => v ? `@${v}` : '-' },
        { title: 'نام', dataIndex: 'first_name', key: 'first_name' },
        {
            title: 'نقش',
            dataIndex: 'role',
            key: 'role',
            render: (role: string) => (
                <Tag color={role === 'admin' ? 'red' : 'blue'}>
                    {role === 'admin' ? 'مدیر' : 'کاربر'}
                </Tag>
            ),
        },
        {
            title: 'تاریخ',
            dataIndex: 'created_at',
            key: 'created_at',
            render: (v: string) => new Date(v).toLocaleDateString('fa-IR'),
        },
    ];

    const paymentColumns: ColumnsType<any> = [
        { title: 'شناسه', dataIndex: 'id', key: 'id', width: 60 },
        { title: 'کاربر', dataIndex: 'user_username', key: 'user_username', render: (v: string) => v ? `@${v}` : '-' },
        {
            title: 'مبلغ',
            dataIndex: 'amount',
            key: 'amount',
            render: (v: number) => `${v?.toLocaleString()} تومان`,
        },
        {
            title: 'وضعیت',
            dataIndex: 'status',
            key: 'status',
            render: (status: string) => (
                <Tag color={statusColors[status] || 'default'}>
                    {statusLabels[status] || status}
                </Tag>
            ),
        },
        {
            title: 'تاریخ',
            dataIndex: 'created_at',
            key: 'created_at',
            render: (v: string) => new Date(v).toLocaleDateString('fa-IR'),
        },
    ];

    // --- Calculate Values ---

    const totalBalance = providers.reduce((sum, p) => sum + (parseFloat(p.balance) || 0), 0);
    const orderCompletionRate = orderStats && orderStats.total > 0
        ? Math.round((orderStats.completed / orderStats.total) * 100)
        : 0;

    return (
        <div>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
                <h2 style={{ margin: 0 }}>
                    <BarChartOutlined style={{ marginLeft: 8 }} />
                    داشبورد مدیریت
                </h2>
                <div style={{ display: 'flex', gap: 8 }}>
                    {[7, 14, 30, 90].map((d) => (
                        <a
                            key={d}
                            onClick={() => setDays(d)}
                            style={{
                                color: days === d ? '#4f46e5' : '#666',
                                fontWeight: days === d ? 'bold' : 'normal',
                                cursor: 'pointer',
                            }}
                        >
                            {d} روز
                        </a>
                    ))}
                </div>
            </div>

            <Spin spinning={loading}>
                {loading ? (
                    <Row gutter={[16, 16]}>
                        {Array.from({ length: 8 }).map((_, i) => (
                            <Col xs={24} sm={12} lg={6} key={i}>
                                <Card bordered={false} style={{ borderRadius: 12 }}>
                                    <Skeleton loading active paragraph={{ rows: 1 }}>
                                        <Statistic title="loading" value={0} />
                                    </Skeleton>
                                </Card>
                            </Col>
                        ))}
                    </Row>
                ) : (
                    <>
                        {/* Section 1: User & Payment Stats */}
                        <Row gutter={[16, 16]}>
                    <Col xs={24} sm={12} lg={6}>
                        <Card bordered={false} style={{ borderRadius: 12 }}>
                            <Statistic
                                title="کل کاربران"
                                value={summary?.users.total ?? 0}
                                prefix={<TeamOutlined style={{ color: '#4f46e5' }} />}
                                valueStyle={{ color: '#4f46e5', fontSize: 28, fontWeight: 'bold' }}
                            />
                            <div style={{ marginTop: 8, fontSize: 12, color: '#666' }}>
                                <span><RiseOutlined style={{ color: '#10b981' }} /> امروز: {summary?.users.today ?? 0}</span>
                                <span style={{ marginRight: 12 }}><CalendarOutlined style={{ color: '#f59e0b' }} /> این هفته: {summary?.users.thisWeek ?? 0}</span>
                            </div>
                        </Card>
                    </Col>
                    <Col xs={24} sm={12} lg={6}>
                        <Card bordered={false} style={{ borderRadius: 12 }}>
                            <Statistic
                                title="کل سفارشات"
                                value={orderStats?.total ?? 0}
                                prefix={<OrderedListOutlined style={{ color: '#06b6d4' }} />}
                                valueStyle={{ color: '#06b6d4', fontSize: 28, fontWeight: 'bold' }}
                            />
                            <div style={{ marginTop: 8, fontSize: 12, color: '#666' }}>
                                <span><CheckCircleOutlined style={{ color: '#10b981' }} /> تکمیل: {orderStats?.completed ?? 0}</span>
                                <span style={{ marginRight: 12 }}><ClockCircleOutlined style={{ color: '#faad14' }} /> در انتظار: {orderStats?.pending ?? 0}</span>
                            </div>
                        </Card>
                    </Col>
                    <Col xs={24} sm={12} lg={6}>
                        <Card bordered={false} style={{ borderRadius: 12 }}>
                            <Statistic
                                title="کل درآمد"
                                value={revenueStats?.total_revenue ?? 0}
                                prefix={<DollarOutlined style={{ color: '#10b981' }} />}
                                suffix="تومان"
                                valueStyle={{ color: '#10b981', fontSize: 28, fontWeight: 'bold' }}
                            />
                            <div style={{ marginTop: 8, fontSize: 12, color: '#666' }}>
                                <span><RiseOutlined style={{ color: '#10b981' }} /> امروز: {(revenueStats?.today_revenue ?? 0).toLocaleString()}</span>
                            </div>
                        </Card>
                    </Col>
                    <Col xs={24} sm={12} lg={6}>
                        <Card bordered={false} style={{ borderRadius: 12 }}>
                            <Statistic
                                title="موجودی ارائه‌دهندگان"
                                value={providerStats?.total_balance ?? totalBalance}
                                prefix={<WalletOutlined style={{ color: '#f59e0b' }} />}
                                suffix="USD"
                                valueStyle={{ color: '#f59e0b', fontSize: 28, fontWeight: 'bold' }}
                            />
                            <div style={{ marginTop: 8, fontSize: 12, color: '#666' }}>
                                <span><ApiOutlined style={{ color: '#8b5cf6' }} /> فعال: {providerStats?.active ?? 0}/{providerStats?.total ?? 0}</span>
                            </div>
                        </Card>
                    </Col>
                </Row>

                {/* Section 2: SMM Panel Stats */}
                <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
                    <Col xs={24} sm={12} lg={6}>
                        <Card bordered={false} style={{ borderRadius: 12 }}>
                            <Statistic
                                title="سرویس‌ها"
                                value={serviceStats?.active ?? 0}
                                prefix={<ShoppingCartOutlined style={{ color: '#8b5cf6' }} />}
                                valueStyle={{ color: '#8b5cf6', fontSize: 28, fontWeight: 'bold' }}
                                suffix={<Text type="secondary" style={{ fontSize: 14 }}>/ {serviceStats?.total ?? 0}</Text>}
                            />
                            <div style={{ marginTop: 8, fontSize: 12, color: '#666' }}>
                                <span><ApiOutlined style={{ color: '#06b6d4' }} /> متصل به API: {serviceStats?.linked ?? 0}</span>
                            </div>
                        </Card>
                    </Col>
                    <Col xs={24} sm={12} lg={6}>
                        <Card bordered={false} style={{ borderRadius: 12 }}>
                            <Statistic
                                title="دسته‌بندی‌ها"
                                value={categoryStats?.active ?? 0}
                                prefix={<FileTextOutlined style={{ color: '#06b6d4' }} />}
                                valueStyle={{ color: '#06b6d4', fontSize: 28, fontWeight: 'bold' }}
                                suffix={<Text type="secondary" style={{ fontSize: 14 }}>/ {categoryStats?.total ?? 0}</Text>}
                            />
                        </Card>
                    </Col>
                    <Col xs={24} sm={12} lg={6}>
                        <Card bordered={false} style={{ borderRadius: 12 }}>
                            <Statistic
                                title="پرداخت‌های در انتظار"
                                value={summary?.payments.pending ?? 0}
                                prefix={<SafetyOutlined style={{ color: '#faad14' }} />}
                                valueStyle={{ color: '#faad14', fontSize: 28, fontWeight: 'bold' }}
                            />
                            <div style={{ marginTop: 8, fontSize: 12, color: '#666' }}>
                                <span><CheckCircleOutlined style={{ color: '#10b981' }} /> تایید: {summary?.payments.approved ?? 0}</span>
                                <span style={{ marginRight: 12 }}><CloseCircleOutlined style={{ color: '#ff4d4f' }} /> رد: {summary?.payments.rejected ?? 0}</span>
                            </div>
                        </Card>
                    </Col>
                    <Col xs={24} sm={12} lg={6}>
                        <Card bordered={false} style={{ borderRadius: 12 }}>
                            <Statistic
                                title="نرخ تکمیل سفارشات"
                                value={orderCompletionRate}
                                suffix="%"
                                prefix={<RiseOutlined style={{ color: orderCompletionRate >= 80 ? '#10b981' : orderCompletionRate >= 50 ? '#f59e0b' : '#ff4d4f' }} />}
                                valueStyle={{ color: orderCompletionRate >= 80 ? '#10b981' : orderCompletionRate >= 50 ? '#f59e0b' : '#ff4d4f', fontSize: 28, fontWeight: 'bold' }}
                            />
                        </Card>
                    </Col>
                </Row>

                {/* Section 3: Order Status Cards */}
                <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
                    <Col xs={12} sm={8} lg={4}>
                        <Card bordered={false} style={{ borderRadius: 12, textAlign: 'center' }}>
                            <Statistic
                                title="در انتظار"
                                value={orderStats?.pending ?? 0}
                                prefix={<ClockCircleOutlined style={{ color: '#faad14' }} />}
                                valueStyle={{ color: '#faad14', fontSize: 24 }}
                            />
                        </Card>
                    </Col>
                    <Col xs={12} sm={8} lg={4}>
                        <Card bordered={false} style={{ borderRadius: 12, textAlign: 'center' }}>
                            <Statistic
                                title="در حال انجام"
                                value={orderStats?.in_progress ?? 0}
                                prefix={<SyncOutlined style={{ color: '#1677ff' }} />}
                                valueStyle={{ color: '#1677ff', fontSize: 24 }}
                            />
                        </Card>
                    </Col>
                    <Col xs={12} sm={8} lg={4}>
                        <Card bordered={false} style={{ borderRadius: 12, textAlign: 'center' }}>
                            <Statistic
                                title="پردازش"
                                value={orderStats?.processing ?? 0}
                                prefix={<SyncOutlined style={{ color: '#13c2c2' }} spin />}
                                valueStyle={{ color: '#13c2c2', fontSize: 24 }}
                            />
                        </Card>
                    </Col>
                    <Col xs={12} sm={8} lg={4}>
                        <Card bordered={false} style={{ borderRadius: 12, textAlign: 'center' }}>
                            <Statistic
                                title="تکمیل شده"
                                value={orderStats?.completed ?? 0}
                                prefix={<CheckCircleOutlined style={{ color: '#10b981' }} />}
                                valueStyle={{ color: '#10b981', fontSize: 24 }}
                            />
                        </Card>
                    </Col>
                    <Col xs={12} sm={8} lg={4}>
                        <Card bordered={false} style={{ borderRadius: 12, textAlign: 'center' }}>
                            <Statistic
                                title="جزئی"
                                value={orderStats?.partial ?? 0}
                                prefix={<MinusCircleOutlined style={{ color: '#722ed1' }} />}
                                valueStyle={{ color: '#722ed1', fontSize: 24 }}
                            />
                        </Card>
                    </Col>
                    <Col xs={12} sm={8} lg={4}>
                        <Card bordered={false} style={{ borderRadius: 12, textAlign: 'center' }}>
                            <Statistic
                                title="لغو شده"
                                value={orderStats?.canceled ?? 0}
                                prefix={<CloseCircleOutlined style={{ color: '#ff4d4f' }} />}
                                valueStyle={{ color: '#ff4d4f', fontSize: 24 }}
                            />
                        </Card>
                    </Col>
                </Row>

                {/* Section 4: Bot & AI Status */}
                <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
                    <Col xs={24} sm={12} lg={8}>
                        <Card
                            title={<><RobotOutlined /> وضعیت ربات</>}
                            bordered={false}
                            style={{ borderRadius: 12 }}
                        >
                            <Space direction="vertical" style={{ width: '100%' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <Text>توکن ربات:</Text>
                                    <Tag color={summary?.bot.hasToken ? 'green' : 'red'}>
                                        {summary?.bot.hasToken ? 'تنظیم شده' : 'تنظیم نشده'}
                                    </Tag>
                                </div>
                                {summary?.bot.botInfo && (
                                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                        <Text>نام ربات:</Text>
                                        <Text strong>@{summary.bot.botInfo.username}</Text>
                                    </div>
                                )}
                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <Text>کانال‌ها:</Text>
                                    <Text>{summary?.bot.totalChannels ?? 0} ({summary?.bot.mandatoryChannels ?? 0} اجباری)</Text>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <Text>آیتم‌های راهنما:</Text>
                                    <Text>{summary?.bot.totalHelps ?? 0}</Text>
                                </div>
                            </Space>
                        </Card>
                    </Col>
                    <Col xs={24} sm={12} lg={8}>
                        <Card
                            title={<><ThunderboltOutlined /> هوش مصنوعی امروز</>}
                            bordered={false}
                            style={{ borderRadius: 12 }}
                        >
                            <Space direction="vertical" style={{ width: '100%' }}>
                                <div>
                                    <Text type="secondary">مدیر</Text>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
                                        <Text><MessageOutlined /> درخواست‌ها:</Text>
                                        <Text strong>{summary?.ai.adminTodayRequests ?? 0}</Text>
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                        <Text><ThunderboltOutlined /> توکن‌ها:</Text>
                                        <Text strong>{(summary?.ai.adminTodayTokens ?? 0).toLocaleString()}</Text>
                                    </div>
                                </div>
                                <Divider style={{ margin: '8px 0' }} />
                                <div>
                                    <Text type="secondary">کاربر</Text>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
                                        <Text><MessageOutlined /> درخواست‌ها:</Text>
                                        <Text strong>{summary?.ai.userTodayRequests ?? 0}</Text>
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                        <Text><ThunderboltOutlined /> توکن‌ها:</Text>
                                        <Text strong>{(summary?.ai.userTodayTokens ?? 0).toLocaleString()}</Text>
                                    </div>
                                </div>
                            </Space>
                        </Card>
                    </Col>
                    <Col xs={24} sm={12} lg={8}>
                        <Card
                            title={<><SafetyOutlined /> وضعیت سیستم</>}
                            bordered={false}
                            style={{ borderRadius: 12 }}
                        >
                            <Space direction="vertical" style={{ width: '100%' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <Text><UserOutlined /> نشست‌های فعال:</Text>
                                    <Text strong>{recentActivity?.activeSessions ?? 0}</Text>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <Text><LockOutlined /> کاربران مسدود:</Text>
                                    <Text strong style={{ color: (recentActivity?.blockedUsers ?? 0) > 0 ? '#ff4d4f' : undefined }}>
                                        {recentActivity?.blockedUsers ?? 0}
                                    </Text>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <Text><DollarOutlined /> پرداخت‌های تایید شده:</Text>
                                    <Text strong>{summary?.payments.approved ?? 0}</Text>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <Text><WalletOutlined /> کل مبلغ تایید شده:</Text>
                                    <Text strong>{(summary?.payments.approvedAmount ?? 0).toLocaleString()} تومان</Text>
                                </div>
                            </Space>
                        </Card>
                    </Col>
                </Row>

                {/* Section 5: Charts */}
                <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
                    <Col xs={24} lg={16}>
                        <Card
                            title="روند سفارشات"
                            bordered={false}
                            style={{ borderRadius: 12 }}
                        >
                            <Spin spinning={chartLoading}>
                                <div style={{ height: 300 }}>
                                    {dailyOrders.length > 0 ? (
                                        <Line
                                            data={[
                                                ...dailyOrders.map(d => ({ date: d.date, count: d.count, type: 'کل سفارشات' })),
                                                ...dailyOrders.map(d => ({ date: d.date, count: d.completed, type: 'تکمیل شده' })),
                                            ]}
                                            xField="date"
                                            yField="count"
                                            seriesField="type"
                                            smooth
                                            color={['#4f46e5', '#10b981']}
                                            animation
                                        />
                                    ) : (
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#999' }}>
                                            داده‌ای موجود نیست
                                        </div>
                                    )}
                                </div>
                            </Spin>
                        </Card>
                    </Col>
                    <Col xs={24} lg={8}>
                        <Card
                            title="وضعیت سفارشات"
                            bordered={false}
                            style={{ borderRadius: 12 }}
                        >
                            <div style={{ height: 300 }}>
                                {orderPieData.length > 0 ? (
                                    <Pie {...orderPieConfig} />
                                ) : (
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#999' }}>
                                        داده‌ای موجود نیست
                                    </div>
                                )}
                            </div>
                        </Card>
                    </Col>
                </Row>

                {/* Section 6: Recent Activity Tables */}
                <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
                    <Col xs={24} lg={12}>
                        <Card
                            title="آخرین کاربران"
                            bordered={false}
                            style={{ borderRadius: 12 }}
                        >
                            <Table scroll={{ x: true }} columns={userColumns}
                                dataSource={recentActivity?.recentUsers ?? []}
                                rowKey="id"
                                pagination={false}
                                size="small"
                            />
                        </Card>
                    </Col>
                    <Col xs={24} lg={12}>
                        <Card
                            title="آخرین پرداخت‌ها"
                            bordered={false}
                            style={{ borderRadius: 12 }}
                        >
                            <Table scroll={{ x: true }} columns={paymentColumns}
                                dataSource={recentActivity?.recentPayments ?? []}
                                rowKey="id"
                                pagination={false}
                                size="small"
                            />
                        </Card>
                    </Col>
                </Row>
                    </>
                )}
            </Spin>
        </div>
    );
}
