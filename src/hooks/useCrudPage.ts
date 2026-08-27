import { useState, useEffect, useCallback } from 'react';
import { Form, message } from 'antd';

interface UseCrudPageOptions {
    fetchUrl: string;
    createUrl?: string;
    updateUrl?: (id: number) => string;
    deleteUrl?: (id: number) => string;
    toggleUrl?: (id: number) => string;
    entityName: string;
    createMsg?: string;
    updateMsg?: string;
    deleteMsg?: string;
    toggleMsg?: string;
    /** When true, expects `{ data, total, page, pageSize }` from the list endpoint. */
    paginated?: boolean;
}

export function useCrudPage<T extends { id: number }>(options: UseCrudPageOptions) {
    const [items, setItems] = useState<T[]>([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(false);
    const [modalOpen, setModalOpen] = useState(false);
    const [editingItem, setEditingItem] = useState<T | null>(null);
    const [form] = Form.useForm();

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch(options.fetchUrl, { credentials: 'include' });
            if (!res.ok) {
                message.error(`خطا ${res.status}: ${res.statusText}`);
                setLoading(false);
                return;
            }
            const json = await res.json();
            if (options.paginated && json && Array.isArray(json.data)) {
                setItems(json.data);
                setTotal(Number(json.total) || 0);
            } else {
                setItems(json);
                setTotal(Array.isArray(json) ? json.length : 0);
            }
        } catch {
            message.error('خطا در دریافت اطلاعات');
        }
        setLoading(false);
    }, [options.fetchUrl, options.paginated]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const handleCreate = async (values: any) => {
        try {
            const res = await fetch(options.createUrl || options.fetchUrl.split('?')[0], {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify(values),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                message.error(data.error || `خطا ${res.status}`);
                return;
            }
            if (data.ok) {
                message.success(options.createMsg || `${options.entityName} اضافه شد`);
                setModalOpen(false);
                form.resetFields();
                fetchData();
            } else {
                message.error(data.error || 'خطا در ایجاد');
            }
        } catch {
            message.error('خطا در ایجاد');
        }
    };

    const handleEdit = async (values: any) => {
        if (!editingItem) return;
        try {
            const base = options.fetchUrl.split('?')[0];
            const res = await fetch(options.updateUrl?.(editingItem.id) || `${base}/${editingItem.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify(values),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                message.error(data.error || `خطا ${res.status}`);
                return;
            }
            if (data.ok) {
                message.success(options.updateMsg || `${options.entityName} بروزرسانی شد`);
                setModalOpen(false);
                setEditingItem(null);
                form.resetFields();
                fetchData();
            } else {
                message.error(data.error || 'خطا در بروزرسانی');
            }
        } catch {
            message.error('خطا در بروزرسانی');
        }
    };

    const handleDelete = async (id: number) => {
        try {
            const base = options.fetchUrl.split('?')[0];
            const res = await fetch(options.deleteUrl?.(id) || `${base}/${id}`, { method: 'DELETE', credentials: 'include' });
            if (!res.ok) {
                message.error(`خطا ${res.status}`);
                return;
            }
            const data = await res.json();
            if (data.ok) {
                message.success(options.deleteMsg || `${options.entityName} حذف شد`);
                fetchData();
            } else {
                message.error(data.error || 'خطا در حذف');
            }
        } catch {
            message.error('خطا در حذف');
        }
    };

    const handleToggle = async (id: number, isActive: boolean) => {
        try {
            const base = options.fetchUrl.split('?')[0];
            const res = await fetch(options.toggleUrl?.(id) || `${base}/${id}/toggle`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ is_active: isActive }),
            });
            if (!res.ok) {
                message.error(`خطا ${res.status}`);
                return;
            }
            const data = await res.json();
            if (data.ok) {
                message.success(options.toggleMsg || 'وضعیت بروزرسانی شد');
                fetchData();
            }
        } catch {
            message.error('خطا در بروزرسانی');
        }
    };

    const openCreateModal = () => {
        setEditingItem(null);
        form.resetFields();
        setModalOpen(true);
    };

    const openEditModal = (item: T) => {
        setEditingItem(item);
        form.setFieldsValue(item);
        setModalOpen(true);
    };

    const closeModal = () => {
        setModalOpen(false);
        setEditingItem(null);
        form.resetFields();
    };

    return {
        items,
        setItems,
        total,
        loading,
        modalOpen,
        editingItem,
        form,
        fetchData,
        handleCreate,
        handleEdit,
        handleDelete,
        handleToggle,
        openCreateModal,
        openEditModal,
        closeModal,
    };
}
