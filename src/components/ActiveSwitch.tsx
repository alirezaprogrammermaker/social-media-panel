import { Switch } from 'antd';

interface ActiveSwitchProps {
    isActive: number;
    onChange: (checked: boolean) => void;
}

export function ActiveSwitch({ isActive, onChange }: ActiveSwitchProps) {
    return (
        <Switch
            checked={isActive === 1}
            onChange={onChange}
            checkedChildren="فعال"
            unCheckedChildren="غیرفعال"
        />
    );
}
