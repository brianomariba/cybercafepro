import { useState, useEffect, useCallback } from 'react';
import { Card, Table, Button, Modal, Form, Input, InputNumber, Switch, Space, Tag, message, Popconfirm, Row, Col, Statistic, Select, Empty, Badge, Tooltip, Typography, Divider, DatePicker, Segmented } from 'antd';
import {
    PlusOutlined, EditOutlined, DeleteOutlined, SettingOutlined,
    ThunderboltOutlined, CheckCircleOutlined, ReloadOutlined,
    SearchOutlined, UserOutlined, CalendarOutlined, DollarOutlined,
    BarChartOutlined, ClockCircleOutlined, FilterOutlined
} from '@ant-design/icons';
import { getTrackableServices, createTrackableService, updateTrackableService, deleteTrackableService, getActivityRecords, deleteActivityRecords } from '../services/api';
import dayjs from 'dayjs';

const { Text, Title } = Typography;
const { Search } = Input;
const { RangePicker } = DatePicker;
const formatKSH = (val) => `KSH ${(val || 0).toLocaleString()}`;

const ICONS = ['📋', '🖨️', '📄', '💰', '🏦', '📊', '🔧', '📱', '💻', '✍️', '📝', '🧾', '📎', '🗂️', '📌', '🎯'];
const COLORS = ['#00B4D8', '#52c41a', '#faad14', '#ff4d4f', '#7B2CBF', '#1890ff', '#eb2f96', '#13c2c2', '#722ed1', '#fa541c'];
const UNITS = [
    { value: 'per_item', label: 'Per Item' },
    { value: 'per_page', label: 'Per Page' },
    { value: 'per_copy', label: 'Per Copy' },
    { value: 'per_hour', label: 'Per Hour' },
    { value: 'flat', label: 'Flat Rate' },
];

