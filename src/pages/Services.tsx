import { useState, useEffect } from 'react';
import { Table, Button, Modal, Form, Input, InputNumber, Select, Space, Tag, message, Skeleton, Tooltip, Popconfirm } from 'antd';
import { PlusOutlined, CheckCircleOutlined, CloseCircleOutlined, SyncOutlined, SearchOutlined, CloudDownloadOutlined, TranslationOutlined, RobotOutlined, DeleteOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { useCrudPage } from '../hooks/useCrudPage';
import { smmApi, aiApi } from '../api';
import { PageHeader } from '../components/PageHeader';
import { DeleteButton } from '../components/DeleteButton';
import { EditButton } from '../components/EditButton';

interface Service {
    id: number; name: string; description?: string; category_id: number; category_name: string; type: string; rate: string;
    min: string; max: string; refill: boolean; cancel: boolean;
    api_provider_id: number | null; api_provider_service_id: number | null;
    api_provider_service_price: string | null; is_active: number;
}
interface Category { id: number; name: string; }
interface ApiProvider { id: number; name: string; }

export default function Services() {
    const [categories, setCategories] = useState<Category[]>([]);
    const [providers, setProviders] = useState<ApiProvider[]>([]);
    const [syncing, setSyncing] = useState(false);
    const [searchText, setSearchText] = useState('');
    const [selectedRowKeys, setSelectedRowKeys] = useState<number[]>([]);
    const [addFromApiModalOpen, setAddFromApiModalOpen] = useState(false);
    const [addFromApiLoading, setAddFromApiLoading] = useState(false);
    const [dollarRate, setDollarRate] = useState<number>(50000);
    const [addFromApiForm] = Form.useForm();
    const [translating, setTranslating] = useState(false);
    const [generatingDesc, setGeneratingDesc] = useState(false);
    const [translationSettings, setTranslationSettings] = useState<{ translatePrompt: string; descPrompt: string }>({ translatePrompt: '', descPrompt: '' });

    const {
        items: services, loading, modalOpen, editingItem, form, fetchData,
        handleCreate, handleEdit, handleDelete, handleToggle,
        openCreateModal, openEditModal, closeModal,
    } = useCrudPage<Service>({ fetchUrl: '/api/smm/services', entityName: 'سرویس' });

    useEffect(() => {
        fetchCategories();
        (async () => {
            const [provRes, settingsRes, aiSettingsRes] = await Promise.all([
                smmApi.getApiProviders(),
                fetch('/api/dashboard/settings', { credentials: 'include' }).then(r => r.json()),
                aiApi.getSettings().catch(() => ({})),
            ]);
            setProviders(provRes);
            if (settingsRes.dollar_rate) setDollarRate(Number(settingsRes.dollar_rate));
            if (aiSettingsRes?.admin) {
                setTranslationSettings({
                    translatePrompt: aiSettingsRes.admin.ai_admin_translate_prompt || '',
                    descPrompt: aiSettingsRes.admin.ai_admin_description_prompt || '',
                });
            }
        })();
    }, []);

    useEffect(() => {
        if (modalOpen && !editingItem) {
            const current = form.getFieldValue('api_provider_id');
            // Only default to manual when opening a blank create form (not add-from-API prefill)
            if (current === undefined || current === null) {
                form.setFieldValue('api_provider_id', 'manual');
            }
        }
    }, [modalOpen, editingItem, form]);

    const fetchCategories = async () => { setCategories(await smmApi.getCategories()); };

    const handleTranslate = async () => {
        const name = form.getFieldValue('name');
        if (!name?.trim()) return message.error('ابتدا نام سرویس را وارد کنید');
        setTranslating(true);
        try {
            const values = form.getFieldsValue();
            const serviceInfo = `نام: ${values.name || ''}, نوع: ${values.type || 'Default'}, قیمت: ${values.rate || '0'} تومان به ازای هر ۱۰۰۰, حداقل: ${values.min || '1'}, حداکثر: ${values.max || '1000'}`;
            const basePrompt = translationSettings.translatePrompt || 'Translate the following service name to Persian (Farsi). Only return the translated name, nothing else: {service}';
            const prompt = basePrompt.replace(/\{service\}/g, serviceInfo);
            const data = await aiApi.chat(prompt, 'admin');
            if (data.response) {
                form.setFieldValue('name', data.response.trim());
                message.success('ترجمه اعمال شد');
            } else {
                message.error(data.error || 'خطا در ترجمه');
            }
        } catch (e: any) { message.error(e?.message || 'خطا در ترجمه'); }
        setTranslating(false);
    };

    const handleGenerateDescription = async () => {
        const values = form.getFieldsValue();
        if (!values.name) return message.error('ابتدا نام سرویس را وارد کنید');
        setGeneratingDesc(true);
        try {
            const serviceInfo = `نام: ${values.name}, نوع: ${values.type || 'Default'}, قیمت: ${values.rate || '0'} تومان به ازای هر ۱۰۰۰, حداقل: ${values.min || '1'}, حداکثر: ${values.max || '1000'}`;
            const basePrompt = translationSettings.descPrompt || 'Generate a professional description for this SMM service in Persian (Farsi). Be concise and informative. Service info: {service}';
            const prompt = basePrompt.replace(/\{service\}/g, serviceInfo);
            const data = await aiApi.chat(prompt, 'admin');
            if (data.response) {
                form.setFieldValue('description', data.response.trim());
                message.success('توضیحات تولید شد');
            } else {
                message.error(data.error || 'خطا در تولید توضیحات');
            }
        } catch (e: any) { message.error(e?.message || 'خطا در تولید توضیحات'); }
        setGeneratingDesc(false);
    };

    const handleSync = async () => {
        setSyncing(true);
        try {
            const data = await smmApi.syncServices();
            if (data.ok) {
                const totalAdded = data.results.reduce((sum: number, r: any) => sum + r.added, 0);
                const totalUpdated = data.results.reduce((sum: number, r: any) => sum + r.updated, 0);
                message.success(`همگام‌سازی انجام شد: ${totalAdded} اضافه، ${totalUpdated} بروزرسانی`);
                fetchData();
            } else message.error(data.error || 'خطا در همگام‌سازی');
        } catch { message.error('خطا در همگام‌سازی'); }
        setSyncing(false);
    };

    const handleAddFromApi = async (values: any) => {
        setAddFromApiLoading(true);
        try {
            const data = await smmApi.addServiceFromApi(values);
            if (data.ok) {
                setAddFromApiModalOpen(false); addFromApiForm.resetFields();
                const service = data.service;
                const matchedCategory = categories.find((c) => c.name.toLowerCase() === service.category_name?.toLowerCase());
                const priceInToman = Math.ceil(parseFloat(service.api_provider_service_price || '0') * dollarRate);
                const prefill = {
                    name: service.name,
                    type: service.type,
                    rate: String(priceInToman),
                    min: String(service.min ?? '1'),
                    max: String(service.max ?? '1000'),
                    category_id: matchedCategory?.id,
                    api_provider_id: service.api_provider_id,
                    api_provider_service_id: service.api_provider_service_id,
                    api_provider_service_price: service.api_provider_service_price,
                };
                openCreateModal();
                // After openCreateModal's default 'manual' effect, apply API prefill
                setTimeout(() => form.setFieldsValue(prefill), 0);
            } else message.error(data.error || 'خطا در دریافت اطلاعات سرویس');
        } catch { message.error('خطا در دریافت اطلاعات سرویس'); }
        setAddFromApiLoading(false);
    };

    const handleCategoryChange = (value: string) => {
        if (value === 'new') {
            Modal.confirm({
                title: 'افزودن دسته‌بندی جدید', content: <Input id="new-category-name" placeholder="نام دسته‌بندی" />,
                okText: 'افزودن', cancelText: 'لغو',
                onOk: async () => {
                    const input = document.getElementById('new-category-name') as HTMLInputElement;
                    const name = input?.value?.trim();
                    if (name) {
                        const data = await smmApi.createCategory({ name, sort_order: 0 });
                        if (data.ok) {
                            message.success('دسته‌بندی اضافه شد');
                            await fetchCategories();
                            const newId = data.category?.id ?? data.category?.lastInsertRowid;
                            if (newId) form.setFieldValue('category_id', newId);
                        }
                    }
                },
            });
            form.setFieldValue('category_id', undefined);
        }
    };

    const handleFormSubmit = (values: any) => {
        const submitValues = {
            ...values,
            api_provider_id: values.api_provider_id === 'manual' ? null : (values.api_provider_id || null),
            api_provider_service_id: values.api_provider_service_id != null && values.api_provider_service_id !== ''
                ? Number(values.api_provider_service_id)
                : null,
        };
        if (editingItem) {
            handleEdit(submitValues);
        } else {
            handleCreate(submitValues);
        }
    };

    const filteredServices = services.filter((s) => s.name.toLowerCase().includes(searchText.toLowerCase()) || s.category_name?.toLowerCase().includes(searchText.toLowerCase()));

    const handleBulkAction = async (action: 'activate' | 'deactivate' | 'delete' | 'change-category', categoryId?: number) => {
        if (selectedRowKeys.length === 0) return message.error('هیچ موردی انتخاب نشده');

        if (action === 'change-category') {
            if (!categoryId) return message.error('دسته‌بندی را انتخاب کنید');
            const catName = categories.find((c) => c.id === categoryId)?.name || '';

            let successCount = 0;
            for (const id of selectedRowKeys) {
                try {
                    await smmApi.updateService(id, { category_id: categoryId });
                    successCount++;
                } catch {}
            }
            message.success(`دسته‌بندی ${successCount} سرویس به "${catName}" تغییر کرد`);
            setSelectedRowKeys([]);
            fetchData();
            return;
        }

        const actionLabel = action === 'activate' ? 'فعال' : action === 'deactivate' ? 'غیرفعال' : 'حذف';
        const confirmed = await new Promise<boolean>((resolve) => {
            Modal.confirm({
                title: `${actionLabel} ${selectedRowKeys.length} مورد؟`,
                content: action === 'delete' ? 'آیا از حذف مطمئن هستید؟' : undefined,
                okText: action === 'delete' ? 'حذف' : actionLabel,
                cancelText: 'لغو',
                onOk: () => resolve(true),
                onCancel: () => resolve(false),
            });
        });
        if (!confirmed) return;

        let successCount = 0;
        for (const id of selectedRowKeys) {
            try {
                if (action === 'delete') {
                    await smmApi.deleteService(id);
                } else {
                    await smmApi.toggleService(id, action === 'activate');
                }
                successCount++;
            } catch {}
        }
        message.success(`${successCount} مورد ${actionLabel} شد`);
        setSelectedRowKeys([]);
        fetchData();
    };

    const [bulkCategoryModalOpen, setBulkCategoryModalOpen] = useState(false);
    const [bulkCategoryValue, setBulkCategoryValue] = useState<number | undefined>(undefined);

    const rowSelection = {
        selectedRowKeys,
        onChange: (keys: React.Key[]) => setSelectedRowKeys(keys as number[]),
    };

    const columns: ColumnsType<Service> = [
        { title: 'نام', dataIndex: 'name', key: 'name', ellipsis: true },
        { title: 'توضیحات', dataIndex: 'description', key: 'description', ellipsis: true, width: 200, render: (v: string) => v || '-' },
        { title: 'دسته‌بندی', dataIndex: 'category_name', key: 'category_name' },
        { title: 'نوع', dataIndex: 'type', key: 'type' },
        { title: 'قیمت', dataIndex: 'rate', key: 'rate' },
        { title: 'حداقل', dataIndex: 'min', key: 'min' },
        { title: 'حداکثر', dataIndex: 'max', key: 'max' },
        { title: 'قیمت API (تومان)', key: 'api_price', render: (_, r) => r.api_provider_service_price ? `${Math.ceil(parseFloat(r.api_provider_service_price) * dollarRate).toLocaleString()} تومان` : '-' },
        { title: 'وضعیت', dataIndex: 'is_active', key: 'is_active', render: (v: number) => <Tag color={v ? 'green' : 'red'}>{v ? 'فعال' : 'غیرفعال'}</Tag> },
        { title: 'عملیات', key: 'actions', render: (_, record) => (
            <Space>
                <Button type="link" size="small" icon={record.is_active ? <CloseCircleOutlined /> : <CheckCircleOutlined />}
                    onClick={() => handleToggle(record.id, !record.is_active)}>{record.is_active ? 'غیرفعال' : 'فعال'}</Button>
                <EditButton onClick={() => openEditModal(record)} />
                <DeleteButton onConfirm={() => handleDelete(record.id)} />
            </Space>
        ) },
    ];

    return (
        <div>
            <PageHeader title="سرویس‌ها" onAdd={openCreateModal} addLabel="افزودن سرویس"
                extra={<Space wrap>
                    <Input placeholder="جستجوی سرویس..." prefix={<SearchOutlined />} value={searchText} onChange={(e) => setSearchText(e.target.value)} style={{ width: 250 }} allowClear />
                    <Button icon={<SyncOutlined />} loading={syncing} onClick={() => Modal.confirm({ title: 'همگام‌سازی سرویس‌ها', content: 'آیا مطمئن هستید؟', okText: 'بله', cancelText: 'خیر', onOk: handleSync })}>همگام‌سازی</Button>
                    <Button icon={<CloudDownloadOutlined />} onClick={() => setAddFromApiModalOpen(true)}>افزودن از API</Button>
                </Space>} />

            {selectedRowKeys.length > 0 && (
                <div style={{ marginBottom: 16, padding: '12px 16px', background: '#f0f5ff', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span><strong>{selectedRowKeys.length}</strong> مورد انتخاب شده</span>
                    <Space wrap>
                        <Button size="small" icon={<CheckCircleOutlined />} onClick={() => handleBulkAction('activate')}>فعال‌سازی</Button>
                        <Button size="small" icon={<CloseCircleOutlined />} onClick={() => handleBulkAction('deactivate')}>غیرفعال‌سازی</Button>
                        <Button size="small" onClick={() => { setBulkCategoryValue(undefined); setBulkCategoryModalOpen(true); }}>تغییر دسته‌بندی</Button>
                        <Popconfirm title="آیا از حذف مطمئن هستید؟" onConfirm={() => handleBulkAction('delete')}>
                            <Button size="small" danger icon={<DeleteOutlined />}>حذف</Button>
                        </Popconfirm>
                    </Space>
                </div>
            )}

            <Modal title="تغییر دسته‌بندی گروهی" open={bulkCategoryModalOpen}
                onCancel={() => setBulkCategoryModalOpen(false)}
                onOk={() => { handleBulkAction('change-category', bulkCategoryValue); setBulkCategoryModalOpen(false); }}
                okText="تغییر" cancelText="لغو">
                <p>{selectedRowKeys.length} سرویس انتخاب شده</p>
                <Select placeholder="انتخاب دسته‌بندی جدید" style={{ width: '100%' }}
                    value={bulkCategoryValue} onChange={(v) => setBulkCategoryValue(v)}>
                    {categories.map((cat) => <Select.Option key={cat.id} value={cat.id}>{cat.name}</Select.Option>)}
                </Select>
            </Modal>

            {loading ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} active title={{ width: '100%' }} paragraph={{ rows: 1 }} style={{ borderRadius: 8, padding: 16, background: '#fff' }} />)}
                </div>
            ) : (
                <Table scroll={{ x: true }} columns={columns} dataSource={filteredServices} rowKey="id" loading={loading}
                    rowSelection={rowSelection} pagination={{ pageSize: 20, showSizeChanger: true, showTotal: (total) => `${total} مورد` }} />
            )}
            <Modal title={editingItem ? 'ویرایش سرویس' : 'افزودن سرویس'} open={modalOpen} onCancel={closeModal} onOk={() => form.submit()} width={650}>
                <Form form={form} onFinish={handleFormSubmit} layout="vertical">
                    <Space.Compact style={{ width: '100%' }}>
                        <Form.Item name="name" label="نام" rules={[{ required: true, message: 'نام الزامی است' }]} style={{ flex: 1 }}><Input /></Form.Item>
                        <Tooltip title="ترجمه با هوش مصنوعی">
                            <Button icon={<TranslationOutlined />} loading={translating} onClick={handleTranslate} style={{ marginTop: 32 }}>ترجمه</Button>
                        </Tooltip>
                    </Space.Compact>
                    <Space.Compact style={{ width: '100%' }}>
                        <Form.Item name="description" label="توضیحات" style={{ flex: 1 }}><Input.TextArea rows={3} placeholder="توضیحات سرویس (اختیاری)" /></Form.Item>
                        <Tooltip title="تولید توضیحات با هوش مصنوعی">
                            <Button icon={<RobotOutlined />} loading={generatingDesc} onClick={handleGenerateDescription} style={{ marginTop: 32 }}>تولید</Button>
                        </Tooltip>
                    </Space.Compact>
                    <Form.Item name="category_id" label="دسته‌بندی" rules={[{ required: true, message: 'دسته‌بندی الزامی است' }]}>
                        <Select placeholder="انتخاب دسته‌بندی" onChange={handleCategoryChange}
                            dropdownRender={(menu) => (<>{menu}<div style={{ padding: '4px 8px', borderTop: '1px solid #f0f0f0' }}><Button type="link" icon={<PlusOutlined />} onClick={() => handleCategoryChange('new')} style={{ width: '100%', textAlign: 'left' }}>افزودن دسته‌بندی جدید</Button></div></>)}>
                            {categories.map((cat) => <Select.Option key={cat.id} value={cat.id}>{cat.name}</Select.Option>)}
                        </Select>
                    </Form.Item>
                    <Form.Item name="type" label="نوع"><Select placeholder="انتخاب نوع">
                        <Select.Option value="Default">Default</Select.Option><Select.Option value="Custom Comments">Custom Comments</Select.Option>
                        <Select.Option value="Package">Package</Select.Option><Select.Option value="Mentions">Mentions</Select.Option>
                        <Select.Option value="Subscriptions">Subscriptions</Select.Option>
                    </Select></Form.Item>
                    <Form.Item noStyle shouldUpdate={(prev, cur) => prev.type !== cur.type}>
                        {() => {
                            const isPackage = form.getFieldValue('type') === 'Package';
                            return (
                                <Space>
                                    <Form.Item
                                        name="rate"
                                        label={isPackage ? 'قیمت پکیج (تومان)' : 'قیمت (تومان / ۱۰۰۰)'}
                                        tooltip={isPackage
                                            ? 'برای پکیج، مبلغ نهایی مشتری را وارد کنید (نه قیمت هر ۱۰۰۰)'
                                            : 'قیمت فروش به ازای هر ۱۰۰۰ واحد؛ با همگام‌سازی API روی api_provider_service_price نوشته می‌شود و rate فروش دستی می‌ماند'}
                                    >
                                        <Input />
                                    </Form.Item>
                                    <Form.Item name="min" label="حداقل"><Input /></Form.Item>
                                    <Form.Item name="max" label="حداکثر"><Input /></Form.Item>
                                </Space>
                            );
                        }}
                    </Form.Item>
                    <Form.Item name="api_provider_id" label="ارائه‌دهنده API">
                        <Select placeholder="انتخاب ارائه‌دهنده" allowClear>
                            <Select.Option key="manual" value="manual">دستی</Select.Option>
                            {providers.map((p) => <Select.Option key={p.id} value={p.id}>{p.name}</Select.Option>)}
                        </Select>
                    </Form.Item>
                    <Form.Item name="api_provider_service_id" label="شناسه سرویس API"><Input placeholder="شناسه سرویس در ارائه‌دهنده (اختیاری)" /></Form.Item>
                    <Form.Item name="api_provider_service_price" label="قیمت API (دلار)"><Input placeholder="قیمت از ارائه‌دهنده" disabled /></Form.Item>
                </Form>
            </Modal>
            <Modal title="افزودن سرویس از ارائه‌دهنده" open={addFromApiModalOpen} onCancel={() => { setAddFromApiModalOpen(false); addFromApiForm.resetFields(); }} onOk={() => addFromApiForm.submit()} confirmLoading={addFromApiLoading}>
                <Form form={addFromApiForm} onFinish={handleAddFromApi} layout="vertical">
                    <Form.Item name="api_provider_id" label="ارائه‌دهنده API" rules={[{ required: true, message: 'ارائه‌دهنده الزامی است' }]}><Select placeholder="انتخاب ارائه‌دهنده">{providers.map((p) => <Select.Option key={p.id} value={p.id}>{p.name}</Select.Option>)}</Select></Form.Item>
                    <Form.Item name="service_id" label="شناسه سرویس" rules={[{ required: true, message: 'شناسه سرویس الزامی است' }]}><InputNumber min={1} style={{ width: '100%' }} placeholder="شناسه سرویس در ارائه‌دهنده" /></Form.Item>
                </Form>
            </Modal>
        </div>
    );
}
