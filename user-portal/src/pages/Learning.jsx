import { useState, useEffect } from 'react';
import { Row, Col, Card, Progress, Tag, Space, Typography, Button, Input, Tabs, Badge, Empty, Rate, Avatar } from 'antd';
import {
    BookOutlined,
    PlayCircleOutlined,
    ClockCircleOutlined,
    SearchOutlined,
    FilterOutlined,
    CheckCircleOutlined,
    TrophyOutlined,
    FireOutlined,
    StarFilled,
    RightOutlined,
    LockOutlined,
    UnlockOutlined,
    ThunderboltOutlined,
    BulbOutlined,
    RocketOutlined,
    FileTextOutlined,
    DesktopOutlined,
    PrinterOutlined,
    ScanOutlined,
    SafetyOutlined,
    TeamOutlined
} from '@ant-design/icons';
import { getCourses } from '../services/api';

const { Text, Title, Paragraph } = Typography;

function Learning({ isDarkMode }) {
    const [courses, setCourses] = useState([]);
    const [loading, setLoading] = useState(true);
    const [activeCategory, setActiveCategory] = useState('all');
    const [searchQuery, setSearchQuery] = useState('');

    useEffect(() => {
        const loadData = async () => {
            try {
                const data = await getCourses();
                const mapped = data.map(c => ({
                    ...c,
                    id: c._id,
                    progress: 0,
                    rating: 5,
                    lessons: c.lessons || 5,
                    students: c.students || 0,
                    color: c.color || '#00B4D8',
                    icon: getIconForCategory(c.category)
                }));
                setCourses(mapped);
            } catch (error) {
                console.error('Failed to load courses', error);
            } finally {
                setLoading(false);
            }
        };
        loadData();
    }, []);

    const getIconForCategory = (cat) => {
        switch (cat) {
            case 'getting-started': return <RocketOutlined />;
            case 'computer': return <DesktopOutlined />;
            case 'printing': return <PrinterOutlined />;
            case 'office': return <FileTextOutlined />;
            default: return <BookOutlined />;
        }
    };

    const categories = [
        { key: 'all', label: 'All Courses' },
        { key: 'getting-started', label: 'Getting Started' },
        { key: 'computer', label: 'Computer Skills' },
        { key: 'printing', label: 'Printing & Scanning' },
        { key: 'office', label: 'Office' },
    ].map(cat => ({
        ...cat,
        count: cat.key === 'all' ? courses.length : courses.filter(c => c.category === cat.key).length
    }));

    const filteredCourses = courses.filter(course => {
        const matchesCategory = activeCategory === 'all' || course.category === activeCategory;
        const matchesSearch = course.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
            course.description.toLowerCase().includes(searchQuery.toLowerCase());
        return matchesCategory && matchesSearch;
    });

    const featuredCourse = courses.find(c => c.featured);
    const inProgressCourses = courses.filter(c => c.progress > 0 && c.progress < 100);
    const completedCourses = courses.filter(c => c.progress === 100);

    return (
        <div>
            <div className="page-header">
                <div className="page-title">
                    <BookOutlined className="icon" />
                    <h1>Learning Center</h1>
                </div>
                <p className="page-subtitle">Expand your knowledge with our curated courses.</p>
            </div>

            <div className="stats-row">
                <div className="stat-card teal">
                    <div className="stat-header">
                        <div className="stat-icon teal"><BookOutlined /></div>
                    </div>
                    <div className="stat-value">{courses.length}</div>
                    <div className="stat-label">Available Courses</div>
                </div>
                <div className="stat-card yellow">
                    <div className="stat-header">
                        <div className="stat-icon yellow"><FireOutlined /></div>
                    </div>
                    <div className="stat-value">{inProgressCourses.length}</div>
                    <div className="stat-label">In Progress</div>
                </div>
                <div className="stat-card green">
                    <div className="stat-header">
                        <div className="stat-icon green"><TrophyOutlined /></div>
                    </div>
                    <div className="stat-value">{completedCourses.length}</div>
                    <div className="stat-label">Completed</div>
                </div>
            </div>

            {featuredCourse && (
                <Card style={{ marginBottom: 24, background: 'linear-gradient(135deg, rgba(0, 180, 216, 0.15) 0%, rgba(0, 200, 83, 0.1) 100%)', border: '1px solid rgba(0, 180, 216, 0.2)' }}>
                    <Row gutter={24} align="middle">
                        <Col xs={24} md={16}>
                            <Tag color="gold" style={{ marginBottom: 12 }}><StarFilled /> Featured Course</Tag>
                            <Title level={3} style={{ margin: 0, color: isDarkMode ? '#fff' : '#1e293b' }}>{featuredCourse.title}</Title>
                            <Paragraph type="secondary" style={{ marginTop: 12, marginBottom: 16, maxWidth: 600 }}>{featuredCourse.description}</Paragraph>
                            <Space wrap>
                                <Tag icon={<ClockCircleOutlined />} color="default">{featuredCourse.duration}</Tag>
                                <Tag icon={<BookOutlined />} color="default">{featuredCourse.lessons} Lessons</Tag>
                                <Tag icon={<ThunderboltOutlined />} color="default">{featuredCourse.level}</Tag>
                            </Space>
                        </Col>
                        <Col xs={24} md={8} style={{ textAlign: 'right' }}>
                            <Button type="primary" size="large" icon={<PlayCircleOutlined />}>Start Learning</Button>
                        </Col>
                    </Row>
                </Card>
            )}

            <div style={{ display: 'flex', gap: 16, marginBottom: 24, flexWrap: 'wrap' }}>
                <Input
                    placeholder="Search courses..."
                    prefix={<SearchOutlined style={{ color: '#64748B' }} />}
                    style={{ maxWidth: 320 }}
                    size="large"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                />
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', flex: 1 }}>
                    {categories.map(cat => (
                        <Button
                            key={cat.key}
                            type={activeCategory === cat.key ? 'primary' : 'default'}
                            onClick={() => setActiveCategory(cat.key)}
                        >
                            {cat.label} <Badge count={cat.count} style={{ marginLeft: 8 }} />
                        </Button>
                    ))}
                </div>
            </div>

            {filteredCourses.length === 0 ? (
                <Empty description="No courses found" />
            ) : (
                <Row gutter={[24, 24]}>
                    {filteredCourses.map(course => (
                        <Col xs={24} sm={12} lg={8} xl={6} key={course.id}>
                            <Card hoverable className="learning-card" style={{ height: '100%' }}>
                                <div className="learning-media" style={{ background: `linear-gradient(135deg, ${course.color}30 0%, ${course.color}10 100%)` }}>
                                    <div style={{ fontSize: 48, color: course.color }}>{course.icon}</div>
                                </div>
                                <div className="learning-content">
                                    <Tag color={course.level === 'Beginner' ? 'green' : course.level === 'Intermediate' ? 'blue' : 'orange'}>{course.level}</Tag>
                                    <div className="learning-title">{course.title}</div>
                                    <div className="learning-desc">{course.description}</div>
                                    <div className="learning-footer">
                                        <Space>
                                            <StarFilled style={{ color: '#FFB703' }} />
                                            <Text type="secondary">{course.rating}</Text>
                                        </Space>
                                        <Text type="secondary">{course.duration}</Text>
                                    </div>
                                </div>
                            </Card>
                        </Col>
                    ))}
                </Row>
            )}
        </div>
    );
}

export default Learning;
