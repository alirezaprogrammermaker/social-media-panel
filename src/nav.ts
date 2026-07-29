import type { ComponentType } from 'react';
import {
    DashboardOutlined,
    TeamOutlined,
    SettingOutlined,
    MessageOutlined,
    WechatOutlined,
    QuestionCircleOutlined,
    RobotOutlined,
    WalletOutlined,
    DollarOutlined,
    ApiOutlined,
    AppstoreOutlined,
    ShoppingOutlined,
    OrderedListOutlined,
    ImportOutlined,
} from '@ant-design/icons';

export type NavItem = {
    path: string;
    label: string;
    icon: ComponentType;
    group?: string;
};

export const navItems: NavItem[] = [
    // Main
    { path: '/', label: 'داشبورد', icon: DashboardOutlined, group: 'اصلی' },

    // SMM Panel
    { path: '/api-providers', label: 'ارائه‌دهندگان API', icon: ApiOutlined, group: 'پنل SMM' },
    { path: '/categories', label: 'دسته‌بندی‌ها', icon: AppstoreOutlined, group: 'پنل SMM' },
    { path: '/services', label: 'سرویس‌ها', icon: ShoppingOutlined, group: 'پنل SMM' },
    { path: '/orders', label: 'سفارشات', icon: OrderedListOutlined, group: 'پنل SMM' },

    // Telegram
    { path: '/telegram-users', label: 'کاربران تلگرام', icon: TeamOutlined, group: 'تلگرام' },
    { path: '/telegram-sessions', label: 'نشست‌های تلگرام', icon: MessageOutlined, group: 'تلگرام' },
    { path: '/bot-channels', label: 'کانال‌های ربات', icon: WechatOutlined, group: 'تلگرام' },
    { path: '/bot-helps', label: 'راهنمای ربات', icon: QuestionCircleOutlined, group: 'تلگرام' },

    // Finance & AI
    { path: '/payment-methods', label: 'روش‌های پرداخت', icon: WalletOutlined, group: 'مالی و هوش مصنوعی' },
    { path: '/payments', label: 'پرداخت‌ها', icon: DollarOutlined, group: 'مالی و هوش مصنوعی' },
    { path: '/ai-settings', label: 'هوش مصنوعی', icon: RobotOutlined, group: 'مالی و هوش مصنوعی' },

    // Settings
    { path: '/settings', label: 'تنظیمات', icon: SettingOutlined, group: 'سیستم' },
    { path: '/export-import', label: 'خروجی / ورودی', icon: ImportOutlined, group: 'سیستم' },
];
