import { useState, useEffect } from 'react';
import { Row, Col, Card, Tag, Space, Typography, Button, Input, Select, Empty, Badge, Modal, message } from 'antd';
import {
    FileTextOutlined,
    SearchOutlined,
    DownloadOutlined,
    EyeOutlined,
    StarFilled,
    HeartOutlined,
    HeartFilled,
    ClockCircleOutlined,
    UserOutlined,
    CheckCircleOutlined,
    FileWordOutlined,
    FileExcelOutlined,
    FilePptOutlined,
    FolderOutlined,
    AppstoreOutlined,
    UnorderedListOutlined,
} from '@ant-design/icons';
import { getTemplates } from '../services/api';

const { Text, Title, Paragraph } = Typography;

function Templates({ isDarkMode }) {
    const [templates, setTemplates] = useState([]);
    const [loading, setLoading] = useState(true);
    const [activeCategory, setActiveCategory] = useState('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [viewMode, setViewMode] = useState('grid');
    const [favorites, setFavorites] = useState([]);
    const [previewModal, setPreviewModal] = useState({ visible: false, template: null });
    const [sortBy, setSortBy] = useState('popular');

    useEffect(() => {
        const loadData = async () => {
            try {
                const data = await getTemplates();
                const mapped = data.map(t => ({
                    ...t,
                    id: t._id,
                    tags: [t.category, t.type],
                    rating: 5,
                    downloads: t.downloads || 0,
                    color: '#00B4D8',
                    icon: getIconForType(t.type)
                }));
                setTemplates(mapped);
            } catch (error) {
                console.error('Failed to load templates', error);
            } finally {
                setLoading(false);
            }
        };
        loadData();
    }, []);

    const getIconForType = (type) => {
        switch (type) {
            case 'Word': return <FileWordOutlined />;
            case 'Excel': return <FileExcelOutlined />;
            case 'PowerPoint': return <FilePptOutlined />;
            default: return <FileTextOutlined />;
        }
    };

    const categories = [
        { key: 'all', label: 'All Templates', icon: <AppstoreOutlined /> },
        { key: 'resume', label: 'Resume & CV', icon: <UserOutlined /> },
        { key: 'business', label: 'Business', icon: <FileTextOutlined /> },
        { key: 'education', label: 'Education', icon: <FolderOutlined /> },
        { key: 'personal', label: 'Personal', icon: <HeartOutlined /> },
    ].map(cat => ({
        ...cat,
        count: cat.key === 'all' ? templates.length : templates.filter(t => t.category === cat.key).length
    }));

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
            template.description.toLowerCase().includes(searchQuery.toLowerCase());
        return matchesCategory && matchesSearch;
    }).sort((a, b) => {
        if (sortBy === 'popular') return b.downloads - a.downloads;
        if (sortBy === 'newest') return new Date(b.createdAt) - new Date(a.createdAt);
        return 0;
    });

    const featuredTemplates = templates.filter(t => t.featured);

    return (
        <div>
            <div className="page-header">
                <div className="page-title">
                    <FileTextOutlined className="icon" />
                    <h1>Templates Hub</h1>
                </div>
                <p className="page-subtitle">Download professionally designed templates.</p>
            </div>

            <div className="stats-row">
                <div className="stat-card teal">
                    <div className="stat-header">
                        <div className="stat-icon teal"><FileTextOutlined /></div>
                    </div>
                    <div className="stat-value">{templates.length}</div>
                    <div className="stat-label">Total Templates</div>
                </div>
                <div className="stat-card yellow">
                    <div className="stat-header">
                        <div className="stat-icon yellow"><DownloadOutlined /></div>
                    </div>
                    <div className="stat-value">0</div>
                    <div className="stat-label">Your Downloads</div>
                </div>
                <div className="stat-card orange">
                    <div className="stat-header">
                        <div className="stat-icon orange"><HeartFilled /></div>
                    </div>
                    <div className="stat-value">{favorites.length}</div>
                    <div className="stat-label">Favorites</div>
                </div>
            </div>

            {/* Featured Section */}
            {featuredTemplates.length > 0 && (
                <>
                    <Title level={4} style={{ color: isDarkMode ? '#fff' : '#1e293b', marginBottom: 16 }}>
                        <StarFilled style={{ color: '#FFB703', marginRight: 8 }} />
                        Featured Templates
                    </Title>
                    <Row gutter={[24, 24]} style={{ marginBottom: 32 }}>
                        {featuredTemplates.map(template => (
                            <Col xs={24} md={8} key={template.id}>
                                <Card hoverable>
                                    <div style={{ display: 'flex', gap: 16 }}>
                                        <div style={{ fontSize: 28, color: template.color }}>{template.icon}</div>
                                        <div>
                                            <Text strong>{template.title}</Text>
                                            <Text type="secondary" style={{ display: 'block' }}>{template.type}</Text>
                                        </div>
                                    </div>
                                    <Button type="primary" icon={<DownloadOutlined />} style={{ marginTop: 16 }} onClick={() => handleDownload(template)}>Download</Button>
                                </Card>
                            </Col>
                        ))}
                    </Row>
                </>
            )}

            {/* Search & Filter */}
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
                        { value: 'newest', label: 'Newest' },
                    ]}
                />
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

            {/* Grid */}
            {filteredTemplates.length === 0 ? (
                <Empty description="No templates found" />
            ) : (
                <Row gutter={[24, 24]}>
                    {filteredTemplates.map(template => (
                        <Col xs={24} sm={12} lg={6} key={template.id}>
                            <Card hoverable>
                                <div style={{ textAlign: 'center', padding: 20 }}>
                                    <span style={{ fontSize: 48, color: template.color }}>{template.icon}</span>
                                    <div style={{ marginTop: 16, fontWeight: 'bold' }}>{template.title}</div>
                                    <div style={{ marginTop: 8, color: '#888' }}>{template.description}</div>
                                    <Button type="primary" icon={<DownloadOutlined />} style={{ marginTop: 16 }} block onClick={() => handleDownload(template)}>Download</Button>
                                </div>
                            </Card>
                        </Col>
                    ))}
                </Row>
            )}
        </div>
    );
}

export default Templates;
