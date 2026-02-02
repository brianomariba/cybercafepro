import { useState, useEffect, useMemo } from 'react';
import { Row, Col, Card, Tag, Space, Typography, Button, Input, Empty, Spin, message, Badge, Tooltip } from 'antd';
import {
    DollarOutlined,
    PrinterOutlined,
    DesktopOutlined,
    ClockCircleOutlined,
    CheckCircleOutlined,
    ScanOutlined,
    CopyOutlined,
    FileTextOutlined,
    SearchOutlined,
    PictureOutlined,
    FileWordOutlined,
    FilePdfOutlined,
    IdcardOutlined,
    CameraOutlined,
    WifiOutlined,
    CustomerServiceOutlined,
    EditOutlined,
    BookOutlined,
    RightOutlined,
    LeftOutlined,
    HomeOutlined,
    AppstoreOutlined,
    FolderOutlined,
    StarOutlined,
    ThunderboltOutlined,
} from '@ant-design/icons';
import { getServices } from '../services/api';

const { Text, Title } = Typography;

// Icon mapping for categories
const iconMap = {
    'printer': <PrinterOutlined />,
    'desktop': <DesktopOutlined />,
    'scan': <ScanOutlined />,
    'copy': <CopyOutlined />,
    'file': <FileTextOutlined />,
    'picture': <PictureOutlined />,
    'photo': <CameraOutlined />,
    'wifi': <WifiOutlined />,
    'support': <CustomerServiceOutlined />,
    'edit': <EditOutlined />,
    'book': <BookOutlined />,
    'folder': <FolderOutlined />,
    'document': <FileWordOutlined />,
    'pdf': <FilePdfOutlined />,
    'id': <IdcardOutlined />,
    'star': <StarOutlined />,
    'flash': <ThunderboltOutlined />,
    'check': <CheckCircleOutlined />,
    'default': <AppstoreOutlined />,
};

// Default category configuration with icons and colors
const defaultCategories = {
    printing: { name: 'Printing', icon: 'printer', color: '#FFB703', subcategories: ['a4', 'a3', 'photopaper', 'glossy'] },
    scanning: { name: 'Scanning', icon: 'scan', color: '#00C853' },
    photocopy: { name: 'Photocopying', icon: 'copy', color: '#FB8500' },
    typing: { name: 'Typing', icon: 'edit', color: '#8B5CF6' },
    computer: { name: 'Computer Usage', icon: 'desktop', color: '#00B4D8' },
    internet: { name: 'Internet', icon: 'wifi', color: '#0077B6' },
    documents: { name: 'Documents', icon: 'document', color: '#E91E63' },
    photography: { name: 'Photography', icon: 'photo', color: '#FF6B6B' },
    other: { name: 'Other Services', icon: 'folder', color: '#64748B' },
};

// Format KSH
const formatKSH = (amount) => `KSH ${(amount || 0).toLocaleString()}`;

