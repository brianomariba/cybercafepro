import { useState, useEffect } from 'react';
import { Card, Table, Tag, Button, Space, Typography, Input, Select, Tooltip, Badge, Avatar, Row, Col, Statistic, Empty, Modal, message, Descriptions, Progress } from 'antd';
import {
    FileOutlined,
    FilePdfOutlined,
    FileWordOutlined,
    FileExcelOutlined,
    UserOutlined,
    PhoneOutlined,
    ClockCircleOutlined,
    SearchOutlined,
    ReloadOutlined,
    CheckCircleOutlined,
    SyncOutlined,
    CloseCircleOutlined,
    EyeOutlined,
    PlayCircleOutlined,
    InboxOutlined,
    DownloadOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { getDocumentRequests, getDocumentRequestStats, updateDocumentRequestStatus, connectSocket } from '../services/api';

const { Text, Title } = Typography;
const { Search } = Input;

// Format file size
const formatBytes = (bytes) => {
    if (!bytes) return '0 B';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
};

// Get file icon by type
const getFileTypeIcon = (docType) => {
    switch (docType) {
        case 'pdf': return <FilePdfOutlined style={{ color: '#ff3b5c', fontSize: 20 }} />;
        case 'word': return <FileWordOutlined style={{ color: '#00d4ff', fontSize: 20 }} />;
        case 'excel': return <FileExcelOutlined style={{ color: '#00ff88', fontSize: 20 }} />;
        default: return <FileOutlined style={{ color: '#6b6b80', fontSize: 20 }} />;
    }
};

// Get status tag color and icon
const getStatusInfo = (status) => {
    switch (status) {
        case 'pending': return { color: 'orange', icon: <ClockCircleOutlined />, label: 'Pending' };
        case 'processing': return { color: 'blue', icon: <SyncOutlined spin />, label: 'Processing' };
        case 'ready': return { color: 'purple', icon: <CheckCircleOutlined />, label: 'Ready' };
        case 'completed': return { color: 'green', icon: <CheckCircleOutlined />, label: 'Completed' };
        case 'cancelled': return { color: 'red', icon: <CloseCircleOutlined />, label: 'Cancelled' };
        default: return { color: 'default', icon: <FileOutlined />, label: status };
    }
};

function DocumentRequests() {
    const [requests, setRequests] = useState([]);
    const [stats, setStats] = useState(null);
    const [loading, setLoading] = useState(false);
    const [searchText, setSearchText] = useState('');
    const [filterStatus, setFilterStatus] = useState('all');
    const [selectedRequest, setSelectedRequest] = useState(null);
    const [detailsVisible, setDetailsVisible] = useState(false);

    // Fetch data
    const fetchData = async () => {
        setLoading(true);
        try {
            const [requestsData, statsData] = await Promise.all([
                getDocumentRequests({ limit: 100 }),
                getDocumentRequestStats()
            ]);
            setRequests(requestsData || []);
            setStats(statsData);
        } catch (error) {
            console.error('Failed to fetch document requests:', error);
        }
        setLoading(false);
    };

    useEffect(() => {
        fetchData();

        // Connect to socket for real-time updates
        const socket = connectSocket({
            onNewDocumentRequest: (data) => {
                message.info({
                    content: data.notification?.message || 'New document request received!',
                    icon: <InboxOutlined style={{ color: '#00d4ff' }} />
                });
                fetchData();
            },
            onDocumentRequestUpdated: () => {
                fetchData();
            }
        });

        return () => {
            socket?.off('new-document-request');
            socket?.off('document-request-updated');
        };
    }, []);

    // Filter requests
    const filteredRequests = requests.filter(r => {
        const matchesSearch = r.customerName?.toLowerCase().includes(searchText.toLowerCase()) ||
            r.orderId?.toLowerCase().includes(searchText.toLowerCase()) ||
            r.customerPhone?.includes(searchText);
        const matchesStatus = filterStatus === 'all' || r.status === filterStatus;
        return matchesSearch && matchesStatus;
    });

    // Update status handler
    const handleStatusUpdate = async (orderId, newStatus) => {
        try {
            await updateDocumentRequestStatus(orderId, newStatus);
            message.success(`Status updated to ${newStatus}`);
            fetchData();
        } catch (error) {
            message.error('Failed to update status');
        }
    };

    // Table columns
    const columns = [
        {
            title: 'Order ID',
            dataIndex: 'orderId',
            key: 'orderId',
            width: 120,
            render: (id) => (
                <Text strong style={{ fontFamily: 'JetBrains Mono', color: '#00d4ff' }}>{id}</Text>
            ),
        },
        {
            title: 'Customer',
            key: 'customer',
            render: (_, record) => (
                <Space>
                    <Avatar style={{ background: '#7b2cbf' }}>
                        {record.customerName?.charAt(0).toUpperCase()}
                    </Avatar>
                    <div>
                        <Text strong style={{ display: 'block' }}>{record.customerName}</Text>
                        <Text type="secondary" style={{ fontSize: 12 }}>
                            <PhoneOutlined /> {record.customerPhone}
                        </Text>
                    </div>
                </Space>
            ),
        },
        {
            title: 'Files',
            key: 'files',
            width: 150,
            render: (_, record) => (
                <div>
                    <Space size={4}>
                        {record.typeSummary?.pdf > 0 && (
                            <Tooltip title={`${record.typeSummary.pdf} PDF file(s)`}>
                                <Tag icon={<FilePdfOutlined />} color="#ff3b5c">{record.typeSummary.pdf}</Tag>
                            </Tooltip>
                        )}
                        {record.typeSummary?.word > 0 && (
                            <Tooltip title={`${record.typeSummary.word} Word file(s)`}>
                                <Tag icon={<FileWordOutlined />} color="#00d4ff">{record.typeSummary.word}</Tag>
                            </Tooltip>
                        )}
                        {record.typeSummary?.excel > 0 && (
                            <Tooltip title={`${record.typeSummary.excel} Excel file(s)`}>
                                <Tag icon={<FileExcelOutlined />} color="#00ff88">{record.typeSummary.excel}</Tag>
                            </Tooltip>
                        )}
                    </Space>
                    <div>
                        <Text type="secondary" style={{ fontSize: 11 }}>
                            {record.totalFiles || record.files?.length || 0} file(s) • {record.totalSizeFormatted || formatBytes(record.totalSize)}
                        </Text>
                    </div>
                </div>
            ),
        },
        {
            title: 'Service',
            dataIndex: 'serviceType',
            key: 'serviceType',
            width: 120,
            render: (type) => (
                <Tag style={{ textTransform: 'capitalize' }}>{type?.replace(/-/g, ' ')}</Tag>
            ),
        },
        {
            title: 'Status',
            dataIndex: 'status',
            key: 'status',
            width: 120,
            render: (status) => {
                const info = getStatusInfo(status);
                return <Tag icon={info.icon} color={info.color}>{info.label}</Tag>;
            },
        },
        {
            title: 'Time',
            dataIndex: 'createdAt',
            key: 'createdAt',
            width: 100,
            render: (time) => (
                <Text type="secondary" style={{ fontSize: 12 }}>
                    {dayjs(time).format('MMM D, HH:mm')}
                </Text>
            ),
        },
        {
            title: 'Actions',
            key: 'actions',
            width: 180,
            render: (_, record) => (
                <Space>
                    <Tooltip title="View Details">
                        <Button
                            type="text"
                            icon={<EyeOutlined />}
                            onClick={() => {
                                setSelectedRequest(record);
                                setDetailsVisible(true);
                            }}
                        />
                    </Tooltip>
                    {record.status === 'pending' && (
                        <Button
                            type="primary"
                            size="small"
                            icon={<PlayCircleOutlined />}
                            onClick={() => handleStatusUpdate(record.orderId, 'processing')}
                        >
                            Start
                        </Button>
                    )}
                    {record.status === 'processing' && (
                        <Button
                            size="small"
                            style={{ background: '#7b2cbf', borderColor: '#7b2cbf', color: '#fff' }}
                            icon={<CheckCircleOutlined />}
                            onClick={() => handleStatusUpdate(record.orderId, 'ready')}
                        >
                            Ready
                        </Button>
                    )}
                    {record.status === 'ready' && (
                        <Button
                            type="primary"
                            size="small"
                            style={{ background: '#00C853' }}
                            icon={<CheckCircleOutlined />}
                            onClick={() => handleStatusUpdate(record.orderId, 'completed')}
                        >
                            Complete
                        </Button>
                    )}
                </Space>
            ),
        },
    ];

    return (
        <div>
            {/* Page Header */}
            <div className="page-header">
                <div className="page-title">
                    <InboxOutlined className="icon" />
                    <h1>Document Requests</h1>
                </div>
                <p className="page-subtitle">Customer document uploads from the landing page</p>
            </div>

            {/* Stats Row - Document Type Summary */}
            <div className="stats-row">
                <div className="stat-card pink">
                    <div className="stat-header">
                        <div className="stat-icon pink"><FilePdfOutlined /></div>
                    </div>
                    <div className="stat-value">{stats?.summary?.totalPdf || 0}</div>
                    <div className="stat-label">PDF Files</div>
                </div>

                <div className="stat-card blue">
                    <div className="stat-header">
                        <div className="stat-icon blue"><FileWordOutlined /></div>
                    </div>
                    <div className="stat-value">{stats?.summary?.totalWord || 0}</div>
                    <div className="stat-label">Word Documents</div>
                </div>

                <div className="stat-card green">
                    <div className="stat-header">
                        <div className="stat-icon green"><FileExcelOutlined /></div>
                    </div>
                    <div className="stat-value">{stats?.summary?.totalExcel || 0}</div>
                    <div className="stat-label">Excel Files</div>
                </div>

                <div className="stat-card orange">
                    <div className="stat-header">
                        <div className="stat-icon orange"><ClockCircleOutlined /></div>
                    </div>
                    <div className="stat-value">{stats?.summary?.pendingJobs || 0}</div>
                    <div className="stat-label">Pending Jobs</div>
                </div>
            </div>

            <Row gutter={[24, 24]}>
                {/* Document Type Summary */}
                <Col xs={24} lg={6}>
                    <Card
                        title={
                            <Space>
                                <FileOutlined style={{ color: '#7b2cbf' }} />
                                <span>By Document Type</span>
                            </Space>
                        }
                    >
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                <div style={{ width: 40, height: 40, borderRadius: 8, background: 'rgba(255, 59, 92, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <FilePdfOutlined style={{ color: '#ff3b5c', fontSize: 20 }} />
                                </div>
                                <div style={{ flex: 1 }}>
                                    <Text strong>PDF</Text>
                                    <Progress percent={stats?.all?.totalFiles ? Math.round((stats.all.pdf / stats.all.totalFiles) * 100) : 0} strokeColor="#ff3b5c" size="small" />
                                </div>
                                <Text style={{ fontFamily: 'JetBrains Mono', color: '#ff3b5c' }}>{stats?.all?.pdf || 0}</Text>
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                <div style={{ width: 40, height: 40, borderRadius: 8, background: 'rgba(0, 212, 255, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <FileWordOutlined style={{ color: '#00d4ff', fontSize: 20 }} />
                                </div>
                                <div style={{ flex: 1 }}>
                                    <Text strong>Word</Text>
                                    <Progress percent={stats?.all?.totalFiles ? Math.round((stats.all.word / stats.all.totalFiles) * 100) : 0} strokeColor="#00d4ff" size="small" />
                                </div>
                                <Text style={{ fontFamily: 'JetBrains Mono', color: '#00d4ff' }}>{stats?.all?.word || 0}</Text>
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                <div style={{ width: 40, height: 40, borderRadius: 8, background: 'rgba(0, 255, 136, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <FileExcelOutlined style={{ color: '#00ff88', fontSize: 20 }} />
                                </div>
                                <div style={{ flex: 1 }}>
                                    <Text strong>Excel</Text>
                                    <Progress percent={stats?.all?.totalFiles ? Math.round((stats.all.excel / stats.all.totalFiles) * 100) : 0} strokeColor="#00ff88" size="small" />
                                </div>
                                <Text style={{ fontFamily: 'JetBrains Mono', color: '#00ff88' }}>{stats?.all?.excel || 0}</Text>
                            </div>
                        </div>

                        <div style={{ marginTop: 24, padding: 16, background: 'rgba(255,255,255,0.03)', borderRadius: 12 }}>
                            <Text type="secondary">Total Files</Text>
                            <Title level={2} style={{ margin: 0, color: '#00d4ff' }}>{stats?.all?.totalFiles || 0}</Title>
                            <Text type="secondary">{stats?.all?.totalSizeFormatted || '0 B'}</Text>
                        </div>
                    </Card>

                    {/* Status Breakdown */}
                    <Card
                        title={
                            <Space>
                                <SyncOutlined style={{ color: '#00d4ff' }} />
                                <span>By Status</span>
                            </Space>
                        }
                        style={{ marginTop: 24 }}
                    >
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                            {Object.entries(stats?.byStatus || {}).map(([status, count]) => {
                                const info = getStatusInfo(status);
                                return (
                                    <div key={status} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <Tag icon={info.icon} color={info.color}>{info.label}</Tag>
                                        <Text strong style={{ fontFamily: 'JetBrains Mono' }}>{count}</Text>
                                    </div>
                                );
                            })}
                        </div>
                    </Card>
                </Col>

                {/* Requests Table */}
                <Col xs={24} lg={18}>
                    <Card
                        title={
                            <Space>
                                <InboxOutlined style={{ color: '#00d4ff' }} />
                                <span>Customer Requests</span>
                                <Badge count={requests.length} style={{ backgroundColor: '#00d4ff' }} />
                            </Space>
                        }
                        extra={
                            <Space>
                                <Search
                                    placeholder="Search..."
                                    style={{ width: 200 }}
                                    value={searchText}
                                    onChange={(e) => setSearchText(e.target.value)}
                                />
                                <Select
                                    value={filterStatus}
                                    onChange={setFilterStatus}
                                    style={{ width: 120 }}
                                    options={[
                                        { value: 'all', label: 'All Status' },
                                        { value: 'pending', label: 'Pending' },
                                        { value: 'processing', label: 'Processing' },
                                        { value: 'ready', label: 'Ready' },
                                        { value: 'completed', label: 'Completed' },
                                        { value: 'cancelled', label: 'Cancelled' },
                                    ]}
                                />
                                <Tooltip title="Refresh">
                                    <Button icon={<ReloadOutlined />} onClick={fetchData} loading={loading} />
                                </Tooltip>
                            </Space>
                        }
                    >
                        <Table
                            columns={columns}
                            dataSource={filteredRequests}
                            rowKey="orderId"
                            pagination={{ pageSize: 10 }}
                            loading={loading}
                            locale={{ emptyText: <Empty description="No document requests yet" /> }}
                        />
                    </Card>
                </Col>
            </Row>

            {/* Request Details Modal */}
            <Modal
                title={
                    <Space>
                        <InboxOutlined style={{ color: '#00d4ff' }} />
                        <span>Request Details - {selectedRequest?.orderId}</span>
                    </Space>
                }
                open={detailsVisible}
                onCancel={() => setDetailsVisible(false)}
                footer={[
                    <Button key="close" onClick={() => setDetailsVisible(false)}>Close</Button>,
                ]}
                width={600}
            >
                {selectedRequest && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                        {/* Customer Info */}
                        <div style={{ padding: 16, background: 'rgba(0, 212, 255, 0.1)', borderRadius: 12 }}>
                            <Space>
                                <Avatar size={48} style={{ background: '#7b2cbf' }}>
                                    {selectedRequest.customerName?.charAt(0).toUpperCase()}
                                </Avatar>
                                <div>
                                    <Title level={4} style={{ margin: 0 }}>{selectedRequest.customerName}</Title>
                                    <Text type="secondary"><PhoneOutlined /> {selectedRequest.customerPhone}</Text>
                                </div>
                            </Space>
                        </div>

                        {/* Status and Service */}
                        <Descriptions bordered column={2}>
                            <Descriptions.Item label="Status">
                                {(() => {
                                    const info = getStatusInfo(selectedRequest.status);
                                    return <Tag icon={info.icon} color={info.color}>{info.label}</Tag>;
                                })()}
                            </Descriptions.Item>
                            <Descriptions.Item label="Service">
                                <Tag>{selectedRequest.serviceType?.replace(/-/g, ' ')}</Tag>
                            </Descriptions.Item>
                            <Descriptions.Item label="Submitted">
                                {dayjs(selectedRequest.createdAt).format('MMM D, YYYY HH:mm')}
                            </Descriptions.Item>
                            <Descriptions.Item label="Total Size">
                                {selectedRequest.totalSizeFormatted || formatBytes(selectedRequest.totalSize)}
                            </Descriptions.Item>
                        </Descriptions>

                        {/* Files List */}
                        <Card title="Uploaded Files" size="small">
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                {selectedRequest.files?.map((file, idx) => (
                                    <div key={idx} style={{
                                        display: 'flex', alignItems: 'center', gap: 12, padding: 12,
                                        background: 'rgba(255,255,255,0.03)', borderRadius: 8
                                    }}>
                                        {getFileTypeIcon(file.docType)}
                                        <div style={{ flex: 1 }}>
                                            <Text strong>{file.originalName}</Text>
                                            <br />
                                            <Text type="secondary" style={{ fontSize: 11 }}>
                                                {file.sizeFormatted || formatBytes(file.size)}
                                            </Text>
                                        </div>
                                        <Tag>{file.docType?.toUpperCase()}</Tag>
                                    </div>
                                ))}
                            </div>
                        </Card>

                        {/* Instructions */}
                        {selectedRequest.instructions && (
                            <Card title="Customer Instructions" size="small">
                                <Text>{selectedRequest.instructions}</Text>
                            </Card>
                        )}
                    </div>
                )}
            </Modal>
        </div>
    );
}

export default DocumentRequests;
