import { Skeleton, Card, Row, Col } from 'antd';

interface SkeletonCardProps {
    rows?: number;
    active?: boolean;
}

export function SkeletonCard({ rows = 3, active = true }: SkeletonCardProps) {
    return (
        <Card bordered={false} style={{ borderRadius: 12 }}>
            <Skeleton loading={active} active paragraph={{ rows }} title={{ width: '40%' }} />
        </Card>
    );
}

interface SkeletonStatCardProps {
    active?: boolean;
}

export function SkeletonStatCard({ active = true }: SkeletonStatCardProps) {
    return (
        <Card bordered={false} style={{ borderRadius: 12 }}>
            <Skeleton loading={active} active>
                <div style={{ height: 20 }} />
                <div style={{ height: 40, marginTop: 16 }} />
                <div style={{ height: 14, marginTop: 16, width: '60%' }} />
            </Skeleton>
        </Card>
    );
}

interface SkeletonTableProps {
    rows?: number;
    columns?: number;
    active?: boolean;
}

export function SkeletonTable({ rows = 5, columns = 4, active = true }: SkeletonTableProps) {
    return (
        <div>
            {Array.from({ length: rows }).map((_, rowIndex) => (
                <div key={rowIndex} style={{ display: 'flex', gap: 16, padding: '12px 0', borderBottom: '1px solid #f0f0f0' }}>
                    {Array.from({ length: columns }).map((_, colIndex) => (
                        <Skeleton
                            key={colIndex}
                            loading={active}
                            active
                            title={{ width: colIndex === 0 ? '60%' : '40%' }}
                            paragraph={{ rows: 0 }}
                            style={{ flex: 1 }}
                        />
                    ))}
                </div>
            ))}
        </div>
    );
}

interface SkeletonPageProps {
    active?: boolean;
    statCards?: number;
    tableRows?: number;
    tableColumns?: number;
    showStats?: boolean;
    showTable?: boolean;
}

export function SkeletonPage({
    active = true,
    statCards = 4,
    tableRows = 5,
    tableColumns = 5,
    showStats = true,
    showTable = true,
}: SkeletonPageProps) {
    return (
        <div>
            {/* Header skeleton */}
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 24 }}>
                <Skeleton loading={active} active title={{ width: 200 }} paragraph={{ rows: 0 }} />
                <Skeleton loading={active} active title={{ width: 120 }} paragraph={{ rows: 0 }} />
            </div>

            {/* Stats cards skeleton */}
            {showStats && (
                <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
                    {Array.from({ length: statCards }).map((_, i) => (
                        <Col xs={24} sm={12} lg={6} key={i}>
                            <SkeletonStatCard active={active} />
                        </Col>
                    ))}
                </Row>
            )}

            {/* Table skeleton */}
            {showTable && (
                <Card bordered={false} style={{ borderRadius: 12 }}>
                    <SkeletonTable rows={tableRows} columns={tableColumns} active={active} />
                </Card>
            )}
        </div>
    );
}
