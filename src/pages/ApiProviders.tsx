import { Table, Button, Modal, Form, Input, Space, message, Skeleton } from 'antd';
import { SyncOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { useCrudPage } from '../hooks/useCrudPage';
import { smmApi } from '../api';
import { PageHeader } from '../components/PageHeader';
import { DeleteButton } from '../components/DeleteButton';
import { EditButton } from '../components/EditButton';
import { ActiveSwitch } from '../components/ActiveSwitch';

interface ApiProvider {
    id: number; name: string; api_url: string; api_key: string;
    balance: string; currency: string; is_active: number; last_sync_at: string; created_at: string;
}

export default function ApiProviders() {
    const {
        items: providers, loading, modalOpen, editingItem, form, fetchData,
        handleCreate, handleEdit, handleDelete, handleToggle,
        openCreateModal, openEditModal, closeModal,
    } = useCrudPage<ApiProvider>({ fetchUrl: '/api/smm/api-providers', entityName: 'ارائه‌دهنده' });

    const handleSync = async (id: number) => {
        try {
            const data = await smmApi.syncApiProvider(id);
            if (data.ok) { message.success('مانده حساب بروزرسانی شد'); fetchData(); }
            else message.error(data.error || 'خطا در همگام‌سازی');
        } catch { message.error('خطا در همگام‌سازی'); }
    };

    const handleSyncAll = async () => {
        const data = await smmApi.syncAllApiProviders();
        if (data.ok) { message.success('همگام‌سازی انجام شد'); fetchData(); }
    };

    const columns: ColumnsType<ApiProvider> = [
        { title: 'نام', dataIndex: 'name', key: 'name' },
        { title: 'آدرس API', dataIndex: 'api_url', key: 'api_url', ellipsis: true },
        { title: 'موجودی', key: 'balance', render: (_, r) => <span>{r.balance || '0'} {r.currency || 'USD'}</span> },
        { title: 'وضعیت', dataIndex: 'is_active', key: 'is_active',
            render: (_, record) => <ActiveSwitch isActive={record.is_active} onChange={(checked) => handleToggle(record.id, checked)} /> },
        { title: 'آخرین همگام‌سازی', dataIndex: 'last_sync_at', key: 'last_sync_at',
            render: (date: string) => date ? new Date(date).toLocaleString('fa-IR') : '-' },
        { title: 'عملیات', key: 'actions',
            render: (_, record) => (
                <Space>
                    <Button type="link" size="small" icon={<SyncOutlined />} onClick={() => handleSync(record.id)}>همگام‌سازی</Button>
                    <EditButton onClick={() => openEditModal(record)} />
                    <DeleteButton onConfirm={() => handleDelete(record.id)} />
                </Space>
            ) },
    ];

    return (
        <div>
            <PageHeader title="ارائه‌دهندگان API" onAdd={openCreateModal} addLabel="افزودن ارائه‌دهنده"
                extra={<Button icon={<SyncOutlined />} onClick={handleSyncAll}>همگام‌سازی همه</Button>} />
            {loading ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {Array.from({ length: 5 }).map((_, i) => (
                        <Skeleton key={i} active title={{ width: '100%' }} paragraph={{ rows: 1 }} style={{ borderRadius: 8, padding: 16, background: '#fff' }} />
                    ))}
                </div>
            ) : (
                <Table columns={columns} dataSource={providers} rowKey="id" loading={loading} scroll={{ x: 800 }} />
            )}
            <Modal title={editingItem ? 'ویرایش ارائه‌دهنده' : 'افزودن ارائه‌دهنده'}
                open={modalOpen} onCancel={closeModal} onOk={() => form.submit()}>
                <Form form={form} onFinish={editingItem ? handleEdit : handleCreate} layout="vertical">
                    <Form.Item name="name" label="نام" rules={[{ required: true, message: 'نام الزامی است' }]}><Input /></Form.Item>
                    <Form.Item name="api_url" label="آدرس API" rules={[{ required: true, message: 'آدرس API الزامی است' }]}><Input placeholder="https://example.com/api/v2" /></Form.Item>
                    <Form.Item name="api_key" label="کلید API" rules={[{ required: true, message: 'کلید API الزامی است' }]}><Input.Password /></Form.Item>
                </Form>
            </Modal>
        </div>
    );
}
