import { useState, useEffect, useMemo } from 'react';
import { Card, Table, Tag, Button, Space, Typography, Input, Select, Tooltip, Badge, Tabs, Row, Col, Modal, message, List, Empty, Statistic, Progress, DatePicker, Popconfirm } from 'antd';
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
    AppstoreOutlined,
    BarsOutlined,
    BarChartOutlined,
    PieChartOutlined
} from '@ant-design/icons';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { getPrintJobs, getPrinters, connectSocket, removeConnectedPrinters, removeSinglePrinter, deleteAllPrinterData, getPageCounterReadings, deletePageCounterReading, getPhotocopyData } from '../services/api';

dayjs.extend(relativeTime);

const { Text, Title } = Typography;
const { Search } = Input;
const { RangePicker } = DatePicker;

// Format number with KSH currency
const formatKSH = (amount) => `KSH ${Number(amount || 0).toLocaleString()}`;

// ==================== PHOTOCOPY TAB COMPONENT ====================
function PhotocopyTracker({ printers }) {
    const [readings, setReadings] = useState([]);
    const [photocopyData, setPhotocopyData] = useState(null);
    const [selectedPrinter, setSelectedPrinter] = useState(null);
    const [loading, setLoading] = useState(false);
    const [dateRange, setDateRange] = useState(null);
    const [readingsSort, setReadingsSort] = useState('newest');

    // Build a flat list of unique printer names from all connected clients
    const allPrinterNames = useMemo(() => {
        const names = new Set();
        (printers || []).forEach(client => {
            (client.printers || []).forEach(p => {
                if (p.name) names.add(p.name);
            });
        });
        return [...names].sort();
    }, [printers]);

    // Auto-select first printer if none selected
    useEffect(() => {
        if (!selectedPrinter && allPrinterNames.length > 0) {
            setSelectedPrinter(allPrinterNames[0]);
        }
    }, [allPrinterNames, selectedPrinter]);

    // Fetch readings and photocopy data when printer changes
    const fetchPhotocopyInfo = async () => {
        if (!selectedPrinter) return;
        setLoading(true);
        try {
            const [readingsRes, photoRes] = await Promise.all([
                getPageCounterReadings({ printerName: selectedPrinter }),
                getPhotocopyData({ printerName: selectedPrinter })
            ]);
            setReadings(readingsRes.readings || []);
            setPhotocopyData(photoRes);
        } catch (e) {
            console.error('Photocopy data fetch error', e);
            message.error('Failed to load photocopy data');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchPhotocopyInfo();
    }, [selectedPrinter]);

    const handleDeleteReading = async (id) => {
        try {
            await deletePageCounterReading(id);
            message.success('Reading deleted');
            fetchPhotocopyInfo();
        } catch {
            message.error('Failed to delete reading');
        }
    };

    // Helper to render source badge
    const renderSourceBadge = (reading) => {
        const source = reading.source || 'manual';
        if (source === 'manual') return <Tag color="blue" style={{ fontSize: 10 }}>👤 Manual</Tag>;
        if (source === 'epson_stm3_tag36') return <Tag color="green" style={{ fontSize: 10 }}>🤖 Tag36</Tag>;
        if (source === 'agent_auto' || source === 'epson_stm3_registry' || source === 'bidi') return <Tag color="green" style={{ fontSize: 10 }}>🤖 Auto</Tag>;
        if (source === 'snmp' || source === 'snmp_raw') return <Tag color="cyan" style={{ fontSize: 10 }}>📡 SNMP</Tag>;
        return <Tag style={{ fontSize: 10 }}>{source}</Tag>;
    };

    // Count auto readings
    const autoReadings = readings.filter(r => r.source && r.source !== 'manual').length;

    // Filter intervals by date range
    const filteredIntervals = useMemo(() => {
        const intervals = photocopyData?.intervals || [];
        if (!dateRange || !dateRange[0] || !dateRange[1]) return intervals;
        return intervals.filter(interval => {
            const start = dayjs(interval.startReading.recordedAt);
            const end = dayjs(interval.endReading.recordedAt);
            return end.isAfter(dateRange[0].startOf('day')) && start.isBefore(dateRange[1].endOf('day'));
        });
    }, [photocopyData, dateRange]);

    // Filter readings by date range
    const filteredReadings = useMemo(() => {
        let result = [...readings];
        if (dateRange && dateRange[0] && dateRange[1]) {
            result = result.filter(r =>
                dayjs(r.recordedAt).isAfter(dateRange[0].startOf('day')) &&
                dayjs(r.recordedAt).isBefore(dateRange[1].endOf('day'))
            );
        }
        // Sort
        if (readingsSort === 'newest') result.sort((a, b) => new Date(b.recordedAt) - new Date(a.recordedAt));
        else if (readingsSort === 'oldest') result.sort((a, b) => new Date(a.recordedAt) - new Date(b.recordedAt));
        else if (readingsSort === 'highest') result.sort((a, b) => (b.counterValue || 0) - (a.counterValue || 0));
        else if (readingsSort === 'lowest') result.sort((a, b) => (a.counterValue || 0) - (b.counterValue || 0));
        return result;
    }, [readings, dateRange, readingsSort]);

    // Filtered summary stats
    const filteredSummary = useMemo(() => {
        const intervals = filteredIntervals;
        return {
            totalPhotocopies: intervals.reduce((s, i) => s + (i.photocopies || 0), 0),
            photocopiesBW: intervals.reduce((s, i) => s + (i.photocopiesBW || 0), 0),
            photocopiesColor: intervals.reduce((s, i) => s + (i.photocopiesColor || 0), 0),
            totalCounterDiff: intervals.reduce((s, i) => s + (i.counterDiff || 0), 0),
            totalPrintJobs: intervals.reduce((s, i) => s + (i.printPages || 0), 0),
            estimatedRevenue: intervals.reduce((s, i) => s + (i.photocopyRevenue || 0), 0),
            revenueBW: intervals.reduce((s, i) => s + (i.photocopyRevenueBW || 0), 0),
            revenueColor: intervals.reduce((s, i) => s + (i.photocopyRevenueColor || 0), 0),
        };
    }, [filteredIntervals]);

    // Interval table columns
    const intervalColumns = [
        {
            title: 'Period', key: 'period', width: 200,
            sorter: (a, b) => new Date(a.startReading.recordedAt) - new Date(b.startReading.recordedAt),
            defaultSortOrder: 'descend',
            render: (_, interval) => (
                <div>
                    <Text style={{ fontSize: 12 }}>{dayjs(interval.startReading.recordedAt).format('MMM D, HH:mm')}</Text>
                    <Text type="secondary" style={{ fontSize: 12 }}> → </Text>
                    <Text style={{ fontSize: 12 }}>{dayjs(interval.endReading.recordedAt).format('MMM D, HH:mm')}</Text>
                    <br />
                    <Text type="secondary" style={{ fontSize: 11 }}>{dayjs(interval.endReading.recordedAt).fromNow()}</Text>
                </div>
            )
        },
        {
            title: 'Counter', key: 'counter', width: 140,
            render: (_, interval) => (
                <Tag color="purple" style={{ fontSize: 11 }}>
                    {interval.startReading.counterValue?.toLocaleString()} → {interval.endReading.counterValue?.toLocaleString()}
                </Tag>
            )
        },
        {
            title: 'Diff', dataIndex: 'counterDiff', key: 'counterDiff', width: 80,
            sorter: (a, b) => (a.counterDiff || 0) - (b.counterDiff || 0),
            render: (v) => <Text strong>{(v || 0).toLocaleString()}</Text>
        },
        {
            title: 'Print Pages', dataIndex: 'printPages', key: 'printPages', width: 100,
            sorter: (a, b) => (a.printPages || 0) - (b.printPages || 0),
            render: (v) => <Text style={{ color: '#00d4ff' }}>{(v || 0).toLocaleString()}</Text>
        },
        {
            title: 'Photocopies', key: 'photocopies', width: 140,
            sorter: (a, b) => (a.photocopies || 0) - (b.photocopies || 0),
            render: (_, interval) => (
                <div>
                    <Text strong style={{ color: '#7b2cbf', fontSize: 14 }}>{(interval.photocopies || 0).toLocaleString()}</Text>
                    {(interval.photocopiesBW > 0 || interval.photocopiesColor > 0) && (
                        <div style={{ fontSize: 10, marginTop: 2 }}>
                            {interval.photocopiesBW > 0 && <Text style={{ color: '#b0b0c0' }}>⬛ {interval.photocopiesBW} </Text>}
                            {interval.photocopiesColor > 0 && <Text style={{ color: '#e040fb' }}>🎨 {interval.photocopiesColor}</Text>}
                        </div>
                    )}
                </div>
            )
        },
        {
            title: 'Revenue', dataIndex: 'photocopyRevenue', key: 'revenue', width: 130,
            sorter: (a, b) => (a.photocopyRevenue || 0) - (b.photocopyRevenue || 0),
            render: (v, interval) => (
                <div>
                    <Text style={{ color: '#00ff88', fontFamily: 'JetBrains Mono', fontSize: 12 }}>{formatKSH(v || 0)}</Text>
                    {(interval.photocopyRevenueBW > 0 && interval.photocopyRevenueColor > 0) && (
                        <div style={{ fontSize: 10, marginTop: 2 }}>
                            <Text style={{ color: '#b0b0c0' }}>BW: {formatKSH(interval.photocopyRevenueBW)} </Text>
                            <Text style={{ color: '#e040fb' }}>Color: {formatKSH(interval.photocopyRevenueColor)}</Text>
                        </div>
                    )}
                </div>
            )
        },
        {
            title: 'Breakdown', key: 'breakdown', width: 160,
            render: (_, interval) => {
                const total = interval.counterDiff || 1;
                const printPct = Math.round((interval.printPages / total) * 100);
                const copyPct = 100 - printPct;
                return (
                    <div>
                        <div style={{ display: 'flex', gap: 6, marginBottom: 2 }}>
                            <Text style={{ fontSize: 10, color: '#00d4ff' }}>🖨️ {printPct}%</Text>
                            <Text style={{ fontSize: 10, color: '#7b2cbf' }}>📋 {copyPct}%</Text>
                            {interval.printJobCount > 0 && <Text type="secondary" style={{ fontSize: 10 }}>({interval.printJobCount} jobs)</Text>}
                        </div>
                        <div style={{ display: 'flex', height: 5, borderRadius: 3, overflow: 'hidden', background: 'rgba(255,255,255,0.05)' }}>
                            {interval.printPages > 0 && <div style={{ width: `${printPct}%`, background: '#00d4ff' }} />}
                            {interval.photocopies > 0 && <div style={{ width: `${copyPct}%`, background: '#7b2cbf' }} />}
                        </div>
                    </div>
                );
            }
        },
    ];

    return (
        <div>
            {/* Auto-collection status banner */}
            {autoReadings > 0 && (
                <div style={{
                    padding: '10px 16px', marginBottom: 16, borderRadius: 8,
                    background: 'linear-gradient(135deg, rgba(0,212,136,0.08), rgba(0,180,255,0.08))',
                    border: '1px solid rgba(0,212,136,0.2)',
                    display: 'flex', alignItems: 'center', gap: 10
                }}>
                    <span style={{ fontSize: 18 }}>🤖</span>
                    <Text style={{ color: '#00d488', fontSize: 13 }}>
                        <strong>Auto-collection active!</strong> The agent is automatically reading page counters.
                        <span> ({autoReadings} automatic readings collected)</span>
                    </Text>
                </div>
            )}

            {/* Printer Selector + Date Range */}
            <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
                <Space>
                    <Text type="secondary">Printer:</Text>
                    <Select
                        value={selectedPrinter}
                        onChange={setSelectedPrinter}
                        style={{ width: 250 }}
                        placeholder="Select printer"
                        showSearch
                        filterOption={(input, option) => option.label.toLowerCase().includes(input.toLowerCase())}
                        options={allPrinterNames.map(n => ({ value: n, label: n }))}
                    />
                </Space>
                <Space>
                    <Text type="secondary">Date Range:</Text>
                    <RangePicker
                        size="small"
                        onChange={setDateRange}
                        value={dateRange}
                        style={{ width: 240 }}
                        allowClear
                        presets={[
                            { label: 'Today', value: [dayjs().startOf('day'), dayjs().endOf('day')] },
                            { label: 'Yesterday', value: [dayjs().subtract(1, 'day').startOf('day'), dayjs().subtract(1, 'day').endOf('day')] },
                            { label: 'This Week', value: [dayjs().startOf('week'), dayjs().endOf('day')] },
                            { label: 'This Month', value: [dayjs().startOf('month'), dayjs().endOf('day')] },
                            { label: 'Last 7 Days', value: [dayjs().subtract(7, 'day'), dayjs()] },
                            { label: 'Last 30 Days', value: [dayjs().subtract(30, 'day'), dayjs()] },
                        ]}
                    />
                    {dateRange && <Button size="small" onClick={() => setDateRange(null)}>Clear</Button>}
                </Space>
                <Button icon={<ReloadOutlined />} onClick={fetchPhotocopyInfo} loading={loading} size="small">Refresh</Button>
            </div>

            {/* Summary Stats */}
            {filteredIntervals.length > 0 && (
                <div className="stats-row" style={{ marginBottom: 24 }}>
                    <div className="stat-card" style={{ borderLeft: '3px solid #7b2cbf' }}>
                        <div className="stat-header">
                            <div className="stat-icon" style={{ background: 'rgba(123,44,191,0.15)', color: '#7b2cbf' }}><PrinterOutlined /></div>
                            <div className="stat-value">{(filteredSummary.totalPhotocopies || 0).toLocaleString()}</div>
                        </div>
                        <div className="stat-label">Total Photocopies{dateRange ? ' (filtered)' : ''}</div>
                        {(filteredSummary.photocopiesBW > 0 || filteredSummary.photocopiesColor > 0) && (
                            <div style={{ fontSize: 11, marginTop: 4, opacity: 0.8 }}>
                                <span style={{ color: '#b0b0c0' }}>⬛ {filteredSummary.photocopiesBW} BW</span>
                                {filteredSummary.photocopiesColor > 0 && <span style={{ color: '#e040fb', marginLeft: 8 }}>🎨 {filteredSummary.photocopiesColor} Color</span>}
                            </div>
                        )}
                    </div>
                    <div className="stat-card" style={{ borderLeft: '3px solid #00d4ff' }}>
                        <div className="stat-header">
                            <div className="stat-icon blue"><BarChartOutlined /></div>
                            <div className="stat-value">{(filteredSummary.totalCounterDiff || 0).toLocaleString()}</div>
                        </div>
                        <div className="stat-label">Counter Difference</div>
                    </div>
                    <div className="stat-card" style={{ borderLeft: '3px solid #b0b0c0' }}>
                        <div className="stat-header">
                            <div className="stat-icon" style={{ background: 'rgba(176,176,192,0.15)', color: '#b0b0c0' }}><FileTextOutlined /></div>
                            <div className="stat-value">{(filteredSummary.totalPrintJobs || 0).toLocaleString()}</div>
                        </div>
                        <div className="stat-label">Tracked Print Pages</div>
                    </div>
                    <div className="stat-card green">
                        <div className="stat-header">
                            <div className="stat-icon green"><DollarOutlined /></div>
                            <div className="stat-value">{formatKSH(filteredSummary.estimatedRevenue || 0)}</div>
                        </div>
                        <div className="stat-label">Photocopy Revenue (est.)</div>
                        {(filteredSummary.revenueBW > 0 && filteredSummary.revenueColor > 0) && (
                            <div style={{ fontSize: 11, marginTop: 4, opacity: 0.8 }}>
                                <span style={{ color: '#b0b0c0' }}>BW: {formatKSH(filteredSummary.revenueBW)}</span>
                                <span style={{ color: '#e040fb', marginLeft: 6 }}>Color: {formatKSH(filteredSummary.revenueColor)}</span>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Photocopy Intervals Table */}
            <Card
                title={
                    <Space>
                        <BarChartOutlined style={{ color: '#7b2cbf' }} />
                        <span>Photocopy Intervals ({filteredIntervals.length})</span>
                    </Space>
                }
                style={{ marginBottom: 24 }}
            >
                {filteredIntervals.length === 0 ? (
                    <Empty
                        image={Empty.PRESENTED_IMAGE_SIMPLE}
                        description={
                            <span style={{ color: '#b0b0c0' }}>
                                {dateRange ? 'No photocopy data in the selected date range.' : (photocopyData?.message || 'Waiting for at least 2 automatic page counter readings to calculate photocopies.')}
                            </span>
                        }
                    />
                ) : (
                    <Table
                        columns={intervalColumns}
                        dataSource={filteredIntervals}
                        rowKey={(_, idx) => idx}
                        pagination={{ pageSize: 15, showSizeChanger: true, pageSizeOptions: ['10', '15', '25', '50'], showTotal: (total) => `${total} intervals` }}
                        scroll={{ x: 800 }}
                        size="small"
                        summary={() => {
                            if (filteredIntervals.length <= 1) return null;
                            return (
                                <Table.Summary fixed>
                                    <Table.Summary.Row>
                                        <Table.Summary.Cell index={0}><Text strong style={{ color: '#7b2cbf' }}>Totals</Text></Table.Summary.Cell>
                                        <Table.Summary.Cell index={1} />
                                        <Table.Summary.Cell index={2}><Text strong>{filteredSummary.totalCounterDiff.toLocaleString()}</Text></Table.Summary.Cell>
                                        <Table.Summary.Cell index={3}><Text strong style={{ color: '#00d4ff' }}>{filteredSummary.totalPrintJobs.toLocaleString()}</Text></Table.Summary.Cell>
                                        <Table.Summary.Cell index={4}><Text strong style={{ color: '#7b2cbf', fontSize: 14 }}>{filteredSummary.totalPhotocopies.toLocaleString()}</Text></Table.Summary.Cell>
                                        <Table.Summary.Cell index={5}><Text strong style={{ color: '#00ff88', fontFamily: 'JetBrains Mono' }}>{formatKSH(filteredSummary.estimatedRevenue)}</Text></Table.Summary.Cell>
                                        <Table.Summary.Cell index={6} />
                                    </Table.Summary.Row>
                                </Table.Summary>
                            );
                        }}
                    />
                )}
            </Card>

            {/* Readings History */}
            <Card
                title={
                    <Space>
                        <ClockCircleOutlined style={{ color: '#00d4ff' }} />
                        <span>Counter Readings History ({filteredReadings.length})</span>
                    </Space>
                }
                extra={
                    <Space size={6}>
                        <Select
                            value={readingsSort}
                            onChange={setReadingsSort}
                            size="small"
                            style={{ width: 150 }}
                            options={[
                                { value: 'newest', label: '🕐 Newest First' },
                                { value: 'oldest', label: '🕐 Oldest First' },
                                { value: 'highest', label: '📈 Highest Counter' },
                                { value: 'lowest', label: '📉 Lowest Counter' },
                            ]}
                        />
                    </Space>
                }
            >
                {filteredReadings.length === 0 ? (
                    <Empty
                        image={Empty.PRESENTED_IMAGE_SIMPLE}
                        description={dateRange ? 'No readings in the selected date range' : 'No readings yet'}
                    />
                ) : (
                    <List
                        dataSource={filteredReadings}
                        pagination={{ pageSize: 10, size: 'small', showTotal: (total) => `${total} readings` }}
                        renderItem={(reading) => (
                            <List.Item
                                actions={[
                                    <Popconfirm
                                        key="del"
                                        title="Delete this reading?"
                                        description="This may affect photocopy calculations."
                                        onConfirm={() => handleDeleteReading(reading._id)}
                                        okText="Delete"
                                        okButtonProps={{ danger: true }}
                                    >
                                        <Button type="link" danger size="small" icon={<DeleteOutlined />} />
                                    </Popconfirm>
                                ]}
                            >
                                <List.Item.Meta
                                    avatar={
                                        <div style={{
                                            width: 40, height: 40, borderRadius: 8,
                                            background: 'rgba(123,44,191,0.1)',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            fontSize: 16, fontWeight: 700, color: '#7b2cbf'
                                        }}>
                                            {(reading.counterValue || 0).toLocaleString()}
                                        </div>
                                    }
                                    title={
                                        <Space>
                                            <Text strong>{reading.counterValue?.toLocaleString()} pages</Text>
                                            {renderSourceBadge(reading)}
                                        </Space>
                                    }
                                    description={
                                        <Space direction="vertical" size={0}>
                                            <Text type="secondary" style={{ fontSize: 12 }}>
                                                {dayjs(reading.recordedAt).format('MMM D, YYYY • hh:mm A')}
                                            </Text>
                                            {reading.colorPages != null && reading.bwPages != null && (
                                                <Text type="secondary" style={{ fontSize: 11 }}>
                                                    🎨 Color: {reading.colorPages?.toLocaleString()} | ⬛ B/W: {reading.bwPages?.toLocaleString()}
                                                </Text>
                                            )}
                                            {(reading.withBorderColor != null || reading.withBorderBW != null) && (
                                                <Text type="secondary" style={{ fontSize: 11 }}>
                                                    WB-Color: {(reading.withBorderColor || 0).toLocaleString()} | WB-BW: {(reading.withBorderBW || 0).toLocaleString()}
                                                    {reading.borderlessColor > 0 && ` | BL-Color: ${reading.borderlessColor.toLocaleString()}`}
                                                    {reading.borderlessBW > 0 && ` | BL-BW: ${reading.borderlessBW.toLocaleString()}`}
                                                </Text>
                                            )}
                                            {reading.notes && <Text type="secondary" style={{ fontSize: 11 }}>📝 {reading.notes}</Text>}
                                            <Text type="secondary" style={{ fontSize: 11 }}>
                                                By: {reading.recordedBy}{reading.hostname ? ` (${reading.hostname})` : ''}
                                            </Text>
                                        </Space>
                                    }
                                />
                            </List.Item>
                        )}
                    />
                )}
            </Card>

            {/* How it works */}
            <Card style={{ marginTop: 24, background: 'rgba(123,44,191,0.05)', border: '1px solid rgba(123,44,191,0.15)' }}>
                <Title level={5} style={{ color: '#7b2cbf', margin: '0 0 8px' }}>
                    <ExclamationCircleOutlined style={{ marginRight: 8 }} />
                    How Photocopy Tracking Works
                </Title>
                <Text type="secondary" style={{ fontSize: 13 }}>
                    1. <strong>🤖 Automatic:</strong> The desktop agent reads the printer's internal page counter every ~5 minutes
                    (same data as <em>Printer Properties → Maintenance → Nozzle Check</em>).<br />
                    2. The system tracks all print jobs sent through computers automatically.<br />
                    3. <strong>Photocopies = Counter Difference − Tracked Print Jobs</strong> for each interval.<br />
                    4. This gives you an accurate count of pages used for photocopying (manual copier usage).
                </Text>
            </Card>
        </div>
    );
}
// ==================== END PHOTOCOPY TRACKER ====================

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
    const [dateRange, setDateRange] = useState(null);
    const [filterPrinter, setFilterPrinter] = useState('all');
    const [filterComputer, setFilterComputer] = useState('all');
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
                totalSheets: job.totalSheets || ((job.totalPages || job.pages || 1) * (job.copies || 1)),
                colorType: job.printType || 'bw',
                pricePerPage: job.pricePerPage || 0,
                totalPrice: job.totalPrice || job.amount || 0,
                status: (() => {
                    const s = (job.status || 'completed').toLowerCase();
                    if (s === 'printed') return 'completed';
                    if (s === 'spooling') return 'printing';
                    return s;
                })(),
                timestamp: job.timestamp || job.receivedAt || new Date().toISOString(),
                printerName: job.printer || 'Unknown',
                mediaType: job.mediaType || job.paperType || 'Plain Paper',
                paperSize: job.paperSize || 'A4',
                duplexMode: job.duplexMode || 'Single-sided',
                printQuality: job.printQuality || 'Normal',
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

    const handleRemovePrinters = async () => {
        try {
            const result = await deleteAllPrinterData();
            const printJobs = result?.deleted?.printJobs || 0;
            const printers = result?.deleted?.printers || 0;
            message.success(`Cleared ${printJobs} print jobs and ${printers} printer records`);
            fetchData();
        } catch {
            message.error('Failed to clear print data');
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
        const s = (status || '').toLowerCase();
        switch (s) {
            case 'completed':
            case 'printed': return <Tag icon={<CheckCircleOutlined />} color="success">Completed</Tag>;
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

    const uniquePrinters = useMemo(() => [...new Set(printJobs.map(j => j.printerName).filter(Boolean))], [printJobs]);
    const uniqueComputers = useMemo(() => [...new Set(printJobs.map(j => j.computer).filter(Boolean))], [printJobs]);

    const filteredJobs = useMemo(() => printJobs.filter(job => {
        const matchesStatus = filterStatus === 'all' || job.status === filterStatus;
        const matchesColor = filterColorType === 'all' || job.colorType === filterColorType;
        const matchesSearch = !searchText || job.documentName.toLowerCase().includes(searchText.toLowerCase()) ||
            job.user.toLowerCase().includes(searchText.toLowerCase()) ||
            job.computer.toLowerCase().includes(searchText.toLowerCase());
        const matchesPrinter = filterPrinter === 'all' || job.printerName === filterPrinter;
        const matchesComputer = filterComputer === 'all' || job.computer === filterComputer;
        const matchesDate = !dateRange || (
            dayjs(job.timestamp).isAfter(dateRange[0].startOf('day')) &&
            dayjs(job.timestamp).isBefore(dateRange[1].endOf('day'))
        );
        return matchesStatus && matchesColor && matchesSearch && matchesPrinter && matchesComputer && matchesDate;
    }), [printJobs, filterStatus, filterColorType, searchText, filterPrinter, filterComputer, dateRange]);

    const stats = {
        totalJobs: totals.totalJobs || printJobs.length,
        completed: printJobs.filter(j => j.status === 'completed').length,
        pending: printJobs.filter(j => j.status === 'pending' || j.status === 'printing' || j.status === 'spooling').length,
        totalPages: totals.totalPages || printJobs.reduce((sum, j) => sum + (j.totalSheets || (j.pages * j.copies)), 0),
        bwPages: totals.bwPages || printJobs.filter(j => j.colorType === 'bw').reduce((sum, j) => sum + (j.totalSheets || (j.pages * j.copies)), 0),
        colorPages: totals.colorPages || printJobs.filter(j => j.colorType === 'color').reduce((sum, j) => sum + (j.totalSheets || (j.pages * j.copies)), 0),
        totalRevenue: totals.totalRevenue || printJobs.filter(j => j.status === 'completed').reduce((sum, j) => sum + j.totalPrice, 0),
    };

    // Calculate total printers across all clients
    const totalPrintersCount = printers.reduce((sum, client) => sum + (client.printers?.length || 0), 0);
    const onlinePrintersCount = printers.reduce((sum, client) =>
        sum + (client.printers?.filter(p => p.isOnline)?.length || 0), 0);

    const columns = [
        {
            title: 'Document',
            dataIndex: 'documentName',
            key: 'documentName',
            sorter: (a, b) => a.documentName.localeCompare(b.documentName),
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
            sorter: (a, b) => a.computer.localeCompare(b.computer),
            filters: uniqueComputers.map(c => ({ text: c, value: c })),
            onFilter: (v, r) => r.computer === v,
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
            sorter: (a, b) => a.printerName.localeCompare(b.printerName),
            filters: uniquePrinters.map(p => ({ text: p, value: p })),
            onFilter: (v, r) => r.printerName === v,
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
            filters: [{ text: '⬛ B&W', value: 'bw' }, { text: '🎨 Color', value: 'color' }],
            onFilter: (v, r) => r.colorType === v,
            render: (type) => (
                <Tag color={type === 'color' ? 'magenta' : 'default'}>
                    {type === 'color' ? '🎨 Color' : '⬛ B&W'}
                </Tag>
            ),
        },
        {
            title: 'Pages',
            key: 'totalPages',
            sorter: (a, b) => (a.pages * a.copies) - (b.pages * b.copies),
            width: 90,
            render: (_, r) => {
                const total = r.totalSheets || (r.pages * r.copies);
                return (
                    <Tooltip title={`${r.pages} page${r.pages > 1 ? 's' : ''} × ${r.copies} cop${r.copies > 1 ? 'ies' : 'y'} = ${total} sheet${total > 1 ? 's' : ''}`}>
                        <Text strong style={{ fontSize: 14 }}>{total}</Text>
                        {r.copies > 1 && <Text type="secondary" style={{ fontSize: 10, display: 'block' }}>{r.pages}p × {r.copies}c</Text>}
                    </Tooltip>
                );
            },
        },
        {
            title: 'Paper',
            key: 'mediaType',
            width: 100,
            filters: [
                { text: 'Plain Paper', value: 'Plain Paper' },
                { text: 'Glossy', value: 'Glossy' },
                { text: 'Matte', value: 'Matte' },
                { text: 'Photo Paper', value: 'Photo Paper' },
                { text: 'Cardstock', value: 'Cardstock' },
                { text: 'Envelope', value: 'Envelope' },
                { text: 'Labels', value: 'Labels' },
            ],
            onFilter: (v, r) => (r.mediaType || 'Plain Paper') === v,
            render: (_, r) => {
                const mt = r.mediaType || 'Plain Paper';
                const colorMap = { 'Glossy': 'gold', 'Matte': 'purple', 'Photo Paper': 'magenta', 'Cardstock': 'orange', 'Envelope': 'cyan', 'Labels': 'green', 'Heavyweight': 'volcano', 'Recycled': 'lime' };
                return <Tag color={colorMap[mt] || 'default'} style={{ fontSize: 10, margin: 0 }}>{mt}</Tag>;
            },
        },
        {
            title: 'Price',
            dataIndex: 'totalPrice',
            key: 'totalPrice',
            sorter: (a, b) => a.totalPrice - b.totalPrice,
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
            filters: [
                { text: '✅ Completed', value: 'completed' },
                { text: '⏳ Pending', value: 'pending' },
                { text: '🖨️ Printing', value: 'printing' },
                { text: '❌ Failed', value: 'failed' },
            ],
            onFilter: (v, r) => r.status === v,
            render: (status) => getStatusTag(status),
        },
        {
            title: 'Date & Time',
            dataIndex: 'timestamp',
            key: 'timestamp',
            sorter: (a, b) => new Date(a.timestamp) - new Date(b.timestamp),
            defaultSortOrder: 'descend',
            width: 160,
            render: (time) => (
                <>
                    <Text style={{ fontSize: 13 }}>{dayjs(time).format('MMM D, YYYY')}</Text>
                    <br />
                    <Text type="secondary" style={{ fontSize: 11 }}>
                        {dayjs(time).format('hh:mm:ss A')} • {dayjs(time).fromNow()}
                    </Text>
                </>
            ),
        },
        {
            title: 'Actions',
            key: 'actions',
            width: 70,
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

    // Helper: render a mini page counter bar for B&W vs Color
    const renderPageBreakdown = (bwPages, colorPages) => {
        const total = (bwPages || 0) + (colorPages || 0);
        if (total === 0) return <Text type="secondary" style={{ fontSize: 12 }}>No pages today</Text>;
        const bwPercent = Math.round((bwPages / total) * 100);
        const colorPercent = 100 - bwPercent;

        return (
            <div>
                <div style={{ display: 'flex', gap: 8, marginBottom: 4 }}>
                    <Text style={{ fontSize: 12, color: '#b0b0c0' }}>⬛ {bwPages} B&W</Text>
                    <Text style={{ fontSize: 12, color: '#e040fb' }}>🎨 {colorPages} Color</Text>
                </div>
                <div style={{ display: 'flex', height: 4, borderRadius: 2, overflow: 'hidden', background: 'rgba(255,255,255,0.05)' }}>
                    {bwPages > 0 && <div style={{ width: `${bwPercent}%`, background: '#b0b0c0' }} />}
                    {colorPages > 0 && <div style={{ width: `${colorPercent}%`, background: '#e040fb' }} />}
                </div>
                <Text type="secondary" style={{ fontSize: 11 }}>{total} total pages today</Text>
            </div>
        );
    };

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
                    <div className="stat-label">Total Sheets Printed</div>
                </div>
                <div className="stat-card">
                    <div className="stat-header">
                        <div className="stat-icon" style={{ background: 'rgba(107, 107, 128, 0.15)', color: '#b0b0c0' }}><FileTextOutlined /></div>
                        <div className="stat-value">{stats.bwPages}</div>
                    </div>
                    <div className="stat-label">B&W Sheets</div>
                </div>
                <div className="stat-card pink">
                    <div className="stat-header">
                        <div className="stat-icon pink"><FileImageOutlined /></div>
                        <div className="stat-value">{stats.colorPages}</div>
                    </div>
                    <div className="stat-label">Color Sheets</div>
                </div>
                <div className="stat-card green">
                    <div className="stat-header">
                        <div className="stat-icon green"><DollarOutlined /></div>
                        <div className="stat-value">{formatKSH(stats.totalRevenue)}</div>
                    </div>
                    <div className="stat-label">Print Revenue</div>
                </div>
                <div className="stat-card" style={{ borderLeft: '3px solid #00d4ff' }}>
                    <div className="stat-header">
                        <div className="stat-icon blue"><PrinterOutlined /></div>
                        <div className="stat-value">{onlinePrintersCount}<span style={{ fontSize: 14, color: '#b0b0c0' }}>/{totalPrintersCount}</span></div>
                    </div>
                    <div className="stat-label">Printers Online</div>
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
                                    <Space wrap>
                                        <Search
                                            placeholder="Search docs, users..."
                                            style={{ width: 200 }}
                                            value={searchText}
                                            onChange={(e) => setSearchText(e.target.value)}
                                            allowClear
                                        />
                                        <RangePicker size="small" onChange={setDateRange} style={{ width: 220 }} />
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
                                        <Select
                                            value={filterPrinter}
                                            onChange={setFilterPrinter}
                                            style={{ width: 150 }}
                                            options={[
                                                { value: 'all', label: '🖨️ All Printers' },
                                                ...uniquePrinters.map(p => ({ value: p, label: p }))
                                            ]}
                                        />
                                        <Select
                                            value={filterComputer}
                                            onChange={setFilterComputer}
                                            style={{ width: 150 }}
                                            options={[
                                                { value: 'all', label: '🖥️ All Computers' },
                                                ...uniqueComputers.map(c => ({ value: c, label: c }))
                                            ]}
                                        />
                                        <Button icon={<ReloadOutlined />} onClick={fetchData} loading={loading} size="small">Refresh</Button>
                                    </Space>
                                }
                            >
                                <Table
                                    columns={columns}
                                    dataSource={filteredJobs}
                                    rowKey="id"
                                    loading={loading}
                                    pagination={{ pageSize: 15, showSizeChanger: true, pageSizeOptions: ['10', '15', '25', '50'] }}
                                    size="middle"
                                    scroll={{ x: 1300 }}
                                    showSorterTooltip
                                />
                            </Card>
                        )
                    },
                    {
                        key: 'printers',
                        label: <span><PrinterOutlined style={{ marginRight: 6 }} /> Connected Printers ({totalPrintersCount})</span>,
                        children: (
                            <div>
                                <div style={{ display: 'flex', justifyContent: 'flex-end', paddingBottom: 16 }}>
                                    <Popconfirm
                                        title="Clear All Print Data?"
                                        description="This will permanently delete all print jobs and printer records. Agents will re-report printers on the next cycle."
                                        onConfirm={handleRemovePrinters}
                                        okText="Yes, Clear All Print Data"
                                        okButtonProps={{ danger: true }}
                                        placement="bottomRight"
                                    >
                                        <Button icon={<DeleteOutlined />} danger type="primary" ghost size="small">
                                            Clear History / Remove Old Printers
                                        </Button>
                                    </Popconfirm>
                                </div>
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
                                                        <Tag color="blue" style={{ margin: 0, fontSize: 10 }}>
                                                            {client.printers?.length || 0} printers
                                                        </Tag>
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
                                                                }}>Details</Button>,
                                                                <Popconfirm
                                                                    title={`Remove "${printer.name}"?`}
                                                                    description="This printer will reappear if the agent reports it again."
                                                                    onConfirm={async () => {
                                                                        try {
                                                                            await removeSinglePrinter(client.clientId, printer.name);
                                                                            message.success(`Removed ${printer.name}`);
                                                                            fetchData();
                                                                        } catch {
                                                                            message.error('Failed to remove printer');
                                                                        }
                                                                    }}
                                                                    okText="Remove"
                                                                    okButtonProps={{ danger: true }}
                                                                >
                                                                    <Button type="link" danger size="small">Remove</Button>
                                                                </Popconfirm>
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
                                                                        {printer.isDefault && <Tag color="gold" style={{ margin: 0, fontSize: 10 }}>Default</Tag>}
                                                                        {printer.isNetwork && <Tag color="cyan" style={{ margin: 0, fontSize: 10 }}>Network</Tag>}
                                                                    </Space>
                                                                }
                                                                description={
                                                                    <Space direction="vertical" size={4} style={{ width: '100%' }}>
                                                                        <Space size="small">
                                                                            <Badge
                                                                                status={printer.isOnline ? "success" : "error"}
                                                                                text={<Text type="secondary" style={{ fontSize: 12 }}>{printer.status || 'Unknown'}</Text>}
                                                                            />
                                                                            {printer.activeJobs > 0 && (
                                                                                <Tag color="processing" style={{ margin: 0, fontSize: 10 }}>
                                                                                    {printer.activeJobs} active
                                                                                </Tag>
                                                                            )}
                                                                        </Space>
                                                                        <Text type="secondary" style={{ fontSize: 11 }}>{printer.driver}</Text>
                                                                        {/* Show page counters */}
                                                                        {(printer.totalPagesPrinted > 0 || printer.totalJobsPrinted > 0) && (
                                                                            <div style={{ display: 'flex', gap: 12, marginTop: 2 }}>
                                                                                <Tooltip title="Lifetime pages printed (from system counters)">
                                                                                    <Text style={{ fontSize: 11, color: '#00d4ff' }}>
                                                                                        📄 {printer.totalPagesPrinted?.toLocaleString()} pages
                                                                                    </Text>
                                                                                </Tooltip>
                                                                                <Tooltip title="Lifetime jobs printed (from system counters)">
                                                                                    <Text style={{ fontSize: 11, color: '#b0b0c0' }}>
                                                                                        🖨️ {printer.totalJobsPrinted?.toLocaleString()} jobs
                                                                                    </Text>
                                                                                </Tooltip>
                                                                            </div>
                                                                        )}
                                                                        {/* Show today's / last 24h B&W vs Color breakdown */}
                                                                        {printer.todayStats && (printer.todayStats.totalPages > 0) && (
                                                                            <div style={{ marginTop: 4 }}>
                                                                                {renderPageBreakdown(printer.todayStats.bwPages, printer.todayStats.colorPages)}
                                                                                {/* Show sync status when agent has more data than server */}
                                                                                {printer.todayStats.agentReported > 0 && printer.todayStats.serverSynced < printer.todayStats.agentReported && (
                                                                                    <Tooltip title={`${printer.todayStats.serverSynced} of ${printer.todayStats.agentReported} jobs synced to server`}>
                                                                                        <Text style={{ fontSize: 10, color: '#ff9500' }}>
                                                                                            ⏳ {printer.todayStats.agentReported - printer.todayStats.serverSynced} pending sync
                                                                                        </Text>
                                                                                    </Tooltip>
                                                                                )}
                                                                            </div>
                                                                        )}
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
                            </div>
                        )
                    },
                    {
                        key: 'photocopies',
                        label: <span><PieChartOutlined style={{ marginRight: 6 }} /> Photocopy Tracking</span>,
                        children: <PhotocopyTracker printers={printers} />
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
                                    <div>{selectedJob.pages} pgs × {selectedJob.copies} = <strong>{selectedJob.totalSheets} sheets</strong></div>
                                </div>
                            </Col>
                            <Col span={12}>
                                <div style={{ padding: 16, background: 'rgba(255,255,255,0.03)', borderRadius: 12 }}>
                                    <Text type="secondary">Print Type</Text>
                                    <div>
                                        <Tag color={selectedJob.colorType === 'color' ? 'magenta' : 'default'}>
                                            {selectedJob.colorType === 'color' ? '🎨 Color' : '⬛ B&W'}
                                        </Tag>
                                    </div>
                                </div>
                            </Col>
                            <Col span={12}>
                                <div style={{ padding: 16, background: 'rgba(255,159,67,0.1)', borderRadius: 12 }}>
                                    <Text type="secondary">Paper Type</Text>
                                    <div>{selectedJob.mediaType || 'Plain Paper'}</div>
                                </div>
                            </Col>
                            <Col span={12}>
                                <div style={{ padding: 16, background: 'rgba(255,255,255,0.03)', borderRadius: 12 }}>
                                    <Text type="secondary">Paper Size</Text>
                                    <div>{selectedJob.paperSize || 'A4'}</div>
                                </div>
                            </Col>
                            <Col span={12}>
                                <div style={{ padding: 16, background: 'rgba(255,255,255,0.03)', borderRadius: 12 }}>
                                    <Text type="secondary">Duplex Mode</Text>
                                    <div>{selectedJob.duplexMode || 'Single-sided'}</div>
                                </div>
                            </Col>
                            <Col span={12}>
                                <div style={{ padding: 16, background: 'rgba(255,255,255,0.03)', borderRadius: 12 }}>
                                    <Text type="secondary">Print Quality</Text>
                                    <div>{selectedJob.printQuality || 'Normal'}</div>
                                </div>
                            </Col>
                            <Col span={24}>
                                <div style={{ padding: 16, background: 'rgba(255,255,255,0.03)', borderRadius: 12 }}>
                                    <Text type="secondary">Printer</Text>
                                    <div style={{ fontWeight: 600 }}>
                                        <PrinterOutlined style={{ marginRight: 8, color: '#00d4ff' }} />
                                        {selectedJob.printerName}
                                    </div>
                                </div>
                            </Col>
                        </Row>
                        <div style={{ padding: 16, background: 'rgba(0, 255, 136, 0.1)', borderRadius: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                                <Text type="secondary">Total Cost</Text>
                                {selectedJob.pricePerPage > 0 && (
                                    <div style={{ fontSize: 11, color: '#b0b0c0' }}>
                                        {formatKSH(selectedJob.pricePerPage)}/sheet × {selectedJob.totalSheets} sheets
                                    </div>
                                )}
                            </div>
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
                width={520}
            >
                {selectedPrinter && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                        <div style={{ padding: 16, background: 'rgba(255,255,255,0.03)', borderRadius: 12, textAlign: 'center' }}>
                            <PrinterOutlined style={{ fontSize: 48, color: getPrinterStatusColor(selectedPrinter.status, selectedPrinter.isOnline), marginBottom: 16 }} />
                            <Title level={4} style={{ margin: 0 }}>{selectedPrinter.name}</Title>
                            <Space style={{ marginTop: 8 }}>
                                <Tag color={selectedPrinter.isOnline ? 'success' : 'error'}>
                                    {selectedPrinter.status || 'Unknown'}
                                </Tag>
                                {selectedPrinter.isColor && <Tag color="magenta">Color Capable</Tag>}
                                {selectedPrinter.isDefault && <Tag color="gold">Default Printer</Tag>}
                                {selectedPrinter.isNetwork && <Tag color="cyan">Network</Tag>}
                            </Space>
                        </div>

                        {/* Page Counter Stats */}
                        {(selectedPrinter.totalPagesPrinted > 0 || selectedPrinter.totalJobsPrinted > 0 ||
                            selectedPrinter.todayStats?.totalPages > 0) && (
                                <div style={{ padding: 16, background: 'rgba(0, 212, 255, 0.05)', borderRadius: 12 }}>
                                    <Text strong style={{ marginBottom: 12, display: 'block', color: '#00d4ff' }}>
                                        <BarChartOutlined style={{ marginRight: 8 }} />
                                        Page Statistics
                                    </Text>
                                    <Row gutter={[16, 12]}>
                                        <Col span={12}>
                                            <div style={{ textAlign: 'center', padding: '8px 0' }}>
                                                <div style={{ fontSize: 24, fontWeight: 700, color: '#00d4ff' }}>
                                                    {(selectedPrinter.totalPagesPrinted || 0).toLocaleString()}
                                                </div>
                                                <Text type="secondary" style={{ fontSize: 11 }}>Lifetime Pages</Text>
                                            </div>
                                        </Col>
                                        <Col span={12}>
                                            <div style={{ textAlign: 'center', padding: '8px 0' }}>
                                                <div style={{ fontSize: 24, fontWeight: 700, color: '#b0b0c0' }}>
                                                    {(selectedPrinter.totalJobsPrinted || 0).toLocaleString()}
                                                </div>
                                                <Text type="secondary" style={{ fontSize: 11 }}>Lifetime Jobs</Text>
                                            </div>
                                        </Col>
                                    </Row>
                                    {selectedPrinter.todayStats && selectedPrinter.todayStats.totalPages > 0 && (
                                        <div style={{ marginTop: 12, padding: 12, background: 'rgba(255,255,255,0.03)', borderRadius: 8 }}>
                                            <Text strong style={{ fontSize: 12, marginBottom: 8, display: 'block' }}>Today's Breakdown</Text>
                                            <Row gutter={[8, 8]}>
                                                <Col span={8}>
                                                    <div style={{ textAlign: 'center' }}>
                                                        <div style={{ fontSize: 18, fontWeight: 700, color: '#fff' }}>
                                                            {selectedPrinter.todayStats.totalPages}
                                                        </div>
                                                        <Text type="secondary" style={{ fontSize: 10 }}>Total</Text>
                                                    </div>
                                                </Col>
                                                <Col span={8}>
                                                    <div style={{ textAlign: 'center' }}>
                                                        <div style={{ fontSize: 18, fontWeight: 700, color: '#b0b0c0' }}>
                                                            {selectedPrinter.todayStats.bwPages}
                                                        </div>
                                                        <Text type="secondary" style={{ fontSize: 10 }}>⬛ B&W</Text>
                                                    </div>
                                                </Col>
                                                <Col span={8}>
                                                    <div style={{ textAlign: 'center' }}>
                                                        <div style={{ fontSize: 18, fontWeight: 700, color: '#e040fb' }}>
                                                            {selectedPrinter.todayStats.colorPages}
                                                        </div>
                                                        <Text type="secondary" style={{ fontSize: 10 }}>🎨 Color</Text>
                                                    </div>
                                                </Col>
                                            </Row>
                                            {renderPageBreakdown(selectedPrinter.todayStats.bwPages, selectedPrinter.todayStats.colorPages)}
                                            {/* Show sync status in detail modal */}
                                            {selectedPrinter.todayStats.agentReported > 0 && (
                                                <div style={{ marginTop: 8, display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                                                    <Text type="secondary" style={{ fontSize: 11 }}>
                                                        Server synced: <Text style={{ color: '#00ff88', fontSize: 11 }}>{selectedPrinter.todayStats.serverSynced || 0}</Text> jobs
                                                    </Text>
                                                    <Text type="secondary" style={{ fontSize: 11 }}>
                                                        Agent reported: <Text style={{ color: '#00d4ff', fontSize: 11 }}>{selectedPrinter.todayStats.agentReported}</Text> jobs
                                                    </Text>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                    {selectedPrinter.jobErrors > 0 && (
                                        <div style={{ marginTop: 8 }}>
                                            <Text type="danger" style={{ fontSize: 12 }}>
                                                <ExclamationCircleOutlined style={{ marginRight: 4 }} />
                                                {selectedPrinter.jobErrors} job errors
                                            </Text>
                                        </div>
                                    )}
                                </div>
                            )}

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
                            {selectedPrinter.location && (
                                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: 8 }}>
                                    <Text type="secondary">Location</Text>
                                    <Text>{selectedPrinter.location}</Text>
                                </div>
                            )}
                            {selectedPrinter.averagePagesPerMinute > 0 && (
                                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: 8 }}>
                                    <Text type="secondary">Speed</Text>
                                    <Text>{selectedPrinter.averagePagesPerMinute} ppm</Text>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </Modal>
        </div>
    );
}

export default PrintManager;
