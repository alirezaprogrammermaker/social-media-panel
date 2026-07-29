import { useState } from 'react';
import { Table, Modal, Form, Input, InputNumber, Skeleton, Button, Space, Popconfirm, message } from 'antd';
import { SearchOutlined, DeleteOutlined, CheckCircleOutlined, CloseCircleOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { useCrudPage } from '../hooks/useCrudPage';
import { PageHeader } from '../components/PageHeader';
import { DeleteButton } from '../components/DeleteButton';
import { EditButton } from '../components/EditButton';
import { ActiveSwitch } from '../components/ActiveSwitch';
import { smmApi } from '../api';

interface Category { id: number; name: string; sort_order: number; is_active: number; created_at: string; }

export default function Categories() {
    const [searchText, setSearchText] = useState('');
    const [selectedRowKeys, setSelectedRowKeys] = useState<number[]>([]);
    const {
        items: categories, loading, modalOpen, editingItem, form, fetchData,
        handleCreate, handleEdit, handleDelete,
        openCreateModal, openEditModal, closeModal,
    } = useCrudPage<Category>({ fetchUrl: '/api/smm/categories', entityName: 'دسته‌بندی' });

    const filteredCategories = categories.filter((c) => c.name.toLowerCase().includes(searchText.toLowerCase()));

    const handleToggleActive = async (id: number, isActive: boolean) => {
        try {
            const data = await smmApi.toggleCategory(id, isActive);
            if (data.ok) { message.success(isActive ? 'فعال شد' : 'غیرفعال شد'); fetchData(); }
            else message.error(data.error || 'خطا');
        } catch { message.error('خطا'); }
    };

    const handleBulkAction = async (action: 'activate' | 'deactivate' | 'delete') => {
        if (selectedRowKeys.length === 0) return message.error('هیچ موردی انتخاب نشده');
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
                    await smmApi.deleteCategory(id);
                } else {
                    await smmApi.toggleCategory(id, action === 'activate');
                }
                successCount++;
            } catch {}
        }
        message.success(`${successCount} مورد ${actionLabel} شد`);
        setSelectedRowKeys([]);
        fetchData();
    };

    const rowSelection = {
        selectedRowKeys,
        onChange: (keys: React.Key[]) => setSelectedRowKeys(keys as number[]),
    };

    const columns: ColumnsType<Category> = [
        { title: 'نام', dataIndex: 'name', key: 'name' },
        { title: 'ترتیب', dataIndex: 'sort_order', key: 'sort_order' },
        {
            title: 'وضعیت', dataIndex: 'is_active', key: 'is_active',
            render: (_, record) => <ActiveSwitch isActive={record.is_active} onChange={(checked) => handleToggleActive(record.id, checked)} />,
        },
        { title: 'تاریخ ایجاد', dataIndex: 'created_at', key: 'created_at', render: (d: string) => new Date(d).toLocaleString('fa-IR') },
        { title: 'عملیات', key: 'actions', render: (_, record) => (<><EditButton onClick={() => openEditModal(record)} /><DeleteButton onConfirm={() => handleDelete(record.id)} /></>) },
    ];

    return (
        <div>
            <PageHeader title="دسته‌بندی‌ها" onAdd={openCreateModal} addLabel="افزودن دسته‌بندی"
                extra={<Input placeholder="جستجو..." prefix={<SearchOutlined />} value={searchText} onChange={(e) => setSearchText(e.target.value)} style={{ width: 250 }} allowClear />} />

            {selectedRowKeys.length > 0 && (
                <div style={{ marginBottom: 16, padding: '12px 16px', background: '#f0f5ff', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span><strong>{selectedRowKeys.length}</strong> مورد انتخاب شده</span>
                    <Space>
                        <Button size="small" icon={<CheckCircleOutlined />} onClick={() => handleBulkAction('activate')}>فعال‌سازی</Button>
                        <Button size="small" icon={<CloseCircleOutlined />} onClick={() => handleBulkAction('deactivate')}>غیرفعال‌سازی</Button>
                        <Popconfirm title="آیا از حذف مطمئن هستید؟" onConfirm={() => handleBulkAction('delete')}>
                            <Button size="small" danger icon={<DeleteOutlined />}>حذف</Button>
                        </Popconfirm>
                    </Space>
                </div>
            )}

            {loading ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} active title={{ width: '100%' }} paragraph={{ rows: 1 }} style={{ borderRadius: 8, padding: 16, background: '#fff' }} />)}
                </div>
            ) : (
                <Table scroll={{ x: true }} columns={columns} dataSource={filteredCategories} rowKey="id" loading={loading}
                    rowSelection={rowSelection} pagination={{ pageSize: 20, showSizeChanger: true, showTotal: (total) => `${total} مورد` }} />
            )}

            <Modal title={editingItem ? 'ویرایش دسته‌بندی' : 'افزودن دسته‌بندی'} open={modalOpen} onCancel={closeModal} onOk={() => form.submit()}>
                <Form form={form} onFinish={editingItem ? handleEdit : handleCreate} layout="vertical">
                    <Form.Item name="name" label="نام" rules={[{ required: true, message: 'نام الزامی است' }]}><Input /></Form.Item>
                    <Form.Item name="sort_order" label="ترتیب"><InputNumber min={0} style={{ width: '100%' }} /></Form.Item>
                </Form>
            </Modal>
        </div>
    );
}