function Services({ isDarkMode }) {
    const [services, setServices] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedCategory, setSelectedCategory] = useState(null);
    const [selectedSubcategory, setSelectedSubcategory] = useState(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [searchFocused, setSearchFocused] = useState(false);

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

    useEffect(() => { fetchServices(); }, []);

    const enabledServices = useMemo(() =>
        services.filter(s => s.isActive !== false),
        [services]
    );

    // Build category structure from services
    const categoryStructure = useMemo(() => {
        const structure = {};

        enabledServices.forEach(service => {
            const cat = service.category?.toLowerCase() || 'other';
            const subcat = service.subcategory?.toLowerCase();

            if (!structure[cat]) {
                const defaultCat = defaultCategories[cat] || defaultCategories.other;
                structure[cat] = {
                    key: cat,
                    name: defaultCat.name,
                    icon: defaultCat.icon,
                    color: service.color || defaultCat.color,
                    services: [],
                    subcategories: {}
                };
            }

            if (subcat) {
                if (!structure[cat].subcategories[subcat]) {
                    structure[cat].subcategories[subcat] = {
                        key: subcat,
                        name: subcat.charAt(0).toUpperCase() + subcat.slice(1).replace(/-/g, ' '),
                        services: []
                    };
                }
                structure[cat].subcategories[subcat].services.push(service);
            } else {
                structure[cat].services.push(service);
            }
        });

        return structure;
    }, [enabledServices]);

    const categories = Object.values(categoryStructure);

    // Get icon component
    const getIcon = (iconName) => iconMap[iconName] || iconMap.default;

    // Search results
    const searchResults = useMemo(() => {
        if (!searchQuery.trim()) return [];
        const query = searchQuery.toLowerCase();
        return enabledServices.filter(s =>
            s.name.toLowerCase().includes(query) ||
            s.description?.toLowerCase().includes(query) ||
            s.category?.toLowerCase().includes(query) ||
            s.subcategory?.toLowerCase().includes(query)
        );
    }, [searchQuery, enabledServices]);

    // Get current view services
    const currentServices = useMemo(() => {
        if (searchQuery.trim()) return searchResults;
        if (!selectedCategory) return [];

        const cat = categoryStructure[selectedCategory];
        if (!cat) return [];

        if (selectedSubcategory && cat.subcategories[selectedSubcategory]) {
            return cat.subcategories[selectedSubcategory].services;
        }

        // Return all services in category if no subcategory selected
        const allServices = [...cat.services];
        Object.values(cat.subcategories).forEach(sub => {
            allServices.push(...sub.services);
        });
        return allServices;
    }, [selectedCategory, selectedSubcategory, categoryStructure, searchQuery, searchResults]);

    // Format unit display
    const formatUnit = (unit) => {
        const unitMap = {
            'per_hour': '/hour',
            'per_page': '/page',
            'per_copy': '/copy',
            'flat': 'flat rate',
        };
        return unitMap[unit] || unit;
    };

    // Handle category click
    const handleCategoryClick = (catKey) => {
        setSelectedCategory(catKey);
        setSelectedSubcategory(null);
        setSearchQuery('');
    };

    // Handle back navigation
    const handleBack = () => {
        if (selectedSubcategory) {
            setSelectedSubcategory(null);
        } else {
            setSelectedCategory(null);
        }
    };

    // Current category info
    const currentCategory = selectedCategory ? categoryStructure[selectedCategory] : null;

    return (
        <div className="kali-services">
            {/* Header */}
            <div className="page-header">
                <div className="page-title">
                    <DollarOutlined className="icon" />
                    <h1>Services & Pricing</h1>
                </div>
                <p className="page-subtitle">
                    Browse our services and pricing. Click a category to explore.
                </p>
            </div>

            {/* Search Bar */}
            <div style={{ marginBottom: 24 }}>
                <Input
                    size="large"
                    prefix={<SearchOutlined style={{ color: searchFocused ? '#00B4D8' : undefined }} />}
                    placeholder="Search services..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onFocus={() => setSearchFocused(true)}
                    onBlur={() => setSearchFocused(false)}
                    style={{
                        borderRadius: 12,
                        background: isDarkMode ? 'rgba(30, 41, 59, 0.8)' : 'rgba(255, 255, 255, 0.9)',
                        border: searchFocused ? '2px solid #00B4D8' : '1px solid rgba(0,0,0,0.1)',
                    }}
                    allowClear
                />
            </div>

            <Spin spinning={loading}>
                {/* Search Results or Category View */}
                {searchQuery.trim() ? (
                    // Search Results View
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
                            <Button
                                icon={<LeftOutlined />}
                                onClick={() => setSearchQuery('')}
                                type="text"
                            />
                            <Title level={4} style={{ margin: 0, color: isDarkMode ? '#fff' : '#1e293b' }}>
                                Search Results ({searchResults.length})
                            </Title>
                        </div>

                        {searchResults.length === 0 ? (
                            <Empty description="No services found for your search" />
                        ) : (
                            <Row gutter={[16, 16]}>
                                {searchResults.map(service => (
                                    <Col xs={24} sm={12} lg={8} xl={6} key={service.id}>
                                        <ServiceCard service={service} isDarkMode={isDarkMode} formatKSH={formatKSH} formatUnit={formatUnit} getIcon={getIcon} />
                                    </Col>
                                ))}
                            </Row>
                        )}
                    </div>
                ) : !selectedCategory ? (
                    // Category Grid View (Kali-style)
                    <div>
                        <Title level={4} style={{ marginBottom: 20, color: isDarkMode ? '#fff' : '#1e293b' }}>
                            <AppstoreOutlined style={{ marginRight: 8, color: '#00B4D8' }} />
                            Select a Category
                        </Title>

                        {categories.length === 0 ? (
                            <Empty description="No services available" />
                        ) : (
                            <Row gutter={[20, 20]}>
                                {categories.map(cat => {
                                    const serviceCount = cat.services.length +
                                        Object.values(cat.subcategories).reduce((acc, sub) => acc + sub.services.length, 0);
                                    const subcatCount = Object.keys(cat.subcategories).length;

                                    return (
                                        <Col xs={12} sm={8} md={6} lg={4} key={cat.key}>
                                            <Card
                                                hoverable
                                                className="category-card"
                                                onClick={() => handleCategoryClick(cat.key)}
                                                style={{
                                                    background: `linear-gradient(145deg, ${cat.color}15 0%, ${cat.color}08 100%)`,
                                                    border: `1px solid ${cat.color}40`,
                                                    borderRadius: 16,
                                                    transition: 'all 0.3s ease',
                                                    cursor: 'pointer',
                                                }}
                                                bodyStyle={{ padding: 20, textAlign: 'center' }}
                                            >
                                                <div style={{
                                                    width: 64,
                                                    height: 64,
                                                    borderRadius: 16,
                                                    background: `${cat.color}25`,
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    fontSize: 28,
                                                    color: cat.color,
                                                    margin: '0 auto 12px',
                                                    transition: 'transform 0.3s ease',
                                                }}>
                                                    {getIcon(cat.icon)}
                                                </div>
                                                <Text strong style={{
                                                    display: 'block',
                                                    color: isDarkMode ? '#fff' : '#1e293b',
                                                    fontSize: 14,
                                                    marginBottom: 4
                                                }}>
                                                    {cat.name}
                                                </Text>
                                                <Space size={4}>
                                                    <Badge
                                                        count={serviceCount}
                                                        style={{ backgroundColor: cat.color }}
                                                        overflowCount={99}
                                                    />
                                                    {subcatCount > 0 && (
                                                        <Tag color="default" style={{ fontSize: 10 }}>
                                                            {subcatCount} types
                                                        </Tag>
                                                    )}
                                                </Space>
                                            </Card>
                                        </Col>
                                    );
                                })}
                            </Row>
                        )}
                    </div>
                ) : (
                    // Category Detail View
                    <div>
                        {/* Breadcrumb Navigation */}
                        <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8,
                            marginBottom: 20,
                            padding: '12px 16px',
                            background: isDarkMode ? 'rgba(30, 41, 59, 0.6)' : 'rgba(255, 255, 255, 0.8)',
                            borderRadius: 12,
                        }}>
                            <Button
                                icon={<HomeOutlined />}
                                onClick={() => { setSelectedCategory(null); setSelectedSubcategory(null); }}
                                type="text"
                            />
                            <RightOutlined style={{ fontSize: 10, color: '#94a3b8' }} />
                            <Button
                                type="text"
                                onClick={() => setSelectedSubcategory(null)}
                                style={{
                                    color: currentCategory?.color,
                                    fontWeight: !selectedSubcategory ? 600 : 400
                                }}
                            >
                                {getIcon(currentCategory?.icon)} {currentCategory?.name}
                            </Button>
                            {selectedSubcategory && (
                                <>
                                    <RightOutlined style={{ fontSize: 10, color: '#94a3b8' }} />
                                    <Text strong style={{ color: isDarkMode ? '#fff' : '#1e293b' }}>
                                        {selectedSubcategory.charAt(0).toUpperCase() + selectedSubcategory.slice(1).replace(/-/g, ' ')}
                                    </Text>
                                </>
                            )}
                        </div>

                        {/* Subcategory Pills (if available) */}
                        {!selectedSubcategory && Object.keys(currentCategory?.subcategories || {}).length > 0 && (
                            <div style={{ marginBottom: 24 }}>
                                <Text type="secondary" style={{ marginBottom: 12, display: 'block' }}>
                                    Select a type:
                                </Text>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
                                    {Object.values(currentCategory.subcategories).map(subcat => (
                                        <Card
                                            key={subcat.key}
                                            hoverable
                                            onClick={() => setSelectedSubcategory(subcat.key)}
                                            style={{
                                                borderRadius: 12,
                                                background: `${currentCategory.color}10`,
                                                border: `1px solid ${currentCategory.color}30`,
                                                cursor: 'pointer',
                                            }}
                                            bodyStyle={{ padding: '12px 20px' }}
                                        >
                                            <Space>
                                                <FolderOutlined style={{ color: currentCategory.color }} />
                                                <Text strong>{subcat.name}</Text>
                                                <Badge count={subcat.services.length} style={{ backgroundColor: currentCategory.color }} />
                                            </Space>
                                        </Card>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Services Grid */}
                        <Row gutter={[16, 16]}>
                            {currentServices.length === 0 ? (
                                <Col span={24}>
                                    <Empty description="No services in this category" />
                                </Col>
                            ) : (
                                currentServices.map(service => (
                                    <Col xs={24} sm={12} lg={8} xl={6} key={service.id}>
                                        <ServiceCard
                                            service={service}
                                            isDarkMode={isDarkMode}
                                            formatKSH={formatKSH}
                                            formatUnit={formatUnit}
                                            getIcon={getIcon}
                                            categoryColor={currentCategory?.color}
                                        />
                                    </Col>
                                ))
                            )}
                        </Row>
                    </div>
                )}
            </Spin>

            {/* Stats Footer */}
            <Card style={{ marginTop: 32, background: isDarkMode ? 'rgba(30, 41, 59, 0.6)' : 'rgba(255, 255, 255, 0.8)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-around', textAlign: 'center', flexWrap: 'wrap', gap: 16 }}>
                    <div>
                        <Text type="secondary">Total Services</Text>
                        <Title level={3} style={{ margin: 0, color: '#00B4D8' }}>{enabledServices.length}</Title>
                    </div>
                    <div>
                        <Text type="secondary">Categories</Text>
                        <Title level={3} style={{ margin: 0, color: '#FFB703' }}>{categories.length}</Title>
                    </div>
                    <div>
                        <Text type="secondary">Operating Hours</Text>
                        <Title level={5} style={{ margin: 0, color: '#00C853' }}>7 AM - 10 PM</Title>
                    </div>
                </div>
            </Card>

            <style>{`
                .category-card:hover {
                    transform: translateY(-4px) scale(1.02);
                    box-shadow: 0 12px 24px rgba(0,0,0,0.15);
                }
                .category-card:hover > div > div:first-child {
                    transform: scale(1.1);
                }
                .service-price-card {
                    transition: all 0.2s ease;
                }
                .service-price-card:hover {
                    transform: translateY(-2px);
                    box-shadow: 0 8px 16px rgba(0,0,0,0.12);
                }
            `}</style>
        </div>
    );
}

// Service Card Component
function ServiceCard({ service, isDarkMode, formatKSH, formatUnit, getIcon, categoryColor }) {
    const color = service.color || categoryColor || '#00B4D8';

    return (
        <Card
            hoverable
            className="service-price-card"
            style={{
                height: '100%',
                background: `linear-gradient(145deg, ${color}12 0%, ${color}05 100%)`,
                border: `1px solid ${color}30`,
                borderRadius: 16,
            }}
        >
            <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                <div style={{
                    width: 48,
                    height: 48,
                    borderRadius: 12,
                    background: `${color}20`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 22,
                    color: color,
                    marginBottom: 12,
                }}>
                    {getIcon(service.icon || 'default')}
                </div>

                <Text strong style={{
                    color: isDarkMode ? '#fff' : '#1e293b',
                    fontSize: 16,
                    display: 'block',
                    marginBottom: 4
                }}>
                    {service.name}
                </Text>

                {service.subcategory && (
                    <Tag size="small" style={{ width: 'fit-content', marginBottom: 8 }}>
                        {service.subcategory}
                    </Tag>
                )}

                {service.description && (
                    <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 12, flex: 1 }}>
                        {service.description}
                    </Text>
                )}

                <div style={{ marginTop: 'auto', paddingTop: 12, borderTop: `1px solid ${color}20` }}>
                    <Text style={{
                        fontFamily: 'JetBrains Mono, monospace',
                        color: '#00C853',
                        fontWeight: 700,
                        fontSize: 22,
                        display: 'block'
                    }}>
                        {formatKSH(service.price)}
                    </Text>
                    <Text type="secondary" style={{ fontSize: 11 }}>
                        {formatUnit(service.unit)}
                    </Text>
                </div>
            </div>
        </Card>
    );
}

export default Services;
