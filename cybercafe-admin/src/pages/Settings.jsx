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
    FolderAddOutlined,
    AppstoreOutlined,
    PictureOutlined,
    ExclamationCircleOutlined,
    BarChartOutlined,
    WhatsAppOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { getServices, createService, updateService, deleteService as deleteServiceApi, getComputers, getSettings, saveSettings, changeAdminPassword, getServiceCategories, createServiceCategory, updateServiceCategory, deleteServiceCategory, getPortalAuthSettings, updatePortalAuthSettings, deleteAllPrinterData, deleteAllBrowserData, deleteAllLandingDocumentData, clearAllFinanceData, clearAllReportsData, getWhatsAppReportSettings, saveWhatsAppReportSettings, sendTestWhatsAppReport } from '../services/api';

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
    const [notificationSettings, setNotificationSettings] = useState({
        sessionAlerts: true,
        lowPaperWarning: true,
        lowInkWarning: true,
        paymentNotifications: true,
        newUserRegistration: false,
        dailyReportEmail: false,
    });
    const [computers, setComputers] = useState([]);
    const [loadingServices, setLoadingServices] = useState(false);
    const [savingSettings, setSavingSettings] = useState(false);
    const [passwordForm, setPasswordForm] = useState({ current: '', new: '', confirm: '' });
    const [changingPassword, setChangingPassword] = useState(false);
    const [form] = Form.useForm();

    // Category management states
    const [categories, setCategories] = useState([]);
    const [categoryModalVisible, setCategoryModalVisible] = useState(false);
    const [editingCategory, setEditingCategory] = useState(null);
    const [categoryForm] = Form.useForm();

    // Portal auth settings state
    const [portalAuthSettings, setPortalAuthSettings] = useState({
        otpEnabled: true,
        sessionDurationHours: 24
    });
    const [updatingPortalAuth, setUpdatingPortalAuth] = useState(false);

    // WhatsApp Reports state
    const [whatsappSettings, setWhatsappSettings] = useState({
        enabled: false,
        phone: '',
        apikey: '',
        time: '18:00'
    });
    const [savingWhatsapp, setSavingWhatsapp] = useState(false);
    const [testingWhatsapp, setTestingWhatsapp] = useState(false);

    // Default categories for dropdown
    const defaultCategories = [
        { key: 'printing', name: 'Printing', icon: 'printer', color: '#FFB703' },
        { key: 'scanning', name: 'Scanning', icon: 'scan', color: '#00C853' },
        { key: 'photocopy', name: 'Photocopying', icon: 'copy', color: '#FB8500' },
        { key: 'typing', name: 'Typing', icon: 'edit', color: '#8B5CF6' },
        { key: 'computer', name: 'Computer Usage', icon: 'desktop', color: '#00B4D8' },
        { key: 'documents', name: 'Documents', icon: 'file', color: '#E91E63' },
        { key: 'photography', name: 'Photography', icon: 'camera', color: '#FF6B6B' },
        { key: 'other', name: 'Other', icon: 'folder', color: '#64748B' },
    ];

    // Combine default categories with custom ones
    const allCategories = [...defaultCategories, ...categories.map(c => ({ key: c.key, name: c.name, icon: c.icon, color: c.color }))];


    const loadData = async () => {
        setLoadingServices(true);
        try {
            const [servicesData, computersData, settingsData, categoriesData, portalAuthData, whatsappData] = await Promise.all([
                getServices(),
                getComputers(),
                getSettings().catch(() => ({})),
                getServiceCategories().catch(() => []),
                getPortalAuthSettings().catch(() => ({ otpEnabled: true, sessionDurationHours: 24 })),
                getWhatsAppReportSettings().catch(() => ({ enabled: false, phone: '', apikey: '', time: '18:00' }))
            ]);
            setServices(servicesData || []);
            setComputers(computersData || []);
            setCategories(categoriesData || []);
            setPortalAuthSettings(portalAuthData);
            if (whatsappData) setWhatsappSettings(whatsappData);

            // Load saved settings
            if (settingsData.generalSettings) {
                setGeneralSettings(prev => ({ ...prev, ...settingsData.generalSettings }));
            }
            if (settingsData.notificationSettings) {
                setNotificationSettings(prev => ({ ...prev, ...settingsData.notificationSettings }));
            }
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

    // Save general settings
    const handleSaveGeneralSettings = async () => {
        setSavingSettings(true);
        try {
            await saveSettings({ generalSettings });
            message.success('Settings saved successfully');
        } catch (error) {
            console.error('Save failed', error);
            message.error('Failed to save settings');
        } finally {
            setSavingSettings(false);
        }
    };

    // Save notification settings
    const handleSaveNotificationSettings = async (key, value) => {
        const updated = { ...notificationSettings, [key]: value };
        setNotificationSettings(updated);
        try {
            await saveSettings({ notificationSettings: updated });
        } catch (error) {
            console.error('Failed to save notification setting', error);
        }
    };

    // Change admin password
    const handleChangePassword = async () => {
        if (!passwordForm.current || !passwordForm.new) {
            message.error('Please fill in all password fields');
            return;
        }
        if (passwordForm.new !== passwordForm.confirm) {
            message.error('New passwords do not match');
            return;
        }
        if (passwordForm.new.length < 6) {
            message.error('Password must be at least 6 characters');
            return;
        }

        setChangingPassword(true);
        try {
            await changeAdminPassword(passwordForm.current, passwordForm.new);
            message.success('Password changed successfully');
            setPasswordForm({ current: '', new: '', confirm: '' });
        } catch (error) {
            message.error(error.response?.data?.error || 'Failed to change password');
        } finally {
            setChangingPassword(false);
        }
    };

    // Toggle portal OTP setting
    const handleTogglePortalOtp = async (enabled) => {
        setUpdatingPortalAuth(true);
        try {
            const result = await updatePortalAuthSettings({
                ...portalAuthSettings,
                otpEnabled: enabled
            });
            setPortalAuthSettings(prev => ({ ...prev, otpEnabled: enabled }));
            message.success(result.message || `Portal OTP ${enabled ? 'enabled' : 'disabled'}`);
        } catch (error) {
            message.error(error.response?.data?.error || 'Failed to update portal auth settings');
        } finally {
            setUpdatingPortalAuth(false);
        }
    };

    const handleSaveWhatsappSettings = async () => {
        setSavingWhatsapp(true);
        try {
            await saveWhatsAppReportSettings(whatsappSettings);
            message.success('WhatsApp report settings saved successfully');
        } catch (error) {
            message.error('Failed to save WhatsApp report settings');
        } finally {
            setSavingWhatsapp(false);
        }
    };

    const handleTestWhatsappReport = async () => {
        setTestingWhatsapp(true);
        try {
            await sendTestWhatsAppReport();
            message.success('Test report triggered successfully');
        } catch (error) {
            message.error('Failed to trigger test report');
        } finally {
            setTestingWhatsapp(false);
        }
    };

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

    // Category management handlers
    const handleAddCategory = () => {
        setEditingCategory(null);
        categoryForm.resetFields();
        setCategoryModalVisible(true);
    };

    const handleEditCategory = (category) => {
        setEditingCategory(category);
        categoryForm.setFieldsValue(category);
        setCategoryModalVisible(true);
    };

    const handleSaveCategory = async (values) => {
        try {
            if (editingCategory) {
                await updateServiceCategory(editingCategory.id, { ...editingCategory, ...values });
                message.success('Category updated successfully');
            } else {
                await createServiceCategory(values);
                message.success('Category added successfully');
            }
            setCategoryModalVisible(false);
            categoryForm.resetFields();
            loadData();
        } catch (error) {
            console.error('Failed to save category', error);
            message.error(error.response?.data?.error || 'Failed to save category');
        }
    };

    const handleDeleteCategory = async (category) => {
        try {
            await deleteServiceCategory(category.id);
            message.success('Category deleted');
            loadData();
        } catch (error) {
            console.error('Failed to delete category', error);
            message.error('Failed to delete category');
        }
    };

    // Delete all printer data
    const [cleaningPrinterData, setCleaningPrinterData] = useState(false);
    const handleDeleteAllPrinterData = async () => {
        setCleaningPrinterData(true);
        try {
            const result = await deleteAllPrinterData();
            message.success(
                `Printer data cleared: ${result.deleted?.printJobs || 0} print jobs and ${result.deleted?.printers || 0} printer records deleted`
            );
        } catch (err) {
            message.error(err.response?.data?.error || 'Failed to delete printer data');
        } finally {
            setCleaningPrinterData(false);
        }
    };

    // Delete all browser data
    const [cleaningBrowserData, setCleaningBrowserData] = useState(false);
    const handleDeleteAllBrowserData = async () => {
        setCleaningBrowserData(true);
        try {
            const result = await deleteAllBrowserData();
            message.success(
                `Browser data cleared: ${result.deleted?.browserLogs || 0} records deleted`
            );
        } catch (err) {
            message.error(err.response?.data?.error || 'Failed to delete browser data');
        } finally {
            setCleaningBrowserData(false);
        }
    };

    // Delete all finance data
    const [cleaningFinanceData, setCleaningFinanceData] = useState(false);
    const handleDeleteAllFinanceData = async () => {
        setCleaningFinanceData(true);
        try {
            const result = await clearAllFinanceData();
            message.success(
                `Finance data cleared: ${result.deleted?.transactions || 0} transactions and ${result.deleted?.sessionBillingLogs || 0} billing logs deleted`
            );
        } catch (err) {
            message.error(err.response?.data?.error || 'Failed to delete finance data');
        } finally {
            setCleaningFinanceData(false);
        }
    };

    // Delete all reports data
    const [cleaningReportsData, setCleaningReportsData] = useState(false);
    const handleDeleteAllReportsData = async () => {
        setCleaningReportsData(true);
        try {
            const result = await clearAllReportsData();
            const d = result.deleted || {};
            message.success(
                `Reports data cleared: ${d.activityLogs || 0} activity, ${d.sessionLogs || 0} session, ${d.fileActivity || 0} file, ${d.usbEvents || 0} USB logs deleted`
            );
        } catch (err) {
            message.error(err.response?.data?.error || 'Failed to delete reports data');
        } finally {
            setCleaningReportsData(false);
        }
    };

    // Delete all landing page and document data
    const [cleaningLandingData, setCleaningLandingData] = useState(false);
    const handleDeleteAllLandingDocumentData = async () => {
        setCleaningLandingData(true);
        try {
            const result = await deleteAllLandingDocumentData();
            const d = result.deleted || {};
            message.success(
                `Landing & Document data cleared: ${d.requests || 0} requests, ${d.documents || 0} documents deleted`
            );
        } catch (err) {
            message.error(err.response?.data?.error || 'Failed to delete landing and document data');
        } finally {
            setCleaningLandingData(false);
        }
    };

    const getCategoryColor = (category) => {
        const cat = allCategories.find(c => c.key === category);
        if (cat) return cat.color;
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
                                    <Button
                                        type="primary"
                                        icon={<SaveOutlined />}
                                        onClick={handleSaveGeneralSettings}
                                        loading={savingSettings}
                                    >
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
                            <Switch
                                checked={notificationSettings.sessionAlerts}
                                onChange={(val) => handleSaveNotificationSettings('sessionAlerts', val)}
                            />
                        </div>
                        <div className="settings-item">
                            <div className="settings-label">
                                <strong>Low Paper Warning</strong>
                                <span>Alert when printer paper is running low</span>
                            </div>
                            <Switch
                                checked={notificationSettings.lowPaperWarning}
                                onChange={(val) => handleSaveNotificationSettings('lowPaperWarning', val)}
                            />
                        </div>
                        <div className="settings-item">
                            <div className="settings-label">
                                <strong>Low Ink Warning</strong>
                                <span>Alert when printer ink/toner is running low</span>
                            </div>
                            <Switch
                                checked={notificationSettings.lowInkWarning}
                                onChange={(val) => handleSaveNotificationSettings('lowInkWarning', val)}
                            />
                        </div>
                        <div className="settings-item">
                            <div className="settings-label">
                                <strong>Payment Notifications</strong>
                                <span>Sound alert for completed payments</span>
                            </div>
                            <Switch
                                checked={notificationSettings.paymentNotifications}
                                onChange={(val) => handleSaveNotificationSettings('paymentNotifications', val)}
                            />
                        </div>
                        <div className="settings-item">
                            <div className="settings-label">
                                <strong>New User Registration</strong>
                                <span>Notify when new users register</span>
                            </div>
                            <Switch
                                checked={notificationSettings.newUserRegistration}
                                onChange={(val) => handleSaveNotificationSettings('newUserRegistration', val)}
                            />
                        </div>
                        <div className="settings-item">
                            <div className="settings-label">
                                <strong>Daily Report Email</strong>
                                <span>Send daily summary to admin email</span>
                            </div>
                            <Switch
                                checked={notificationSettings.dailyReportEmail}
                                onChange={(val) => handleSaveNotificationSettings('dailyReportEmail', val)}
                            />
                        </div>
                    </div>
                </Card>
            ),
        },
        {
            key: 'whatsapp',
            label: (
                <Space>
                    <WhatsAppOutlined style={{ color: '#25D366' }} />
                    <span>WhatsApp Reports</span>
                </Space>
            ),
            children: (
                <Row gutter={24}>
                    <Col xs={24} lg={16}>
                        <Card
                            title={
                                <Space>
                                    <WhatsAppOutlined style={{ color: '#25D366' }} />
                                    <span>CallMeBot WhatsApp Integration</span>
                                </Space>
                            }
                        >
                            <div style={{
                                padding: '16px 24px',
                                background: 'rgba(37, 211, 102, 0.05)',
                                border: '1px solid rgba(37, 211, 102, 0.2)',
                                borderRadius: 12,
                                marginBottom: 24
                            }}>
                                <Title level={5} style={{ color: '#25D366', marginTop: 0 }}>Automated Daily Performance Reports</Title>
                                <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
                                    Receive automated daily summaries of your business performance directly to your WhatsApp. The report includes online computer status, sales revenue, printing & photocopy data, and session statistics.
                                </Text>
                                <Text type="secondary" style={{ fontSize: 13 }}>
                                    <strong>How to get your API Key:</strong><br/>
                                    1. Add the phone number <strong>+34 693 05 47 43</strong> to your Phone Contacts. (Name it it as CallMeBot)<br/>
                                    2. Send the following message "I allow callmebot to send me messages" to the new Contact created (using WhatsApp).<br/>
                                    3. Wait until you receive the message "API Activated for your phone number. Your APIKEY is 123123".
                                </Text>
                            </div>

                            <Form layout="vertical">
                                <Row gutter={16}>
                                    <Col span={24}>
                                        <div className="settings-item" style={{
                                            padding: '16px',
                                            borderRadius: '12px',
                                            border: '1px solid #303030',
                                            marginBottom: '24px'
                                        }}>
                                            <div className="settings-label">
                                                <strong>Enable Automated Reports</strong>
                                                <span>Send daily summary reports at the configured time</span>
                                            </div>
                                            <Switch
                                                checked={whatsappSettings.enabled}
                                                onChange={(val) => setWhatsappSettings(s => ({ ...s, enabled: val }))}
                                            />
                                        </div>
                                    </Col>
                                </Row>

                                <Row gutter={16}>
                                    <Col xs={24} sm={12}>
                                        <Form.Item label="WhatsApp Phone Number">
                                            <Input 
                                                placeholder="e.g. 254794436994" 
                                                value={whatsappSettings.phone}
                                                onChange={(e) => setWhatsappSettings(s => ({ ...s, phone: e.target.value }))}
                                                prefix={<WhatsAppOutlined />}
                                                disabled={!whatsappSettings.enabled}
                                            />
                                        </Form.Item>
                                    </Col>
                                    <Col xs={24} sm={12}>
                                        <Form.Item label="CallMeBot API Key">
                                            <Input 
                                                placeholder="e.g. 4956433" 
                                                value={whatsappSettings.apikey}
                                                onChange={(e) => setWhatsappSettings(s => ({ ...s, apikey: e.target.value }))}
                                                disabled={!whatsappSettings.enabled}
                                            />
                                        </Form.Item>
                                    </Col>
                                </Row>

                                <Row gutter={16}>
                                    <Col xs={24} sm={12}>
                                        <Form.Item label="Daily Report Time">
                                            <TimePicker
                                                format="HH:mm"
                                                value={dayjs(whatsappSettings.time, 'HH:mm')}
                                                onChange={(time) => setWhatsappSettings(s => ({ ...s, time: time?.format('HH:mm') || '18:00' }))}
                                                style={{ width: '100%' }}
                                                disabled={!whatsappSettings.enabled}
                                            />
                                        </Form.Item>
                                    </Col>
                                </Row>

                                <Divider />

                                <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                                    <Button
                                        onClick={handleTestWhatsappReport}
                                        loading={testingWhatsapp}
                                        disabled={!whatsappSettings.phone || !whatsappSettings.apikey}
                                    >
                                        Send Test Report Now
                                    </Button>
                                    <Button
                                        type="primary"
                                        style={{ background: '#25D366', borderColor: '#25D366' }}
                                        icon={<SaveOutlined />}
                                        onClick={handleSaveWhatsappSettings}
                                        loading={savingWhatsapp}
                                    >
                                        Save WhatsApp Settings
                                    </Button>
                                </Space>
                            </Form>
                        </Card>
                    </Col>
                </Row>
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
                                    <Input.Password
                                        placeholder="Enter current password"
                                        value={passwordForm.current}
                                        onChange={(e) => setPasswordForm(p => ({ ...p, current: e.target.value }))}
                                    />
                                </Form.Item>
                                <Form.Item label="New Password">
                                    <Input.Password
                                        placeholder="Enter new password"
                                        value={passwordForm.new}
                                        onChange={(e) => setPasswordForm(p => ({ ...p, new: e.target.value }))}
                                    />
                                </Form.Item>
                                <Form.Item label="Confirm New Password">
                                    <Input.Password
                                        placeholder="Confirm new password"
                                        value={passwordForm.confirm}
                                        onChange={(e) => setPasswordForm(p => ({ ...p, confirm: e.target.value }))}
                                    />
                                </Form.Item>
                                <Form.Item>
                                    <Button
                                        type="primary"
                                        danger
                                        icon={<LockOutlined />}
                                        onClick={handleChangePassword}
                                        loading={changingPassword}
                                    >
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
                                <div className="settings-item" style={{
                                    background: 'rgba(0, 180, 216, 0.1)',
                                    padding: '16px',
                                    borderRadius: '12px',
                                    border: '1px solid rgba(0, 180, 216, 0.3)',
                                    marginBottom: '16px'
                                }}>
                                    <div className="settings-label">
                                        <strong style={{ color: '#00B4D8' }}>🔐 Portal Login OTP</strong>
                                        <span>Require email verification code for user portal login</span>
                                    </div>
                                    <Switch
                                        checked={portalAuthSettings.otpEnabled}
                                        onChange={handleTogglePortalOtp}
                                        loading={updatingPortalAuth}
                                        checkedChildren="ON"
                                        unCheckedChildren="OFF"
                                    />
                                </div>
                                <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 16 }}>
                                    {portalAuthSettings.otpEnabled
                                        ? '✅ Users must verify with email OTP to access the portal'
                                        : '⚠️ OTP is disabled - users can log in with password only'
                                    }
                                </Text>
                                <Divider style={{ margin: '16px 0' }} />
                                <div className="settings-item">
                                    <div className="settings-label">
                                        <strong>Two-Factor Authentication (Admin)</strong>
                                        <span>Add an extra layer of security for admin</span>
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
        {
            key: 'data',
            label: (
                <Space>
                    <ClearOutlined />
                    <span>Data Management</span>
                </Space>
            ),
            children: (
                <Row gutter={24}>
                    <Col xs={24} lg={12}>
                        <Card
                            title={
                                <Space>
                                    <PrinterOutlined style={{ color: '#ff3b5c' }} />
                                    <span>Printer Data Cleanup</span>
                                </Space>
                            }
                        >
                            <div style={{
                                padding: 24,
                                background: 'rgba(255, 59, 92, 0.06)',
                                border: '1px solid rgba(255, 59, 92, 0.15)',
                                borderRadius: 12,
                                marginBottom: 16
                            }}>
                                <Space direction="vertical" size={12} style={{ width: '100%' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                        <ExclamationCircleOutlined style={{ color: '#ff3b5c', fontSize: 18 }} />
                                        <Text strong>Delete All Printer Data</Text>
                                    </div>
                                    <Text type="secondary" style={{ fontSize: 13 }}>
                                        This will permanently remove all print job records and printer discovery logs
                                        from every computer in the system. This includes:
                                    </Text>
                                    <ul style={{ margin: '4px 0', paddingLeft: 20, color: 'rgba(255,255,255,0.65)' }}>
                                        <li>All print job history (B&W and color)</li>
                                        <li>Printer discovery and status records</li>
                                        <li>Page count statistics</li>
                                    </ul>
                                    <Text type="secondary" style={{ fontSize: 12 }}>
                                        ⚠️ This action cannot be undone. New printer data will be collected
                                        automatically when agents report activity.
                                    </Text>
                                    <Divider style={{ margin: '8px 0' }} />
                                    <Popconfirm
                                        title="Delete all printer data?"
                                        description="This will permanently remove ALL print jobs and printer records from every computer. This cannot be undone."
                                        onConfirm={handleDeleteAllPrinterData}
                                        okText="Yes, Delete All"
                                        cancelText="Cancel"
                                        okButtonProps={{ danger: true }}
                                        icon={<ExclamationCircleOutlined style={{ color: '#ff3b5c' }} />}
                                    >
                                        <Button
                                            danger
                                            type="primary"
                                            icon={<DeleteOutlined />}
                                            loading={cleaningPrinterData}
                                            block
                                        >
                                            Delete All Printer Data
                                        </Button>
                                    </Popconfirm>
                                </Space>
                            </div>
                        </Card>
                    </Col>

                    <Col xs={24} lg={12}>
                        <Card
                            title={
                                <Space>
                                    <GlobalOutlined style={{ color: '#ff3b5c' }} />
                                    <span>Browser Data Cleanup</span>
                                </Space>
                            }
                        >
                            <div style={{
                                padding: 24,
                                background: 'rgba(255, 59, 92, 0.06)',
                                border: '1px solid rgba(255, 59, 92, 0.15)',
                                borderRadius: 12,
                                marginBottom: 16
                            }}>
                                <Space direction="vertical" size={12} style={{ width: '100%' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                        <ExclamationCircleOutlined style={{ color: '#ff3b5c', fontSize: 18 }} />
                                        <Text strong>Delete All Browser Data</Text>
                                    </div>
                                    <Text type="secondary" style={{ fontSize: 13 }}>
                                        This will permanently remove all browser history records
                                        from every computer in the system. This includes:
                                    </Text>
                                    <ul style={{ margin: '4px 0', paddingLeft: 20, color: 'rgba(255,255,255,0.65)' }}>
                                        <li>All browsing history URLs and titles</li>
                                        <li>Time spent tracking data per URL</li>
                                        <li>Category and source metadata</li>
                                    </ul>
                                    <Text type="secondary" style={{ fontSize: 12 }}>
                                        ⚠️ This action cannot be undone. New browser data will be collected
                                        automatically when agents report activity.
                                    </Text>
                                    <Divider style={{ margin: '8px 0' }} />
                                    <Popconfirm
                                        title="Delete all browser data?"
                                        description="This will permanently remove ALL browser history from every computer. This cannot be undone."
                                        onConfirm={handleDeleteAllBrowserData}
                                        okText="Yes, Delete All"
                                        cancelText="Cancel"
                                        okButtonProps={{ danger: true }}
                                        icon={<ExclamationCircleOutlined style={{ color: '#ff3b5c' }} />}
                                    >
                                        <Button
                                            danger
                                            type="primary"
                                            icon={<DeleteOutlined />}
                                            loading={cleaningBrowserData}
                                            block
                                        >
                                            Delete All Browser Data
                                        </Button>
                                    </Popconfirm>
                                </Space>
                            </div>
                        </Card>
                    </Col>

                    <Col xs={24} lg={12}>
                        <Card
                            title={
                                <Space>
                                    <DollarOutlined style={{ color: '#ff3b5c' }} />
                                    <span>Finance Data Cleanup</span>
                                </Space>
                            }
                        >
                            <div style={{
                                padding: 24,
                                background: 'rgba(255, 59, 92, 0.06)',
                                border: '1px solid rgba(255, 59, 92, 0.15)',
                                borderRadius: 12,
                                marginBottom: 16
                            }}>
                                <Space direction="vertical" size={12} style={{ width: '100%' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                        <ExclamationCircleOutlined style={{ color: '#ff3b5c', fontSize: 18 }} />
                                        <Text strong>Delete All Finance Data</Text>
                                    </div>
                                    <Text type="secondary" style={{ fontSize: 13 }}>
                                        This will permanently remove all financial records
                                        from the system. This includes:
                                    </Text>
                                    <ul style={{ margin: '4px 0', paddingLeft: 20, color: 'rgba(255,255,255,0.65)' }}>
                                        <li>All transaction records (sessions, tasks, inventory sales)</li>
                                        <li>Session billing and revenue logs</li>
                                        <li>Revenue summaries and history</li>
                                    </ul>
                                    <Text type="secondary" style={{ fontSize: 12 }}>
                                        ⚠️ This action cannot be undone. The finance dashboard will reset to
                                        zero and new transactions will be recorded automatically going forward.
                                    </Text>
                                    <Divider style={{ margin: '8px 0' }} />
                                    <Popconfirm
                                        title="Delete all finance data?"
                                        description="This will permanently remove ALL transactions, revenue records, and billing history. This cannot be undone."
                                        onConfirm={handleDeleteAllFinanceData}
                                        okText="Yes, Delete All"
                                        cancelText="Cancel"
                                        okButtonProps={{ danger: true }}
                                        icon={<ExclamationCircleOutlined style={{ color: '#ff3b5c' }} />}
                                    >
                                        <Button
                                            danger
                                            type="primary"
                                            icon={<DeleteOutlined />}
                                            loading={cleaningFinanceData}
                                            block
                                        >
                                            Delete All Finance Data
                                        </Button>
                                    </Popconfirm>
                                </Space>
                            </div>
                        </Card>
                    </Col>

                    <Col xs={24} lg={12}>
                        <Card
                            title={
                                <Space>
                                    <BarChartOutlined style={{ color: '#ff3b5c' }} />
                                    <span>Reports Data Cleanup</span>
                                </Space>
                            }
                        >
                            <div style={{
                                padding: 24,
                                background: 'rgba(255, 59, 92, 0.06)',
                                border: '1px solid rgba(255, 59, 92, 0.15)',
                                borderRadius: 12,
                                marginBottom: 16
                            }}>
                                <Space direction="vertical" size={12} style={{ width: '100%' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                        <ExclamationCircleOutlined style={{ color: '#ff3b5c', fontSize: 18 }} />
                                        <Text strong>Delete All Reports Data</Text>
                                    </div>
                                    <Text type="secondary" style={{ fontSize: 13 }}>
                                        This will permanently remove all monitoring and reporting
                                        records from the system. This includes:
                                    </Text>
                                    <ul style={{ margin: '4px 0', paddingLeft: 20, color: 'rgba(255,255,255,0.65)' }}>
                                        <li>Activity logs (logins, actions, system events)</li>
                                        <li>Session tracking logs</li>
                                        <li>File activity records (access, transfers)</li>
                                        <li>USB device event logs</li>
                                    </ul>
                                    <Text type="secondary" style={{ fontSize: 12 }}>
                                        ⚠️ This action cannot be undone. New activity will be
                                        recorded automatically as agents report.
                                    </Text>
                                    <Divider style={{ margin: '8px 0' }} />
                                    <Popconfirm
                                        title="Delete all reports data?"
                                        description="This will permanently remove ALL activity, session, file, and USB logs. This cannot be undone."
                                        onConfirm={handleDeleteAllReportsData}
                                        okText="Yes, Delete All"
                                        cancelText="Cancel"
                                        okButtonProps={{ danger: true }}
                                        icon={<ExclamationCircleOutlined style={{ color: '#ff3b5c' }} />}
                                    >
                                        <Button
                                            danger
                                            type="primary"
                                            icon={<DeleteOutlined />}
                                            loading={cleaningReportsData}
                                            block
                                        >
                                            Delete All Reports Data
                                        </Button>
                                    </Popconfirm>
                                </Space>
                            </div>
                        </Card>
                    </Col>

                    <Col xs={24} lg={12}>
                        <Card
                            title={
                                <Space>
                                    <FileTextOutlined style={{ color: '#ff3b5c' }} />
                                    <span>Landing & Document Data Cleanup</span>
                                </Space>
                            }
                        >
                            <div style={{
                                padding: 24,
                                background: 'rgba(255, 59, 92, 0.06)',
                                border: '1px solid rgba(255, 59, 92, 0.15)',
                                borderRadius: 12,
                                marginBottom: 16
                            }}>
                                <Space direction="vertical" size={12} style={{ width: '100%' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                        <ExclamationCircleOutlined style={{ color: '#ff3b5c', fontSize: 18 }} />
                                        <Text strong>Delete Landing & Document Data</Text>
                                    </div>
                                    <Text type="secondary" style={{ fontSize: 13 }}>
                                        This will permanently remove all document requests from the landing page and all shared document data.
                                    </Text>
                                    <ul style={{ margin: '4px 0', paddingLeft: 20, color: 'rgba(255,255,255,0.65)' }}>
                                        <li>Remote printing and task document requests via landing page</li>
                                        <li>Shared documents in the admin dashboard</li>
                                    </ul>
                                    <Text type="secondary" style={{ fontSize: 12 }}>
                                        ⚠️ This action cannot be undone.
                                    </Text>
                                    <Divider style={{ margin: '8px 0' }} />
                                    <Popconfirm
                                        title="Delete landing & document data?"
                                        description="This will permanently remove ALL landing page document requests and shared documents. This cannot be undone."
                                        onConfirm={handleDeleteAllLandingDocumentData}
                                        okText="Yes, Delete All"
                                        cancelText="Cancel"
                                        okButtonProps={{ danger: true }}
                                        icon={<ExclamationCircleOutlined style={{ color: '#ff3b5c' }} />}
                                    >
                                        <Button
                                            danger
                                            type="primary"
                                            icon={<DeleteOutlined />}
                                            loading={cleaningLandingData}
                                            block
                                        >
                                            Delete Landing & Document Data
                                        </Button>
                                    </Popconfirm>
                                </Space>
                            </div>
                        </Card>
                    </Col>
                </Row>
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
                                    placeholder="Select category"
                                    showSearch
                                    optionFilterProp="label"
                                    dropdownRender={(menu) => (
                                        <>
                                            {menu}
                                            <Divider style={{ margin: '8px 0' }} />
                                            <Button
                                                type="link"
                                                icon={<FolderAddOutlined />}
                                                onClick={handleAddCategory}
                                                style={{ width: '100%', textAlign: 'left' }}
                                            >
                                                Add Custom Category
                                            </Button>
                                        </>
                                    )}
                                    options={allCategories.map(c => ({
                                        value: c.key,
                                        label: c.name,
                                    }))}
                                />
                            </Form.Item>
                        </Col>
                        <Col span={12}>
                            <Form.Item
                                name="subcategory"
                                label="Subcategory / Type"
                            >
                                <Select
                                    placeholder="e.g., A4, Photo Paper, Glossy"
                                    mode="tags"
                                    maxCount={1}
                                    allowClear
                                    options={[
                                        { value: 'a4', label: 'A4 Paper' },
                                        { value: 'a3', label: 'A3 Paper' },
                                        { value: 'photopaper', label: 'Photo Paper' },
                                        { value: 'glossy', label: 'Glossy Paper' },
                                        { value: 'matte', label: 'Matte Paper' },
                                        { value: 'passport', label: 'Passport Size' },
                                        { value: 'document', label: 'Document' },
                                        { value: 'color', label: 'Color' },
                                        { value: 'blackwhite', label: 'Black & White' },
                                    ]}
                                />
                            </Form.Item>
                        </Col>
                    </Row>

                    <Row gutter={16}>
                        <Col span={12}>
                            <Form.Item
                                name="unit"
                                label="Price Type / Unit"
                                rules={[{ required: true }]}
                            >
                                <Select
                                    options={[
                                        { value: 'per_hour', label: 'Per Hour' },
                                        { value: 'per_page', label: 'Per Page' },
                                        { value: 'per_copy', label: 'Per Copy' },
                                        { value: 'flat', label: 'Fixed Price' },
                                    ]}
                                />
                            </Form.Item>
                        </Col>
                        <Col span={12}>
                            <Form.Item
                                name="color"
                                label="Accent Color"
                            >
                                <Input type="color" style={{ width: 80, height: 32 }} />
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
                                name="displayOrder"
                                label="Display Order"
                            >
                                <InputNumber
                                    min={0}
                                    style={{ width: '100%' }}
                                    placeholder="0 = default order"
                                />
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

            {/* Add/Edit Category Modal */}
            <Modal
                title={
                    <Space>
                        {editingCategory ? <EditOutlined style={{ color: '#00d4ff' }} /> : <FolderAddOutlined style={{ color: '#00ff88' }} />}
                        <span>{editingCategory ? 'Edit Category' : 'Add Custom Category'}</span>
                    </Space>
                }
                open={categoryModalVisible}
                onCancel={() => {
                    setCategoryModalVisible(false);
                    categoryForm.resetFields();
                }}
                footer={null}
                width={450}
            >
                <Form
                    form={categoryForm}
                    layout="vertical"
                    onFinish={handleSaveCategory}
                >
                    <Form.Item
                        name="name"
                        label="Category Name"
                        rules={[{ required: true, message: 'Please enter category name' }]}
                    >
                        <Input placeholder="e.g., Photo Paper, ID Printing" />
                    </Form.Item>

                    <Form.Item
                        name="key"
                        label="Category Key (optional)"
                        extra="Auto-generated from name if not provided"
                    >
                        <Input placeholder="e.g., photopaper, id-printing" />
                    </Form.Item>

                    <Row gutter={16}>
                        <Col span={12}>
                            <Form.Item
                                name="icon"
                                label="Icon"
                            >
                                <Select
                                    placeholder="Select icon"
                                    options={[
                                        { value: 'printer', label: '🖨️ Printer' },
                                        { value: 'picture', label: '🖼️ Picture' },
                                        { value: 'camera', label: '📷 Camera' },
                                        { value: 'file', label: '📄 File' },
                                        { value: 'folder', label: '📁 Folder' },
                                        { value: 'desktop', label: '🖥️ Desktop' },
                                        { value: 'scan', label: '📠 Scanner' },
                                        { value: 'copy', label: '📋 Copy' },
                                        { value: 'edit', label: '✏️ Edit' },
                                        { value: 'id', label: '🪪 ID Card' },
                                        { value: 'star', label: '⭐ Star' },
                                    ]}
                                />
                            </Form.Item>
                        </Col>
                        <Col span={12}>
                            <Form.Item
                                name="color"
                                label="Category Color"
                            >
                                <Input type="color" style={{ width: 80, height: 32 }} defaultValue="#00B4D8" />
                            </Form.Item>
                        </Col>
                    </Row>

                    <Form.Item
                        name="parentCategory"
                        label="Parent Category (optional)"
                        extra="For nested categories under an existing one"
                    >
                        <Select
                            allowClear
                            placeholder="Select parent category"
                            options={allCategories.map(c => ({ value: c.key, label: c.name }))}
                        />
                    </Form.Item>

                    <Form.Item
                        name="description"
                        label="Description"
                    >
                        <Input.TextArea placeholder="Brief description" rows={2} />
                    </Form.Item>

                    <Form.Item>
                        <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
                            <Button onClick={() => {
                                setCategoryModalVisible(false);
                                categoryForm.resetFields();
                            }}>
                                Cancel
                            </Button>
                            <Button type="primary" htmlType="submit" icon={<SaveOutlined />}>
                                {editingCategory ? 'Update Category' : 'Add Category'}
                            </Button>
                        </Space>
                    </Form.Item>
                </Form>
            </Modal>
        </div>
    );
}

export default Settings;
