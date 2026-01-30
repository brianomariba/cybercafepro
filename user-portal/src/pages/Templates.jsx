import { useState } from 'react';
import { Row, Col, Card, Tag, Space, Typography, Button, Input, Select, Empty, Badge, Modal, message } from 'antd';
import {
    FileTextOutlined,
    SearchOutlined,
    FilterOutlined,
    DownloadOutlined,
    EyeOutlined,
    StarFilled,
    StarOutlined,
    HeartOutlined,
    HeartFilled,
    ClockCircleOutlined,
    UserOutlined,
    CheckCircleOutlined,
    FileWordOutlined,
    FilePdfOutlined,
    FileExcelOutlined,
    FilePptOutlined,
    FileImageOutlined,
    FolderOutlined,
    AppstoreOutlined,
    UnorderedListOutlined,
} from '@ant-design/icons';

const { Text, Title, Paragraph } = Typography;

// Template categories
const categories = [
    { key: 'all', label: 'All Templates', icon: <AppstoreOutlined />, count: 0 },
    { key: 'resume', label: 'Resume & CV', icon: <UserOutlined />, count: 0 },
    { key: 'business', label: 'Business', icon: <FileTextOutlined />, count: 0 },
    { key: 'education', label: 'Education', icon: <FolderOutlined />, count: 0 },
    { key: 'personal', label: 'Personal', icon: <HeartOutlined />, count: 0 },
];

// Templates data would be fetched from API in real implementation
const templates = [];

