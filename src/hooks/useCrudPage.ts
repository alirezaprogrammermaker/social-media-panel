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
}

export function useCrudPage<T extends { id: number }>(options: UseCrudPageOptions) {
    const [items, setItems] = useState<T[]>([]);
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
            setItems(await res.json());
        } catch {
            message.error('خطا در دریافت اطلاعات');
        }
        setLoading(false);
    }, [options.fetchUrl]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const handleCreate = async (values: any) => {
        try {
            const res = await fetch(options.createUrl || options.fetchUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify(values),
            });
            if (!res.ok) {
                message.error(`خطا ${res.status}`);
                return;
            }
            const data = await res.json();
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
            const res = await fetch(options.updateUrl?.(editingItem.id) || `${options.fetchUrl}/${editingItem.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify(values),
            });
            if (!res.ok) {
                message.error(`خطا ${res.status}`);
                return;
            }
            const data = await res.json();
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
            const res = await fetch(options.deleteUrl?.(id) || `${options.fetchUrl}/${id}`, { method: 'DELETE', credentials: 'include' });
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
            const res = await fetch(options.toggleUrl?.(id) || `${options.fetchUrl}/${id}/toggle`, {
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