export default function ServicesTab() {
    const [services, setServices] = useState([]);
    const [loading, setLoading] = useState(false);
    const [modalVisible, setModalVisible] = useState(false);
    const [editingService, setEditingService] = useState(null);
    const [saving, setSaving] = useState(false);
    const [form] = Form.useForm();

    // Activity records
    const [activityView, setActivityView] = useState('services'); // 'services' or 'records'
    const [records, setRecords] = useState([]);
    const [recordsLoading, setRecordsLoading] = useState(false);
    const [recordsDateFilter, setRecordsDateFilter] = useState(null);
    const [recordsAgentFilter, setRecordsAgentFilter] = useState('all');
    const [recordsSearch, setRecordsSearch] = useState('');

    const fetchServices = useCallback(async () => {
        setLoading(true);
        try { setServices(await getTrackableServices()); } catch { message.error('Failed to load services'); }
        setLoading(false);
    }, []);

    const fetchRecords = useCallback(async () => {
        setRecordsLoading(true);
        try {
            const params = {};
            if (recordsDateFilter) {
                params.startDate = recordsDateFilter[0].format('YYYY-MM-DD');
                params.endDate = recordsDateFilter[1].format('YYYY-MM-DD');
            }
            if (recordsAgentFilter !== 'all') params.agentUser = recordsAgentFilter;
            setRecords(await getActivityRecords(params));
        } catch { setRecords([]); }
        setRecordsLoading(false);
    }, [recordsDateFilter, recordsAgentFilter]);

    useEffect(() => { fetchServices(); fetchRecords(); }, []);
    useEffect(() => { if (activityView === 'records') fetchRecords(); }, [activityView, recordsDateFilter, recordsAgentFilter]);

    const handleSave = async (values) => {
        setSaving(true);
        try {
            if (editingService) {
                await updateTrackableService(editingService._id, values);
                message.success('Service updated');
            } else {
                await createTrackableService(values);
                message.success('Service created');
            }
            setModalVisible(false);
            form.resetFields();
            setEditingService(null);
            fetchServices();
        } catch (e) {
            message.error(e.response?.data?.error || 'Failed to save');
        }
        setSaving(false);
    };

    const handleEdit = (svc) => {
        setEditingService(svc);
        form.setFieldsValue(svc);
        setModalVisible(true);
    };

    const handleDelete = async (id) => {
        try { await deleteTrackableService(id); message.success('Deleted'); fetchServices(); }
        catch { message.error('Failed to delete'); }
    };

    const handleClearRecords = async () => {
        try { await deleteActivityRecords(); message.success('All records cleared'); fetchRecords(); }
        catch { message.error('Failed to clear'); }
    };

    // Filtered records
    const filteredRecords = records.filter(r => {
        if (recordsSearch && !r.serviceName?.toLowerCase().includes(recordsSearch.toLowerCase()) && !r.agentUser?.toLowerCase().includes(recordsSearch.toLowerCase())) return false;
        return true;
    });

    // Summary stats
    const todayStr = dayjs().format('YYYY-MM-DD');
    const todayRecords = records.filter(r => r.date === todayStr);
    const todayRevenue = todayRecords.reduce((s, r) => s + (r.totalAmount || 0), 0);
    const totalRevenue = records.reduce((s, r) => s + (r.totalAmount || 0), 0);
    const uniqueAgents = [...new Set(records.map(r => r.agentUser).filter(Boolean))];

    // Service table columns
    const serviceColumns = [
        {
            title: '', dataIndex: 'icon', width: 40, render: v => <span style={{ fontSize: 20 }}>{v || '📋'}</span>
        },
        {
            title: 'Service Name', dataIndex: 'name', render: (name, r) => (
                <Space direction="vertical" size={0}>
                    <Text strong>{name}</Text>
                    {r.description && <Text type="secondary" style={{ fontSize: 11 }}>{r.description}</Text>}
                </Space>
            )
        },
        {
            title: 'Price', dataIndex: 'price', width: 120, render: (v, r) => (
                <Text strong style={{ color: '#52c41a' }}>{formatKSH(v)} <Text type="secondary" style={{ fontSize: 10 }}>/{(r.unit || 'item').replace('per_', '')}</Text></Text>
            )
        },
        {
            title: 'Shortcut', dataIndex: 'keyboardShortcut', width: 140, render: v => v ? (
                <Tag color="geekblue" style={{ fontFamily: 'monospace', fontWeight: 600 }}>⌨️ {v}</Tag>
            ) : <Text type="secondary" style={{ fontSize: 11 }}>None</Text>
        },
        {
            title: 'Category', dataIndex: 'category', width: 120, render: v => <Tag>{v || 'General'}</Tag>
        },
        {
            title: 'Active', dataIndex: 'isActive', width: 80, render: (v, r) => (
                <Switch size="small" checked={v} onChange={async (checked) => {
                    try { await updateTrackableService(r._id, { isActive: checked }); fetchServices(); }
                    catch { message.error('Failed'); }
                }} />
            )
        },
        {
            title: 'Actions', width: 100, render: (_, r) => (
                <Space>
                    <Tooltip title="Edit"><Button size="small" icon={<EditOutlined />} onClick={() => handleEdit(r)} /></Tooltip>
                    <Popconfirm title="Delete this service?" onConfirm={() => handleDelete(r._id)} okButtonProps={{ danger: true }}>
                        <Tooltip title="Delete"><Button size="small" danger icon={<DeleteOutlined />} /></Tooltip>
                    </Popconfirm>
                </Space>
            )
        }
    ];

    // Records table columns
    const recordColumns = [
        { title: 'Date', dataIndex: 'date', width: 100, render: v => <Tag icon={<CalendarOutlined />}>{v}</Tag> },
        { title: 'Service', dataIndex: 'serviceName', render: v => <Text strong>{v}</Text> },
        { title: 'Qty', dataIndex: 'quantity', width: 60, align: 'center', render: v => <Badge count={v} style={{ backgroundColor: '#00B4D8' }} /> },
        { title: 'Unit Price', dataIndex: 'unitPrice', width: 100, render: v => formatKSH(v) },
        { title: 'Total', dataIndex: 'totalAmount', width: 110, render: v => <Text strong style={{ color: '#52c41a' }}>{formatKSH(v)}</Text> },
        { title: 'Agent', dataIndex: 'agentUser', width: 110, render: v => <Tag icon={<UserOutlined />}>{v}</Tag> },
        { title: 'Station', dataIndex: 'hostname', width: 100, render: v => v || '-' },
        { title: 'Notes', dataIndex: 'notes', ellipsis: true, render: v => v || '-' },
        { title: 'Submitted', dataIndex: 'submittedAt', width: 140, render: v => dayjs(v).format('MMM D, hh:mm A') },
    ];

    return (
        <div>
            {/* Toggle between Services and Records */}
            <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
                <Segmented
                    value={activityView}
                    onChange={setActivityView}
                    options={[
                        { label: <span><SettingOutlined style={{ marginRight: 4 }} />Manage Services</span>, value: 'services' },
                        { label: <span><BarChartOutlined style={{ marginRight: 4 }} />Activity Records <Badge count={todayRecords.length} style={{ marginLeft: 4, backgroundColor: '#52c41a' }} /></span>, value: 'records' },
                    ]}
                    size="large"
                />
                {activityView === 'services' && (
                    <Button type="primary" icon={<PlusOutlined />} onClick={() => { setEditingService(null); form.resetFields(); setModalVisible(true); }}>
                        Add Service
                    </Button>
                )}
            </div>

            {activityView === 'services' ? (
                <>
                    {/* Stats */}
                    <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
                        <Col xs={6}><Card size="small" style={{ background: 'rgba(0,180,216,0.05)', border: '1px solid rgba(0,180,216,0.2)' }}><Statistic title="Total Services" value={services.length} prefix={<SettingOutlined style={{ color: '#00B4D8' }} />} /></Card></Col>
                        <Col xs={6}><Card size="small" style={{ background: 'rgba(82,196,26,0.05)', border: '1px solid rgba(82,196,26,0.2)' }}><Statistic title="Active" value={services.filter(s => s.isActive).length} prefix={<CheckCircleOutlined style={{ color: '#52c41a' }} />} /></Card></Col>
                        <Col xs={6}><Card size="small" style={{ background: 'rgba(114,46,209,0.05)', border: '1px solid rgba(114,46,209,0.2)' }}><Statistic title="With Shortcuts" value={services.filter(s => s.keyboardShortcut).length} prefix={<ThunderboltOutlined style={{ color: '#722ed1' }} />} /></Card></Col>
                        <Col xs={6}><Card size="small" style={{ background: 'rgba(250,173,20,0.05)', border: '1px solid rgba(250,173,20,0.2)' }}><Statistic title="Today's Activity" value={todayRecords.length} prefix={<ClockCircleOutlined style={{ color: '#faad14' }} />} /></Card></Col>
                    </Row>

                    {/* Services Table */}
                    <Card
                        title={<Space><SettingOutlined style={{ color: '#00B4D8' }} /><span>Trackable Services</span></Space>}
                        extra={<Button icon={<ReloadOutlined />} size="small" onClick={fetchServices}>Refresh</Button>}
                    >
                        <Table
                            columns={serviceColumns}
                            dataSource={services}
                            rowKey="_id"
                            loading={loading}
                            pagination={false}
                            locale={{ emptyText: <Empty description="No services defined yet. Add a service to get started!" /> }}
                        />
                    </Card>

                    {/* How it works info */}
                    <Card size="small" style={{ marginTop: 16, background: 'rgba(0,180,216,0.04)', border: '1px solid rgba(0,180,216,0.15)' }}>
                        <Title level={5} style={{ marginBottom: 8 }}>💡 How Agent Activity Tracking Works</Title>
                        <ol style={{ paddingLeft: 20, margin: 0, fontSize: 13, color: 'rgba(255,255,255,0.65)' }}>
                            <li><strong>Define Services</strong> — Add services like "KRA Filing", "Printing", "Copies" with prices and keyboard shortcuts</li>
                            <li><strong>Agent Records</strong> — When an agent presses the shortcut, a popup appears to record the activity (quantity, customer, notes)</li>
                            <li><strong>Daily Summary</strong> — At end of day, agent reviews all recorded activities and submits the batch</li>
                            <li><strong>Admin Review</strong> — View all submissions in the "Activity Records" tab with filtering by date, agent, and service</li>
                        </ol>
                    </Card>
                </>
            ) : (
                <>
                    {/* Activity Records View */}
                    <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
                        <Col xs={6}><Card size="small" style={{ background: 'rgba(82,196,26,0.05)', border: '1px solid rgba(82,196,26,0.2)' }}><Statistic title="Today's Records" value={todayRecords.length} prefix={<ClockCircleOutlined style={{ color: '#52c41a' }} />} /></Card></Col>
                        <Col xs={6}><Card size="small" style={{ background: 'rgba(0,180,216,0.05)', border: '1px solid rgba(0,180,216,0.2)' }}><Statistic title="Today's Revenue" value={todayRevenue} prefix={<DollarOutlined style={{ color: '#00B4D8' }} />} formatter={v => formatKSH(v)} /></Card></Col>
                        <Col xs={6}><Card size="small" style={{ background: 'rgba(114,46,209,0.05)', border: '1px solid rgba(114,46,209,0.2)' }}><Statistic title="Total Revenue" value={totalRevenue} prefix={<DollarOutlined style={{ color: '#722ed1' }} />} formatter={v => formatKSH(v)} /></Card></Col>
                        <Col xs={6}><Card size="small" style={{ background: 'rgba(250,173,20,0.05)', border: '1px solid rgba(250,173,20,0.2)' }}><Statistic title="Active Agents" value={uniqueAgents.length} prefix={<UserOutlined style={{ color: '#faad14' }} />} /></Card></Col>
                    </Row>

                    <Card
                        title={<Space><BarChartOutlined style={{ color: '#00B4D8' }} /><span>Activity Records ({filteredRecords.length})</span></Space>}
                        extra={
                            <Space wrap>
                                <Search placeholder="Search..." style={{ width: 160 }} value={recordsSearch} onChange={e => setRecordsSearch(e.target.value)} allowClear />
                                <RangePicker size="small" value={recordsDateFilter} onChange={setRecordsDateFilter} />
                                <Select value={recordsAgentFilter} onChange={setRecordsAgentFilter} style={{ width: 140 }}
                                    options={[{ value: 'all', label: '👤 All Agents' }, ...uniqueAgents.map(a => ({ value: a, label: a }))]}
                                />
                                <Button icon={<ReloadOutlined />} size="small" onClick={fetchRecords}>Refresh</Button>
                                <Popconfirm title="Clear ALL activity records?" onConfirm={handleClearRecords} okButtonProps={{ danger: true }}>
                                    <Button icon={<DeleteOutlined />} size="small" danger disabled={records.length === 0}>Clear All</Button>
                                </Popconfirm>
                            </Space>
                        }
                    >
                        <Table
                            columns={recordColumns}
                            dataSource={filteredRecords}
                            rowKey="_id"
                            loading={recordsLoading}
                            pagination={{ pageSize: 20, showSizeChanger: true }}
                            scroll={{ x: 1000 }}
                            locale={{ emptyText: <Empty description="No activity records yet" /> }}
                        />
                    </Card>
                </>
            )}

            {/* Add/Edit Service Modal */}
            <Modal
                title={editingService ? '✏️ Edit Service' : '➕ Add Trackable Service'}
                open={modalVisible}
                onCancel={() => { setModalVisible(false); setEditingService(null); form.resetFields(); }}
                onOk={() => form.submit()}
                okText={editingService ? 'Update' : 'Create'}
                confirmLoading={saving}
                width={560}
            >
                <Form form={form} layout="vertical" onFinish={handleSave} initialValues={{ icon: '📋', unit: 'per_item', category: 'General', color: '#00B4D8', isActive: true }}>
                    <Form.Item name="name" label="Service Name" rules={[{ required: true, message: 'Enter service name' }]}>
                        <Input placeholder="e.g. KRA Filing, Photocopies, Scanning" />
                    </Form.Item>
                    <Form.Item name="description" label="Description">
                        <Input.TextArea placeholder="Optional description" rows={2} />
                    </Form.Item>
                    <Row gutter={16}>
                        <Col span={12}>
                            <Form.Item name="price" label="Price (KSH)" rules={[{ required: true, message: 'Enter price' }]}>
                                <InputNumber style={{ width: '100%' }} min={0} placeholder="100" />
                            </Form.Item>
                        </Col>
                        <Col span={12}>
                            <Form.Item name="unit" label="Unit">
                                <Select options={UNITS} />
                            </Form.Item>
                        </Col>
                    </Row>
                    <Row gutter={16}>
                        <Col span={12}>
                            <Form.Item name="keyboardShortcut" label={<Space><ThunderboltOutlined style={{ color: '#722ed1' }} />Keyboard Shortcut</Space>}
                                tooltip="The shortcut agents will press to record this service (e.g. Ctrl+1, F5, Ctrl+Shift+K)"
                            >
                                <Input placeholder="e.g. Ctrl+1, F5, Ctrl+Shift+K" style={{ fontFamily: 'monospace' }} />
                            </Form.Item>
                        </Col>
                        <Col span={12}>
                            <Form.Item name="category" label="Category">
                                <Input placeholder="e.g. Government, Printing" />
                            </Form.Item>
                        </Col>
                    </Row>
                    <Row gutter={16}>
                        <Col span={12}>
                            <Form.Item name="icon" label="Icon">
                                <Select options={ICONS.map(i => ({ value: i, label: <span style={{ fontSize: 18 }}>{i}</span> }))} />
                            </Form.Item>
                        </Col>
                        <Col span={6}>
                            <Form.Item name="color" label="Color">
                                <Select options={COLORS.map(c => ({ value: c, label: <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><div style={{ width: 16, height: 16, borderRadius: 4, background: c }} />{c}</div> }))} />
                            </Form.Item>
                        </Col>
                        <Col span={6}>
                            <Form.Item name="isActive" label="Active" valuePropName="checked">
                                <Switch />
                            </Form.Item>
                        </Col>
                    </Row>

                    {/* Shortcut Preview */}
                    <Card size="small" style={{ background: 'rgba(114,46,209,0.06)', border: '1px solid rgba(114,46,209,0.2)' }}>
                        <Text type="secondary" style={{ fontSize: 12 }}>
                            <ThunderboltOutlined /> <strong>Shortcut Tips:</strong> Use combinations like <code>Ctrl+1</code>, <code>Ctrl+Shift+K</code>, <code>F5</code>, etc.
                            The agent will press this shortcut to quickly open the activity recording popup for this service.
                        </Text>
                    </Card>
                </Form>
            </Modal>
        </div>
    );
}
