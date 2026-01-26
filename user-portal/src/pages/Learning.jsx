import { useState } from 'react';
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
} from '@ant-design/icons';

const { Text, Title, Paragraph } = Typography;

// Course categories
const categories = [
    { key: 'all', label: 'All Courses', count: 24 },
    { key: 'getting-started', label: 'Getting Started', count: 5 },
    { key: 'computer', label: 'Computer Skills', count: 8 },
    { key: 'printing', label: 'Printing & Scanning', count: 6 },
    { key: 'office', label: 'Office Applications', count: 5 },
];

// Mock courses data
const courses = [
    {
        id: 1,
        title: 'Introduction to Computer Services',
        description: 'Learn the basics of using cybercafe computer services efficiently.',
        category: 'getting-started',
        duration: '15 min',
        lessons: 5,
        progress: 80,
        level: 'Beginner',
        rating: 4.8,
        students: 1250,
        icon: <RocketOutlined />,
        color: '#00B4D8',
        locked: false,
    },
    {
        id: 2,
        title: 'Document Printing Mastery',
        description: 'Master all aspects of document printing, from basic to advanced settings.',
        category: 'printing',
        duration: '25 min',
        lessons: 8,
        progress: 45,
        level: 'Intermediate',
        rating: 4.7,
        students: 890,
        icon: <PrinterOutlined />,
        color: '#FFB703',
        locked: false,
    },
    {
        id: 3,
        title: 'Computer Basics for Everyone',
        description: 'Essential computer skills for everyday tasks and productivity.',
        category: 'computer',
        duration: '40 min',
        lessons: 12,
        progress: 20,
        level: 'Beginner',
        rating: 4.9,
        students: 2100,
        icon: <DesktopOutlined />,
        color: '#00C853',
        locked: false,
    },
    {
        id: 4,
        title: 'Scanning & Digital Documents',
        description: 'Learn how to scan, edit, and manage digital documents professionally.',
        category: 'printing',
        duration: '20 min',
        lessons: 6,
        progress: 0,
        level: 'Beginner',
        rating: 4.6,
        students: 560,
        icon: <ScanOutlined />,
        color: '#FB8500',
        locked: false,
    },
    {
        id: 5,
        title: 'Microsoft Word Essentials',
        description: 'Create professional documents with Microsoft Word like a pro.',
        category: 'office',
        duration: '45 min',
        lessons: 15,
        progress: 0,
        level: 'Intermediate',
        rating: 4.8,
        students: 1800,
        icon: <FileTextOutlined />,
        color: '#8B5CF6',
    },
    {
        id: 6,
        title: 'Internet Safety & Security',
        description: 'Stay safe online with essential security practices and awareness.',
        category: 'computer',
        duration: '30 min',
        lessons: 10,
        progress: 0,
        level: 'Beginner',
        rating: 4.9,
        students: 3200,
        icon: <SafetyOutlined />,
        color: '#00B4D8',
    },
];

// Featured course
const featuredCourse = {
    title: 'Complete Cybercafe User Guide',
    description: 'Everything you need to know about using HawkNine cybercafe services effectively. From computer usage to printing, scanning, and more.',
    duration: '2 hours',
    lessons: 24,
    level: 'All Levels',
    rating: 4.9,
    students: 5400,
    instructor: 'HawkNine Team',
};

