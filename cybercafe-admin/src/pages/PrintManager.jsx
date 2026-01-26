import { useState } from 'react';
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

const { Text, Title } = Typography;
const { Search } = Input;
const { RangePicker } = DatePicker;

// Format KSH
const formatKSH = (amount) => `KSH ${amount.toLocaleString()}`;

// Mock print jobs data (in KSH)
const mockPrintJobs = [
    {
        id: 1,
        documentName: 'Annual Report 2024.pdf',
        documentType: 'pdf',
        computer: 'PC-01',
        user: 'John Doe',
        pages: 25,
        copies: 2,
        colorType: 'bw',
        pricePerPage: 10,
        totalPrice: 500,
        status: 'completed',
        timestamp: '2024-12-13 10:30:00',
    },
    {
        id: 2,
        documentName: 'Marketing Brochure.docx',
        documentType: 'docx',
        computer: 'PC-03',
        user: 'Jane Smith',
        pages: 8,
        copies: 5,
        colorType: 'color',
        pricePerPage: 50,
        totalPrice: 2000,
        status: 'printing',
        timestamp: '2024-12-13 10:45:00',
    },
    {
        id: 3,
        documentName: 'Invoice_December.xlsx',
        documentType: 'xlsx',
        computer: 'PC-05',
        user: 'Mike Johnson',
        pages: 3,
        copies: 1,
        colorType: 'bw',
        pricePerPage: 10,
        totalPrice: 30,
        status: 'completed',
        timestamp: '2024-12-13 11:00:00',
    },
    {
        id: 4,
        documentName: 'Presentation_Q4.pptx',
        documentType: 'pptx',
        computer: 'PC-02',
        user: 'Sarah Wilson',
        pages: 15,
        copies: 3,
        colorType: 'color',
        pricePerPage: 50,
        totalPrice: 2250,
        status: 'pending',
        timestamp: '2024-12-13 11:15:00',
    },
    {
        id: 5,
        documentName: 'Photo_Vacation.jpg',
        documentType: 'image',
        computer: 'PC-06',
        user: 'Tom Brown',
        pages: 1,
        copies: 4,
        colorType: 'color',
        pricePerPage: 100,
        totalPrice: 400,
        status: 'completed',
        timestamp: '2024-12-13 11:30:00',
    },
    {
        id: 6,
        documentName: 'Contract_Agreement.pdf',
        documentType: 'pdf',
        computer: 'PC-08',
        user: 'Emma Davis',
        pages: 12,
        copies: 2,
        colorType: 'bw',
        pricePerPage: 10,
        totalPrice: 240,
        status: 'completed',
        timestamp: '2024-12-13 11:45:00',
    },
    {
        id: 7,
        documentName: 'Thesis_Final_Draft.pdf',
        documentType: 'pdf',
        computer: 'PC-01',
        user: 'John Doe',
        pages: 85,
        copies: 1,
        colorType: 'bw',
        pricePerPage: 10,
        totalPrice: 850,
        status: 'completed',
        timestamp: '2024-12-13 12:00:00',
    },
    {
        id: 8,
        documentName: 'ID_Photo.jpg',
        documentType: 'image',
        computer: 'PC-04',
        user: 'Guest User',
        pages: 1,
        copies: 8,
        colorType: 'color',
        pricePerPage: 75,
        totalPrice: 600,
        status: 'failed',
        timestamp: '2024-12-13 12:15:00',
    },
];

// Printer status
const printers = [
    { id: 1, name: 'HP LaserJet Pro', status: 'online', paperLevel: 75, tonerLevel: 60, type: 'bw' },
    { id: 2, name: 'Canon PIXMA G7000', status: 'online', paperLevel: 45, tonerLevel: 80, type: 'color' },
    { id: 3, name: 'Epson EcoTank L3250', status: 'offline', paperLevel: 20, tonerLevel: 30, type: 'color' },
];

function PrintManager() {
    const [printJobs, setPrintJobs] = useState(mockPrintJobs);
    const [selectedJob, setSelectedJob] = useState(null);
    const [detailsVisible, setDetailsVisible] = useState(false);
    const [filterStatus, setFilterStatus] = useState('all');
    const [filterColorType, setFilterColorType] = useState('all');
    const [searchText, setSearchText] = useState('');

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
        totalJobs: printJobs.length,
        completed: printJobs.filter(j => j.status === 'completed').length,
        pending: printJobs.filter(j => j.status === 'pending' || j.status === 'printing').length,
        totalPages: printJobs.reduce((sum, j) => sum + (j.pages * j.copies), 0),
        bwPages: printJobs.filter(j => j.colorType === 'bw').reduce((sum, j) => sum + (j.pages * j.copies), 0),
        colorPages: printJobs.filter(j => j.colorType === 'color').reduce((sum, j) => sum + (j.pages * j.copies), 0),
        totalRevenue: printJobs.filter(j => j.status === 'completed').reduce((sum, j) => sum + j.totalPrice, 0),
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
                {/* Printer Status */}
                <Col xs={24} lg={8}>
                    <Card
                        title={
                            <Space>
                                <PrinterOutlined style={{ color: '#7b2cbf' }} />
                                <span>Printer Status</span>
                            </Space>
                        }
                    >
                        {printers.map(printer => (
                            <div
                                key={printer.id}
                                style={{
                                    padding: 16,
                                    background: 'rgba(255,255,255,0.03)',
                                    borderRadius: 12,
                                    marginBottom: 12,
                                    border: `1px solid ${printer.status === 'online' ? 'rgba(0, 255, 136, 0.2)' : 'rgba(255, 59, 92, 0.2)'}`
                                }}
                            >
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                                    <div>
                                        <Text strong style={{ display: 'block' }}>{printer.name}</Text>
                                        <Tag color={printer.type === 'color' ? 'magenta' : 'default'} style={{ marginTop: 4 }}>
                                            {printer.type === 'color' ? 'Color' : 'B&W'}
                                        </Tag>
                                    </div>
                                    <Badge
                                        status={printer.status === 'online' ? 'success' : 'error'}
                                        text={<Text type="secondary">{printer.status}</Text>}
                                    />
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                                    <div>
                                        <Text type="secondary" style={{ fontSize: 12 }}>Paper</Text>
                                        <Progress
                                            percent={printer.paperLevel}
                                            size="small"
                                            strokeColor={printer.paperLevel < 30 ? '#ff3b5c' : '#00d4ff'}
                                        />
                                    </div>
                                    <div>
                                        <Text type="secondary" style={{ fontSize: 12 }}>Toner/Ink</Text>
                                        <Progress
                                            percent={printer.tonerLevel}
                                            size="small"
                                            strokeColor={printer.tonerLevel < 30 ? '#ff3b5c' : '#7b2cbf'}
                                        />
                                    </div>
                                </div>
                            </div>
                        ))}
                    </Card>

                    {/* Quick Stats */}
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
