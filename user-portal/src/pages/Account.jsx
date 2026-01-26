import { useState } from 'react';
import { Row, Col, Card, Avatar, Space, Typography, Button, Form, Input, Switch, Tag, Tabs, Divider, Progress, List, Badge, message } from 'antd';
import {
    UserOutlined,
    MailOutlined,
    PhoneOutlined,
    LockOutlined,
    BellOutlined,
    SafetyOutlined,
    EditOutlined,
    SaveOutlined,
    CameraOutlined,
    CheckCircleOutlined,
    ClockCircleOutlined,
    HistoryOutlined,
    SettingOutlined,
    GlobalOutlined,
    MoonOutlined,
    KeyOutlined,
    DeleteOutlined,
    ExportOutlined,
} from '@ant-design/icons';

const { Text, Title } = Typography;

// Usage history mock data
const usageHistory = [
    { date: '2024-01-07', activity: 'Computer Session', duration: '2h 30m', amount: 'KSH 500' },
    { date: '2024-01-06', activity: 'Document Printing', pages: '15 pages', amount: 'KSH 150' },
    { date: '2024-01-05', activity: 'Scanning Service', pages: '8 pages', amount: 'KSH 80' },
    { date: '2024-01-04', activity: 'Computer Session', duration: '1h 15m', amount: 'KSH 250' },
    { date: '2024-01-03', activity: 'Photocopy Service', pages: '25 pages', amount: 'KSH 125' },
];


