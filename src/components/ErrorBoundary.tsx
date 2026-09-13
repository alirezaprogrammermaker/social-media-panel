import { Component, type ReactNode } from 'react';
import { Button, Result } from 'antd';

interface Props {
    children: ReactNode;
}

interface State {
    hasError: boolean;
    error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
    constructor(props: Props) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
        const isChunkLoadError = /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module/i.test(
            error.message,
        );

        // Stale tab after deploy: old JS asks for a hashed chunk that no longer exists.
        if (isChunkLoadError) {
            const key = 'spa-chunk-reload';
            if (!sessionStorage.getItem(key)) {
                sessionStorage.setItem(key, '1');
                window.location.reload();
                return;
            }
            sessionStorage.removeItem(key);
        }

        console.error('ErrorBoundary caught:', error, errorInfo);
    }

    render() {
        if (this.state.hasError) {
            return (
                <Result
                    status="error"
                    title="خطای غیرمنتظره"
                    subTitle={this.state.error?.message || 'مشکلی پیش آمده است'}
                    extra={
                        <Button
                            type="primary"
                            onClick={() => {
                                this.setState({ hasError: false, error: null });
                                window.location.reload();
                            }}
                        >
                            بارگذاری مجدد
                        </Button>
                    }
                />
            );
        }
        return this.props.children;
    }
}
