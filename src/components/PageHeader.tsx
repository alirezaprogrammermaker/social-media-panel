import { Button } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import type { ReactNode } from 'react';

interface PageHeaderProps {
    title: string;
    onAdd?: () => void;
    addLabel?: string;
    extra?: ReactNode;
}

export function PageHeader({ title, onAdd, addLabel = 'افزودن', extra }: PageHeaderProps) {
    return (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h2 style={{ margin: 0 }}>{title}</h2>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                {extra}
                {onAdd && (
                    <Button type="primary" icon={<PlusOutlined />} onClick={onAdd}>
                        {addLabel}
                    </Button>
                )}
            </div>
        </div>
    );
}