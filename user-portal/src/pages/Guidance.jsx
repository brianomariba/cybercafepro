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

// Guidance categories (objectives)
const objectives = [
    {
        key: 'getting-started',
        title: 'Getting Started',
        description: 'New to HawkNine? Start here.',
        icon: <ThunderboltOutlined />,
        color: '#00B4D8',
        articles: 5,
    },
    {
        key: 'computer-services',
        title: 'Computer Services',
        description: 'Learn about our computer services.',
        icon: <DesktopOutlined />,
        color: '#00C853',
        articles: 8,
    },
    {
        key: 'printing',
        title: 'Printing & Scanning',
        description: 'Everything about printing and scanning.',
        icon: <PrinterOutlined />,
        color: '#FFB703',
        articles: 6,
    },
    {
        key: 'payments',
        title: 'Payments & Pricing',
        description: 'Understand our pricing and payment options.',
        icon: <DollarOutlined />,
        color: '#FB8500',
        articles: 4,
    },
    {
        key: 'account',
        title: 'Account Management',
        description: 'Manage your account settings.',
        icon: <UserOutlined />,
        color: '#8B5CF6',
        articles: 5,
    },
    {
        key: 'safety',
        title: 'Safety & Security',
        description: 'Stay safe while using our services.',
        icon: <SafetyOutlined />,
        color: '#FF3B5C',
        articles: 4,
    },
];

// Guides/References by objective
const guides = [
    {
        id: 1,
        objective: 'getting-started',
        title: 'Welcome to HawkNine Cybercafe',
        description: 'Complete introduction to our cybercafe services and facilities.',
        type: 'Guide',
        duration: '5 min read',
        icon: <BookOutlined />,
        popular: true,
    },
    {
        id: 2,
        objective: 'getting-started',
        title: 'How to Start a Computer Session',
        description: 'Step-by-step guide to starting your first computer session.',
        type: 'Tutorial',
        duration: '3 min read',
        icon: <DesktopOutlined />,
        popular: true,
    },
    {
        id: 3,
        objective: 'getting-started',
        title: 'Understanding Our Pricing',
        description: 'Complete breakdown of our service rates and packages.',
        type: 'Reference',
        duration: '4 min read',
        icon: <DollarOutlined />,
        popular: false,
    },
    {
        id: 4,
        objective: 'computer-services',
        title: 'Computer Usage Guidelines',
        description: 'Rules and best practices for using our computers.',
        type: 'Guide',
        duration: '6 min read',
        icon: <SettingOutlined />,
        popular: false,
    },
    {
        id: 5,
        objective: 'computer-services',
        title: 'Installing and Using Software',
        description: 'Learn about available software and how to use them.',
        type: 'Tutorial',
        duration: '8 min read',
        icon: <DesktopOutlined />,
        popular: true,
    },
    {
        id: 6,
        objective: 'printing',
        title: 'How to Print Documents',
        description: 'Complete guide to printing documents at HawkNine.',
        type: 'Tutorial',
        duration: '5 min read',
        icon: <PrinterOutlined />,
        popular: true,
    },
    {
        id: 7,
        objective: 'printing',
        title: 'Printing Pricing Guide',
        description: 'Understand our printing rates for B&W and color.',
        type: 'Reference',
        duration: '2 min read',
        icon: <DollarOutlined />,
        popular: false,
    },
    {
        id: 8,
        objective: 'printing',
        title: 'How to Scan Documents',
        description: 'Learn to use our scanning services effectively.',
        type: 'Tutorial',
        duration: '4 min read',
        icon: <ScanOutlined />,
        popular: true,
    },
    {
        id: 9,
        objective: 'payments',
        title: 'Payment Methods Accepted',
        description: 'All the ways you can pay for our services.',
        type: 'Reference',
        duration: '2 min read',
        icon: <DollarOutlined />,
        popular: false,
    },
    {
        id: 10,
        objective: 'payments',
        title: 'M-Pesa Payment Guide',
        description: 'How to pay using M-Pesa mobile money.',
        type: 'Tutorial',
        duration: '3 min read',
        icon: <PhoneOutlined />,
        popular: true,
    },
    {
        id: 11,
        objective: 'account',
        title: 'Creating Your Account',
        description: 'How to register for a HawkNine account.',
        type: 'Tutorial',
        duration: '3 min read',
        icon: <UserOutlined />,
        popular: true,
    },
    {
        id: 12,
        objective: 'account',
        title: 'Managing Your Profile',
        description: 'Update your personal information and preferences.',
        type: 'Guide',
        duration: '4 min read',
        icon: <SettingOutlined />,
        popular: false,
    },
    {
        id: 13,
        objective: 'safety',
        title: 'Internet Safety Tips',
        description: 'Stay safe while browsing the internet.',
        type: 'Guide',
        duration: '6 min read',
        icon: <SafetyOutlined />,
        popular: true,
    },
    {
        id: 14,
        objective: 'safety',
        title: 'Protecting Your Data',
        description: 'Best practices for data security at cybercafes.',
        type: 'Guide',
        duration: '5 min read',
        icon: <SafetyOutlined />,
        popular: false,
    },
];

// FAQs
const faqs = [
    {
        question: 'What are your opening hours?',
        answer: 'HawkNine is open from 7:00 AM to 10:00 PM, Monday through Saturday. On Sundays, we operate from 9:00 AM to 8:00 PM.',
    },
    {
        question: 'How much does computer usage cost?',
        answer: 'Computer usage costs KSH 50 per 30 minutes or KSH 200 per hour. We also offer package deals for longer sessions.',
    },
    {
        question: 'Do you offer printing services?',
        answer: 'Yes! We offer both black & white printing (KSH 10 per page) and color printing (KSH 50 per page). We can print on various paper sizes.',
    },
    {
        question: 'Can I bring my own USB drive?',
        answer: 'Absolutely! You can bring your own USB drive to access your files. We recommend scanning it with our antivirus first.',
    },
    {
        question: 'Do you have Wi-Fi?',
        answer: 'Yes, we offer free Wi-Fi for our customers. Ask our staff for the password when you visit.',
    },
    {
        question: 'How do I pay for services?',
        answer: 'We accept cash, M-Pesa, and card payments. For M-Pesa, use our paybill number displayed at the counter.',
    },
    {
        question: 'Can I book a computer in advance?',
        answer: 'Yes, you can reserve a computer by calling us or using the booking feature in your account (coming soon).',
    },
    {
        question: 'Is there a minimum session time?',
        answer: 'The minimum session time is 30 minutes. You can extend your session at any time.',
    },
];

// Video tutorials
const videoTutorials = [
    { title: 'Quick Tour of HawkNine', duration: '2:30', views: 1200 },
    { title: 'How to Print a Document', duration: '3:45', views: 890 },
    { title: 'Using M-Pesa for Payment', duration: '2:15', views: 650 },
    { title: 'Scanning 101', duration: '4:00', views: 520 },
];

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
