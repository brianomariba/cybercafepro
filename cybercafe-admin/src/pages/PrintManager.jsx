import { useState, useEffect } from 'react';
import { Card, Table, Tag, Button, Space, Typography, Input, Select, Tooltip, Badge, Tabs, Row, Col, Modal, message, List, Empty } from 'antd';
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
    WifiOutlined,
    WifiOneOneOutlined,
    AppstoreOutlined,
    BarsOutlined
} from '@ant-design/icons';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { getPrintJobs, getPrinters, connectSocket } from '../services/api';

dayjs.extend(relativeTime);

const { Text, Title } = Typography;
const { Search } = Input;

// Format KSH
const formatKSH = (amount) => `KSH ${Number(amount || 0).toLocaleString()}`;

function PrintManager() {
    const [printJobs, setPrintJobs] = useState([]);
    const [printers, setPrinters] = useState([]);
    const [selectedJob, setSelectedJob] = useState(null);
    const [selectedPrinter, setSelectedPrinter] = useState(null);
    const [jobDetailsVisible, setJobDetailsVisible] = useState(false);
    const [printerDetailsVisible, setPrinterDetailsVisible] = useState(false);
    const [activeTab, setActiveTab] = useState('queue');
    const [filterStatus, setFilterStatus] = useState('all');
    const [filterColorType, setFilterColorType] = useState('all');
    const [searchText, setSearchText] = useState('');
    const [loading, setLoading] = useState(false);
    const [lastUpdated, setLastUpdated] = useState(new Date());
    const [totals, setTotals] = useState({
        totalJobs: 0,
        bwPages: 0,
        colorPages: 0,
        bwRevenue: 0,
        colorRevenue: 0,
        totalRevenue: 0,
    });

    const fetchData = async () => {
        setLoading(true);
        try {
            const [jobsData, printersData] = await Promise.all([
                getPrintJobs({ limit: 200 }),
                getPrinters()
            ]);

            // Process Jobs
            const jobs = jobsData.jobs || [];
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
                printerName: job.printer || 'Unknown'
            })));

            if (jobsData.totals) {
                setTotals(jobsData.totals);
            }

            // Process Printers
            setPrinters(printersData || []);
            setLastUpdated(new Date());
        } catch (e) {
            console.error('Failed to load data', e);
            message.error('Failed to load print data');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();

        // Real-time updates
        const socket = connectSocket({
            onNewLog: (log) => {
                if (log.type === 'print') fetchData();
                if (log.type === 'printers') fetchData();
            }
        });

        // Poll every 30s
        const interval = setInterval(fetchData, 30000);

        return () => {
            if (socket) socket.disconnect();
            clearInterval(interval);
        };
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
            case 'completed': return <Tag icon={<CheckCircleOutlined />} color="success">Completed</Tag>;
            case 'printing': return <Tag icon={<ClockCircleOutlined spin />} color="processing">Printing</Tag>;
            case 'pending': return <Tag icon={<ClockCircleOutlined />} color="warning">Pending</Tag>;
            case 'failed': return <Tag icon={<ExclamationCircleOutlined />} color="error">Failed</Tag>;
            case 'spooling': return <Tag icon={<ClockCircleOutlined />} color="processing">Spooling</Tag>;
            default: return <Tag>{status}</Tag>;
        }
    };

    const getPrinterStatusColor = (status, isOnline) => {
        if (!isOnline) return '#ff3b5c';
        if (status === 'Ready' || status === 'Idle') return '#00ff88';
        if (status === 'Printing' || status === 'Busy') return '#00d4ff';
        if (status === 'Error' || status === 'Offline') return '#ff3b5c';
        return '#b0b0c0';
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
        pending: printJobs.filter(j => j.status === 'pending' || j.status === 'printing' || j.status === 'spooling').length,
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
                        width: 40, height: 40, borderRadius: 8,
                        background: 'rgba(255,255,255,0.05)', display: 'flex',
                        alignItems: 'center', justifyContent: 'center', fontSize: 20
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
            title: 'Printer',
            dataIndex: 'printerName',
            key: 'printerName',
            render: (printerName) => (
                <Space>
                    <PrinterOutlined style={{ color: '#b0b0c0' }} />
                    <Text>{printerName}</Text>
                </Space>
            )
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
                <Tooltip title="View Details">
                    <Button type="text" icon={<EyeOutlined />} onClick={() => {
                        setSelectedJob(record);
                        setJobDetailsVisible(true);
                    }} />
                </Tooltip>
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
                <div style={{ textAlign: 'right' }}>
                    <p className="page-subtitle">Monitor all print jobs & printers</p>
                    <Space size="small">
                        <Badge status="processing" text={
                            <Text type="secondary" style={{ fontSize: 12 }}>
                                Live Updated <Text style={{ fontSize: 11 }}>{dayjs(lastUpdated).format('HH:mm:ss')}</Text>
                            </Text>
                        } />
                        <Button
                            type="text"
                            icon={<ReloadOutlined spin={loading} />}
                            onClick={fetchData}
                        />
                    </Space>
                </div>
            </div>

            {/* Stats */}
            <div className="stats-row">
                <div className="stat-card blue">
                    <div className="stat-header">
                        <div className="stat-icon blue"><FileTextOutlined /></div>
                        <div className="stat-value">{stats.totalPages}</div>
                    </div>
                    <div className="stat-label">Total Pages Today</div>
                </div>
                <div className="stat-card">
                    <div className="stat-header">
                        <div className="stat-icon" style={{ background: 'rgba(107, 107, 128, 0.15)', color: '#b0b0c0' }}><FileTextOutlined /></div>
                        <div className="stat-value">{stats.bwPages}</div>
                    </div>
                    <div className="stat-label">B&W Pages</div>
                </div>
                <div className="stat-card pink">
                    <div className="stat-header">
                        <div className="stat-icon pink"><FileImageOutlined /></div>
                        <div className="stat-value">{stats.colorPages}</div>
                    </div>
                    <div className="stat-label">Color Pages</div>
                </div>
                <div className="stat-card green">
                    <div className="stat-header">
                        <div className="stat-icon green"><DollarOutlined /></div>
                        <div className="stat-value">{formatKSH(stats.totalRevenue)}</div>
                    </div>
                    <div className="stat-label">Print Revenue</div>
                </div>
            </div>

            <Tabs
                activeKey={activeTab}
                onChange={setActiveTab}
                style={{ marginTop: 24 }}
                items={[
                    {
                        key: 'queue',
                        label: <span><FileTextOutlined /> Print Queue</span>,
                        children: (
                            <Card
                                title={
                                    <Space>
                                        <FileTextOutlined style={{ color: '#00d4ff' }} />
                                        <span>Print Jobs</span>
                                    </Space>
                                }
                                extra={
                                    <Space>
                                        <Search
                                            placeholder="Search docs, users..."
                                            style={{ width: 250 }}
                                            value={searchText}
                                            onChange={(e) => setSearchText(e.target.value)}
                                            allowClear
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
                                    pagination={{ pageSize: 8 }}
                                    size="middle"
                                />
                            </Card>
                        )
                    },
                    {
                        key: 'printers',
                        label: <span><PrinterOutlined /> Connected Printers</span>,
                        children: (
                            <Row gutter={[24, 24]}>
                                {printers.length === 0 && (
                                    <Col span={24}>
                                        <div style={{ textAlign: 'center', padding: '60px', background: 'rgba(255,255,255,0.02)', borderRadius: 16 }}>
                                            <PrinterOutlined style={{ fontSize: 48, color: 'rgba(255,255,255,0.2)', marginBottom: 24 }} />
                                            <Title level={4} style={{ color: 'rgba(255,255,255,0.6)' }}>No Printers Detected</Title>
                                            <Text type="secondary">Waiting for agents to report printer status...</Text>
                                        </div>
                                    </Col>
                                )}
                                {printers.map((client) => (
                                    <Col xs={24} md={12} key={client.clientId}>
                                        <Card
                                            title={
                                                <Space>
                                                    <DesktopOutlined style={{ color: '#00d4ff' }} />
                                                    <span>{client.hostname}</span>
                                                </Space>
                                            }
                                            extra={<Text type="secondary" style={{ fontSize: 12 }}>Last seen: {dayjs(client.lastUpdated).fromNow()}</Text>}
                                        >
                                            <List
                                                itemLayout="horizontal"
                                                dataSource={client.printers}
                                                renderItem={(printer) => (
                                                    <List.Item
                                                        actions={[
                                                            <Button type="link" onClick={() => {
                                                                setSelectedPrinter({ ...printer, hostname: client.hostname });
                                                                setPrinterDetailsVisible(true);
                                                            }}>Details</Button>
                                                        ]}
                                                    >
                                                        <List.Item.Meta
                                                            avatar={
                                                                <div style={{
                                                                    width: 40, height: 40, borderRadius: 8,
                                                                    background: 'rgba(255,255,255,0.05)', display: 'flex',
                                                                    alignItems: 'center', justifyContent: 'center',
                                                                    fontSize: 20, color: getPrinterStatusColor(printer.status, printer.isOnline)
                                                                }}>
                                                                    <PrinterOutlined />
                                                                </div>
                                                            }
                                                            title={
                                                                <Space>
                                                                    <Text strong>{printer.name}</Text>
                                                                    {printer.isColor && <Tag color="magenta" style={{ margin: 0, fontSize: 10 }}>Color</Tag>}
                                                                </Space>
                                                            }
                                                            description={
                                                                <Space direction="vertical" size={0}>
                                                                    <Space size="small">
                                                                        <Badge
                                                                            status={printer.isOnline ? "success" : "error"}
                                                                            text={<Text type="secondary" style={{ fontSize: 12 }}>{printer.status || 'Unknown'}</Text>}
                                                                        />
                                                                    </Space>
                                                                    <Text type="secondary" style={{ fontSize: 11 }}>{printer.driver}</Text>
                                                                </Space>
                                                            }
                                                        />
                                                    </List.Item>
                                                )}
                                            />
                                        </Card>
                                    </Col>
                                ))}
                            </Row>
                        )
                    }
                ]}
            />

            {/* Print Job Details Modal */}
            <Modal
                title={
                    <Space>
                        {selectedJob && getDocumentIcon(selectedJob.documentType)}
                        <span>Print Job Details</span>
                    </Space>
                }
                open={jobDetailsVisible}
                onCancel={() => setJobDetailsVisible(false)}
                footer={[<Button key="close" onClick={() => setJobDetailsVisible(false)}>Close</Button>]}
            >
                {selectedJob && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                        <div style={{ padding: 16, background: 'rgba(255,255,255,0.03)', borderRadius: 12 }}>
                            <Text type="secondary">Document</Text>
                            <Title level={5} style={{ margin: '4px 0 0' }}>{selectedJob.documentName}</Title>
                        </div>
                        <Row gutter={[16, 16]}>
                            <Col span={12}>
                                <div style={{ padding: 16, background: 'rgba(0, 212, 255, 0.1)', borderRadius: 12 }}>
                                    <Text type="secondary">Computer</Text>
                                    <div style={{ fontWeight: 600 }}>{selectedJob.computer}</div>
                                </div>
                            </Col>
                            <Col span={12}>
                                <div style={{ padding: 16, background: 'rgba(123, 44, 191, 0.1)', borderRadius: 12 }}>
                                    <Text type="secondary">User</Text>
                                    <div style={{ fontWeight: 600 }}>{selectedJob.user}</div>
                                </div>
                            </Col>
                            <Col span={12}>
                                <div style={{ padding: 16, background: 'rgba(255,255,255,0.03)', borderRadius: 12 }}>
                                    <Text type="secondary">Pages & Copies</Text>
                                    <div>{selectedJob.pages} pgs × {selectedJob.copies}</div>
                                </div>
                            </Col>
                            <Col span={12}>
                                <div style={{ padding: 16, background: 'rgba(255,255,255,0.03)', borderRadius: 12 }}>
                                    <Text type="secondary">Print Type</Text>
                                    <div>
                                        <Tag color={selectedJob.colorType === 'color' ? 'magenta' : 'default'}>
                                            {selectedJob.colorType === 'color' ? 'Color' : 'B&W'}
                                        </Tag>
                                    </div>
                                </div>
                            </Col>
                        </Row>
                        <div style={{ padding: 16, background: 'rgba(0, 255, 136, 0.1)', borderRadius: 12, display: 'flex', justifyContent: 'space-between' }}>
                            <div><Text type="secondary">Total Cost</Text></div>
                            <div style={{ fontSize: 20, fontWeight: 'bold', color: '#00ff88' }}>{formatKSH(selectedJob.totalPrice)}</div>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <Text type="secondary">Status: {getStatusTag(selectedJob.status)}</Text>
                            <Text type="secondary">{dayjs(selectedJob.timestamp).format('YYYY-MM-DD HH:mm:ss')}</Text>
                        </div>
                    </div>
                )}
            </Modal>

            {/* Printer Details Modal */}
            <Modal
                title={
                    <Space>
                        <PrinterOutlined />
                        <span>Printer Details</span>
                    </Space>
                }
                open={printerDetailsVisible}
                onCancel={() => setPrinterDetailsVisible(false)}
                footer={[<Button key="close" onClick={() => setPrinterDetailsVisible(false)}>Close</Button>]}
            >
                {selectedPrinter && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                        <div style={{ padding: 16, background: 'rgba(255,255,255,0.03)', borderRadius: 12, textAlign: 'center' }}>
                            <PrinterOutlined style={{ fontSize: 48, color: getPrinterStatusColor(selectedPrinter.status, selectedPrinter.isOnline), marginBottom: 16 }} />
                            <Title level={4} style={{ margin: 0 }}>{selectedPrinter.name}</Title>
                            <Tag color={selectedPrinter.isOnline ? 'success' : 'error'} style={{ marginTop: 8 }}>
                                {selectedPrinter.status || 'Unknown'}
                            </Tag>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: 8 }}>
                                <Text type="secondary">Computer</Text>
                                <Text strong>{selectedPrinter.hostname}</Text>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: 8 }}>
                                <Text type="secondary">Driver</Text>
                                <Text>{selectedPrinter.driver}</Text>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: 8 }}>
                                <Text type="secondary">Port</Text>
                                <Text>{selectedPrinter.port}</Text>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: 8 }}>
                                <Text type="secondary">Shared</Text>
                                <Text>{selectedPrinter.shared ? 'Yes' : 'No'}</Text>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: 8 }}>
                                <Text type="secondary">Color Supported</Text>
                                <Text>{selectedPrinter.isColor ? 'Yes' : 'No'}</Text>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: 8 }}>
                                <Text type="secondary">Type</Text>
                                <Text>{selectedPrinter.type}</Text>
                            </div>
                        </div>
                    </div>
                )}
            </Modal>
        </div>
    );
}

export default PrintManager;
