import { useEffect, useState, createContext, useContext } from 'react';
import {
    Card, Input, Button, Typography, Space, Tag, Descriptions, Switch,
    Table, message, Row, Col, Tabs, TimePicker,
} from 'antd';
import {
    SaveOutlined, LinkOutlined, DeleteOutlined, InfoCircleOutlined,
    PlusOutlined, MinusCircleOutlined,
    RobotOutlined, MessageOutlined, SettingOutlined, CheckCircleOutlined,
    SendOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';

const { Text } = Typography;
const { TextArea } = Input;

interface BotCommand { command: string; description: string; }

interface SettingsContextType {
    token: string; setToken: (v: string) => void;
    webhookUrl: string; setWebhookUrl: (v: string) => void;
    botInfo: Record<string, any> | null;
    webhookInfo: Record<string, any> | null;
    registrationDisabled: boolean;
    loading: string | null;
    pageLoading: boolean;
    dollarRate: string; setDollarRate: (v: string) => void;
    botName: string; setBotName: (v: string) => void;
    botShortDesc: string; setBotShortDesc: (v: string) => void;
    botDesc: string; setBotDesc: (v: string) => void;
    botCommands: BotCommand[]; setBotCommands: React.Dispatch<React.SetStateAction<BotCommand[]>>;
    newCmd: string; setNewCmd: (v: string) => void;
    newCmdDesc: string; setNewCmdDesc: (v: string) => void;
    supportMessage: string; setSupportMessage: (v: string) => void;
    receiptAnalysisPrompt: string; setReceiptAnalysisPrompt: (v: string) => void;
    receiptAnalysisEnabled: string; setReceiptAnalysisEnabled: (v: string) => void;
    receiptVerificationRequired: string; setReceiptVerificationRequired: (v: string) => void;
    receiptMaxInvalidAttempts: string; setReceiptMaxInvalidAttempts: (v: string) => void;
    receiptBanHours: string; setReceiptBanHours: (v: string) => void;
    statsReportEnabled: boolean; setStatsReportEnabled: (v: boolean) => void;
    statsReportTime: string; setStatsReportTime: (v: string) => void;
    apiPut: (endpoint: string, body: Record<string, any>, successMsg: string, loadingKey: string) => Promise<void>;
    saveToken: () => Promise<void>;
    setWebhook: () => Promise<void>;
    deleteWebhook: () => Promise<void>;
    fetchWebhookInfo: () => Promise<void>;
    toggleRegistration: (checked: boolean) => Promise<void>;
    addCommand: () => void;
}

const SettingsContext = createContext<SettingsContextType | null>(null);

function useSettings() {
    const ctx = useContext(SettingsContext);
    if (!ctx) throw new Error('useSettings must be used within SettingsProvider');
    return ctx;
}

function SettingsProvider({ children }: { children: React.ReactNode }) {
    const [token, setToken] = useState('');
    const [webhookUrl, setWebhookUrl] = useState(`${window.location.origin}/api/telegram/webhook`);
    const [botInfo, setBotInfo] = useState<Record<string, any> | null>(null);
    const [webhookInfo, setWebhookInfo] = useState<Record<string, any> | null>(null);
    const [registrationDisabled, setRegistrationDisabled] = useState(false);
    const [loading, setLoading] = useState<string | null>(null);
    const [pageLoading, setPageLoading] = useState(true);
    const [dollarRate, setDollarRate] = useState('50000');
    const [botName, setBotName] = useState('');
    const [botShortDesc, setBotShortDesc] = useState('');
    const [botDesc, setBotDesc] = useState('');
    const [botCommands, setBotCommands] = useState<BotCommand[]>([]);
    const [newCmd, setNewCmd] = useState('');
    const [newCmdDesc, setNewCmdDesc] = useState('');
    const [supportMessage, setSupportMessage] = useState('');
    const [receiptAnalysisPrompt, setReceiptAnalysisPrompt] = useState('');
    const [receiptAnalysisEnabled, setReceiptAnalysisEnabled] = useState('true');
    const [receiptVerificationRequired, setReceiptVerificationRequired] = useState('true');
    const [receiptMaxInvalidAttempts, setReceiptMaxInvalidAttempts] = useState('2');
    const [receiptBanHours, setReceiptBanHours] = useState('3');
    const [statsReportEnabled, setStatsReportEnabled] = useState(true);
    const [statsReportTime, setStatsReportTime] = useState('20:00');

    useEffect(() => {
        fetch('/api/dashboard/settings', { credentials: 'include' })
            .then((r) => r.json())
            .then((data) => {
                if (data.botInfo) setBotInfo(data.botInfo);
                if (data.registrationDisabled) setRegistrationDisabled(data.registrationDisabled);
                if (data.botName) setBotName(data.botName);
                if (data.botShortDescription) setBotShortDesc(data.botShortDescription);
                if (data.botDescription) setBotDesc(data.botDescription);
                if (data.botCommands) setBotCommands(data.botCommands);
                if (data.dollarRate) setDollarRate(data.dollarRate);
                if (data.supportMessage) setSupportMessage(data.supportMessage);
                if (data.receiptAnalysisPrompt) setReceiptAnalysisPrompt(data.receiptAnalysisPrompt);
                if (data.receiptAnalysisEnabled !== undefined) setReceiptAnalysisEnabled(data.receiptAnalysisEnabled);
                if (data.receiptVerificationRequired !== undefined) setReceiptVerificationRequired(data.receiptVerificationRequired);
                if (data.receiptMaxInvalidAttempts) setReceiptMaxInvalidAttempts(data.receiptMaxInvalidAttempts);
                if (data.receiptBanHours) setReceiptBanHours(data.receiptBanHours);
                if (data.statsReportEnabled !== undefined) setStatsReportEnabled(data.statsReportEnabled);
                if (data.statsReportTime) setStatsReportTime(data.statsReportTime);
                setPageLoading(false);
            })
            .catch(() => {
                message.error('خطا در دریافت تنظیمات');
                setPageLoading(false);
            });
    }, []);

    const apiPut = async (endpoint: string, body: Record<string, any>, successMsg: string, loadingKey: string): Promise<void> => {
        setLoading(loadingKey);
        try {
            const res = await fetch(`/api/dashboard/settings/${endpoint}`, {
                method: 'PUT', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
                body: JSON.stringify(body),
            });
            const data = await res.json();
            if (!res.ok) { message.error(data.error); return; }
            message.success(successMsg);
        } catch { message.error('خطای شبکه'); } finally { setLoading(null); }
    };

    const saveToken = async () => {
        if (!token.trim()) return;
        setLoading('token');
        try {
            const res = await fetch('/api/dashboard/settings/token', {
                method: 'PUT', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
                body: JSON.stringify({ token }),
            });
            const data = await res.json();
            if (!res.ok) { message.error(data.error); return; }
            message.success(`بات ${data.botInfo.first_name} ذخیره شد`);
            setBotInfo(data.botInfo);
        } finally { setLoading(null); }
    };

    const setWebhook = async (): Promise<void> => {
        if (!webhookUrl.trim()) { message.error('آدرس وب‌هوک را وارد کنید'); return; }
        setLoading('webhook');
        try {
            const res = await fetch('/api/dashboard/settings/webhook/set', {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
                body: JSON.stringify({ url: webhookUrl }),
            });
            const data = await res.json();
            if (!res.ok) { message.error(data.error); return; }
            message.success('وب‌هوک تنظیم شد');
        } catch { message.error('خطای شبکه'); } finally { setLoading(null); }
    };

    const deleteWebhook = async () => {
        setLoading('webhook');
        try {
            const res = await fetch('/api/dashboard/settings/webhook/delete', { method: 'POST', credentials: 'include' });
            const data = await res.json();
            if (!res.ok) { message.error(data.error); return; }
            message.success('وب‌هوک حذف شد'); setWebhookInfo(null);
        } catch { message.error('خطای شبکه'); } finally { setLoading(null); }
    };

    const fetchWebhookInfo = async () => {
        setLoading('info');
        try {
            const res = await fetch('/api/dashboard/settings/webhook/info', { credentials: 'include' });
            const data = await res.json();
            if (!res.ok) { message.error(data.error); return; }
            setWebhookInfo(data);
        } catch { message.error('خطای شبکه'); } finally { setLoading(null); }
    };

    const toggleRegistration = async (checked: boolean): Promise<void> => {
        setLoading('registration');
        try {
            const res = await fetch('/api/dashboard/settings/registration', {
                method: 'PUT', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
                body: JSON.stringify({ disabled: checked }),
            });
            const data = await res.json();
            if (!res.ok) { message.error(data.error); return; }
            setRegistrationDisabled(data.registrationDisabled);
            message.success(data.registrationDisabled ? 'ثبت نام غیرفعال شد' : 'ثبت نام فعال شد');
        } finally { setLoading(null); }
    };

    const addCommand = () => {
        if (!newCmd.trim() || !newCmdDesc.trim()) return message.error('فیلدها را پر کنید');
        setBotCommands((prev) => [...prev, { command: newCmd.trim(), description: newCmdDesc.trim() }]);
        setNewCmd(''); setNewCmdDesc('');
    };

    return (
        <SettingsContext.Provider value={{
            token, setToken, webhookUrl, setWebhookUrl, botInfo, webhookInfo, registrationDisabled,
            loading, pageLoading, dollarRate, setDollarRate, botName, setBotName, botShortDesc, setBotShortDesc,
            botDesc, setBotDesc, botCommands, setBotCommands, newCmd, setNewCmd, newCmdDesc, setNewCmdDesc,
            supportMessage, setSupportMessage, receiptAnalysisPrompt, setReceiptAnalysisPrompt,
            receiptAnalysisEnabled, setReceiptAnalysisEnabled, receiptVerificationRequired, setReceiptVerificationRequired,
            receiptMaxInvalidAttempts, setReceiptMaxInvalidAttempts, receiptBanHours, setReceiptBanHours,
            statsReportEnabled, setStatsReportEnabled, statsReportTime, setStatsReportTime,
            apiPut, saveToken, setWebhook, deleteWebhook, fetchWebhookInfo,
            toggleRegistration, addCommand,
        }}>
            {children}
        </SettingsContext.Provider>
    );
}

function BotSettings() {
    const s = useSettings();
    const commandColumns: ColumnsType<BotCommand> = [
        { title: 'دستور', dataIndex: 'command', render: (v) => `/${v}` },
        { title: 'توضیحات', dataIndex: 'description' },
        { title: '', width: 40, render: (_, __, i) => <Button type="text" danger icon={<MinusCircleOutlined />} onClick={() => s.setBotCommands((prev) => prev.filter((_, idx) => idx !== i))} /> },
    ];

    return (
        <Row gutter={[24, 24]}>
            <Col xs={24} lg={12}>
                <Space direction="vertical" size="middle" style={{ width: '100%' }}>
                    <Card title="توکن ربات تلگرام">
                        <Space.Compact style={{ width: '100%' }}>
                            <Input value={s.token} onChange={(e) => s.setToken(e.target.value)} placeholder="توکن ربات را وارد کنید" />
                            <Button type="primary" icon={<SaveOutlined />} loading={s.loading === 'token'} onClick={s.saveToken}>ذخیره</Button>
                        </Space.Compact>
                        {s.botInfo && (
                            <Descriptions size="small" column={1} style={{ marginTop: 12 }}>
                                <Descriptions.Item label="نام">{s.botInfo.first_name}</Descriptions.Item>
                                <Descriptions.Item label="نام کاربری">@{s.botInfo.username}</Descriptions.Item>
                                <Descriptions.Item label="ID">{s.botInfo.id}</Descriptions.Item>
                            </Descriptions>
                        )}
                    </Card>
                    <Card title="نام ربات">
                        <Space.Compact style={{ width: '100%' }}>
                            <Input value={s.botName} onChange={(e) => s.setBotName(e.target.value)} placeholder="نام ربات" />
                            <Button type="primary" icon={<SaveOutlined />} loading={s.loading === 'bot-name'}
                                onClick={() => s.apiPut('bot-name', { name: s.botName }, 'نام ربات ذخیره شد', 'bot-name')}>ذخیره</Button>
                        </Space.Compact>
                    </Card>
                    <Card title="توضیح کوتاه ربات">
                        <Space.Compact style={{ width: '100%' }}>
                            <Input value={s.botShortDesc} onChange={(e) => s.setBotShortDesc(e.target.value)} placeholder="توضیح کوتاه" />
                            <Button type="primary" icon={<SaveOutlined />} loading={s.loading === 'bot-short-desc'}
                                onClick={() => s.apiPut('bot-short-description', { shortDescription: s.botShortDesc }, 'ذخیره شد', 'bot-short-desc')}>ذخیره</Button>
                        </Space.Compact>
                    </Card>
                    <Card title="توضیحات ربات">
                        <TextArea rows={3} value={s.botDesc} onChange={(e) => s.setBotDesc(e.target.value)} placeholder="توضیحات کامل ربات" />
                        <Button type="primary" icon={<SaveOutlined />} loading={s.loading === 'bot-desc'} style={{ marginTop: 8 }}
                            onClick={() => s.apiPut('bot-description', { description: s.botDesc }, 'ذخیره شد', 'bot-desc')}>ذخیره</Button>
                    </Card>
                </Space>
            </Col>
            <Col xs={24} lg={12}>
                <Space direction="vertical" size="middle" style={{ width: '100%' }}>
                    <Card title="دستورات ربات">
                        {s.botCommands.length > 0 && (
                            <Table dataSource={s.botCommands} columns={commandColumns} rowKey={(_, i) => String(i)} pagination={false} size="small" style={{ marginBottom: 12 }} />
                        )}
                        <Space.Compact style={{ width: '100%' }}>
                            <Input value={s.newCmd} onChange={(e) => s.setNewCmd(e.target.value)} placeholder="دستور" style={{ width: '30%' }} />
                            <Input value={s.newCmdDesc} onChange={(e) => s.setNewCmdDesc(e.target.value)} placeholder="توضیحات" onPressEnter={s.addCommand} />
                            <Button icon={<PlusOutlined />} onClick={s.addCommand} />
                        </Space.Compact>
                        <Button type="primary" icon={<SaveOutlined />} loading={s.loading === 'bot-commands'} style={{ marginTop: 12 }}
                            onClick={() => s.apiPut('bot-commands', { commands: s.botCommands }, 'دستورات ذخیره شد', 'bot-commands')}>ذخیره دستورات</Button>
                    </Card>
                    <Card title="وب‌هوک">
                        <Space.Compact style={{ width: '100%' }}>
                            <Input value={s.webhookUrl} onChange={(e) => s.setWebhookUrl(e.target.value)} placeholder="https://example.com/api/telegram/webhook" />
                            <Button type="primary" icon={<LinkOutlined />} loading={s.loading === 'webhook'} onClick={s.setWebhook}>تنظیم</Button>
                        </Space.Compact>
                        <Space style={{ marginTop: 12 }}>
                            <Button danger icon={<DeleteOutlined />} loading={s.loading === 'webhook'} onClick={s.deleteWebhook}>حذف</Button>
                            <Button icon={<InfoCircleOutlined />} loading={s.loading === 'info'} onClick={s.fetchWebhookInfo}>اطلاعات</Button>
                        </Space>
                        {s.webhookInfo && (
                            <Descriptions size="small" column={1} style={{ marginTop: 12 }}>
                                <Descriptions.Item label="URL"><Text copyable>{s.webhookInfo.url || 'تنظیم نشده'}</Text></Descriptions.Item>
                                <Descriptions.Item label="خطا">{s.webhookInfo.last_error_message ? <Tag color="error">{s.webhookInfo.last_error_message}</Tag> : <Tag color="success">بدون خطا</Tag>}</Descriptions.Item>
                                <Descriptions.Item label="Pending">{s.webhookInfo.pending_update_count ?? 0}</Descriptions.Item>
                            </Descriptions>
                        )}
                    </Card>
                </Space>
            </Col>
        </Row>
    );
}

function GeneralSettings() {
    const s = useSettings();
    return (
        <Row gutter={[24, 24]}>
            <Col xs={24} lg={12}>
                <Card title="نرخ دلار (تومان)">
                    <Space.Compact style={{ width: '100%' }}>
                        <Input type="number" value={s.dollarRate} onChange={(e) => s.setDollarRate(e.target.value)} placeholder="نرخ دلار به تومان" />
                        <Button type="primary" icon={<SaveOutlined />} loading={s.loading === 'dollar-rate'}
                            onClick={() => s.apiPut('dollar-rate', { rate: s.dollarRate }, 'نرخ دلار ذخیره شد', 'dollar-rate')}>ذخیره</Button>
                    </Space.Compact>
                </Card>
            </Col>
            <Col xs={24} lg={12}>
                <Card title="تنظیمات ثبت نام">
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span>غیرفعال کردن صفحه ثبت نام</span>
                        <Switch checked={s.registrationDisabled} loading={s.loading === 'registration'} onChange={s.toggleRegistration}
                            checkedChildren="غیرفعال" unCheckedChildren="فعال" />
                    </div>
                </Card>
            </Col>
        </Row>
    );
}

function SupportSettings() {
    const s = useSettings();
    const [activating, setActivating] = useState(false);
    const [sendingTestReport, setSendingTestReport] = useState(false);

    const handleActivateAI = async () => {
        setActivating(true);
        try {
            const res = await fetch('/api/test-ai', { credentials: 'include' });
            const data = await res.json();
            if (data.ok || data.response) {
                message.success('مدل هوش مصنوعی فعال شد');
            } else {
                message.error(data.error || 'خطا در فعال‌سازی');
            }
        } catch {
            message.error('خطا در فعال‌سازی');
        }
        setActivating(false);
    };

    const toggleReceiptAnalysis = async (checked: boolean) => {
        try {
            const res = await fetch('/api/dashboard/settings/receipt-analysis-enabled', {
                method: 'PUT', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
                body: JSON.stringify({ enabled: String(checked) }),
            });
            const data = await res.json();
            if (data.ok) {
                s.setReceiptAnalysisEnabled(String(checked));
                message.success(checked ? 'تحلیل تصویر فعال شد' : 'تحلیل تصویر غیرفعال شد');
            }
        } catch { message.error('خطا'); }
    };

    const saveVerificationSettings = async () => {
        try {
            const res = await fetch('/api/dashboard/settings/receipt-verification', {
                method: 'PUT', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
                body: JSON.stringify({
                    required: s.receiptVerificationRequired,
                    max_attempts: s.receiptMaxInvalidAttempts,
                    ban_hours: s.receiptBanHours,
                }),
            });
            const data = await res.json();
            if (data.ok) message.success('تنظیمات ذخیره شد');
        } catch { message.error('خطا'); }
    };

    const saveStatsReportSettings = async () => {
        try {
            const res = await fetch('/api/dashboard/settings/stats-report', {
                method: 'PUT', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
                body: JSON.stringify({
                    enabled: s.statsReportEnabled,
                    time: s.statsReportTime,
                }),
            });
            const data = await res.json();
            if (data.ok) message.success('تنظیمات گزارش ذخیره شد');
        } catch { message.error('خطا'); }
    };

    const sendTestReport = async () => {
        setSendingTestReport(true);
        try {
            const res = await fetch('/api/dashboard/settings/stats-report/test', {
                method: 'POST', credentials: 'include',
            });
            const data = await res.json();
            if (data.ok) {
                message.success(data.message || 'گزارش آزمایشی ارسال شد');
            } else {
                message.error(data.error || 'خطا در ارسال گزارش');
            }
        } catch { message.error('خطا'); }
        setSendingTestReport(false);
    };

    return (
        <Space direction="vertical" size="large" style={{ width: '100%' }}>
            <Card title="💬 پیام پشتیبانی ربات" style={{ maxWidth: 600 }}>
                <Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>
                    متنی که اینجا وارد کنید، زمانی که کاربر در ربات تلگرام دکمه "پشتیبانی" را بزند نمایش داده می‌شود.
                </Text>
                <TextArea rows={6} value={s.supportMessage} onChange={(e) => s.setSupportMessage(e.target.value)}
                    placeholder={"متن پشتیبانی...\n\nمثال:\n📞 شماره تماس: ۰۹۱۲۱۲۳۴۵۶۷\n📧 ایمیل: support@example.com\n⏰ ساعت پاسخگویی: ۹ صبح تا ۹ شب"} />
                <Button type="primary" icon={<SaveOutlined />} loading={s.loading === 'support'} style={{ marginTop: 12 }} block
                    onClick={() => s.apiPut('support', { support_message: s.supportMessage }, 'پیام پشتیبانی ذخیره شد', 'support')}>
                    ذخیره پیام پشتیبانی
                </Button>
            </Card>

            <Card title="🤖 تحلیل تصویر رسید پرداخت" style={{ maxWidth: 600 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                    <Text strong>فعال‌سازی تحلیل تصویر</Text>
                    <Switch checked={s.receiptAnalysisEnabled === 'true'} onChange={toggleReceiptAnalysis}
                        checkedChildren="فعال" unCheckedChildren="غیرفعال" />
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, padding: 12, background: '#f6f8fa', borderRadius: 8 }}>
                    <Text>فعال‌سازی مدل Llama 3.2 Vision (یکبار کافیست)</Text>
                    <Button icon={<CheckCircleOutlined />} loading={activating} onClick={handleActivateAI}>
                        فعال‌سازی
                    </Button>
                </div>

                <Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>
                    پرامپتی که هوش مصنوعی برای بررسی رسید پرداخت استفاده می‌کند. از <Text code>{'{payment}'}</Text> برای اطلاعات پرداخت استفاده کنید.
                </Text>
                <TextArea rows={6} value={s.receiptAnalysisPrompt} onChange={(e) => s.setReceiptAnalysisPrompt(e.target.value)}
                    placeholder={"پرامپت تحلیل تصویر رسید...\n\nمثال:\nتو یک کارشناس بررسی رسید پرداخت هستی. تصویر ارسال شده رو بررسی کن.\nاطلاعات پرداخت: {payment}\nآیا مبلغ پرداختی با رسید مطابقت دارد؟"} />
                <Button type="primary" icon={<SaveOutlined />} loading={s.loading === 'receipt-prompt'} style={{ marginTop: 12 }} block
                    onClick={() => s.apiPut('receipt-analysis-prompt', { prompt: s.receiptAnalysisPrompt }, 'پرامپت ذخیره شد', 'receipt-prompt')}>
                    ذخیره پرامپت تحلیل تصویر
                </Button>
            </Card>

            <Card title="🚫 تنظیمات تایید اجباری رسید" style={{ maxWidth: 600 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                    <Text strong>تایید اجباری رسید توسط هوش مصنوعی</Text>
                    <Switch checked={s.receiptVerificationRequired === 'true'} onChange={(v) => s.setReceiptVerificationRequired(String(v))}
                        checkedChildren="فعال" unCheckedChildren="غیرفعال" />
                </div>
                <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
                    اگر فعال باشد، تصویری که هوش مصنوعی تشخیص بده رسید پرداخت نیست، رد می‌شود و کاربر پیام خطا دریافت می‌کند.
                </Text>

                <div style={{ display: 'flex', gap: 16, marginBottom: 16 }}>
                    <div style={{ flex: 1 }}>
                        <Text strong>حداکثر تلاش نامعتبر:</Text>
                        <Input type="number" value={s.receiptMaxInvalidAttempts} onChange={(e) => s.setReceiptMaxInvalidAttempts(e.target.value)}
                            min={1} max={10} style={{ marginTop: 8 }} addonAfter="بار" />
                        <Text type="secondary" style={{ fontSize: 12 }}>بعد از این تعداد، کاربر بن می‌شود</Text>
                    </div>
                    <div style={{ flex: 1 }}>
                        <Text strong>مدت بن (ساعت):</Text>
                        <Input type="number" value={s.receiptBanHours} onChange={(e) => s.setReceiptBanHours(e.target.value)}
                            min={1} max={168} style={{ marginTop: 8 }} addonAfter="ساعت" />
                        <Text type="secondary" style={{ fontSize: 12 }}>مدت محرومیت کاربر</Text>
                    </div>
                </div>

                <Button type="primary" icon={<SaveOutlined />} block onClick={saveVerificationSettings}>
                    ذخیره تنظیمات تایید
                </Button>
            </Card>

            <Card title="📊 گزارش روزانه آمار" style={{ maxWidth: 600 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                    <Text strong>ارسال گزارش روزانه به مدیر</Text>
                    <Switch checked={s.statsReportEnabled} onChange={(v) => s.setStatsReportEnabled(v)}
                        checkedChildren="فعال" unCheckedChildren="غیرفعال" />
                </div>
                <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
                    گزارش آمار سفارشات، درآمد، کاربران و موجودی ارائه‌دهندگان به صورت روزانه به مدیر ارسال می‌شود.
                </Text>

                <div style={{ marginBottom: 16 }}>
                    <Text strong>زمان ارسال گزارش:</Text>
                    <TimePicker
                        value={dayjs(s.statsReportTime, 'HH:mm')}
                        format="HH:mm"
                        onChange={(time) => {
                            if (time) s.setStatsReportTime(time.format('HH:mm'));
                        }}
                        style={{ width: '100%', marginTop: 8 }}
                        placeholder="زمان ارسال گزارش"
                    />
                    <Text type="secondary" style={{ fontSize: 12 }}>ساعت ارسال گزارش روزانه</Text>
                </div>

                <Space style={{ width: '100%' }}>
                    <Button type="primary" icon={<SaveOutlined />} onClick={saveStatsReportSettings}>
                        ذخیره تنظیمات
                    </Button>
                    <Button icon={<SendOutlined />} loading={sendingTestReport} onClick={sendTestReport}>
                        ارسال آزمایشی
                    </Button>
                </Space>
            </Card>
        </Space>
    );
}

export function Settings() {
    return (
        <SettingsProvider>
            <div>
                <h2 style={{ marginBottom: 24 }}>تنظیمات</h2>
                <Tabs defaultActiveKey="bot" items={[
                    {
                        key: 'bot', label: <span><RobotOutlined /> ربات تلگرام</span>,
                        children: <BotSettings />,
                    },
                    {
                        key: 'general', label: <span><SettingOutlined /> تنظیمات عمومی</span>,
                        children: <GeneralSettings />,
                    },
                    {
                        key: 'support', label: <span><MessageOutlined /> پشتیبانی</span>,
                        children: <SupportSettings />,
                    },
                ]} />
            </div>
        </SettingsProvider>
    );
}
