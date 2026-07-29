import { Button } from 'antd';
import { EditOutlined } from '@ant-design/icons';

interface EditButtonProps {
    onClick: () => void;
}

export function EditButton({ onClick }: EditButtonProps) {
    return (
        <Button type="text" icon={<EditOutlined />} onClick={onClick} title="ویرایش" />
    );
}