function Templates({ isDarkMode }) {
    const [activeCategory, setActiveCategory] = useState('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [viewMode, setViewMode] = useState('grid');
    const [favorites, setFavorites] = useState(templates.filter(t => t.favorite).map(t => t.id));
    const [previewModal, setPreviewModal] = useState({ visible: false, template: null });
    const [sortBy, setSortBy] = useState('popular');

    const toggleFavorite = (id) => {
        if (favorites.includes(id)) {
            setFavorites(favorites.filter(f => f !== id));
            message.info('Removed from favorites');
        } else {
            setFavorites([...favorites, id]);
            message.success('Added to favorites');
        }
    };

    const handleDownload = (template) => {
        message.success(`Downloading ${template.title}...`);
    };

    const handlePreview = (template) => {
        setPreviewModal({ visible: true, template });
    };

    const filteredTemplates = templates.filter(template => {
        const matchesCategory = activeCategory === 'all' || template.category === activeCategory;
        const matchesSearch = template.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
            template.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
            template.tags.some(tag => tag.toLowerCase().includes(searchQuery.toLowerCase()));
        return matchesCategory && matchesSearch;
    }).sort((a, b) => {
        if (sortBy === 'popular') return b.downloads - a.downloads;
        if (sortBy === 'rating') return b.rating - a.rating;
        if (sortBy === 'newest') return 0; // Would use date comparison in real app
        return 0;
    });

    const featuredTemplates = templates.filter(t => t.featured);

    return (
        <div>
            {/* Page Header */}
            <div className="page-header">
                <div className="page-title">
                    <FileTextOutlined className="icon" />
                    <h1>Templates Hub</h1>
                </div>
                <p className="page-subtitle">
                    Download professionally designed templates for resumes, documents, and more.
                </p>
            </div>

            {/* Quick Stats */}
            <div className="stats-row">
                <div className="stat-card teal">
                    <div className="stat-header">
                        <div className="stat-icon teal">
                            <FileTextOutlined />
                        </div>
                    </div>
                    <div className="stat-value">{templates.length}</div>
                    <div className="stat-label">Total Templates</div>
                </div>

                <div className="stat-card yellow">
                    <div className="stat-header">
                        <div className="stat-icon yellow">
                            <DownloadOutlined />
                        </div>
                    </div>
                    <div className="stat-value">0</div>
                    <div className="stat-label">Your Downloads</div>
                </div>

                <div className="stat-card orange">
                    <div className="stat-header">
                        <div className="stat-icon orange">
                            <HeartFilled />
                        </div>
                    </div>
                    <div className="stat-value">{favorites.length}</div>
                    <div className="stat-label">Favorites</div>
                </div>

                <div className="stat-card green">
                    <div className="stat-header">
                        <div className="stat-icon green">
                            <CheckCircleOutlined />
                        </div>
                    </div>
                    <div className="stat-value">{featuredTemplates.length}</div>
                    <div className="stat-label">Featured</div>
                </div>
            </div>

            {/* Featured Templates */}
            <Title level={4} style={{ color: isDarkMode ? '#fff' : '#1e293b', marginBottom: 16 }}>
                <StarFilled style={{ color: '#FFB703', marginRight: 8 }} />
                Featured Templates
            </Title>
            <Row gutter={[24, 24]} style={{ marginBottom: 32 }}>
                {featuredTemplates.slice(0, 3).map(template => (
                    <Col xs={24} md={8} key={template.id}>
                        <Card
                            hoverable
                            style={{
                                background: `linear-gradient(135deg, ${template.color}15 0%, ${template.color}05 100%)`,
                                border: `1px solid ${template.color}30`,
                            }}
                        >
                            <div style={{ display: 'flex', gap: 16 }}>
                                <div style={{
                                    width: 64,
                                    height: 64,
                                    borderRadius: 12,
                                    background: `${template.color}20`,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontSize: 28,
                                    color: template.color,
                                }}>
                                    {template.icon}
                                </div>
                                <div style={{ flex: 1 }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                        <Text strong style={{ color: isDarkMode ? '#fff' : '#1e293b', fontSize: 16 }}>
                                            {template.title}
                                        </Text>
                                        <Button
                                            type="text"
                                            size="small"
                                            icon={favorites.includes(template.id) ? <HeartFilled style={{ color: '#FF3B5C' }} /> : <HeartOutlined />}
                                            onClick={() => toggleFavorite(template.id)}
                                        />
                                    </div>
                                    <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 8 }}>
                                        {template.type} • {template.downloads.toLocaleString()} downloads
                                    </Text>
                                    <Space>
                                        <StarFilled style={{ color: '#FFB703', fontSize: 12 }} />
                                        <Text type="secondary" style={{ fontSize: 12 }}>{template.rating}</Text>
                                    </Space>
                                </div>
                            </div>
                            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
                                <Button type="primary" icon={<DownloadOutlined />} onClick={() => handleDownload(template)}>
                                    Download
                                </Button>
                                <Button icon={<EyeOutlined />} onClick={() => handlePreview(template)}>
                                    Preview
                                </Button>
                            </div>
                        </Card>
                    </Col>
                ))}
            </Row>

            {/* Search and Filter */}
            <div style={{ display: 'flex', gap: 16, marginBottom: 24, flexWrap: 'wrap', alignItems: 'center' }}>
                <Input
                    placeholder="Search templates..."
                    prefix={<SearchOutlined style={{ color: '#64748B' }} />}
                    style={{ maxWidth: 320 }}
                    size="large"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                />
                <Select
                    value={sortBy}
                    onChange={setSortBy}
                    style={{ width: 150 }}
                    size="large"
                    options={[
                        { value: 'popular', label: 'Most Popular' },
                        { value: 'rating', label: 'Top Rated' },
                        { value: 'newest', label: 'Newest' },
                    ]}
                />
                <div style={{ display: 'flex', gap: 4 }}>
                    <Button
                        type={viewMode === 'grid' ? 'primary' : 'default'}
                        icon={<AppstoreOutlined />}
                        onClick={() => setViewMode('grid')}
                    />
                    <Button
                        type={viewMode === 'list' ? 'primary' : 'default'}
                        icon={<UnorderedListOutlined />}
                        onClick={() => setViewMode('list')}
                    />
                </div>
            </div>

            {/* Categories */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 24, flexWrap: 'wrap' }}>
                {categories.map(cat => (
                    <Button
                        key={cat.key}
                        type={activeCategory === cat.key ? 'primary' : 'default'}
                        icon={cat.icon}
                        onClick={() => setActiveCategory(cat.key)}
                    >
                        {cat.label}
                        <Badge count={cat.count} style={{ marginLeft: 8 }} />
                    </Button>
                ))}
            </div>

            {/* Templates Grid */}
            <Title level={4} style={{ color: isDarkMode ? '#fff' : '#1e293b', marginBottom: 16 }}>
                {activeCategory === 'all' ? 'All Templates' : categories.find(c => c.key === activeCategory)?.label}
            </Title>

            {filteredTemplates.length === 0 ? (
                <Empty description="No templates found matching your criteria" />
            ) : (
                <Row gutter={[24, 24]}>
                    {filteredTemplates.map(template => (
                        <Col xs={24} sm={12} lg={viewMode === 'grid' ? 6 : 12} key={template.id}>
                            <Card
                                hoverable
                                className="template-card"
                            >
                                {/* Template Preview */}
                                <div
                                    className="template-preview"
                                    style={{
                                        background: `linear-gradient(135deg, ${template.color}30 0%, ${template.color}10 100%)`,
                                        position: 'relative',
                                    }}
                                >
                                    <span style={{ fontSize: 48, color: template.color }}>{template.icon}</span>
                                    {template.featured && (
                                        <Tag
                                            color="gold"
                                            style={{ position: 'absolute', top: 12, left: 12 }}
                                        >
                                            <StarFilled /> Featured
                                        </Tag>
                                    )}
                                    <Button
                                        type="text"
                                        icon={favorites.includes(template.id) ?
                                            <HeartFilled style={{ color: '#FF3B5C' }} /> :
                                            <HeartOutlined style={{ color: '#fff' }} />
                                        }
                                        style={{ position: 'absolute', top: 8, right: 8 }}
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            toggleFavorite(template.id);
                                        }}
                                    />
                                </div>

                                {/* Template Content */}
                                <div className="template-content">
                                    <div className="template-category">{template.type}</div>
                                    <div className="template-title">{template.title}</div>
                                    <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 8 }}>
                                        {template.description}
                                    </Text>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 12 }}>
                                        {template.tags.slice(0, 3).map(tag => (
                                            <Tag key={tag} style={{ fontSize: 10 }}>{tag}</Tag>
                                        ))}
                                    </div>
                                    <div className="template-meta">
                                        <Space>
                                            <StarFilled style={{ color: '#FFB703' }} />
                                            <span>{template.rating}</span>
                                        </Space>
                                        <span>{template.downloads.toLocaleString()} downloads</span>
                                    </div>
                                    <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                                        <Button type="primary" icon={<DownloadOutlined />} block onClick={() => handleDownload(template)}>
                                            Download
                                        </Button>
                                    </div>
                                </div>
                            </Card>
                        </Col>
                    ))}
                </Row>
            )}

            {/* Preview Modal */}
            <Modal
                title={previewModal.template?.title}
                open={previewModal.visible}
                onCancel={() => setPreviewModal({ visible: false, template: null })}
                footer={[
                    <Button key="close" onClick={() => setPreviewModal({ visible: false, template: null })}>
                        Close
                    </Button>,
                    <Button key="download" type="primary" icon={<DownloadOutlined />} onClick={() => handleDownload(previewModal.template)}>
                        Download
                    </Button>,
                ]}
                width={800}
            >
                {previewModal.template && (
                    <div style={{ textAlign: 'center', padding: 40 }}>
                        <div style={{
                            width: 120,
                            height: 120,
                            borderRadius: 16,
                            background: `${previewModal.template.color}20`,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: 56,
                            color: previewModal.template.color,
                            margin: '0 auto 24px',
                        }}>
                            {previewModal.template.icon}
                        </div>
                        <Title level={4}>{previewModal.template.title}</Title>
                        <Paragraph type="secondary">{previewModal.template.description}</Paragraph>
                        <div style={{ display: 'flex', justifyContent: 'center', gap: 16, marginTop: 16 }}>
                            <Tag icon={<DownloadOutlined />}>{previewModal.template.downloads.toLocaleString()} downloads</Tag>
                            <Tag icon={<StarFilled />} color="gold">{previewModal.template.rating} rating</Tag>
                            <Tag icon={<ClockCircleOutlined />}>Updated {previewModal.template.lastUpdated}</Tag>
                        </div>
                    </div>
                )}
            </Modal>
        </div>
    );
}

export default Templates;
