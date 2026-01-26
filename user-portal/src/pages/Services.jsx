import { useState, useEffect } from 'react';
import { Row, Col, Card, Tag, Space, Typography, Button, Table, Empty, Spin, message } from 'antd';
import {
    DollarOutlined,
    PrinterOutlined,
    DesktopOutlined,
    ClockCircleOutlined,
    CheckCircleOutlined,
    ScanOutlined,
    CopyOutlined,
    FileTextOutlined,
    InfoCircleOutlined,
    ReloadOutlined,
} from '@ant-design/icons';
import { getServices } from '../services/api';

const { Text, Title } = Typography;

// Format KSH
const formatKSH = (amount) => `KSH ${(amount || 0).toLocaleString()}`;

// Category configuration
const categoryConfig = {
    usage: { label: 'Computer Services', icon: <DesktopOutlined />, color: '#00B4D8' },
    core: { label: 'Computer Services', icon: <DesktopOutlined />, color: '#00B4D8' },
    printing: { label: 'Printing', icon: <PrinterOutlined />, color: '#FFB703' },
    scanning: { label: 'Scanning', icon: <ScanOutlined />, color: '#00C853' },
    photocopy: { label: 'Photocopying', icon: <CopyOutlined />, color: '#FB8500' },
    typing: { label: 'Typing', icon: <FileTextOutlined />, color: '#8B5CF6' },
    document: { label: 'Documents', icon: <FileTextOutlined />, color: '#E91E63' },
    service: { label: 'Services', icon: <CheckCircleOutlined />, color: '#00BCD4' },
    other: { label: 'Other Services', icon: <FileTextOutlined />, color: '#8B5CF6' },
};

// Operating hours
const operatingHours = {
    weekdays: { open: '7:00 AM', close: '10:00 PM' },
    weekends: { open: '9:00 AM', close: '8:00 PM' },
};

