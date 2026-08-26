import { useState, useEffect } from 'react';
import { Layout as AntLayout, Menu, Avatar, Dropdown, Button } from 'antd';
import { LogoutOutlined, MenuFoldOutlined, MenuUnfoldOutlined, CalendarOutlined } from '@ant-design/icons';
import { useNavigate, useLocation, Outlet } from 'react-router-dom';
import { navItems, navGroupOrder } from '../nav';
import { useAuth } from '../context/AuthContext';
import { getJalaliDateTime } from '../utils/jalali';

const { Sider, Header, Content } = AntLayout;

export function Layout() {
    const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768);
    const [collapsed, setCollapsed] = useState(() => window.innerWidth < 768);
    const [dateTime, setDateTime] = useState(getJalaliDateTime());
    const { user, logout } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();

    useEffect(() => {
        const interval = setInterval(() => setDateTime(getJalaliDateTime()), 60000);
        return () => clearInterval(interval);
    }, []);

    useEffect(() => {
        const checkMobile = () => {
            const mobile = window.innerWidth < 768;
            setIsMobile(mobile);
            if (mobile) {
                setCollapsed(true);
            }
        };
        checkMobile();
        window.addEventListener('resize', checkMobile);
        return () => window.removeEventListener('resize', checkMobile);
    }, []);

    // Close sidebar on mobile when navigating
    useEffect(() => {
        if (isMobile) {
            setCollapsed(true);
        }
    }, [location.pathname, isMobile]);

    // Group nav items in defined order so all sections stay complete and consistent
    const groups = navItems.reduce((acc, item) => {
        const group = item.group || 'سایر';
        if (!acc[group]) acc[group] = [];
        acc[group].push(item);
        return acc;
    }, {} as Record<string, typeof navItems>);

    const orderedGroupKeys = [
        ...navGroupOrder.filter((g) => groups[g]?.length),
        ...Object.keys(groups).filter((g) => !(navGroupOrder as readonly string[]).includes(g)),
    ];

    const menuItems = orderedGroupKeys.map((group) => ({
        type: 'group' as const,
        label: group,
        children: groups[group].map(({ path, label, icon: Icon }) => ({
            key: path,
            icon: <Icon />,
            label,
        })),
    }));

    const handleMenuClick = ({ key }: { key: string }) => {
        navigate(key);
        if (isMobile) {
            setCollapsed(true);
        }
    };

    const toggleSidebar = () => {
        setCollapsed(!collapsed);
    };

    return (
        <AntLayout style={{ minHeight: '100vh' }}>
            {/* Mobile overlay */}
            {isMobile && !collapsed && (
                <div
                    style={{
                        position: 'fixed',
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        background: 'rgba(0, 0, 0, 0.45)',
                        zIndex: 99,
                    }}
                    onClick={() => setCollapsed(true)}
                />
            )}

            <Sider
                collapsible
                collapsed={collapsed}
                onCollapse={setCollapsed}
                collapsedWidth={0}
                trigger={null}
                theme="light"
                width={260}
                className="app-sider"
                style={{
                    borderInlineEnd: '1px solid #eef0f3',
                    ...(isMobile
                        ? {
                              position: 'fixed',
                              top: 0,
                              right: 0,
                              left: 'auto',
                              bottom: 0,
                              zIndex: 100,
                              height: '100dvh',
                              maxHeight: '100dvh',
                          }
                        : {
                              height: '100vh',
                              position: 'sticky',
                              top: 0,
                          }),
                }}
            >
                <div
                    style={{
                        height: 48,
                        margin: '16px 16px 8px',
                        flexShrink: 0,
                        fontWeight: 600,
                        fontSize: 16,
                        color: '#4f46e5',
                        textAlign: 'center',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                    }}
                >
                    پنل مدیریت
                </div>
                <Menu
                    theme="light"
                    mode="inline"
                    selectedKeys={[location.pathname]}
                    items={menuItems}
                    onClick={handleMenuClick}
                    style={{ borderInlineEnd: 'none', paddingBottom: isMobile ? 32 : 16 }}
                />
            </Sider>

            <AntLayout>
                <Header
                    style={{
                        background: '#fff',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '0 12px 0 20px',
                        borderBottom: '1px solid #eef0f3',
                        position: 'sticky',
                        top: 0,
                        zIndex: 50,
                    }}
                >
                    <Button
                        type="text"
                        icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
                        onClick={toggleSidebar}
                        style={{ fontSize: 18 }}
                    />

                    <Dropdown
                        menu={{
                            items: [
                                { key: 'logout', label: 'خروج', icon: <LogoutOutlined />, onClick: logout },
                            ],
                        }}
                    >
                        <Avatar style={{ cursor: 'pointer', backgroundColor: '#4f46e5' }}>
                            {user?.email?.[0]?.toUpperCase()}
                        </Avatar>
                    </Dropdown>
                </Header>

                <Content style={{ margin: isMobile ? 12 : 20 }}>
                    <div style={{
                        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                        color: '#fff',
                        padding: '10px 20px',
                        borderRadius: 8,
                        marginBottom: 16,
                        fontSize: 14,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                    }}>
                        <CalendarOutlined />
                        <span style={{ direction: 'rtl' }}>{dateTime}</span>
                    </div>
                    <Outlet />
                </Content>
            </AntLayout>
        </AntLayout>
    );
}
