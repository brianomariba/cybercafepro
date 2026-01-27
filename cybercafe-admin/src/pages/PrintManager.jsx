import { useState, useEffect } from 'react';
import { Card, Table, Tag, Button, Space, Typography, Input, Select, Tooltip, Badge, Progress, Tabs, Statistic, Row, Col, DatePicker, Modal, message, Avatar } from 'antd';
import {
    PrinterOutlined,
    FileTextOutlined,
    FilePdfOutlined,
    FileImageOutlined,
    FileWordOutlined,
    FileExcelOutlined,
    FilePptOutlined,
    DeleteOutlined,
    ReloadOutlined,
    EyeOutlined,
    CheckCircleOutlined,
    ClockCircleOutlined,
    ExclamationCircleOutlined,
    DesktopOutlined,
    DollarOutlined,
    UserOutlined,
    SearchOutlined,
    DownloadOutlined,
    FilterOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { getPrintJobs } from '../services/api';

const { Text, Title } = Typography;
const { Search } = Input;
const { RangePicker } = DatePicker;

// Format KSH
const formatKSH = (amount) => `KSH ${Number(amount || 0).toLocaleString()}`;

function PrintManager() {
    const [printJobs, setPrintJobs] = useState([]);
    const [selectedJob, setSelectedJob] = useState(null);
    const [detailsVisible, setDetailsVisible] = useState(false);
    const [filterStatus, setFilterStatus] = useState('all');
    const [filterColorType, setFilterColorType] = useState('all');
    const [searchText, setSearchText] = useState('');
    const [loading, setLoading] = useState(false);
    const [totals, setTotals] = useState({
        totalJobs: 0,
        bwPages: 0,
        colorPages: 0,
        bwRevenue: 0,
        colorRevenue: 0,
        totalRevenue: 0,
    });

    useEffect(() => {
        const loadPrintJobs = async () => {
            setLoading(true);
            try {
                const data = await getPrintJobs({ limit: 200 });
                const jobs = data.jobs || [];
                setPrintJobs(jobs.map((job, index) => ({
                    id: job.id || index,
                    documentName: job.document || job.name || 'Document',
                    documentType: job.documentType || 'pdf',
                    computer: job.hostname || job.clientId || 'Unknown',
                    user: job.sessionUser || job.user || 'Unknown',
                    pages: job.totalPages || job.pages || 1,
                    copies: job.copies || 1,
                    colorType: job.printType || 'bw',
                    pricePerPage: job.pricePerPage || 0,
                    totalPrice: job.totalPrice || job.amount || 0,
                    status: job.status || 'completed',
                    timestamp: job.timestamp || job.receivedAt || new Date().toISOString(),
                })));
                if (data.totals) {
                    setTotals(data.totals);
                }
            } catch (e) {
                console.error('Failed to load print jobs', e);
            } finally {
                setLoading(false);
            }
        };

        loadPrintJobs();
    }, []);

    const getDocumentIcon = (type) => {
        switch (type) {
            case 'pdf': return <FilePdfOutlined style={{ color: '#ff3b5c' }} />;
            case 'docx': return <FileWordOutlined style={{ color: '#00d4ff' }} />;
            case 'xlsx': return <FileExcelOutlined style={{ color: '#00ff88' }} />;
            case 'pptx': return <FilePptOutlined style={{ color: '#ff9500' }} />;
            case 'image': return <FileImageOutlined style={{ color: '#7b2cbf' }} />;
            default: return <FileTextOutlined style={{ color: '#6b6b80' }} />;
        }
    };

    const getStatusTag = (status) => {
        switch (status) {
            case 'completed':
                return <Tag icon={<CheckCircleOutlined />} color="success">Completed</Tag>;
            case 'printing':
                return <Tag icon={<ClockCircleOutlined spin />} color="processing">Printing</Tag>;
            case 'pending':
                return <Tag icon={<ClockCircleOutlined />} color="warning">Pending</Tag>;
            case 'failed':
                return <Tag icon={<ExclamationCircleOutlined />} color="error">Failed</Tag>;
            default:
                return <Tag>{status}</Tag>;
        }
    };

    const filteredJobs = printJobs.filter(job => {
        const matchesStatus = filterStatus === 'all' || job.status === filterStatus;
        const matchesColor = filterColorType === 'all' || job.colorType === filterColorType;
        const matchesSearch = job.documentName.toLowerCase().includes(searchText.toLowerCase()) ||
            job.user.toLowerCase().includes(searchText.toLowerCase()) ||
            job.computer.toLowerCase().includes(searchText.toLowerCase());
        return matchesStatus && matchesColor && matchesSearch;
    });

    const stats = {
        totalJobs: totals.totalJobs || printJobs.length,
        completed: printJobs.filter(j => j.status === 'completed').length,
        pending: printJobs.filter(j => j.status === 'pending' || j.status === 'printing').length,
        totalPages: totals.totalPages || printJobs.reduce((sum, j) => sum + (j.pages * j.copies), 0),
        bwPages: totals.bwPages || printJobs.filter(j => j.colorType === 'bw').reduce((sum, j) => sum + (j.pages * j.copies), 0),
        colorPages: totals.colorPages || printJobs.filter(j => j.colorType === 'color').reduce((sum, j) => sum + (j.pages * j.copies), 0),
        totalRevenue: totals.totalRevenue || printJobs.filter(j => j.status === 'completed').reduce((sum, j) => sum + j.totalPrice, 0),
    };

    const columns = [
        {
            title: 'Document',
            dataIndex: 'documentName',
            key: 'documentName',
            render: (name, record) => (
                <Space>
                    <div style={{
                        width: 40,
                        height: 40,
                        borderRadius: 8,
                        background: 'rgba(255,255,255,0.05)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 20
                    }}>
                        {getDocumentIcon(record.documentType)}
                    </div>
                    <div>
                        <Text strong style={{ color: '#fff', display: 'block' }}>{name}</Text>
                        <Text type="secondary" style={{ fontSize: 12 }}>
                            {record.pages} pages × {record.copies} copies
                        </Text>
                    </div>
                </Space>
            ),
        },
        {
            title: 'Computer',
            dataIndex: 'computer',
            key: 'computer',
            render: (computer, record) => (
                <Space>
                    <DesktopOutlined style={{ color: '#00d4ff' }} />
                    <div>
                        <Text>{computer}</Text>
                        <br />
                        <Text type="secondary" style={{ fontSize: 12 }}>{record.user}</Text>
                    </div>
                </Space>
            ),
        },
        {
            title: 'Type',
            dataIndex: 'colorType',
            key: 'colorType',
            render: (type) => (
                <Tag color={type === 'color' ? 'magenta' : 'default'}>
                    {type === 'color' ? '🎨 Color' : '⬛ B&W'}
                </Tag>
            ),
        },
        {
            title: 'Price',
            dataIndex: 'totalPrice',
            key: 'totalPrice',
            render: (price) => (
                <Text style={{ fontFamily: 'JetBrains Mono', color: '#00ff88', fontWeight: 600 }}>
                    {formatKSH(price)}
                </Text>
            ),
        },
        {
            title: 'Status',
            dataIndex: 'status',
            key: 'status',
            render: (status) => getStatusTag(status),
        },
        {
            title: 'Time',
            dataIndex: 'timestamp',
            key: 'timestamp',
            render: (time) => (
                <Text type="secondary" style={{ fontSize: 12 }}>
                    {dayjs(time).format('HH:mm:ss')}
                </Text>
            ),
        },
        {
            title: 'Actions',
            key: 'actions',
            render: (_, record) => (
                <Space>
                    <Tooltip title="View Details">
                        <Button
                            type="text"
                            icon={<EyeOutlined />}
                            onClick={() => {
                                setSelectedJob(record);
                                setDetailsVisible(true);
                            }}
                        />
                    </Tooltip>
                    {record.status === 'pending' && (
                        <Tooltip title="Cancel">
                            <Button
                                type="text"
                                icon={<DeleteOutlined style={{ color: '#ff3b5c' }} />}
                                onClick={() => {
                                    setPrintJobs(prev => prev.filter(j => j.id !== record.id));
                                    message.success('Print job cancelled');
                                }}
                            />
                        </Tooltip>
                    )}
                    {record.status === 'failed' && (
                        <Tooltip title="Retry">
                            <Button
                                type="text"
                                icon={<ReloadOutlined style={{ color: '#00d4ff' }} />}
                                onClick={() => message.info('Retrying print job...')}
                            />
                        </Tooltip>
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
                    <PrinterOutlined className="icon" />
                    <h1>Print Manager</h1>
                </div>
                <p className="page-subtitle">Monitor all print jobs, track revenue, and manage printers</p>
            </div>

            {/* Stats */}
            <div className="stats-row">
                <div className="stat-card blue">
                    <div className="stat-header">
                        <div className="stat-icon blue">
                            <FileTextOutlined />
                        </div>
                    </div>
                    <div className="stat-value">{stats.totalPages}</div>
                    <div className="stat-label">Total Pages Today</div>
                </div>

                <div className="stat-card">
                    <div className="stat-header">
                        <div className="stat-icon" style={{ background: 'rgba(107, 107, 128, 0.15)', color: '#b0b0c0' }}>
                            <FileTextOutlined />
                        </div>
                    </div>
                    <div className="stat-value">{stats.bwPages}</div>
                    <div className="stat-label">B&W Pages</div>
                </div>

                <div className="stat-card pink">
                    <div className="stat-header">
                        <div className="stat-icon pink">
                            <FileImageOutlined />
                        </div>
                    </div>
                    <div className="stat-value">{stats.colorPages}</div>
                    <div className="stat-label">Color Pages</div>
                </div>

                <div className="stat-card green">
                    <div className="stat-header">
                        <div className="stat-icon green">
                            <DollarOutlined />
                        </div>
                    </div>
                    <div className="stat-value">{formatKSH(stats.totalRevenue)}</div>
                    <div className="stat-label">Print Revenue</div>
                </div>
            </div>

            <Row gutter={[24, 24]}>
                {/* Quick Stats */}
                <Col xs={24} lg={8}>
                    <Card
                        title={
                            <Space>
                                <CheckCircleOutlined style={{ color: '#00ff88' }} />
                                <span>Job Summary</span>
                            </Space>
                        }
                        style={{ marginTop: 24 }}
                    >
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <Text type="secondary">Completed</Text>
                                <Badge count={stats.completed} style={{ backgroundColor: '#00ff88' }} />
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <Text type="secondary">In Progress</Text>
                                <Badge count={stats.pending} style={{ backgroundColor: '#ff9500' }} />
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <Text type="secondary">Total Jobs Today</Text>
                                <Badge count={stats.totalJobs} style={{ backgroundColor: '#00d4ff' }} />
                            </div>
                        </div>
                    </Card>
                </Col>

                {/* Print Jobs Table */}
                <Col xs={24} lg={16}>
                    <Card
                        title={
                            <Space>
                                <FileTextOutlined style={{ color: '#00d4ff' }} />
                                <span>Print Queue</span>
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
                                        { value: 'completed', label: 'Completed' },
                                        { value: 'printing', label: 'Printing' },
                                        { value: 'pending', label: 'Pending' },
                                        { value: 'failed', label: 'Failed' },
                                    ]}
                                />
                                <Select
                                    value={filterColorType}
                                    onChange={setFilterColorType}
                                    style={{ width: 100 }}
                                    options={[
                                        { value: 'all', label: 'All Types' },
                                        { value: 'bw', label: 'B&W' },
                                        { value: 'color', label: 'Color' },
                                    ]}
                                />
                            </Space>
                        }
                    >
                        <Table
                            columns={columns}
                            dataSource={filteredJobs}
                            rowKey="id"
                                loading={loading}
                            pagination={{ pageSize: 6 }}
                            size="middle"
                        />
                    </Card>
                </Col>
            </Row>

            {/* Print Job Details Modal */}
            <Modal
                title={
                    <Space>
                        {selectedJob && getDocumentIcon(selectedJob.documentType)}
                        <span>Print Job Details</span>
                    </Space>
                }
                open={detailsVisible}
                onCancel={() => setDetailsVisible(false)}
                footer={[
                    <Button key="close" onClick={() => setDetailsVisible(false)}>Close</Button>,
                ]}
                width={500}
            >
                {selectedJob && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                        <div style={{ padding: 16, background: 'rgba(255,255,255,0.03)', borderRadius: 12 }}>
                            <Text type="secondary">Document Name</Text>
                            <Title level={5} style={{ margin: '4px 0 0' }}>{selectedJob.documentName}</Title>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                            <div style={{ padding: 16, background: 'rgba(0, 212, 255, 0.1)', borderRadius: 12 }}>
                                <Text type="secondary">Computer</Text>
                                <br />
                                <Text strong>{selectedJob.computer}</Text>
                            </div>
                            <div style={{ padding: 16, background: 'rgba(123, 44, 191, 0.1)', borderRadius: 12 }}>
                                <Text type="secondary">User</Text>
                                <br />
                                <Text strong>{selectedJob.user}</Text>
                            </div>
                            <div style={{ padding: 16, background: 'rgba(255,255,255,0.03)', borderRadius: 12 }}>
                                <Text type="secondary">Pages</Text>
                                <br />
                                <Text strong>{selectedJob.pages} × {selectedJob.copies} copies</Text>
                            </div>
                            <div style={{ padding: 16, background: 'rgba(255,255,255,0.03)', borderRadius: 12 }}>
                                <Text type="secondary">Type</Text>
                                <br />
                                <Tag color={selectedJob.colorType === 'color' ? 'magenta' : 'default'}>
                                    {selectedJob.colorType === 'color' ? '🎨 Color' : '⬛ B&W'}
                                </Tag>
                            </div>
                        </div>

                        <div style={{ padding: 16, background: 'rgba(0, 255, 136, 0.1)', borderRadius: 12 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div>
                                    <Text type="secondary">Price per page</Text>
                                    <br />
                                    <Text strong>{formatKSH(selectedJob.pricePerPage)}</Text>
                                </div>
                                <div style={{ textAlign: 'right' }}>
                                    <Text type="secondary">Total Cost</Text>
                                    <br />
                                    <Text strong style={{ fontSize: 24, color: '#00ff88' }}>{formatKSH(selectedJob.totalPrice)}</Text>
                                </div>
                            </div>
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <Text type="secondary">Status</Text>
                            {getStatusTag(selectedJob.status)}
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <Text type="secondary">Timestamp</Text>
                            <Text>{dayjs(selectedJob.timestamp).format('YYYY-MM-DD HH:mm:ss')}</Text>
                        </div>
                    </div>
                )}
            </Modal>
        </div>
    );
}

export default PrintManager;
