import { useEffect, useState } from 'react';
import { Card, Form, Input, Select, Switch, Button, Space, Typography, Divider, InputNumber, Table, Tag, Modal, Popconfirm, message, Tabs, ColorPicker, TimePicker, Row, Col, Slider, Upload, Empty, Badge } from 'antd';
import {
    SettingOutlined,
    DollarOutlined,
    PrinterOutlined,
    DesktopOutlined,
    ClockCircleOutlined,
    WifiOutlined,
    BellOutlined,
    SafetyOutlined,
    PlusOutlined,
    EditOutlined,
    DeleteOutlined,
    SaveOutlined,
    ThunderboltOutlined,
    GlobalOutlined,
    MailOutlined,
    LockOutlined,
    UserOutlined,
    CopyOutlined,
    ScanOutlined,
    FileTextOutlined,
    CameraOutlined,
    DatabaseOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { getServices, createService, updateService, deleteService as deleteServiceApi, getComputers } from '../services/api';

const { Text, Title } = Typography;

// Format KSH
const formatKSH = (amount) => `KSH ${(amount || 0).toLocaleString()}`;

function Settings() {
    const [services, setServices] = useState([]);
    const [editingService, setEditingService] = useState(null);
    const [serviceModalVisible, setServiceModalVisible] = useState(false);
    const [generalSettings, setGeneralSettings] = useState({
        cafeName: 'CyberCafe Pro',
        currency: 'KES',
        timezone: 'Africa/Nairobi',
        openingTime: '08:00',
        closingTime: '22:00',
        autoLogoutMinutes: 5,
        sessionWarningMinutes: 10,
    });
    const [computers, setComputers] = useState([]);
    const [loadingServices, setLoadingServices] = useState(false);
    const [form] = Form.useForm();

    const loadData = async () => {
        setLoadingServices(true);
        try {
            const [servicesData, computersData] = await Promise.all([
                getServices(),
                getComputers()
            ]);
            setServices(servicesData || []);
            setComputers(computersData || []);
        } catch (error) {
            console.error('Failed to load data', error);
            message.error('Failed to load settings data');
        } finally {
            setLoadingServices(false);
        }
    };

    useEffect(() => {
        loadData();
    }, []);

    const handleAddService = () => {
        setEditingService(null);
        form.resetFields();
        setServiceModalVisible(true);
    };

    const handleEditService = (service) => {
        setEditingService(service);
        form.setFieldsValue(service);
        setServiceModalVisible(true);
    };

    const handleSaveService = async (values) => {
        try {
            if (editingService) {
                await updateService(editingService.id, { ...editingService, ...values });
                message.success('Service updated successfully');
            } else {
                await createService(values);
                message.success('Service added successfully');
            }
            setServiceModalVisible(false);
            form.resetFields();
            loadData();
        } catch (error) {
            console.error('Failed to save service', error);
            message.error('Failed to save service');
        }
    };

    const handleDeleteService = async (service) => {
        try {
            await deleteServiceApi(service.id);
            message.success('Service deleted successfully');
            loadData();
        } catch (error) {
            console.error('Failed to delete service', error);
            message.error('Failed to delete service');
        }
    };

    const handleToggleService = async (service, enabled) => {
        try {
            await updateService(service.id, { ...service, isActive: enabled });
            message.success(`${service.name} ${enabled ? 'enabled' : 'disabled'}`);
            loadData();
        } catch (error) {
            console.error('Failed to update service status', error);
            message.error('Failed to update service status');
        }
    };

    const getCategoryColor = (category) => {
        switch (category) {
            case 'core': return '#00d4ff';
            case 'printing': return '#7b2cbf';
            case 'scanning': return '#00ff88';
            case 'photocopy': return '#ff9500';
            default: return '#6b6b80';
        }
    };

    const getCategoryIcon = (category) => {
        switch (category) {
            case 'core': return <DesktopOutlined />;
            case 'printing': return <PrinterOutlined />;
            case 'scanning': return <ScanOutlined />;
            case 'photocopy': return <CopyOutlined />;
            default: return <FileTextOutlined />;
        }
    };

    const serviceColumns = [
        {
            title: 'Service',
            dataIndex: 'name',
            key: 'name',
            render: (name, record) => (
                <Space>
                    <div style={{
                        width: 36,
                        height: 36,
                        borderRadius: 8,
                        background: `${getCategoryColor(record.category)}15`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: getCategoryColor(record.category)
                    }}>
                        {getCategoryIcon(record.category)}
                    </div>
                    <div>
                        <Text strong style={{ color: record.enabled ? '#fff' : '#6b6b80' }}>{name}</Text>
                        <br />
                        <Text type="secondary" style={{ fontSize: 12 }}>{record.description}</Text>
                    </div>
                </Space>
            ),
        },
        {
            title: 'Category',
            dataIndex: 'category',
            key: 'category',
            render: (category) => (
                <Tag color={getCategoryColor(category)} style={{ textTransform: 'capitalize' }}>
                    {category}
                </Tag>
            ),
        },
        {
            title: 'Price',
            dataIndex: 'price',
            key: 'price',
            render: (price, record) => (
                <div>
                    <Text style={{ fontFamily: 'JetBrains Mono', color: '#00ff88', fontWeight: 600, fontSize: 16 }}>
                        {formatKSH(price)}
                    </Text>
                    <br />
                    <Text type="secondary" style={{ fontSize: 11 }}>{record.unit}</Text>
                </div>
            ),
        },
        {
            title: 'Status',
            dataIndex: 'enabled',
            key: 'enabled',
            render: (enabled, record) => (
                <Switch
                    checked={record.isActive !== false}
                    onChange={(checked) => handleToggleService(record, checked)}
                    checkedChildren="ON"
                    unCheckedChildren="OFF"
                />
            ),
        },
        {
            title: 'Actions',
            key: 'actions',
            render: (_, record) => (
                <Space>
                    <Button
                        type="text"
                        icon={<EditOutlined style={{ color: '#00d4ff' }} />}
                        onClick={() => handleEditService(record)}
                    />
                    <Popconfirm
                        title="Delete this service?"
                        description="This action cannot be undone"
                        onConfirm={() => handleDeleteService(record)}
                    >
                        <Button type="text" icon={<DeleteOutlined style={{ color: '#ff3b5c' }} />} />
                    </Popconfirm>
                </Space>
            ),
        },
    ];

    const tabItems = [
        {
            key: 'services',
            label: (
                <Space>
                    <DollarOutlined />
                    <span>Services & Pricing</span>
                </Space>
            ),
            children: (
                <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
                        <div>
                            <Title level={4} style={{ margin: 0 }}>Service Management</Title>
                            <Text type="secondary">Add, edit, or remove services and set their prices</Text>
                        </div>
                        <Button type="primary" icon={<PlusOutlined />} onClick={handleAddService}>
                            Add Service
                        </Button>
                    </div>

                    {/* Service Categories Summary */}
                    <Row gutter={16} style={{ marginBottom: 24 }}>
                        {['core', 'printing', 'scanning', 'photocopy', 'other'].map(category => {
                            const categoryServices = services.filter(s => s.category === category);
                            const enabledCount = categoryServices.filter(s => s.enabled).length;
                            return (
                                <Col key={category} xs={12} md={4}>
                                    <div style={{
                                        padding: 16,
                                        background: `${getCategoryColor(category)}10`,
                                        border: `1px solid ${getCategoryColor(category)}30`,
                                        borderRadius: 12,
                                        textAlign: 'center'
                                    }}>
                                        <div style={{ fontSize: 20, color: getCategoryColor(category), marginBottom: 8 }}>
                                            {getCategoryIcon(category)}
                                        </div>
                                        <Text style={{ textTransform: 'capitalize', display: 'block' }}>{category}</Text>
                                        <Text type="secondary" style={{ fontSize: 12 }}>{enabledCount}/{categoryServices.length} active</Text>
                                    </div>
                                </Col>
                            );
                        })}
                    </Row>

                    <Card loading={loadingServices}>
                        <Table
                            columns={serviceColumns}
                            dataSource={services}
                            rowKey="id"
                            pagination={false}
                        />
                    </Card>
                </div>
            ),
        },
        {
            key: 'general',
            label: (
                <Space>
                    <SettingOutlined />
                    <span>General Settings</span>
                </Space>
            ),
            children: (
                <Row gutter={24}>
                    <Col xs={24} lg={12}>
                        <Card
                            title={
                                <Space>
                                    <ThunderboltOutlined style={{ color: '#00d4ff' }} />
                                    <span>Business Information</span>
                                </Space>
                            }
                        >
                            <Form layout="vertical">
                                <Form.Item label="Cafe Name">
                                    <Input
                                        value={generalSettings.cafeName}
                                        onChange={(e) => setGeneralSettings(prev => ({ ...prev, cafeName: e.target.value }))}
                                        prefix={<ThunderboltOutlined />}
                                    />
                                </Form.Item>
                                <Form.Item label="Currency">
                                    <Select
                                        value={generalSettings.currency}
                                        onChange={(value) => setGeneralSettings(prev => ({ ...prev, currency: value }))}
                                        options={[
                                            { value: 'USD', label: '$ USD - US Dollar' },
                                            { value: 'EUR', label: '€ EUR - Euro' },
                                            { value: 'GBP', label: '£ GBP - British Pound' },
                                            { value: 'KES', label: 'KES - Kenyan Shilling' },
                                        ]}
                                    />
                                </Form.Item>
                                <Form.Item label="Timezone">
                                    <Select
                                        value={generalSettings.timezone}
                                        onChange={(value) => setGeneralSettings(prev => ({ ...prev, timezone: value }))}
                                        options={[
                                            { value: 'America/New_York', label: 'Eastern Time (ET)' },
                                            { value: 'America/Chicago', label: 'Central Time (CT)' },
                                            { value: 'America/Los_Angeles', label: 'Pacific Time (PT)' },
                                            { value: 'Africa/Nairobi', label: 'East Africa Time (EAT)' },
                                            { value: 'Europe/London', label: 'Greenwich Mean Time (GMT)' },
                                        ]}
                                    />
                                </Form.Item>
                                <Form.Item>
                                    <Button type="primary" icon={<SaveOutlined />}>
                                        Save Changes
                                    </Button>
                                </Form.Item>
                            </Form>
                        </Card>
                    </Col>

                    <Col xs={24} lg={12}>
                        <Card
                            title={
                                <Space>
                                    <ClockCircleOutlined style={{ color: '#ff9500' }} />
                                    <span>Operating Hours</span>
                                </Space>
                            }
                        >
                            <Form layout="vertical">
                                <Row gutter={16}>
                                    <Col span={12}>
                                        <Form.Item label="Opening Time">
                                            <TimePicker
                                                format="HH:mm"
                                                value={dayjs(generalSettings.openingTime, 'HH:mm')}
                                                onChange={(time) => setGeneralSettings(prev => ({ ...prev, openingTime: time?.format('HH:mm') }))}
                                                style={{ width: '100%' }}
                                            />
                                        </Form.Item>
                                    </Col>
                                    <Col span={12}>
                                        <Form.Item label="Closing Time">
                                            <TimePicker
                                                format="HH:mm"
                                                value={dayjs(generalSettings.closingTime, 'HH:mm')}
                                                onChange={(time) => setGeneralSettings(prev => ({ ...prev, closingTime: time?.format('HH:mm') }))}
                                                style={{ width: '100%' }}
                                            />
                                        </Form.Item>
                                    </Col>
                                </Row>
                                <Form.Item label="Auto-logout after inactivity (minutes)">
                                    <Slider
                                        value={generalSettings.autoLogoutMinutes}
                                        onChange={(value) => setGeneralSettings(prev => ({ ...prev, autoLogoutMinutes: value }))}
                                        min={1}
                                        max={30}
                                        marks={{ 1: '1m', 5: '5m', 10: '10m', 15: '15m', 30: '30m' }}
                                    />
                                </Form.Item>
                                <Form.Item label="Session expiry warning (minutes before)">
                                    <InputNumber
                                        value={generalSettings.sessionWarningMinutes}
                                        onChange={(value) => setGeneralSettings(prev => ({ ...prev, sessionWarningMinutes: value }))}
                                        min={1}
                                        max={30}
                                        style={{ width: '100%' }}
                                    />
                                </Form.Item>
                            </Form>
                        </Card>
                    </Col>
                </Row>
            ),
        },
        {
            key: 'computers',
            label: (
                <Space>
                    <DesktopOutlined />
                    <span>Computers</span>
                </Space>
            ),
            children: (
                <Card
                    title={
                        <Space>
                            <DesktopOutlined style={{ color: '#00d4ff' }} />
                            <span>Computer Configuration</span>
                        </Space>
                    }
                    extra={<Button type="primary" icon={<PlusOutlined />}>Add Computer</Button>}
                >
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 16 }}>
                        {computers.length === 0 ? (
                            <Empty description="No computers registered. They appear here automatically when the Desktop Agent connects." />
                        ) : (
                            computers.map(pc => (
                                <div
                                    key={pc.clientId}
                                    style={{
                                        padding: 20,
                                        background: 'rgba(255,255,255,0.03)',
                                        border: '1px solid rgba(255,255,255,0.08)',
                                        borderRadius: 12,
                                        textAlign: 'center'
                                    }}
                                >
                                    <DesktopOutlined style={{ fontSize: 32, color: pc.isOnline ? '#00ff88' : '#00d4ff', marginBottom: 12 }} />
                                    <Text strong style={{ display: 'block' }}>{pc.hostname || 'Unknown PC'}</Text>
                                    <Text type="secondary" style={{ fontSize: 12 }}>{pc.ip || 'N/A'}</Text>
                                    <div style={{ marginTop: 12 }}>
                                        <Badge status={pc.isOnline ? 'success' : 'default'} text={pc.isOnline ? 'Online' : 'Offline'} />
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </Card>
            ),
        },
        {
            key: 'notifications',
            label: (
                <Space>
                    <BellOutlined />
                    <span>Notifications</span>
                </Space>
            ),
            children: (
                <Card
                    title={
                        <Space>
                            <BellOutlined style={{ color: '#7b2cbf' }} />
                            <span>Notification Settings</span>
                        </Space>
                    }
                >
                    <div className="settings-section" style={{ marginBottom: 24 }}>
                        <div className="settings-item">
                            <div className="settings-label">
                                <strong>Session Alerts</strong>
                                <span>Notify when sessions are about to expire</span>
                            </div>
                            <Switch defaultChecked />
                        </div>
                        <div className="settings-item">
                            <div className="settings-label">
                                <strong>Low Paper Warning</strong>
                                <span>Alert when printer paper is running low</span>
                            </div>
                            <Switch defaultChecked />
                        </div>
                        <div className="settings-item">
                            <div className="settings-label">
                                <strong>Low Ink Warning</strong>
                                <span>Alert when printer ink/toner is running low</span>
                            </div>
                            <Switch defaultChecked />
                        </div>
                        <div className="settings-item">
                            <div className="settings-label">
                                <strong>Payment Notifications</strong>
                                <span>Sound alert for completed payments</span>
                            </div>
                            <Switch defaultChecked />
                        </div>
                        <div className="settings-item">
                            <div className="settings-label">
                                <strong>New User Registration</strong>
                                <span>Notify when new users register</span>
                            </div>
                            <Switch />
                        </div>
                        <div className="settings-item">
                            <div className="settings-label">
                                <strong>Daily Report Email</strong>
                                <span>Send daily summary to admin email</span>
                            </div>
                            <Switch />
                        </div>
                    </div>
                </Card>
            ),
        },
        {
            key: 'security',
            label: (
                <Space>
                    <SafetyOutlined />
                    <span>Security</span>
                </Space>
            ),
            children: (
                <Row gutter={24}>
                    <Col xs={24} lg={12}>
                        <Card
                            title={
                                <Space>
                                    <LockOutlined style={{ color: '#ff3b5c' }} />
                                    <span>Password Settings</span>
                                </Space>
                            }
                        >
                            <Form layout="vertical">
                                <Form.Item label="Current Password">
                                    <Input.Password placeholder="Enter current password" />
                                </Form.Item>
                                <Form.Item label="New Password">
                                    <Input.Password placeholder="Enter new password" />
                                </Form.Item>
                                <Form.Item label="Confirm New Password">
                                    <Input.Password placeholder="Confirm new password" />
                                </Form.Item>
                                <Form.Item>
                                    <Button type="primary" danger icon={<LockOutlined />}>
                                        Change Password
                                    </Button>
                                </Form.Item>
                            </Form>
                        </Card>
                    </Col>

                    <Col xs={24} lg={12}>
                        <Card
                            title={
                                <Space>
                                    <SafetyOutlined style={{ color: '#00ff88' }} />
                                    <span>Security Options</span>
                                </Space>
                            }
                        >
                            <div className="settings-section">
                                <div className="settings-item">
                                    <div className="settings-label">
                                        <strong>Two-Factor Authentication</strong>
                                        <span>Add an extra layer of security</span>
                                    </div>
                                    <Switch />
                                </div>
                                <div className="settings-item">
                                    <div className="settings-label">
                                        <strong>Session Timeout</strong>
                                        <span>Auto logout after 30 minutes of inactivity</span>
                                    </div>
                                    <Switch defaultChecked />
                                </div>
                                <div className="settings-item">
                                    <div className="settings-label">
                                        <strong>Login Notifications</strong>
                                        <span>Email alert on new login</span>
                                    </div>
                                    <Switch defaultChecked />
                                </div>
                                <div className="settings-item">
                                    <div className="settings-label">
                                        <strong>IP Whitelist</strong>
                                        <span>Only allow access from trusted IPs</span>
                                    </div>
                                    <Switch />
                                </div>
                            </div>
                        </Card>
                    </Col>
                </Row>
            ),
        },
        {
            key: 'backup',
            label: (
                <Space>
                    <DatabaseOutlined />
                    <span>Backup</span>
                </Space>
            ),
            children: (
                <Card
                    title={
                        <Space>
                            <DatabaseOutlined style={{ color: '#00d4ff' }} />
                            <span>Data Backup & Restore</span>
                        </Space>
                    }
                >
                    <Row gutter={24}>
                        <Col xs={24} md={12}>
                            <div style={{ padding: 24, background: 'rgba(0, 212, 255, 0.1)', borderRadius: 16, textAlign: 'center' }}>
                                <DatabaseOutlined style={{ fontSize: 48, color: '#00d4ff', marginBottom: 16 }} />
                                <Title level={4}>Create Backup</Title>
                                <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
                                    Export all data including users, transactions, and settings
                                </Text>
                                <Button type="primary" icon={<DatabaseOutlined />}>
                                    Create Backup Now
                                </Button>
                                <div style={{ marginTop: 16 }}>
                                    <Text type="secondary" style={{ fontSize: 12 }}>Last backup: December 12, 2024 at 11:30 PM</Text>
                                </div>
                            </div>
                        </Col>
                        <Col xs={24} md={12}>
                            <div style={{ padding: 24, background: 'rgba(123, 44, 191, 0.1)', borderRadius: 16, textAlign: 'center' }}>
                                <Upload.Dragger style={{ background: 'transparent', border: 'none' }}>
                                    <DatabaseOutlined style={{ fontSize: 48, color: '#7b2cbf', marginBottom: 16 }} />
                                    <Title level={4}>Restore Backup</Title>
                                    <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
                                        Click or drag backup file here to restore
                                    </Text>
                                </Upload.Dragger>
                            </div>
                        </Col>
                    </Row>
                </Card>
            ),
        },
    ];

    return (
        <div>
            {/* Page Header */}
            <div className="page-header">
                <div className="page-title">
                    <SettingOutlined className="icon" />
                    <h1>Settings</h1>
                </div>
                <p className="page-subtitle">Configure services, pricing, and system preferences</p>
            </div>

            <Tabs items={tabItems} size="large" />

            {/* Add/Edit Service Modal */}
            <Modal
                title={
                    <Space>
                        {editingService ? <EditOutlined style={{ color: '#00d4ff' }} /> : <PlusOutlined style={{ color: '#00ff88' }} />}
                        <span>{editingService ? 'Edit Service' : 'Add New Service'}</span>
                    </Space>
                }
                open={serviceModalVisible}
                onCancel={() => {
                    setServiceModalVisible(false);
                    form.resetFields();
                }}
                footer={null}
                width={500}
            >
                <Form
                    form={form}
                    layout="vertical"
                    onFinish={handleSaveService}
                >
                    <Form.Item
                        name="name"
                        label="Service Name"
                        rules={[{ required: true, message: 'Please enter service name' }]}
                    >
                        <Input placeholder="e.g., Color Printing" />
                    </Form.Item>

                    <Form.Item
                        name="description"
                        label="Description"
                    >
                        <Input.TextArea placeholder="Brief description of the service" rows={2} />
                    </Form.Item>

                    <Row gutter={16}>
                        <Col span={12}>
                            <Form.Item
                                name="category"
                                label="Category"
                                rules={[{ required: true }]}
                            >
                                <Select
                                    options={[
                                        { value: 'core', label: 'Core (Computer Usage)' },
                                        { value: 'printing', label: 'Printing' },
                                        { value: 'scanning', label: 'Scanning' },
                                        { value: 'photocopy', label: 'Photocopy' },
                                        { value: 'other', label: 'Other' },
                                    ]}
                                />
                            </Form.Item>
                        </Col>
                        <Col span={12}>
                            <Form.Item
                                name="priceType"
                                label="Price Type"
                                rules={[{ required: true }]}
                            >
                                <Select
                                    options={[
                                        { value: 'hourly', label: 'Per Hour' },
                                        { value: 'per_page', label: 'Per Page' },
                                        { value: 'per_copy', label: 'Per Copy' },
                                        { value: 'fixed', label: 'Fixed Price' },
                                    ]}
                                />
                            </Form.Item>
                        </Col>
                    </Row>

                    <Row gutter={16}>
                        <Col span={12}>
                            <Form.Item
                                name="price"
                                label="Price (KSH)"
                                rules={[{ required: true, message: 'Please enter price' }]}
                            >
                                <InputNumber
                                    prefix="KSH"
                                    min={0}
                                    step={10}
                                    style={{ width: '100%' }}
                                    placeholder="0"
                                />
                            </Form.Item>
                        </Col>
                        <Col span={12}>
                            <Form.Item
                                name="unit"
                                label="Unit Label"
                                rules={[{ required: true }]}
                            >
                                <Input placeholder="e.g., per page" />
                            </Form.Item>
                        </Col>
                    </Row>

                    <Form.Item>
                        <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
                            <Button onClick={() => {
                                setServiceModalVisible(false);
                                form.resetFields();
                            }}>
                                Cancel
                            </Button>
                            <Button type="primary" htmlType="submit" icon={<SaveOutlined />}>
                                {editingService ? 'Update Service' : 'Add Service'}
                            </Button>
                        </Space>
                    </Form.Item>
                </Form>
            </Modal>
        </div>
    );
}

export default Settings;