function Learning({ isDarkMode }) {
    const [activeCategory, setActiveCategory] = useState('all');
    const [searchQuery, setSearchQuery] = useState('');

    const filteredCourses = courses.filter(course => {
        const matchesCategory = activeCategory === 'all' || course.category === activeCategory;
        const matchesSearch = course.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
            course.description.toLowerCase().includes(searchQuery.toLowerCase());
        return matchesCategory && matchesSearch;
    });

    const inProgressCourses = courses.filter(c => c.progress > 0 && c.progress < 100);
    const completedCourses = courses.filter(c => c.progress === 100);

    return (
        <div>
            {/* Page Header */}
            <div className="page-header">
                <div className="page-title">
                    <BookOutlined className="icon" />
                    <h1>Learning Center</h1>
                </div>
                <p className="page-subtitle">Expand your knowledge with our curated courses and guides.</p>
            </div>

            {/* Quick Stats */}
            <div className="stats-row">
                <div className="stat-card teal">
                    <div className="stat-header">
                        <div className="stat-icon teal">
                            <BookOutlined />
                        </div>
                    </div>
                    <div className="stat-value">{courses.length}</div>
                    <div className="stat-label">Available Courses</div>
                </div>

                <div className="stat-card yellow">
                    <div className="stat-header">
                        <div className="stat-icon yellow">
                            <FireOutlined />
                        </div>
                    </div>
                    <div className="stat-value">{inProgressCourses.length}</div>
                    <div className="stat-label">In Progress</div>
                </div>

                <div className="stat-card green">
                    <div className="stat-header">
                        <div className="stat-icon green">
                            <TrophyOutlined />
                        </div>
                    </div>
                    <div className="stat-value">{completedCourses.length}</div>
                    <div className="stat-label">Completed</div>
                </div>

                <div className="stat-card purple">
                    <div className="stat-header">
                        <div className="stat-icon purple">
                            <ClockCircleOutlined />
                        </div>
                    </div>
                    <div className="stat-value">4.5h</div>
                    <div className="stat-label">Learning Time</div>
                </div>
            </div>

            {/* Featured Course */}
            <Card
                style={{
                    marginBottom: 24,
                    background: 'linear-gradient(135deg, rgba(0, 180, 216, 0.15) 0%, rgba(0, 200, 83, 0.1) 100%)',
                    border: '1px solid rgba(0, 180, 216, 0.2)',
                }}
            >
                <Row gutter={24} align="middle">
                    <Col xs={24} md={16}>
                        <Tag color="gold" style={{ marginBottom: 12 }}>
                            <StarFilled /> Featured Course
                        </Tag>
                        <Title level={3} style={{ margin: 0, color: isDarkMode ? '#fff' : '#1e293b' }}>
                            {featuredCourse.title}
                        </Title>
                        <Paragraph type="secondary" style={{ marginTop: 12, marginBottom: 16, maxWidth: 600 }}>
                            {featuredCourse.description}
                        </Paragraph>
                        <Space wrap>
                            <Tag icon={<ClockCircleOutlined />} color="default">{featuredCourse.duration}</Tag>
                            <Tag icon={<BookOutlined />} color="default">{featuredCourse.lessons} Lessons</Tag>
                            <Tag icon={<ThunderboltOutlined />} color="default">{featuredCourse.level}</Tag>
                            <Tag icon={<StarFilled />} color="gold">{featuredCourse.rating}</Tag>
                            <Tag icon={<TeamOutlined />} color="default">{featuredCourse.students} students</Tag>
                        </Space>
                    </Col>
                    <Col xs={24} md={8} style={{ textAlign: 'right' }}>
                        <div style={{
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'flex-end',
                            gap: 12,
                        }}>
                            <Button type="primary" size="large" icon={<PlayCircleOutlined />}>
                                Start Learning
                            </Button>
                            <Text type="secondary">By {featuredCourse.instructor}</Text>
                        </div>
                    </Col>
                </Row>
            </Card>

            {/* Search and Filter */}
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

            {/* Continue Learning Section */}
            {inProgressCourses.length > 0 && (
                <>
                    <Title level={4} style={{ color: isDarkMode ? '#fff' : '#1e293b', marginBottom: 16 }}>
                        <FireOutlined style={{ color: '#FB8500', marginRight: 8 }} />
                        Continue Learning
                    </Title>
                    <Row gutter={[24, 24]} style={{ marginBottom: 32 }}>
                        {inProgressCourses.map(course => (
                            <Col xs={24} md={12} lg={8} key={course.id}>
                                <Card
                                    hoverable
                                    style={{ height: '100%', overflow: 'hidden' }}
                                >
                                    <div style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 16,
                                        marginBottom: 16,
                                    }}>
                                        <div style={{
                                            width: 56,
                                            height: 56,
                                            borderRadius: 12,
                                            background: `${course.color}20`,
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            fontSize: 24,
                                            color: course.color,
                                        }}>
                                            {course.icon}
                                        </div>
                                        <div style={{ flex: 1 }}>
                                            <Text strong style={{ color: isDarkMode ? '#fff' : '#1e293b', display: 'block' }}>
                                                {course.title}
                                            </Text>
                                            <Text type="secondary" style={{ fontSize: 12 }}>
                                                {course.lessons} lessons • {course.duration}
                                            </Text>
                                        </div>
                                    </div>
                                    <Progress
                                        percent={course.progress}
                                        strokeColor={course.color}
                                        size="small"
                                    />
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 16 }}>
                                        <Text type="secondary">{course.progress}% complete</Text>
                                        <Button type="link" style={{ padding: 0 }}>
                                            Continue <RightOutlined />
                                        </Button>
                                    </div>
                                </Card>
                            </Col>
                        ))}
                    </Row>
                </>
            )}

            {/* All Courses */}
            <Title level={4} style={{ color: isDarkMode ? '#fff' : '#1e293b', marginBottom: 16 }}>
                <BookOutlined style={{ color: '#00B4D8', marginRight: 8 }} />
                {activeCategory === 'all' ? 'All Courses' : categories.find(c => c.key === activeCategory)?.label}
            </Title>

            {filteredCourses.length === 0 ? (
                <Empty description="No courses found matching your criteria" />
            ) : (
                <Row gutter={[24, 24]}>
                    {filteredCourses.map(course => (
                        <Col xs={24} sm={12} lg={8} xl={6} key={course.id}>
                            <Card
                                hoverable
                                className="learning-card"
                                style={{ height: '100%' }}
                            >
                                {/* Course Header */}
                                <div
                                    className="learning-media"
                                    style={{
                                        background: `linear-gradient(135deg, ${course.color}30 0%, ${course.color}10 100%)`,
                                        position: 'relative',
                                    }}
                                >
                                    <div style={{ fontSize: 48, color: course.color }}>
                                        {course.icon}
                                    </div>
                                    {course.progress === 0 && (
                                        <div
                                            className="play-btn"
                                            style={{
                                                position: 'absolute',
                                                bottom: -24,
                                                right: 16,
                                            }}
                                        >
                                            <PlayCircleOutlined />
                                        </div>
                                    )}
                                </div>

                                {/* Course Content */}
                                <div className="learning-content">
                                    <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                                        <Tag color={course.level === 'Beginner' ? 'green' : course.level === 'Intermediate' ? 'blue' : 'orange'}>
                                            {course.level}
                                        </Tag>
                                    </div>
                                    <div className="learning-title">{course.title}</div>
                                    <div className="learning-desc">{course.description}</div>
                                    <div className="learning-footer">
                                        <Space>
                                            <StarFilled style={{ color: '#FFB703' }} />
                                            <Text type="secondary">{course.rating}</Text>
                                        </Space>
                                        <Text type="secondary">{course.duration}</Text>
                                    </div>

                                    {course.progress > 0 && (
                                        <Progress
                                            percent={course.progress}
                                            size="small"
                                            strokeColor={course.color}
                                            style={{ marginTop: 12 }}
                                        />
                                    )}
                                </div>
                            </Card>
                        </Col>
                    ))}
                </Row>
            )}

            {/* Pro Tip */}
            <Card
                style={{
                    marginTop: 32,
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
                        <BulbOutlined style={{ fontSize: 28, color: '#8B5CF6' }} />
                    </div>
                    <div style={{ flex: 1 }}>
                        <Title level={5} style={{ margin: 0, color: isDarkMode ? '#fff' : '#1e293b' }}>
                            💡 Learning Tip
                        </Title>
                        <Text type="secondary">
                            Set aside 15-20 minutes each day for learning. Consistent practice leads to better results!
                        </Text>
                    </div>
                    <Button type="primary" ghost>
                        View All Courses
                    </Button>
                </div>
            </Card>
        </div>
    );
}

// Add missing import
import { TeamOutlined } from '@ant-design/icons';

export default Learning;