function Account({ user, onUpdateUser, isDarkMode }) {
    const [isEditing, setIsEditing] = useState(false);
    const [form] = Form.useForm();
    const [activeTab, setActiveTab] = useState('profile');

    const handleSave = (values) => {
        message.success('Profile updated successfully!');
        setIsEditing(false);
        if (onUpdateUser) {
            onUpdateUser({ ...user, ...values });
        }
    };

    const profileCompletion = 75;

    const tabItems = [
        {
            key: 'profile',
            label: <span><UserOutlined /> Profile</span>,
            children: (
                <Row gutter={[24, 24]}>
                    {/* Profile Card */}
                    <Col xs={24} lg={8}>
                        <Card>
                            <div style={{ textAlign: 'center' }}>
                                <div style={{ position: 'relative', display: 'inline-block', marginBottom: 20 }}>
                                    <Avatar
                                        size={120}
                                        src={user?.avatar || "https://api.dicebear.com/7.x/avataaars/svg?seed=user"}
                                        style={{ border: '4px solid #00B4D8' }}
                                    />
                                    <Button
                                        type="primary"
                                        shape="circle"
                                        icon={<CameraOutlined />}
                                        size="small"
                                        style={{
                                            position: 'absolute',
                                            bottom: 5,
                                            right: 5,
                                            background: '#00B4D8',
                                            border: 'none',
                                        }}
                                    />
                                </div>

                                <Title level={4} style={{ margin: 0, color: isDarkMode ? '#fff' : '#1e293b' }}>
                                    {user?.name || 'John Doe'}
                                </Title>
                                <Text type="secondary">{user?.email || 'john.doe@example.com'}</Text>

                                <Divider />

                                <div style={{ textAlign: 'left' }}>
                                    <Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>
                                        Profile Completion
                                    </Text>
                                    <Progress
                                        percent={profileCompletion}
                                        strokeColor={{ '0%': '#00B4D8', '100%': '#00C853' }}
                                    />
                                </div>

                                <div style={{ marginTop: 20, display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
                                    <div style={{ textAlign: 'center', padding: '12px 20px', background: 'rgba(0, 180, 216, 0.1)', borderRadius: 12 }}>
                                        <Text style={{ fontSize: 24, fontWeight: 700, color: '#00B4D8', display: 'block' }}>12</Text>
                                        <Text type="secondary" style={{ fontSize: 12 }}>Lessons</Text>
                                    </div>
                                    <div style={{ textAlign: 'center', padding: '12px 20px', background: 'rgba(0, 200, 83, 0.1)', borderRadius: 12 }}>
                                        <Text style={{ fontSize: 24, fontWeight: 700, color: '#00C853', display: 'block' }}>8</Text>
                                        <Text type="secondary" style={{ fontSize: 12 }}>Templates</Text>
                                    </div>
                                    <div style={{ textAlign: 'center', padding: '12px 20px', background: 'rgba(255, 183, 3, 0.1)', borderRadius: 12 }}>
                                        <Text style={{ fontSize: 24, fontWeight: 700, color: '#FFB703', display: 'block' }}>5</Text>
                                        <Text type="secondary" style={{ fontSize: 12 }}>Guides Read</Text>
                                    </div>
                                </div>
                            </div>
                        </Card>
                    </Col>

                    {/* Profile Form */}
                    <Col xs={24} lg={16}>
                        <Card
                            title={
                                <Space>
                                    <EditOutlined style={{ color: '#00B4D8' }} />
                                    <span>Personal Information</span>
                                </Space>
                            }
                            extra={
                                isEditing ? (
                                    <Space>
                                        <Button onClick={() => setIsEditing(false)}>Cancel</Button>
                                        <Button type="primary" icon={<SaveOutlined />} onClick={() => form.submit()}>
                                            Save
                                        </Button>
                                    </Space>
                                ) : (
                                    <Button type="primary" ghost icon={<EditOutlined />} onClick={() => setIsEditing(true)}>
                                        Edit Profile
                                    </Button>
                                )
                            }
                        >
                            <Form
                                form={form}
                                layout="vertical"
                                onFinish={handleSave}
                                initialValues={{
                                    name: user?.name || 'John Doe',
                                    email: user?.email || 'john.doe@example.com',
                                    phone: user?.phone || '+254 700 000 000',
                                    location: user?.location || 'Nairobi, Kenya',
                                    bio: user?.bio || 'A regular user of HawkNine cybercafe services.',
                                }}
                            >
                                <Row gutter={16}>
                                    <Col xs={24} md={12}>
                                        <Form.Item
                                            label="Full Name"
                                            name="name"
                                            rules={[{ required: true, message: 'Please enter your name' }]}
                                        >
                                            <Input
                                                prefix={<UserOutlined style={{ color: '#64748B' }} />}
                                                disabled={!isEditing}
                                                size="large"
                                            />
                                        </Form.Item>
                                    </Col>
                                    <Col xs={24} md={12}>
                                        <Form.Item
                                            label="Email Address"
                                            name="email"
                                            rules={[{ required: true, type: 'email', message: 'Please enter valid email' }]}
                                        >
                                            <Input
                                                prefix={<MailOutlined style={{ color: '#64748B' }} />}
                                                disabled={!isEditing}
                                                size="large"
                                            />
                                        </Form.Item>
                                    </Col>
                                    <Col xs={24} md={12}>
                                        <Form.Item label="Phone Number" name="phone">
                                            <Input
                                                prefix={<PhoneOutlined style={{ color: '#64748B' }} />}
                                                disabled={!isEditing}
                                                size="large"
                                            />
                                        </Form.Item>
                                    </Col>
                                    <Col xs={24} md={12}>
                                        <Form.Item label="Location" name="location">
                                            <Input
                                                prefix={<GlobalOutlined style={{ color: '#64748B' }} />}
                                                disabled={!isEditing}
                                                size="large"
                                            />
                                        </Form.Item>
                                    </Col>
                                    <Col xs={24}>
                                        <Form.Item label="Bio" name="bio">
                                            <Input.TextArea
                                                rows={3}
                                                disabled={!isEditing}
                                                placeholder="Tell us a bit about yourself..."
                                            />
                                        </Form.Item>
                                    </Col>
                                </Row>
                            </Form>
                        </Card>
                    </Col>
                </Row>
            ),
        },
        {
            key: 'preferences',
            label: <span><SettingOutlined /> Preferences</span>,
            children: (
                <Row gutter={[24, 24]}>
                    <Col xs={24} lg={12}>
                        <Card
                            title={
                                <Space>
                                    <BellOutlined style={{ color: '#FFB703' }} />
                                    <span>Notifications</span>
                                </Space>
                            }
                        >
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                                {[
                                    { label: 'Email Notifications', desc: 'Receive updates about new content and features', checked: true },
                                    { label: 'Push Notifications', desc: 'Get instant alerts on your device', checked: true },
                                    { label: 'Course Reminders', desc: 'Remind me to continue learning', checked: true },
                                    { label: 'Weekly Digest', desc: 'Summary of your activity and recommendations', checked: false },
                                    { label: 'Promotional Emails', desc: 'Special offers and discounts', checked: false },
                                ].map((item, idx) => (
                                    <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                        <div>
                                            <Text strong style={{ color: isDarkMode ? '#fff' : '#1e293b' }}>{item.label}</Text>
                                            <br />
                                            <Text type="secondary" style={{ fontSize: 12 }}>{item.desc}</Text>
                                        </div>
                                        <Switch defaultChecked={item.checked} />
                                    </div>
                                ))}
                            </div>
                        </Card>
                    </Col>

                    <Col xs={24} lg={12}>
                        <Card
                            title={
                                <Space>
                                    <GlobalOutlined style={{ color: '#00B4D8' }} />
                                    <span>Display & Language</span>
                                </Space>
                            }
                        >
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div>
                                        <Text strong style={{ color: isDarkMode ? '#fff' : '#1e293b' }}>
                                            <MoonOutlined style={{ marginRight: 8 }} />
                                            Dark Mode
                                        </Text>
                                        <br />
                                        <Text type="secondary" style={{ fontSize: 12 }}>Use dark theme for the interface</Text>
                                    </div>
                                    <Switch defaultChecked={isDarkMode} />
                                </div>

                                <Divider style={{ margin: '12px 0' }} />

                                <div>
                                    <Text strong style={{ color: isDarkMode ? '#fff' : '#1e293b', display: 'block', marginBottom: 8 }}>
                                        Language
                                    </Text>
                                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                        {['English', 'Swahili'].map((lang, idx) => (
                                            <Tag
                                                key={lang}
                                                color={idx === 0 ? 'cyan' : 'default'}
                                                style={{ cursor: 'pointer', padding: '4px 12px' }}
                                            >
                                                {lang}
                                            </Tag>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </Card>

                        <Card
                            title={
                                <Space>
                                    <SafetyOutlined style={{ color: '#00C853' }} />
                                    <span>Privacy & Data</span>
                                </Space>
                            }
                            style={{ marginTop: 24 }}
                        >
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                                <Button icon={<ExportOutlined />} block>
                                    Export My Data
                                </Button>
                                <Button icon={<HistoryOutlined />} block>
                                    Download Activity Log
                                </Button>
                                <Button danger icon={<DeleteOutlined />} block>
                                    Delete Account
                                </Button>
                            </div>
                        </Card>
                    </Col>
                </Row>
            ),
        },
        {
            key: 'security',
            label: <span><LockOutlined /> Security</span>,
            children: (
                <Row gutter={[24, 24]}>
                    <Col xs={24} lg={12}>
                        <Card
                            title={
                                <Space>
                                    <KeyOutlined style={{ color: '#FB8500' }} />
                                    <span>Change Password</span>
                                </Space>
                            }
                        >
                            <Form layout="vertical">
                                <Form.Item label="Current Password">
                                    <Input.Password prefix={<LockOutlined />} size="large" />
                                </Form.Item>
                                <Form.Item label="New Password">
                                    <Input.Password prefix={<LockOutlined />} size="large" />
                                </Form.Item>
                                <Form.Item label="Confirm New Password">
                                    <Input.Password prefix={<LockOutlined />} size="large" />
                                </Form.Item>
                                <Button type="primary" block size="large">
                                    Update Password
                                </Button>
                            </Form>
                        </Card>
                    </Col>

                    <Col xs={24} lg={12}>
                        <Card
                            title={
                                <Space>
                                    <SafetyOutlined style={{ color: '#00C853' }} />
                                    <span>Two-Factor Authentication</span>
                                </Space>
                            }
                        >
                            <div style={{ textAlign: 'center', padding: 20 }}>
                                <div style={{
                                    width: 80,
                                    height: 80,
                                    borderRadius: '50%',
                                    background: 'rgba(0, 200, 83, 0.1)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    margin: '0 auto 20px',
                                }}>
                                    <SafetyOutlined style={{ fontSize: 36, color: '#00C853' }} />
                                </div>
                                <Title level={5} style={{ color: isDarkMode ? '#fff' : '#1e293b' }}>
                                    Secure Your Account
                                </Title>
                                <Text type="secondary" style={{ display: 'block', marginBottom: 20 }}>
                                    Add an extra layer of security with 2FA
                                </Text>
                                <Button type="primary" ghost size="large">
                                    Enable 2FA
                                </Button>
                            </div>
                        </Card>

                        <Card
                            title={
                                <Space>
                                    <ClockCircleOutlined style={{ color: '#00B4D8' }} />
                                    <span>Active Sessions</span>
                                </Space>
                            }
                            style={{ marginTop: 24 }}
                        >
                            <List
                                dataSource={[
                                    { device: 'Chrome on Windows', location: 'Nairobi, KE', current: true },
                                    { device: 'Safari on iPhone', location: 'Nairobi, KE', current: false },
                                ]}
                                renderItem={(item) => (
                                    <List.Item
                                        actions={item.current ? [
                                            <Tag color="success">Current</Tag>
                                        ] : [
                                            <Button type="text" danger size="small">Logout</Button>
                                        ]}
                                    >
                                        <List.Item.Meta
                                            title={<Text style={{ color: isDarkMode ? '#fff' : '#1e293b' }}>{item.device}</Text>}
                                            description={item.location}
                                        />
                                    </List.Item>
                                )}
                            />
                        </Card>
                    </Col>
                </Row>
            ),
        },
        {
            key: 'history',
            label: <span><HistoryOutlined /> Usage History</span>,
            children: (
                <Card
                    title={
                        <Space>
                            <HistoryOutlined style={{ color: '#00B4D8' }} />
                            <span>Service Usage History</span>
                        </Space>
                    }
                    extra={<Button type="primary" ghost icon={<ExportOutlined />}>Export</Button>}
                >
                    <List
                        dataSource={usageHistory}
                        renderItem={(item) => (
                            <List.Item
                                actions={[
                                    <Text strong style={{ color: '#00C853', fontFamily: 'JetBrains Mono' }}>
                                        {item.amount}
                                    </Text>
                                ]}
                            >
                                <List.Item.Meta
                                    avatar={
                                        <div style={{
                                            width: 40,
                                            height: 40,
                                            borderRadius: 10,
                                            background: 'rgba(0, 180, 216, 0.1)',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                        }}>
                                            <ClockCircleOutlined style={{ color: '#00B4D8' }} />
                                        </div>
                                    }
                                    title={<Text style={{ color: isDarkMode ? '#fff' : '#1e293b' }}>{item.activity}</Text>}
                                    description={
                                        <Space>
                                            <Text type="secondary" style={{ fontSize: 12 }}>{item.date}</Text>
                                            <Text type="secondary" style={{ fontSize: 12 }}>
                                                {item.duration || item.pages}
                                            </Text>
                                        </Space>
                                    }
                                />
                            </List.Item>
                        )}
                    />

                    <div style={{
                        marginTop: 20,
                        padding: 16,
                        background: 'rgba(0, 180, 216, 0.05)',
                        borderRadius: 12,
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                    }}>
                        <Text type="secondary">Total This Month</Text>
                        <Text strong style={{ fontSize: 20, color: '#00C853', fontFamily: 'JetBrains Mono' }}>
                            KSH 1,105
                        </Text>
                    </div>
                </Card>
            ),
        },
    ];

    return (
        <div>
            {/* Page Header */}
            <div className="page-header">
                <div className="page-title">
                    <UserOutlined className="icon" />
                    <h1>My Account</h1>
                </div>
                <p className="page-subtitle">Manage your profile, preferences, and account settings.</p>
            </div>

            <Tabs
                activeKey={activeTab}
                onChange={setActiveTab}
                items={tabItems}
                size="large"
            />
        </div>
    );
}

export default Account;
