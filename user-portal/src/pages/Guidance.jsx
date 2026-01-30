import { useState } from 'react';
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
} from '@ant-design/icons';

const { Text, Title, Paragraph } = Typography;
const { Panel } = Collapse;

// Categories from API
const objectives = [];

// Guides would be fetched from API
const guides = [];

// FAQs would be fetched from API
const faqs = [];

// Video tutorials would be fetched from API
const videoTutorials = [];

function Guidance({ isDarkMode }) {
    const [selectedObjective, setSelectedObjective] = useState(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [activeTab, setActiveTab] = useState('guides');

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
                    {/* Objectives Grid */}
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

                    {/* Guides List */}
                    <Title level={5} style={{ color: isDarkMode ? '#fff' : '#1e293b', marginBottom: 16 }}>
                        {selectedObjective
                            ? objectives.find(o => o.key === selectedObjective)?.title
                            : 'All Guides & References'}
                        {selectedObjective && (
                            <Button type="link" onClick={() => setSelectedObjective(null)}>Clear filter</Button>
                        )}
                    </Title>

                    {filteredGuides.length === 0 ? (
                        <Empty description="No guides found matching your criteria" />
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
                <Row gutter={[24, 24]}>
                    <Col xs={24} lg={16}>
                        <Card
                            title={
                                <Space>
                                    <QuestionCircleOutlined style={{ color: '#FFB703' }} />
                                    <span>Frequently Asked Questions</span>
                                </Space>
                            }
                        >
                            <Collapse
                                accordion
                                bordered={false}
                                expandIconPosition="end"
                                style={{ background: 'transparent' }}
                            >
                                {faqs.map((faq, idx) => (
                                    <Panel
                                        header={
                                            <Text strong style={{ color: isDarkMode ? '#fff' : '#1e293b' }}>
                                                {faq.question}
                                            </Text>
                                        }
                                        key={idx}
                                        style={{
                                            marginBottom: 8,
                                            background: 'rgba(255,255,255,0.03)',
                                            borderRadius: 8,
                                            border: '1px solid rgba(255,255,255,0.05)',
                                        }}
                                    >
                                        <Paragraph type="secondary" style={{ margin: 0 }}>
                                            {faq.answer}
                                        </Paragraph>
                                    </Panel>
                                ))}
                            </Collapse>
                        </Card>
                    </Col>

                    <Col xs={24} lg={8}>
                        <Card
                            title={
                                <Space>
                                    <CustomerServiceOutlined style={{ color: '#00B4D8' }} />
                                    <span>Need More Help?</span>
                                </Space>
                            }
                        >
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                                <Button icon={<MessageOutlined />} size="large" block>
                                    Chat with Support
                                </Button>
                                <Button icon={<MailOutlined />} size="large" block>
                                    Email Us
                                </Button>
                                <Button icon={<PhoneOutlined />} size="large" block>
                                    Call: +254 700 000 000
                                </Button>
                            </div>

                            <div style={{
                                marginTop: 20,
                                padding: 16,
                                background: 'rgba(0, 180, 216, 0.1)',
                                borderRadius: 12,
                                textAlign: 'center'
                            }}>
                                <Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>
                                    Visit us at
                                </Text>
                                <Text strong style={{ color: isDarkMode ? '#fff' : '#1e293b' }}>
                                    HawkNine Cybercafe
                                </Text>
                                <br />
                                <Text type="secondary" style={{ fontSize: 12 }}>
                                    Nairobi, Kenya
                                </Text>
                            </div>
                        </Card>
                    </Col>
                </Row>
            ),
        },
        {
            key: 'videos',
            label: <span><VideoCameraOutlined /> Video Tutorials</span>,
            children: (
                <Row gutter={[24, 24]}>
                    {videoTutorials.map((video, idx) => (
                        <Col xs={24} sm={12} lg={6} key={idx}>
                            <Card hoverable className="learning-card">
                                <div
                                    className="learning-media"
                                    style={{
                                        background: `linear-gradient(135deg, rgba(0, 180, 216, 0.2) 0%, rgba(139, 92, 246, 0.2) 100%)`,
                                    }}
                                >
                                    <div className="play-btn">
                                        <VideoCameraOutlined />
                                    </div>
                                </div>
                                <div className="learning-content">
                                    <div className="learning-title">{video.title}</div>
                                    <div className="learning-footer">
                                        <Tag icon={<ClockCircleOutlined />}>{video.duration}</Tag>
                                        <Text type="secondary" style={{ fontSize: 12 }}>
                                            {video.views} views
                                        </Text>
                                    </div>
                                </div>
                            </Card>
                        </Col>
                    ))}
                </Row>
            ),
        },
    ];

    return (
        <div>
            {/* Page Header */}
            <div className="page-header">
                <div className="page-title">
                    <BulbOutlined className="icon" />
                    <h1>Guidance & References</h1>
                </div>
                <p className="page-subtitle">
                    Find answers, tutorials, and helpful resources organized by objective.
                </p>
            </div>

            {/* Quick Stats */}
            <div className="stats-row">
                <div className="stat-card teal">
                    <div className="stat-header">
                        <div className="stat-icon teal">
                            <BookOutlined />
                        </div>
                    </div>
                    <div className="stat-value">{guides.length}</div>
                    <div className="stat-label">Total Guides</div>
                </div>

                <div className="stat-card yellow">
                    <div className="stat-header">
                        <div className="stat-icon yellow">
                            <QuestionCircleOutlined />
                        </div>
                    </div>
                    <div className="stat-value">{faqs.length}</div>
                    <div className="stat-label">FAQs</div>
                </div>

                <div className="stat-card green">
                    <div className="stat-header">
                        <div className="stat-icon green">
                            <VideoCameraOutlined />
                        </div>
                    </div>
                    <div className="stat-value">{videoTutorials.length}</div>
                    <div className="stat-label">Video Tutorials</div>
                </div>

                <div className="stat-card purple">
                    <div className="stat-header">
                        <div className="stat-icon purple">
                            <CheckCircleOutlined />
                        </div>
                    </div>
                    <div className="stat-value">{objectives.length}</div>
                    <div className="stat-label">Topics</div>
                </div>
            </div>

            {/* Search */}
            <div style={{ marginBottom: 24 }}>
                <Input
                    placeholder="Search for guides, tutorials, FAQs..."
                    prefix={<SearchOutlined style={{ color: '#64748B' }} />}
                    size="large"
                    style={{ maxWidth: 500 }}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                />
            </div>

            {/* Popular Guides Banner */}
            {popularGuides.length > 0 && (
                <Card
                    style={{
                        marginBottom: 24,
                        background: 'linear-gradient(135deg, rgba(255, 183, 3, 0.1) 0%, rgba(251, 133, 0, 0.1) 100%)',
                        border: '1px solid rgba(255, 183, 3, 0.2)',
                    }}
                >
                    <Title level={5} style={{ color: isDarkMode ? '#fff' : '#1e293b', marginBottom: 16 }}>
                        <StarFilled style={{ color: '#FFB703', marginRight: 8 }} />
                        Popular Guides
                    </Title>
                    <Row gutter={[16, 16]}>
                        {popularGuides.slice(0, 4).map(guide => {
                            const objective = objectives.find(o => o.key === guide.objective);
                            return (
                                <Col xs={24} sm={12} md={6} key={guide.id}>
                                    <div
                                        style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: 12,
                                            padding: 12,
                                            background: 'rgba(255, 255, 255, 0.05)',
                                            borderRadius: 10,
                                            cursor: 'pointer',
                                            transition: 'all 0.3s ease',
                                        }}
                                    >
                                        <div style={{
                                            width: 40,
                                            height: 40,
                                            borderRadius: 10,
                                            background: `${objective?.color}20`,
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            color: objective?.color,
                                        }}>
                                            {guide.icon}
                                        </div>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <Text
                                                strong
                                                style={{
                                                    color: isDarkMode ? '#fff' : '#1e293b',
                                                    display: 'block',
                                                    fontSize: 13,
                                                    whiteSpace: 'nowrap',
                                                    overflow: 'hidden',
                                                    textOverflow: 'ellipsis',
                                                }}
                                            >
                                                {guide.title}
                                            </Text>
                                            <Text type="secondary" style={{ fontSize: 11 }}>
                                                {guide.duration}
                                            </Text>
                                        </div>
                                    </div>
                                </Col>
                            );
                        })}
                    </Row>
                </Card>
            )}

            {/* Tabs */}
            <Tabs
                activeKey={activeTab}
                onChange={setActiveTab}
                items={tabItems}
                size="large"
            />
        </div>
    );
}

export default Guidance;
