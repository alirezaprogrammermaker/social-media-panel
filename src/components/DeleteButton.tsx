import { Button, Popconfirm } from 'antd';
import { DeleteOutlined } from '@ant-design/icons';

interface DeleteButtonProps {
    onConfirm: () => void;
    title?: string;
}

export function DeleteButton({ onConfirm, title = 'حذف شود؟' }: DeleteButtonProps) {
    return (
        <Popconfirm title={title} onConfirm={onConfirm}>
            <Button type="text" danger icon={<DeleteOutlined />} />
        </Popconfirm>
    );
}
