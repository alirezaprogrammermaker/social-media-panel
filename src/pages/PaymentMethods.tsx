import { useEffect, useState } from 'react';
import { Table, message, Modal, Input, InputNumber, Form, Skeleton } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { dashboardApi } from '../api';
import { PageHeader } from '../components/PageHeader';
import { DeleteButton } from '../components/DeleteButton';
import { EditButton } from '../components/EditButton';
import { ActiveSwitch } from '../components/ActiveSwitch';

interface PaymentMethod { id: number; name: string; card_number: string; card_holder: string; min_amount: number; max_amount: number; is_active: number; created_at: string; }

export function PaymentMethods() {
    const [methods, setMethods] = useState<PaymentMethod[]>([]);
    const [loading, setLoading] = useState(true);
    const [modalVisible, setModalVisible] = useState(false);
    const [editingMethod, setEditingMethod] = useState<PaymentMethod | null>(null);
    const [form] = Form.useForm();

    async function fetchMethods() { setLoading(true); try { setMethods(await dashboardApi.getPaymentMethods()); } finally { setLoading(false); } }
    useEffect(() => { fetchMethods(); }, []);

    async function handleCreate() { try { const values = await form.validateFields(); const data = await dashboardApi.createPaymentMethod(values); if (!data.ok) return message.error(data.error); message.success('ایجاد شد'); setModalVisible(false); form.resetFields(); fetchMethods(); } catch {} }
    async function handleEdit() { if (!editingMethod) return; try { const values = await form.validateFields(); const data = await dashboardApi.updatePaymentMethod(editingMethod.id, values); if (!data.ok) return message.error(data.error); message.success('بروزرسانی شد'); setModalVisible(false); setEditingMethod(null); form.resetFields(); fetchMethods(); } catch {} }
    async function handleDelete(id: number) { await dashboardApi.deletePaymentMethod(id); message.success('حذف شد'); setMethods((prev) => prev.filter((m) => m.id !== id)); }
    async function handleToggleActive(id: number, checked: boolean) { const data = await dashboardApi.togglePaymentMethod(id, checked); if (!data.ok) return message.error(data.error); message.success(checked ? 'فعال شد' : 'غیرفعال شد'); setMethods((prev) => prev.map((m) => (m.id === id ? { ...m, is_active: checked ? 1 : 0 } : m))); }

    const columns: ColumnsType<PaymentMethod> = [
        { title: 'نام', dataIndex: 'name' },
        { title: 'شماره کارت', dataIndex: 'card_number', render: (v) => <span style={{ direction: 'ltr' }}>{v}</span> },
        { title: 'نام صاحب کارت', dataIndex: 'card_holder' },
        { title: 'حداقل', dataIndex: 'min_amount', render: (v) => v?.toLocaleString() + ' تومان' },
        { title: 'حداکثر', dataIndex: 'max_amount', render: (v) => v?.toLocaleString() + ' تومان' },
        { title: 'وضعیت', dataIndex: 'is_active', render: (_, r) => <ActiveSwitch isActive={r.is_active} onChange={(c) => handleToggleActive(r.id, c)} /> },
        { title: '', width: 100, render: (_, r) => (<><EditButton onClick={() => { setEditingMethod(r); form.setFieldsValue(r); setModalVisible(true); }} /><DeleteButton onConfirm={() => handleDelete(r.id)} /></>) },
    ];

    return (
        <div>
            <PageHeader title="روش‌های پرداخت" onAdd={() => { setEditingMethod(null); form.resetFields(); setModalVisible(true); }} addLabel="افزودن روش پرداخت" />
            {loading ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} active title={{ width: '100%' }} paragraph={{ rows: 1 }} style={{ borderRadius: 8, padding: 16, background: '#fff' }} />)}
                </div>
            ) : (
                <Table dataSource={methods} columns={columns} rowKey="id" loading={loading} pagination={false} />
            )}
            <Modal title={editingMethod ? 'ویرایش روش پرداخت' : 'افزودن روش پرداخت'} open={modalVisible}
                onCancel={() => { setModalVisible(false); setEditingMethod(null); form.resetFields(); }}
                onOk={editingMethod ? handleEdit : handleCreate} okText={editingMethod ? 'بروزرسانی' : 'افزودن'} cancelText="لغو">
                <Form form={form} layout="vertical">
                    <Form.Item name="name" label="نام" rules={[{ required: true }]}><Input placeholder="مثال: کارت به کارت" /></Form.Item>
                    <Form.Item name="card_number" label="شماره کارت" rules={[{ required: true }]}><Input placeholder="شماره 16 رقمی کارت" style={{ direction: 'ltr' }} /></Form.Item>
                    <Form.Item name="card_holder" label="نام صاحب کارت" rules={[{ required: true }]}><Input placeholder="نام و نام خانوادگی" /></Form.Item>
                    <Form.Item name="min_amount" label="حداقل مبلغ (تومان)" rules={[{ required: true }]}><InputNumber min={1} style={{ width: '100%' }} placeholder="10000" /></Form.Item>
                    <Form.Item name="max_amount" label="حداکثر مبلغ (تومان)" rules={[{ required: true }]}><InputNumber min={1} style={{ width: '100%' }} placeholder="50000000" /></Form.Item>
                </Form>
            </Modal>
        </div>
    );
}