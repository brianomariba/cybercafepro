import React, { useState, useEffect } from 'react';
import { Card, Typography, Space, Button, Tag, Divider, Statistic, Row, Col, Tooltip, Empty } from 'antd';
import {
    FilePdfOutlined, FileWordOutlined, FileExcelOutlined, FileOutlined,
    DownloadOutlined, ClockCircleOutlined, UserOutlined, InboxOutlined
} from '@ant-design/icons';
import { getPublicDocumentRequests, connectSocket } from '../services/api';

const { Title, Text } = Typography;

const ClientDocuments = ({ isDarkMode }) => {
    const [requests, setRequests] = useState([]);
    const [loading, setLoading] = useState(true);

    const loadData = async () => {
        try {
            setLoading(true);
            const data = await getPublicDocumentRequests();
            setRequests(data);
        } catch (error) {
            console.error('Failed to load documents:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadData();

        // Socket listener for real-time updates
        const socket = connectSocket({
            onNewDocumentRequest: (newDoc) => {
                setRequests(prev => [newDoc, ...prev]);
            }
        });

        // We don't disconnect the shared socket service
    }, []);

    const getFileIcon = (type) => {
        switch ((type || '').toLowerCase()) {
            case 'pdf': return <FilePdfOutlined style={{ color: '#ff3b5c' }} />;
            case 'word': return <FileWordOutlined style={{ color: '#00d4ff' }} />;
            case 'excel': return <FileExcelOutlined style={{ color: '#00ff88' }} />;
            default: return <FileOutlined />;
        }
    };

    return (
        <div style={{ padding: '24px', maxWidth: 1200, margin: '0 auto' }}>
            <div style={{ marginBottom: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                    <Title level={2} style={{ color: isDarkMode ? '#fff' : '#1e293b', marginBottom: 0 }}>
                        Client Documents
                    </Title>
                    <Text type="secondary" style={{ color: isDarkMode ? 'rgba(255,255,255,0.45)' : undefined }}>
                        Real-time feed of documents uploaded from the landing page
                    </Text>
                </div>
                <Button onClick={loadData} icon={<DownloadOutlined />}>Refresh</Button>
            </div>

            <Row gutter={[16, 16]}>
                <Col span={24}>
                    <Card bordered={false} style={{ background: isDarkMode ? 'rgba(255,255,255,0.05)' : '#fff', borderRadius: 12 }}>
                        <div style={{ display: 'flex', gap: 24 }}>
                            <Statistic
                                title="Total Requests"
                                value={requests.length}
                                prefix={<InboxOutlined />}
                                valueStyle={{ color: isDarkMode ? '#fff' : '#000' }}
                            />
                            <Statistic
                                title="Total Files"
                                value={requests.reduce((acc, r) => acc + (r.fileCount || 0), 0)}
                                prefix={<FileOutlined />}
                                valueStyle={{ color: isDarkMode ? '#fff' : '#000' }}
                            />
                        </div>
                    </Card>
                </Col>

                {requests.map(req => (
                    <Col xs={24} sm={24} md={12} lg={8} key={req.orderId}>
                        <Card
                            hoverable
                            style={{
                                background: isDarkMode ? '#023047' : '#fff',
                                border: isDarkMode ? '1px solid rgba(0, 180, 216, 0.2)' : '1px solid #f0f0f0',
                                height: '100%'
                            }}
                        >
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
                                <Space>
                                    <UserOutlined style={{ color: '#00B4D8' }} />
                                    <Text strong style={{ color: isDarkMode ? '#fff' : '#000' }}>{req.customerName}</Text>
                                </Space>
                                <Tag color="blue">{req.serviceType}</Tag>
                            </div>

                            <div style={{ marginBottom: 16 }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <Text type="secondary" style={{ fontSize: 12 }}>ID: {req.orderId}</Text>
                                    <Text type="secondary" style={{ fontSize: 12 }}>
                                        {new Date(req.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                    </Text>
                                </div>
                                <Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 4 }}>
                                    <ClockCircleOutlined style={{ marginRight: 4 }} />
                                    {new Date(req.createdAt).toLocaleDateString()}
                                </Text>
                            </div>

                            <Divider style={{ margin: '12px 0', borderColor: isDarkMode ? 'rgba(255,255,255,0.1)' : '#f0f0f0' }} />

                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                {(req.files || []).map((file, idx) => (
                                    <div key={idx} style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        padding: '8px',
                                        background: isDarkMode ? 'rgba(0,0,0,0.2)' : '#f8fafc',
                                        borderRadius: 6
                                    }}>
                                        <div style={{ fontSize: 20, marginRight: 12 }}>{getFileIcon(file.type)}</div>
                                        <div style={{ flex: 1, overflow: 'hidden' }}>
                                            <Text ellipsis style={{ color: isDarkMode ? '#e2e8f0' : '#475569', fontSize: 13 }}>
                                                {file.originalName || file.filename}
                                            </Text>
                                        </div>
                                        <Tooltip title="Download">
                                            <Button
                                                type="text"
                                                icon={<DownloadOutlined />}
                                                size="small"
                                                href={file.downloadUrl}
                                                target="_blank"
                                                style={{ color: '#00B4D8' }}
                                            />
                                        </Tooltip>
                                    </div>
                                ))}
                            </div>
                        </Card>
                    </Col>
                ))}
            </Row>

            {requests.length === 0 && !loading && (
                <Empty
                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                    description={<Text type="secondary">No documents found</Text>}
                    style={{ marginTop: 40 }}
                />
            )}
        </div>
    );
};

export default ClientDocuments;