function Services({ isDarkMode }) {
    const [services, setServices] = useState([]);
    const [loading, setLoading] = useState(true);
    const [activeCategory, setActiveCategory] = useState('all');

    // Fetch services from API
    const fetchServices = async () => {
        setLoading(true);
        try {
            const data = await getServices();
            setServices(data || []);
        } catch (error) {
            console.error('Failed to fetch services:', error);
            message.error('Failed to load services');
        }
        setLoading(false);
    };

    useEffect(() => {
        fetchServices();
    }, []);

    const enabledServices = services.filter(s => s.isActive !== false);

    // Get unique categories from actual services
    const categories = [...new Set(enabledServices.map(s => s.category))].filter(Boolean);

    const filteredServices = activeCategory === 'all'
        ? enabledServices
        : enabledServices.filter(s => s.category === activeCategory);

    const getCategoryIcon = (category) => {
        return categoryConfig[category]?.icon || <FileTextOutlined />;
    };

    const getCategoryColor = (category) => {
        return categoryConfig[category]?.color || '#8B5CF6';
    };

    const getCategoryLabel = (category) => {
        return categoryConfig[category]?.label || category;
    };

    // Group services by category for display
    const servicesByCategory = categories.reduce((acc, cat) => {
        acc[cat] = enabledServices.filter(s => s.category === cat);
        return acc;
    }, {});

    // Format unit display
    const formatUnit = (unit) => {
        const unitMap = {
            'per_hour': 'per hour',
            'per_page': 'per page',
            'per_copy': 'per copy',
            'flat': 'flat rate',
        };
        return unitMap[unit] || unit;
    };

    return (
        <div>
            {/* Page Header */}
            <div className="page-header">
                <div className="page-title">
                    <DollarOutlined className="icon" />
                    <h1>Services & Pricing</h1>
                </div>
                <p className="page-subtitle">
                    View our available services and current pricing.
                </p>
            </div>

            {/* Quick Stats */}
            <Spin spinning={loading}>
                <div className="stats-row">
                    <div className="stat-card teal">
                        <div className="stat-header">
                            <div className="stat-icon teal">
                                <DesktopOutlined />
                            </div>
                            <Button
                                icon={<ReloadOutlined />}
                                size="small"
                                type="text"
                                onClick={fetchServices}
                                loading={loading}
                            />
                        </div>
                        <div className="stat-value">{enabledServices.length}</div>
                        <div className="stat-label">Services Available</div>
                    </div>

                    <div className="stat-card yellow">
                        <div className="stat-header">
                            <div className="stat-icon yellow">
                                <ClockCircleOutlined />
                            </div>
                        </div>
                        <div className="stat-value">{operatingHours.weekdays.open}</div>
                        <div className="stat-label">Opening Time</div>
                    </div>

                    <div className="stat-card green">
                        <div className="stat-header">
                            <div className="stat-icon green">
                                <ClockCircleOutlined />
                            </div>
                        </div>
                        <div className="stat-value">{operatingHours.weekdays.close}</div>
                        <div className="stat-label">Closing Time</div>
                    </div>

                    <div className="stat-card purple">
                        <div className="stat-header">
                            <div className="stat-icon purple">
                                <CheckCircleOutlined />
                            </div>
                        </div>
                        <div className="stat-value">{categories.length}</div>
                        <div className="stat-label">Categories</div>
                    </div>
                </div>
            </Spin>

            {/* Operating Hours Banner */}
            <Card
                style={{
                    marginBottom: 24,
                    background: 'linear-gradient(135deg, rgba(0, 180, 216, 0.1) 0%, rgba(0, 200, 83, 0.1) 100%)',
                    border: '1px solid rgba(0, 180, 216, 0.2)',
                }}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
                    <div style={{
                        width: 56,
                        height: 56,
                        borderRadius: 12,
                        background: 'rgba(0, 180, 216, 0.2)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                    }}>
                        <ClockCircleOutlined style={{ fontSize: 28, color: '#00B4D8' }} />
                    </div>
                    <div style={{ flex: 1 }}>
                        <Title level={5} style={{ margin: 0, color: isDarkMode ? '#fff' : '#1e293b' }}>
                            🕐 Operating Hours
                        </Title>
                        <Space wrap style={{ marginTop: 8 }}>
                            <Tag color="blue">
                                Mon-Sat: {operatingHours.weekdays.open} - {operatingHours.weekdays.close}
                            </Tag>
                            <Tag color="orange">
                                Sunday: {operatingHours.weekends.open} - {operatingHours.weekends.close}
                            </Tag>
                        </Space>
                    </div>
                </div>
            </Card>

            {/* Category Filter */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 24, flexWrap: 'wrap' }}>
                <Button
                    type={activeCategory === 'all' ? 'primary' : 'default'}
                    onClick={() => setActiveCategory('all')}
                >
                    All Services
                </Button>
                {categories.map(cat => {
                    const config = categoryConfig[cat] || { label: cat, icon: <FileTextOutlined /> };
                    const count = servicesByCategory[cat]?.length || 0;
                    if (count === 0) return null;
                    return (
                        <Button
                            key={cat}
                            type={activeCategory === cat ? 'primary' : 'default'}
                            icon={config.icon}
                            onClick={() => setActiveCategory(cat)}
                        >
                            {config.label} ({count})
                        </Button>
                    );
                })}
            </div>

            {/* Services Grid */}
            {loading ? (
                <Card>
                    <div style={{ textAlign: 'center', padding: 48 }}>
                        <Spin size="large" />
                        <Text type="secondary" style={{ display: 'block', marginTop: 16 }}>Loading services...</Text>
                    </div>
                </Card>
            ) : enabledServices.length === 0 ? (
                <Card>
                    <Empty description="No services available" />
                </Card>
            ) : activeCategory === 'all' ? (
                // Show services grouped by category
                categories.map(cat => {
                    const catServices = servicesByCategory[cat];
                    if (!catServices || catServices.length === 0) return null;
                    const config = categoryConfig[cat] || { label: cat, color: '#8B5CF6', icon: <FileTextOutlined /> };

                    return (
                        <div key={cat} style={{ marginBottom: 32 }}>
                            <Title level={4} style={{ color: isDarkMode ? '#fff' : '#1e293b', marginBottom: 16 }}>
                                <span style={{ color: config.color, marginRight: 8 }}>{config.icon}</span>
                                {config.label}
                            </Title>
                            <Row gutter={[16, 16]}>
                                {catServices.map(service => (
                                    <Col xs={24} sm={12} lg={8} xl={6} key={service.id}>
                                        <Card
                                            hoverable
                                            style={{
                                                height: '100%',
                                                background: `linear-gradient(135deg, ${config.color}10 0%, ${config.color}05 100%)`,
                                                border: `1px solid ${config.color}30`,
                                            }}
                                        >
                                            <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                                                <div style={{
                                                    width: 48,
                                                    height: 48,
                                                    borderRadius: 12,
                                                    background: `${config.color}20`,
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    fontSize: 22,
                                                    color: config.color,
                                                    marginBottom: 12,
                                                }}>
                                                    {getCategoryIcon(service.category)}
                                                </div>
                                                <Text strong style={{ color: isDarkMode ? '#fff' : '#1e293b', fontSize: 16, display: 'block' }}>
                                                    {service.name}
                                                </Text>
                                                {service.description && (
                                                    <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 12 }}>
                                                        {service.description}
                                                    </Text>
                                                )}
                                                <div style={{ marginTop: 'auto' }}>
                                                    <Text style={{
                                                        fontFamily: 'JetBrains Mono',
                                                        color: '#00C853',
                                                        fontWeight: 700,
                                                        fontSize: 20,
                                                        display: 'block'
                                                    }}>
                                                        {formatKSH(service.price)}
                                                    </Text>
                                                    <Text type="secondary" style={{ fontSize: 12 }}>
                                                        {formatUnit(service.unit)}
                                                    </Text>
                                                </div>
                                            </div>
                                        </Card>
                                    </Col>
                                ))}
                            </Row>
                        </div>
                    );
                })
            ) : (
                // Show filtered services
                <Row gutter={[16, 16]}>
                    {filteredServices.length === 0 ? (
                        <Col span={24}>
                            <Empty description="No services found in this category" />
                        </Col>
                    ) : (
                        filteredServices.map(service => {
                            const config = categoryConfig[service.category] || { color: '#8B5CF6' };
                            return (
                                <Col xs={24} sm={12} lg={8} xl={6} key={service.id}>
                                    <Card
                                        hoverable
                                        style={{
                                            height: '100%',
                                            background: `linear-gradient(135deg, ${config.color}10 0%, ${config.color}05 100%)`,
                                            border: `1px solid ${config.color}30`,
                                        }}
                                    >
                                        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                                            <div style={{
                                                width: 48,
                                                height: 48,
                                                borderRadius: 12,
                                                background: `${config.color}20`,
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                fontSize: 22,
                                                color: config.color,
                                                marginBottom: 12,
                                            }}>
                                                {getCategoryIcon(service.category)}
                                            </div>
                                            <Text strong style={{ color: isDarkMode ? '#fff' : '#1e293b', fontSize: 16, display: 'block' }}>
                                                {service.name}
                                            </Text>
                                            {service.description && (
                                                <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 12 }}>
                                                    {service.description}
                                                </Text>
                                            )}
                                            <div style={{ marginTop: 'auto' }}>
                                                <Text style={{
                                                    fontFamily: 'JetBrains Mono',
                                                    color: '#00C853',
                                                    fontWeight: 700,
                                                    fontSize: 20,
                                                    display: 'block'
                                                }}>
                                                    {formatKSH(service.price)}
                                                </Text>
                                                <Text type="secondary" style={{ fontSize: 12 }}>
                                                    {formatUnit(service.unit)}
                                                </Text>
                                            </div>
                                        </div>
                                    </Card>
                                </Col>
                            );
                        })
                    )}
                </Row>
            )}

            {/* Price Table */}
            {enabledServices.length > 0 && (
                <Card
                    title={
                        <Space>
                            <DollarOutlined style={{ color: '#00B4D8' }} />
                            <span>Complete Price List</span>
                        </Space>
                    }
                    style={{ marginTop: 32 }}
                >
                    <Table
                        dataSource={enabledServices}
                        rowKey="id"
                        pagination={false}
                        columns={[
                            {
                                title: 'Service',
                                dataIndex: 'name',
                                key: 'name',
                                render: (name, record) => (
                                    <Space>
                                        <div style={{
                                            width: 32,
                                            height: 32,
                                            borderRadius: 8,
                                            background: `${getCategoryColor(record.category)}20`,
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            color: getCategoryColor(record.category),
                                        }}>
                                            {getCategoryIcon(record.category)}
                                        </div>
                                        <div>
                                            <Text strong style={{ color: isDarkMode ? '#fff' : '#1e293b' }}>{name}</Text>
                                            {record.description && (
                                                <>
                                                    <br />
                                                    <Text type="secondary" style={{ fontSize: 11 }}>{record.description}</Text>
                                                </>
                                            )}
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
                                        {getCategoryLabel(category)}
                                    </Tag>
                                ),
                            },
                            {
                                title: 'Price',
                                dataIndex: 'price',
                                key: 'price',
                                render: (price, record) => (
                                    <div>
                                        <Text style={{
                                            fontFamily: 'JetBrains Mono',
                                            color: '#00C853',
                                            fontWeight: 600,
                                            fontSize: 16
                                        }}>
                                            {formatKSH(price)}
                                        </Text>
                                        <br />
                                        <Text type="secondary" style={{ fontSize: 11 }}>{formatUnit(record.unit)}</Text>
                                    </div>
                                ),
                            },
                        ]}
                    />
                </Card>
            )}

            {/* Info Banner */}
            <Card
                style={{
                    marginTop: 24,
                    background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.1) 0%, rgba(0, 180, 216, 0.1) 100%)',
                    border: '1px solid rgba(139, 92, 246, 0.2)',
                }}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                    <div style={{
                        width: 56,
                        height: 56,
                        borderRadius: 12,
                        background: 'rgba(139, 92, 246, 0.2)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                    }}>
                        <InfoCircleOutlined style={{ fontSize: 28, color: '#8B5CF6' }} />
                    </div>
                    <div style={{ flex: 1 }}>
                        <Title level={5} style={{ margin: 0, color: isDarkMode ? '#fff' : '#1e293b' }}>
                            ℹ️ Need Assistance?
                        </Title>
                        <Text type="secondary">
                            Prices are subject to change. Ask our staff for any ongoing promotions or bulk discounts!
                        </Text>
                    </div>
                </div>
            </Card>
        </div>
    );
}

export default Services;
