import React, { useState, useEffect } from 'react';
import { Card, Typography, Space, Button, Tag, Divider, Statistic, Row, Col, Tooltip, Empty, Spin, message } from 'antd';
import {
    FilePdfOutlined, FileWordOutlined, FileExcelOutlined, FileOutlined,
    DownloadOutlined, ClockCircleOutlined, UserOutlined, InboxOutlined, PhoneOutlined
} from '@ant-design/icons';
import { getPublicDocumentRequests, connectSocket } from '../services/api';

const { Title, Text } = Typography;

const ClientDocuments = ({ isDarkMode }) => {
    const [requests, setRequests] = useState([]);
    const [loading, setLoading] = useState(true);
    const [downloading, setDownloading] = useState({});

    const loadData = async () => {
        try {
            setLoading(true);
            const data = await getPublicDocumentRequests();
            console.log('Loaded document requests:', data);
            // Ensure data is an array
            if (Array.isArray(data)) {
                setRequests(data);
            } else {
                console.warn('Expected array but got:', typeof data, data);
                setRequests([]);
            }
        } catch (error) {
            console.error('Failed to load documents:', error);
            setRequests([]);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadData();

        // Socket listener for real-time updates
        const onNewDoc = (newDoc) => {
            console.log('New document received via socket:', newDoc);
            // Ensure the new document has the required structure
            if (newDoc && newDoc.orderId) {
                setRequests(prev => {
                    // Avoid duplicates
                    const exists = prev.find(r => r.orderId === newDoc.orderId);
                    if (exists) {
                        return prev;
                    }
                    return [newDoc, ...prev];
                });
            }
        };

        const socket = connectSocket({
            onNewDocumentRequest: onNewDoc
        });

        // Cleanup listener on unmount
        return () => {
            if (socket) {
                socket.off('new-document-for-users', onNewDoc);
            }
        };
    }, []);

    const getFileIcon = (type) => {
        switch ((type || '').toLowerCase()) {
            case 'pdf': return <FilePdfOutlined style={{ color: '#ff3b5c' }} />;
            case 'word': return <FileWordOutlined style={{ color: '#00d4ff' }} />;
            case 'excel': return <FileExcelOutlined style={{ color: '#00ff88' }} />;
            default: return <FileOutlined />;
        }
    };

    const handleDownload = async (file, reqOrderId, fileIdx) => {
        const fileName = file.originalName || file.filename || 'download';
        const downloadKey = `${reqOrderId}-${fileIdx}`;

        if (!file.downloadUrl || String(file.downloadUrl).includes('/undefined')) {
            message.error('Download URL not available for this file');
            return;
        }

        setDownloading(prev => ({ ...prev, [downloadKey]: true }));

        try {
            // Fetch file as blob for reliable cross-origin download
            const response = await fetch(file.downloadUrl);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);

            const blob = await response.blob();
            const blobUrl = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = blobUrl;
            link.download = fileName;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            window.URL.revokeObjectURL(blobUrl);

            message.success(`Downloaded: ${fileName}`);
        } catch (err) {
            console.error('Download failed via fetch, attempting standard anchor download:', err);
            // Fallback: programmatic anchor tag instead of window.open forces a download attempt rather than opening a new tab
            const link = document.createElement('a');
            link.href = file.downloadUrl;
            link.download = fileName;
            link.target = '_blank';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            message.info(`Downloading ${fileName}...`);
        } finally {
            setDownloading(prev => ({ ...prev, [downloadKey]: false }));
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

            {loading ? (
                <div style={{ textAlign: 'center', padding: '60px 0' }}>
                    <Spin size="large" />
                </div>
            ) : (
                <>
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

                                    {req.customerPhone && (
                                        <div style={{ marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                                            <PhoneOutlined style={{ color: '#00B4D8', fontSize: 13 }} />
                                            <Text style={{ color: isDarkMode ? '#e2e8f0' : '#475569', fontSize: 13 }}>
                                                {req.customerPhone}
                                            </Text>
                                        </div>
                                    )}

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
                                        {req.instructions && (
                                            <div style={{ marginTop: 8, padding: '8px', background: isDarkMode ? 'rgba(255,255,255,0.05)' : '#f8fafc', borderRadius: 4 }}>
                                                <Text type="secondary" style={{ fontSize: 12, fontStyle: 'italic', display: 'block' }}>
                                                    "{req.instructions}"
                                                </Text>
                                            </div>
                                        )}
                                    </div>

                                    <Divider style={{ margin: '12px 0', borderColor: isDarkMode ? 'rgba(255,255,255,0.1)' : '#f0f0f0' }} />

                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                        {req.files && req.files.length > 0 ? (
                                            req.files.map((file, idx) => (
                                                <div key={idx} style={{
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    padding: '8px',
                                                    background: isDarkMode ? 'rgba(0,0,0,0.2)' : '#f8fafc',
                                                    borderRadius: 6
                                                }}>
                                                    <div style={{ fontSize: 20, marginRight: 12 }}>{getFileIcon(file.type || 'other')}</div>
                                                    <div style={{ flex: 1, overflow: 'hidden' }}>
                                                        <Text ellipsis style={{ color: isDarkMode ? '#e2e8f0' : '#475569', fontSize: 13 }}>
                                                            {file.originalName || file.filename || 'Unknown file'}
                                                        </Text>
                                                    </div>
                                                    <Tooltip title="Download Original">
                                                        <Button
                                                            type="text"
                                                            icon={<DownloadOutlined />}
                                                            size="small"
                                                            loading={downloading[`${req.orderId}-orig-${idx}`]}
                                                            onClick={() => handleDownload(file, req.orderId, `orig-${idx}`)}
                                                            style={{ color: '#00B4D8' }}
                                                        />
                                                    </Tooltip>
                                                </div>
                                            ))
                                        ) : (
                                            <Text type="secondary" style={{ fontSize: 12, fontStyle: 'italic', padding: '8px' }}>
                                                No uploaded files available
                                            </Text>
                                        )}

                                        {req.resultFiles && req.resultFiles.length > 0 && (
                                            <>
                                                <Divider style={{ margin: '8px 0', borderColor: isDarkMode ? 'rgba(255,255,255,0.1)' : '#f0f0f0' }} />
                                                <Text strong style={{ fontSize: 13, color: '#00ff88', marginBottom: 4 }}>
                                                    ✅ Completed Work ({req.resultFiles.length})
                                                </Text>
                                                {req.resultFiles.map((file, idx) => (
                                                    <div key={`res-${idx}`} style={{
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        padding: '8px',
                                                        background: isDarkMode ? 'rgba(0,255,136,0.1)' : '#f0fdf4',
                                                        borderRadius: 6,
                                                        border: '1px solid rgba(0, 255, 136, 0.2)'
                                                    }}>
                                                        <div style={{ fontSize: 20, marginRight: 12 }}>{getFileIcon(file.type || 'other')}</div>
                                                        <div style={{ flex: 1, overflow: 'hidden' }}>
                                                            <Text ellipsis style={{ color: isDarkMode ? '#e2e8f0' : '#475569', fontSize: 13 }}>
                                                                {file.originalName || file.filename || 'Finished file'}
                                                            </Text>
                                                        </div>
                                                        <Tooltip title="Download Completed File">
                                                            <Button
                                                                type="text"
                                                                icon={<DownloadOutlined />}
                                                                size="small"
                                                                loading={downloading[`${req.orderId}-res-${idx}`]}
                                                                onClick={() => handleDownload(file, req.orderId, `res-${idx}`)}
                                                                style={{ color: '#00ff88' }}
                                                            />
                                                        </Tooltip>
                                                    </div>
                                                ))}
                                            </>
                                        )}
                                    </div>
                                </Card>
                            </Col>
                        ))}
                    </Row>

                    {requests.length === 0 && (
                        <Empty
                            image={Empty.PRESENTED_IMAGE_SIMPLE}
                            description={
                                <div>
                                    <Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>
                                        No documents found
                                    </Text>
                                    <Text type="secondary" style={{ fontSize: 12 }}>
                                        Documents uploaded from the landing page will appear here
                                    </Text>
                                </div>
                            }
                            style={{ marginTop: 40 }}
                        />
                    )}
                </>
            )}
        </div>
    );
};

export default ClientDocuments;
