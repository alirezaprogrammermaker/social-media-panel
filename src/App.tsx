import { lazy, Suspense } from 'react';
import { ConfigProvider, Spin } from 'antd';
import faIR from 'antd/locale/fa_IR';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import { Layout } from './components/Layout';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Login } from './pages/Login';
import { Signup } from './pages/Signup';
import { NotFound } from './pages/NotFound';

// Lazy-loaded pages for code splitting
const DashboardHome = lazy(() => import('./pages/DashboardHome').then(m => ({ default: m.DashboardHome })));
const TelegramUsers = lazy(() => import('./pages/TelegramUsers').then(m => ({ default: m.TelegramUsers })));
const TelegramUserSessions = lazy(() => import('./pages/TelegramUserSessions').then(m => ({ default: m.TelegramUserSessions })));
const BotChannels = lazy(() => import('./pages/BotChannels').then(m => ({ default: m.BotChannels })));
const BotHelps = lazy(() => import('./pages/BotHelps').then(m => ({ default: m.BotHelps })));
const AISettings = lazy(() => import('./pages/AISettings').then(m => ({ default: m.AISettings })));
const PaymentMethods = lazy(() => import('./pages/PaymentMethods').then(m => ({ default: m.PaymentMethods })));
const Payments = lazy(() => import('./pages/Payments').then(m => ({ default: m.Payments })));
const Settings = lazy(() => import('./pages/Settings').then(m => ({ default: m.Settings })));
const ApiProviders = lazy(() => import('./pages/ApiProviders'));
const Categories = lazy(() => import('./pages/Categories'));
const Services = lazy(() => import('./pages/Services'));
const Orders = lazy(() => import('./pages/Orders'));
const ExportImport = lazy(() => import('./pages/ExportImport'));

function PageLoader() {
    return (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '50vh' }}>
            <Spin size="large" />
        </div>
    );
}

export default function App() {
    return (
        <ErrorBoundary>
            <ConfigProvider
                direction="rtl"
                locale={faIR}
                theme={{
                    token: {
                        colorPrimary: '#4f46e5',
                        fontFamily: "'Vazirmatn', 'Inter', sans-serif",
                        borderRadius: 8,
                        colorBgLayout: '#f5f6fa',
                    },
                }}
            >
                <AuthProvider>
                    <BrowserRouter>
                        <Routes>
                            <Route path="/login" element={<Login />} />
                            <Route path="/signup" element={<Signup />} />

                            <Route
                                element={
                                    <ProtectedRoute>
                                        <Layout />
                                    </ProtectedRoute>
                                }
                            >
                                <Route path="/" element={<Suspense fallback={<PageLoader />}><DashboardHome /></Suspense>} />
                                <Route path="/api-providers" element={<Suspense fallback={<PageLoader />}><ApiProviders /></Suspense>} />
                                <Route path="/categories" element={<Suspense fallback={<PageLoader />}><Categories /></Suspense>} />
                                <Route path="/services" element={<Suspense fallback={<PageLoader />}><Services /></Suspense>} />
                                <Route path="/orders" element={<Suspense fallback={<PageLoader />}><Orders /></Suspense>} />
                                <Route path="/telegram-users" element={<Suspense fallback={<PageLoader />}><TelegramUsers /></Suspense>} />
                                <Route path="/telegram-sessions" element={<Suspense fallback={<PageLoader />}><TelegramUserSessions /></Suspense>} />
                                <Route path="/bot-channels" element={<Suspense fallback={<PageLoader />}><BotChannels /></Suspense>} />
                                <Route path="/bot-helps" element={<Suspense fallback={<PageLoader />}><BotHelps /></Suspense>} />
                                <Route path="/ai-settings" element={<Suspense fallback={<PageLoader />}><AISettings /></Suspense>} />
                                <Route path="/payment-methods" element={<Suspense fallback={<PageLoader />}><PaymentMethods /></Suspense>} />
                                <Route path="/payments" element={<Suspense fallback={<PageLoader />}><Payments /></Suspense>} />
                                <Route path="/settings" element={<Suspense fallback={<PageLoader />}><Settings /></Suspense>} />
                                <Route path="/export-import" element={<Suspense fallback={<PageLoader />}><ExportImport /></Suspense>} />
                            </Route>

                            <Route path="*" element={<NotFound />} />
                        </Routes>
                    </BrowserRouter>
                </AuthProvider>
            </ConfigProvider>
        </ErrorBoundary>
    );
}
