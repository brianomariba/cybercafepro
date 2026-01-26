import { useState } from 'react';
import { Form, Input, Button, Card, Typography, Space, message, Checkbox, Alert } from 'antd';
import { UserOutlined, LockOutlined, ThunderboltOutlined, InfoCircleOutlined } from '@ant-design/icons';
import { adminLogin } from '../services/api';

const { Title, Text } = Typography;

function Login({ onLogin }) {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const handleSubmit = async (values) => {
        setLoading(true);
        setError('');

        try {
            // Call real authentication API
            const response = await adminLogin(values.username, values.password);

            if (response.success) {
                const userData = {
                    name: response.user?.username || values.username,
                    role: 'Admin',
                    email: `${values.username}@hawknine.co.ke`,
                    avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${values.username}`,
                    token: response.token
                };

                message.success('Login successful! Welcome to HawkNine');
                onLogin(userData);
            } else {
                setError(response.error || 'Login failed');
            }
        } catch (err) {
            console.error('Login error:', err);
            if (err.response?.data?.error) {
                setError(err.response.data.error);
            } else if (err.code === 'ECONNREFUSED' || err.message.includes('Network')) {
                setError('Cannot connect to server. Please check if the backend is running.');
            } else {
                setError('Login failed. Please try again.');
            }
        }

        setLoading(false);
    };

    return (
        <div className="login-container">
            {/* Animated Background */}
            <div className="login-bg">
                <div className="login-bg-gradient"></div>
                <div className="login-bg-grid"></div>
                <div className="login-bg-glow"></div>
            </div>

            {/* Login Card */}
            <Card className="login-card" bordered={false}>
                {/* Logo */}
                <div className="login-logo">
                    <div className="login-logo-icon" style={{
                        background: 'linear-gradient(135deg, #00B4D8, #023047)',
                        borderRadius: 16,
                        padding: 16,
                        display: 'inline-flex',
                        marginBottom: 16
                    }}>
                        <img
                            src="/logo.png"
                            alt="HawkNine"
                            style={{ width: 48, height: 48, objectFit: 'contain' }}
                        />
                    </div>
                    <Title level={2} className="login-title" style={{
                        background: 'linear-gradient(135deg, #00B4D8, #FFB703)',
                        WebkitBackgroundClip: 'text',
                        WebkitTextFillColor: 'transparent',
                    }}>
                        HawkNine
                    </Title>
                    <Text type="secondary">Cybercafe Admin Dashboard</Text>
                </div>

                {/* Error Alert */}
                {error && (
                    <Alert
                        message={error}
                        type="error"
                        showIcon
                        style={{ marginTop: 16, marginBottom: 8 }}
                        closable
                        onClose={() => setError('')}
                    />
                )}

                {/* Login Form */}
                <Form
                    name="login"
                    onFinish={handleSubmit}
                    layout="vertical"
                    size="large"
                    style={{ marginTop: error ? 16 : 32 }}
                >
                    <Form.Item
                        name="username"
                        rules={[{ required: true, message: 'Please enter your username' }]}
                    >
                        <Input
                            prefix={<UserOutlined style={{ color: '#64748B' }} />}
                            placeholder="Username"
                            className="login-input"
                        />
                    </Form.Item>

                    <Form.Item
                        name="password"
                        rules={[{ required: true, message: 'Please enter your password' }]}
                    >
                        <Input.Password
                            prefix={<LockOutlined style={{ color: '#64748B' }} />}
                            placeholder="Password"
                            className="login-input"
                        />
                    </Form.Item>

                    <Form.Item>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <Checkbox style={{ color: '#94A3B8' }}>Remember me</Checkbox>
                            <Button type="link" style={{ padding: 0, color: '#00B4D8' }}>
                                Forgot password?
                            </Button>
                        </div>
                    </Form.Item>

                    <Form.Item>
                        <Button
                            type="primary"
                            htmlType="submit"
                            block
                            loading={loading}
                            className="login-button"
                            style={{
                                background: 'linear-gradient(135deg, #00B4D8, #023047)',
                                border: 'none',
                                height: 48,
                                fontSize: 16,
                                fontWeight: 600,
                            }}
                        >
                            Sign In
                        </Button>
                    </Form.Item>
                </Form>

                {/* Default Credentials Info */}
                <div className="demo-credentials" style={{
                    background: 'rgba(255, 183, 3, 0.1)',
                    border: '1px solid rgba(255, 183, 3, 0.3)',
                    borderRadius: 8,
                    padding: 12,
                    marginTop: 16,
                }}>
                    <InfoCircleOutlined style={{ color: '#FFB703' }} />
                    <Text type="secondary" style={{ marginLeft: 8 }}>
                        Default: <code style={{ color: '#00B4D8' }}>admin</code> / <code style={{ color: '#00B4D8' }}>admin123</code>
                    </Text>
                </div>

                {/* Footer */}
                <div className="login-footer" style={{ marginTop: 24, textAlign: 'center' }}>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                        © 2024 HawkNine. All rights reserved.
                    </Text>
                </div>
            </Card>
        </div>
    );
}

export default Login;
