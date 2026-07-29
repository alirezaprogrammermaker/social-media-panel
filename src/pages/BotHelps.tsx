import { useEffect, useState } from 'react';
import { Table, Input, InputNumber, Form, message, Modal, Skeleton } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { dashboardApi } from '../api';
import { PageHeader } from '../components/PageHeader';
import { DeleteButton } from '../components/DeleteButton';
import { EditButton } from '../components/EditButton';

interface BotHelp { id: number; name: string; description: string; sort_order: number; created_at: string; }

export function BotHelps() {
    const [helps, setHelps] = useState<BotHelp[]>([]);
    const [loading, setLoading] = useState(true);
    const [createModalVisible, setCreateModalVisible] = useState(false);
    const [editing, setEditing] = useState<BotHelp | null>(null);
    const [createForm] = Form.useForm();
    const [editForm] = Form.useForm();
    const [createLoading, setCreateLoading] = useState(false);
    const [editLoading, setEditLoading] = useState(false);

    async function fetchHelps() { setLoading(true); try { setHelps(await dashboardApi.getBotHelps()); } finally { setLoading(false); } }
    useEffect(() => { fetchHelps(); }, []);

    async function handleCreate() {
        try {
            const values = await createForm.validateFields(); setCreateLoading(true);
            const data = await dashboardApi.createBotHelp({ name: values.name, description: values.description, sort_order: values.sort_order ?? 0 });
            if (!data.ok) return message.error(data.error);
            message.success('راهنما اضافه شد'); setCreateModalVisible(false); createForm.resetFields(); fetchHelps();
        } catch {} finally { setCreateLoading(false); }
    }

    async function handleEdit() {
        if (!editing) return;
        try {
            const values = await editForm.validateFields(); setEditLoading(true);
            const data = await dashboardApi.updateBotHelp(editing.id, { name: values.name, description: values.description, sort_order: values.sort_order ?? 0 });
            if (!data.ok) return message.error(data.error);
            message.success('راهنما بروزرسانی شد'); setEditing(null); fetchHelps();
        } catch {} finally { setEditLoading(false); }
    }

    async function handleDelete(id: number) { await dashboardApi.deleteBotHelp(id); message.success('حذف شد'); setHelps((prev) => prev.filter((h) => h.id !== id)); }

    const columns: ColumnsType<BotHelp> = [
        { title: 'نام', dataIndex: 'name', width: 200 },
        { title: 'توضیحات', dataIndex: 'description', ellipsis: true, render: (v) => <span style={{ whiteSpace: 'pre-wrap' }}>{v}</span> },
        { title: 'ترتیب', dataIndex: 'sort_order', width: 80 },
        { title: '', width: 80, render: (_, record) => (<><EditButton onClick={() => { editForm.setFieldsValue(record); setEditing(record); }} /><DeleteButton onConfirm={() => handleDelete(record.id)} /></>) },
    ];

    return (
        <div>
            <PageHeader title="راهنمای ربات" onAdd={() => setCreateModalVisible(true)} addLabel="راهنمای جدید" />
            {loading ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} active title={{ width: '100%' }} paragraph={{ rows: 1 }} style={{ borderRadius: 8, padding: 16, background: '#fff' }} />)}
                </div>
            ) : (
                <Table dataSource={helps} columns={columns} rowKey="id" loading={loading} pagination={false} />
            )}
            <Modal title="ایجاد راهنمای جدید" open={createModalVisible} onCancel={() => { setCreateModalVisible(false); createForm.resetFields(); }} onOk={handleCreate} okText="ایجاد" cancelText="لغو" confirmLoading={createLoading}>
                <Form form={createForm} layout="vertical">
                    <Form.Item name="name" label="نام راهنما" rules={[{ required: true }]}><Input placeholder="نام راهنما" /></Form.Item>
                    <Form.Item name="description" label="توضیحات" rules={[{ required: true }]}><Input.TextArea placeholder="توضیحات" autoSize={{ minRows: 4, maxRows: 10 }} /></Form.Item>
                    <Form.Item name="sort_order" label="ترتیب نمایش" initialValue={0}><InputNumber min={0} style={{ width: '100%' }} /></Form.Item>
                </Form>
            </Modal>
            <Modal title="ویرایش راهنما" open={!!editing} onCancel={() => setEditing(null)} onOk={handleEdit} okText="ذخیره" cancelText="لغو" confirmLoading={editLoading}>
                <Form form={editForm} layout="vertical">
                    <Form.Item name="name" label="نام راهنما" rules={[{ required: true }]}><Input /></Form.Item>
                    <Form.Item name="description" label="توضیحات" rules={[{ required: true }]}><Input.TextArea autoSize={{ minRows: 4, maxRows: 10 }} /></Form.Item>
                    <Form.Item name="sort_order" label="ترتیب نمایش"><InputNumber min={0} style={{ width: '100%' }} /></Form.Item>
                </Form>
            </Modal>
        </div>
    );
}
