import { useState, useEffect } from 'react';
import { Row, Col, Card, Tag, Space, Typography, Button, Input, Collapse, Tabs, List, Avatar, Empty, Tooltip, Badge, Anchor } from 'antd';
import {
    BulbOutlined,
    SearchOutlined,
    BookOutlined,
    QuestionCircleOutlined,
    VideoCameraOutlined,
    FileTextOutlined,
    RightOutlined,
    CheckCircleOutlined,
    StarFilled,
    ClockCircleOutlined,
    PrinterOutlined,
    DesktopOutlined,
    ScanOutlined,
    SafetyOutlined,
    DollarOutlined,
    UserOutlined,
    ThunderboltOutlined,
    SettingOutlined,
    PhoneOutlined,
    MailOutlined,
    CustomerServiceOutlined,
    MessageOutlined,
    RocketOutlined
} from '@ant-design/icons';
import { getGuides } from '../services/api';

const { Text, Title, Paragraph } = Typography;
const { Panel } = Collapse;

function Guidance({ isDarkMode }) {
    const [guides, setGuides] = useState([]);
    const [loading, setLoading] = useState(true);
    const [objectives, setObjectives] = useState([]);
    const [selectedObjective, setSelectedObjective] = useState(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [activeTab, setActiveTab] = useState('guides');

    const faqs = [];
    const videoTutorials = [];

    useEffect(() => {
        const loadData = async () => {
            try {
                const data = await getGuides();
                const mapped = data.map(g => ({
                    ...g,
                    id: g._id,
                    icon: getIconForObjective(g.objective)
                }));
                setGuides(mapped);

                const baseObjectives = [
                    { key: 'getting-started', title: 'Getting Started', icon: <RocketOutlined />, color: '#00B4D8' },
                    { key: 'printing', title: 'Printing & Scanning', icon: <PrinterOutlined />, color: '#00C853' },
                    { key: 'payments', title: 'Payments & Billing', icon: <DollarOutlined />, color: '#FFB703' },
                    { key: 'safety', title: 'Safety & Rules', icon: <SafetyOutlined />, color: '#F72585' },
                    { key: 'account', title: 'Account Settings', icon: <SettingOutlined />, color: '#7209B7' },
                    { key: 'other', title: 'General & Other', icon: <BookOutlined />, color: '#4CC9F0' }
                ];

                const calculatedObjectives = baseObjectives.map(obj => ({
                    ...obj,
                    articles: mapped.filter(g => g.objective === obj.key).length
                }));
                setObjectives(calculatedObjectives);
            } catch (error) {
                console.error('Failed to load guides', error);
            } finally {
                setLoading(false);
            }
        };
        loadData();
    }, []);

    const getIconForObjective = (obj) => {
        switch (obj) {
            case 'getting-started': return <RocketOutlined />;
            case 'printing': return <PrinterOutlined />;
            case 'payments': return <DollarOutlined />;
            case 'safety': return <SafetyOutlined />;
            default: return <BookOutlined />;
        }
    };

    const filteredGuides = guides.filter(guide => {
        const matchesObjective = !selectedObjective || guide.objective === selectedObjective;
        const matchesSearch = guide.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
            guide.description.toLowerCase().includes(searchQuery.toLowerCase());
        return matchesObjective && matchesSearch;
    });

    const popularGuides = guides.filter(g => g.popular);

    const tabItems = [
        {
            key: 'guides',
            label: <span><BookOutlined /> Guides & References</span>,
            children: (
                <>
                    <Title level={5} style={{ color: isDarkMode ? '#fff' : '#1e293b', marginBottom: 16 }}>
                        Browse by Objective
                    </Title>
                    <Row gutter={[16, 16]} style={{ marginBottom: 32 }}>
                        {objectives.map(obj => (
                            <Col xs={12} sm={8} md={6} lg={4} key={obj.key}>
                                <Card
                                    hoverable
                                    style={{
                                        textAlign: 'center',
                                        background: selectedObjective === obj.key
                                            ? `${obj.color}15`
                                            : 'transparent',
                                        border: `1px solid ${selectedObjective === obj.key ? obj.color : 'rgba(255,255,255,0.1)'}`,
                                    }}
                                    onClick={() => setSelectedObjective(selectedObjective === obj.key ? null : obj.key)}
                                >
                                    <div style={{
                                        width: 48,
                                        height: 48,
                                        borderRadius: 12,
                                        background: `${obj.color}20`,
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        fontSize: 22,
                                        color: obj.color,
                                        margin: '0 auto 12px',
                                    }}>
                                        {obj.icon}
                                    </div>
                                    <Text strong style={{
                                        color: isDarkMode ? '#fff' : '#1e293b',
                                        display: 'block',
                                        fontSize: 13,
                                    }}>
                                        {obj.title}
                                    </Text>
                                    <Text type="secondary" style={{ fontSize: 11 }}>
                                        {obj.articles} articles
                                    </Text>
                                </Card>
                            </Col>
                        ))}
                    </Row>

                    <Title level={5} style={{ color: isDarkMode ? '#fff' : '#1e293b', marginBottom: 16 }}>
                        {selectedObjective
                            ? objectives.find(o => o.key === selectedObjective)?.title
                            : 'All Guides & References'}
                        {selectedObjective && (
                            <Button type="link" onClick={() => setSelectedObjective(null)}>Clear filter</Button>
                        )}
                    </Title>

                    {filteredGuides.length === 0 ? (
                        <Empty description="No guides found" />
                    ) : (
                        <Row gutter={[16, 16]}>
                            {filteredGuides.map(guide => {
                                const objective = objectives.find(o => o.key === guide.objective);
                                return (
                                    <Col xs={24} md={12} lg={8} key={guide.id}>
                                        <div
                                            className="reference-card"
                                            style={{ height: '100%' }}
                                        >
                                            <div
                                                className="reference-icon"
                                                style={{
                                                    background: `${objective?.color}20`,
                                                    color: objective?.color,
                                                }}
                                            >
                                                {guide.icon}
                                            </div>
                                            <div className="reference-content">
                                                <div style={{ display: 'flex', gap: 8, marginBottom: 4 }}>
                                                    <Tag color={
                                                        guide.type === 'Tutorial' ? 'blue' :
                                                            guide.type === 'Guide' ? 'green' : 'orange'
                                                    } style={{ fontSize: 10 }}>
                                                        {guide.type}
                                                    </Tag>
                                                    {guide.popular && (
                                                        <Tag color="gold" style={{ fontSize: 10 }}>
                                                            <StarFilled /> Popular
                                                        </Tag>
                                                    )}
                                                </div>
                                                <div className="reference-title">{guide.title}</div>
                                                <div className="reference-desc">{guide.description}</div>
                                                <Text type="secondary" style={{ fontSize: 11 }}>
                                                    <ClockCircleOutlined style={{ marginRight: 4 }} />
                                                    {guide.duration}
                                                </Text>
                                            </div>
                                            <RightOutlined className="reference-arrow" />
                                        </div>
                                    </Col>
                                );
                            })}
                        </Row>
                    )}
                </>
            ),
        },
        {
            key: 'faq',
            label: <span><QuestionCircleOutlined /> FAQs</span>,
            children: (
                <Empty description="FAQs coming soon" />
            ),
        },
        {
            key: 'videos',
            label: <span><VideoCameraOutlined /> Video Tutorials</span>,
            children: (
                <Empty description="Videos coming soon" />
            ),
        },
    ];

    return (
        <div>
            <div className="page-header">
                <div className="page-title">
                    <BulbOutlined className="icon" />
                    <h1>Guidance & References</h1>
                </div>
                <p className="page-subtitle">
                    Find answers, tutorials, and helpful resources.
                </p>
            </div>

            <div className="stats-row">
                <div className="stat-card teal">
                    <div className="stat-header">
                        <div className="stat-icon teal"><BookOutlined /></div>
                    </div>
                    <div className="stat-value">{guides.length}</div>
                    <div className="stat-label">Total Guides</div>
                </div>
                <div className="stat-card yellow">
                    <div className="stat-header">
                        <div className="stat-icon yellow"><QuestionCircleOutlined /></div>
                    </div>
                    <div className="stat-value">{faqs.length}</div>
                    <div className="stat-label">FAQs</div>
                </div>
                <div className="stat-card green">
                    <div className="stat-header">
                        <div className="stat-icon green"><VideoCameraOutlined /></div>
                    </div>
                    <div className="stat-value">{videoTutorials.length}</div>
                    <div className="stat-label">Video Tutorials</div>
                </div>
                <div className="stat-card purple">
                    <div className="stat-header">
                        <div className="stat-icon purple"><CheckCircleOutlined /></div>
                    </div>
                    <div className="stat-value">{objectives.length}</div>
                    <div className="stat-label">Topics</div>
                </div>
            </div>

            <div style={{ marginBottom: 24 }}>
                <Input
                    placeholder="Search for guides..."
                    prefix={<SearchOutlined style={{ color: '#64748B' }} />}
                    size="large"
                    style={{ maxWidth: 500 }}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                />
            </div>

            {popularGuides.length > 0 && (
                <Card style={{ marginBottom: 24, background: 'linear-gradient(135deg, rgba(255, 183, 3, 0.1) 0%, rgba(251, 133, 0, 0.1) 100%)', border: '1px solid rgba(255, 183, 3, 0.2)' }}>
                    <Title level={5} style={{ color: isDarkMode ? '#fff' : '#1e293b', marginBottom: 16 }}>
                        <StarFilled style={{ color: '#FFB703', marginRight: 8 }} />
                        Popular Guides
                    </Title>
                    <Row gutter={[16, 16]}>
                        {popularGuides.slice(0, 4).map(guide => {
                            const objective = objectives.find(o => o.key === guide.objective);
                            return (
                                <Col xs={24} sm={12} md={6} key={guide.id}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 12, background: 'rgba(255, 255, 255, 0.05)', borderRadius: 10, cursor: 'pointer', transition: 'all 0.3s ease' }}>
                                        <div style={{ width: 40, height: 40, borderRadius: 10, background: `${objective?.color}20`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: objective?.color }}>
                                            {guide.icon}
                                        </div>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <Text strong style={{ color: isDarkMode ? '#fff' : '#1e293b', display: 'block', fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{guide.title}</Text>
                                            <Text type="secondary" style={{ fontSize: 11 }}>{guide.duration}</Text>
                                        </div>
                                    </div>
                                </Col>
                            );
                        })}
                    </Row>
                </Card>
            )}

            <Tabs activeKey={activeTab} onChange={setActiveTab} items={tabItems} size="large" />
        </div>
    );
}

export default Guidance;
