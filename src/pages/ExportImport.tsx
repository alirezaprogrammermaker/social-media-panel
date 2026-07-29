import { useState, useEffect } from 'react';
import { Card, Button, Table, Checkbox, Space, message, Upload, Modal, Tag, Row, Col, Skeleton, Typography } from 'antd';
import { DownloadOutlined, UploadOutlined, ExclamationCircleOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { dashboardApi } from '../api';

const { Text } = Typography;

interface TableInfo {
    name: string;
    label: string;
    count?: number;
    selected?: boolean;
}

const TABLE_LABELS: Record<string, string> = {
    categories: 'دسته‌بندی‌ها',
    services: 'سرویس‌ها',
    api_providers: 'ارائه‌دهندگان API',
    orders: 'سفارشات',
    payment_methods: 'روش‌های پرداخت',
    payments: 'پرداخت‌ها',
    telegram_users: 'کاربران تلگرام',
    telegram_user_sessions: 'نشست‌های تلگرام',
    bot_channels: 'کانال‌های ربات',
    telegram_bot_helps: 'راهنمای ربات',
    settings: 'تنظیمات',
    ai_settings: 'تنظیمات هوش مصنوعی',
};

export default function ExportImport() {
    const [tables, setTables] = useState<TableInfo[]>([]);
    const [loading, setLoading] = useState(true);
    const [exporting, setExporting] = useState(false);
    const [importing, setImporting] = useState(false);
    const [importData, setImportData] = useState<any[] | null>(null);
    const [importFileName, setImportFileName] = useState<string>('');
    const [importModalOpen, setImportModalOpen] = useState(false);
    const [selectedImportTable, setSelectedImportTable] = useState<string>('');

    useEffect(() => {
        loadTables();
    }, []);

    const loadTables = async () => {
        setLoading(true);
        try {
            const tableNames = await dashboardApi.getExportableTables();
            const tablesWithInfo: TableInfo[] = tableNames.map((name) => ({
                name,
                label: TABLE_LABELS[name] || name,
            }));
            setTables(tablesWithInfo);
        } catch {
            message.error('خطا در دریافت لیست جداول');
        }
        setLoading(false);
    };

    const handleSelectAll = (checked: boolean) => {
        setTables((prev) => prev.map((t) => ({ ...t, selected: checked })));
    };

    const handleSelectTable = (tableName: string, checked: boolean) => {
        setTables((prev) => prev.map((t) => t.name === tableName ? { ...t, selected: checked } : t));
    };

    const handleExport = async () => {
        const selectedTables = tables.filter((t) => t.selected);
        if (selectedTables.length === 0) {
            return message.error('حداقل یک جدول را انتخاب کنید');
        }

        setExporting(true);
        try {
            const exportData: Record<string, any[]> = {};

            for (const table of selectedTables) {
                try {
                    const result = await dashboardApi.exportTable(table.name);
                    if (result.ok) {
                        exportData[table.name] = result.data;
                    }
                } catch {
                    message.warning(`خطا در خروجی گرفتن از ${table.label}`);
                }
            }

            const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `export_${new Date().toISOString().split('T')[0]}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            message.success(`خروجی ${Object.keys(exportData).length} جدول با موفقیت دانلود شد`);
        } catch {
            message.error('خطا در خروجی گرفتن');
        }
        setExporting(false);
    };

    const handleFileUpload = (file: File) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = JSON.parse(e.target?.result as string);
                const tableNames = Object.keys(data);

                if (tableNames.length === 0) {
                    return message.error('فایل خالی است');
                }

                setImportData(data);
                setImportFileName(file.name);
                setImportModalOpen(true);
                setSelectedImportTable(tableNames[0]);
            } catch {
                message.error('فایل JSON معتبر نیست');
            }
        };
        reader.readAsText(file);
        return false;
    };

    const handleImport = async () => {
        if (!importData || !selectedImportTable) {
            return message.error('جدولی انتخاب نشده');
        }

        const data = (importData as any)[selectedImportTable];
        if (!data || data.length === 0) {
            return message.error('داده‌ای برای این جدول وجود ندارد');
        }

        setImporting(true);
        try {
            const result = await dashboardApi.importTable(selectedImportTable, data, 'replace');
            if (result.ok) {
                message.success(`${result.imported} ردیف با موفقیت وارد شد`);
                if (result.errors > 0) {
                    message.warning(`${result.errors} خطا رخ داد`);
                }
                setImportModalOpen(false);
                setImportData(null);
                loadTables();
            } else {
                message.error(result.error || 'خطا در وارد کردن');
            }
        } catch {
            message.error('خطا در وارد کردن');
        }
        setImporting(false);
    };

    const selectedCount = tables.filter((t) => t.selected).length;
    const allSelected = tables.length > 0 && tables.every((t) => t.selected);
    const someSelected = tables.some((t) => t.selected) && !allSelected;

    const columns: ColumnsType<TableInfo> = [
        {
            title: <Checkbox checked={allSelected} indeterminate={someSelected} onChange={(e) => handleSelectAll(e.target.checked)} />,
            key: 'select',
            width: 50,
            render: (_, record) => (
                <Checkbox checked={record.selected} onChange={(e) => handleSelectTable(record.name, e.target.checked)} />
            ),
        },
        { title: 'نام جدول', dataIndex: 'label', key: 'label' },
        { title: 'نام انگلیسی', dataIndex: 'name', key: 'name', render: (v: string) => <Tag>{v}</Tag> },
    ];

    return (
        <div>
            <h2 style={{ marginBottom: 24 }}>خروجی / ورودی اطلاعات</h2>

            <Row gutter={[24, 24]}>
                <Col xs={24} lg={14}>
                    <Card title="انتخاب جداول برای خروجی" bordered={false} style={{ borderRadius: 12 }}
                        extra={
                            <Space>
                                <Button type="primary" icon={<DownloadOutlined />} loading={exporting}
                                    onClick={handleExport} disabled={selectedCount === 0}>
                                    خروجی ({selectedCount} جدول)
                                </Button>
                            </Space>
                        }>
                        {loading ? (
                            <Skeleton active paragraph={{ rows: 8 }} />
                        ) : (
                            <Table columns={columns} dataSource={tables} rowKey="name" pagination={false} size="small" />
                        )}
                    </Card>
                </Col>

                <Col xs={24} lg={10}>
                    <Card title="ورودی اطلاعات" bordered={false} style={{ borderRadius: 12 }}>
                        <Space direction="vertical" style={{ width: '100%' }} size="large">
                            <div>
                                <Text strong>فایل JSON را انتخاب کنید:</Text>
                                <Upload.Dragger
                                    accept=".json"
                                    showUploadList={false}
                                    beforeUpload={handleFileUpload}
                                    style={{ marginTop: 8 }}
                                >
                                    <p className="ant-upload-drag-icon">
                                        <UploadOutlined style={{ fontSize: 32, color: '#4f46e5' }} />
                                    </p>
                                    <p className="ant-upload-text">کلیک کنید یا فایل را بکشید</p>
                                    <p className="ant-upload-hint">فرمت: JSON (خروجی همین سیستم)</p>
                                </Upload.Dragger>
                            </div>

                            <Card size="small" style={{ background: '#f6f8fa' }}>
                                <Text type="secondary">
                                    <ExclamationCircleOutlined style={{ marginLeft: 4 }} />
                                    توجه: وارد کردن اطلاعات، داده‌های قبلی جدول انتخاب شده را جایگزین می‌کند.
                                </Text>
                            </Card>
                        </Space>
                    </Card>
                </Col>
            </Row>

            <Modal
                title="ورودی اطلاعات"
                open={importModalOpen}
                onCancel={() => { setImportModalOpen(false); setImportData(null); }}
                onOk={handleImport}
                confirmLoading={importing}
                okText="وارد کردن"
                cancelText="لغو"
            >
                <Space direction="vertical" style={{ width: '100%' }} size="middle">
                    <div>
                        <Text strong>فایل:</Text> <Text>{importFileName}</Text>
                    </div>
                    <div>
                        <Text strong>جدول مقصد:</Text>
                        <Checkbox.Group
                            value={[selectedImportTable]}
                            onChange={(v) => setSelectedImportTable(v[0] as string)}
                            style={{ width: '100%', marginTop: 8 }}
                        >
                            <Space direction="vertical">
                                {importData && Object.keys(importData).map((tableName) => (
                                    <Checkbox key={tableName} value={tableName}>
                                        {TABLE_LABELS[tableName] || tableName}
                                        <Tag style={{ marginRight: 8 }}>{((importData as any)[tableName] || []).length} ردیف</Tag>
                                    </Checkbox>
                                ))}
                            </Space>
                        </Checkbox.Group>
                    </div>
                    <Card size="small" style={{ background: '#fff7e6', border: '1px solid #ffd591' }}>
                        <Text type="warning">
                            <ExclamationCircleOutlined style={{ marginLeft: 4 }} />
                            این عملیات تمام داده‌های قبلی جدول انتخاب شده را پاک کرده و داده‌های جدید را جایگزین می‌کند.
                        </Text>
                    </Card>
                </Space>
            </Modal>
        </div>
    );
}
