import { useState } from 'react';
import { Card, Form, Input, Button, Typography, Checkbox, Divider, message, Space } from 'antd';
import {
    UserOutlined,
    LockOutlined,
    MailOutlined,
    GoogleOutlined,
    EyeInvisibleOutlined,
    EyeTwoTone,
    ArrowRightOutlined,
} from '@ant-design/icons';

const { Title, Text, Paragraph } = Typography;

function Login({ onLogin }) {
    const [isLoading, setIsLoading] = useState(false);
    const [isRegister, setIsRegister] = useState(false);

    const handleSubmit = async (values) => {
        setIsLoading(true);

        // Simulate API call
        setTimeout(() => {
            const userData = {
                id: '1',
                name: values.name || 'John Doe',
                email: values.email,
                avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${values.email}`,
                role: 'User',
                memberSince: new Date().toISOString(),
            };

            message.success(isRegister ? 'Account created successfully!' : 'Welcome back!');
            onLogin(userData);
            setIsLoading(false);
        }, 1500);
    };

    return (
        <div
            style={{
                minHeight: '100vh',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'linear-gradient(135deg, #011627 0%, #023047 50%, #011627 100%)',
                padding: 20,
                position: 'relative',
                overflow: 'hidden',
            }}
        >
            {/* Animated Background */}
            <div
                style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    background: `
                        radial-gradient(ellipse at 20% 20%, rgba(0, 180, 216, 0.12) 0%, transparent 50%),
                        radial-gradient(ellipse at 80% 80%, rgba(0, 200, 83, 0.08) 0%, transparent 50%),
                        radial-gradient(ellipse at 50% 50%, rgba(255, 183, 3, 0.05) 0%, transparent 40%)
                    `,
                    pointerEvents: 'none',
                }}
            />

            <Card
                style={{
                    width: '100%',
                    maxWidth: 440,
                    background: 'rgba(10, 25, 41, 0.85)',
                    border: '1px solid rgba(0, 180, 216, 0.15)',
                    borderRadius: 20,
                    backdropFilter: 'blur(10px)',
                    boxShadow: '0 20px 60px rgba(0, 0, 0, 0.4)',
                }}
                bodyStyle={{ padding: 40 }}
            >
                {/* Logo */}
                <div style={{ textAlign: 'center', marginBottom: 32 }}>
                    <img
                        src="/logo.jpg"
                        alt="HawkNine Logo"
                        style={{
                            width: 100,
                            height: 'auto',
                            marginBottom: 16,
                            borderRadius: 12,
                        }}
                    />
                    <Title level={3} style={{ margin: 0, color: '#fff' }}>
                        HawkNine <Text style={{ color: '#00B4D8' }}>Portal</Text>
                    </Title>
                    <Paragraph type="secondary" style={{ marginTop: 8 }}>
                        {isRegister
                            ? 'Create your account to get started'
                            : 'Welcome back! Sign in to continue'}
                    </Paragraph>
                </div>

                <Form
                    name="login"
                    layout="vertical"
                    onFinish={handleSubmit}
                    autoComplete="off"
                    requiredMark={false}
                >
                    {isRegister && (
                        <Form.Item
                            name="name"
                            rules={[{ required: true, message: 'Please enter your name' }]}
                        >
                            <Input
                                prefix={<UserOutlined style={{ color: '#64748B' }} />}
                                placeholder="Full Name"
                                size="large"
                                style={{
                                    background: 'rgba(255, 255, 255, 0.05)',
                                    border: '1px solid rgba(0, 180, 216, 0.2)',
                                    borderRadius: 12,
                                }}
                            />
                        </Form.Item>
                    )}

                    <Form.Item
                        name="email"
                        rules={[
                            { required: true, message: 'Please enter your email' },
                            { type: 'email', message: 'Please enter a valid email' },
                        ]}
                    >
                        <Input
                            prefix={<MailOutlined style={{ color: '#64748B' }} />}
                            placeholder="Email Address"
                            size="large"
                            style={{
                                background: 'rgba(255, 255, 255, 0.05)',
                                border: '1px solid rgba(0, 180, 216, 0.2)',
                                borderRadius: 12,
                            }}
                        />
                    </Form.Item>

                    <Form.Item
                        name="password"
                        rules={[
                            { required: true, message: 'Please enter your password' },
                            { min: 6, message: 'Password must be at least 6 characters' },
                        ]}
                    >
                        <Input.Password
                            prefix={<LockOutlined style={{ color: '#64748B' }} />}
                            placeholder="Password"
                            size="large"
                            iconRender={(visible) =>
                                visible ? <EyeTwoTone /> : <EyeInvisibleOutlined />
                            }
                            style={{
                                background: 'rgba(255, 255, 255, 0.05)',
                                border: '1px solid rgba(0, 180, 216, 0.2)',
                                borderRadius: 12,
                            }}
                        />
                    </Form.Item>

                    {isRegister && (
                        <Form.Item
                            name="confirmPassword"
                            dependencies={['password']}
                            rules={[
                                { required: true, message: 'Please confirm your password' },
                                ({ getFieldValue }) => ({
                                    validator(_, value) {
                                        if (!value || getFieldValue('password') === value) {
                                            return Promise.resolve();
                                        }
                                        return Promise.reject(new Error('Passwords do not match'));
                                    },
                                }),
                            ]}
                        >
                            <Input.Password
                                prefix={<LockOutlined style={{ color: '#64748B' }} />}
                                placeholder="Confirm Password"
                                size="large"
                                iconRender={(visible) =>
                                    visible ? <EyeTwoTone /> : <EyeInvisibleOutlined />
                                }
                                style={{
                                    background: 'rgba(255, 255, 255, 0.05)',
                                    border: '1px solid rgba(0, 180, 216, 0.2)',
                                    borderRadius: 12,
                                }}
                            />
                        </Form.Item>
                    )}

                    {!isRegister && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 24 }}>
                            <Form.Item name="remember" valuePropName="checked" noStyle>
                                <Checkbox style={{ color: '#94A3B8' }}>Remember me</Checkbox>
                            </Form.Item>
                            <Button type="link" style={{ padding: 0 }}>
                                Forgot password?
                            </Button>
                        </div>
                    )}

                    <Form.Item>
                        <Button
                            type="primary"
                            htmlType="submit"
                            block
                            size="large"
                            loading={isLoading}
                            icon={<ArrowRightOutlined />}
                            style={{
                                height: 50,
                                borderRadius: 12,
                                background: 'linear-gradient(135deg, #00B4D8 0%, #0096C7 100%)',
                                border: 'none',
                                fontSize: 16,
                                fontWeight: 600,
                                boxShadow: '0 4px 20px rgba(0, 180, 216, 0.3)',
                            }}
                        >
                            {isRegister ? 'Create Account' : 'Sign In'}
                        </Button>
                    </Form.Item>
                </Form>

                <Divider style={{ borderColor: 'rgba(255, 255, 255, 0.1)' }}>
                    <Text type="secondary">or continue with</Text>
                </Divider>

                <Button
                    block
                    size="large"
                    icon={<GoogleOutlined />}
                    style={{
                        height: 50,
                        borderRadius: 12,
                        background: 'rgba(255, 255, 255, 0.05)',
                        border: '1px solid rgba(255, 255, 255, 0.1)',
                        color: '#fff',
                    }}
                >
                    Google
                </Button>

                <div style={{ textAlign: 'center', marginTop: 24 }}>
                    <Text type="secondary">
                        {isRegister ? 'Already have an account? ' : "Don't have an account? "}
                    </Text>
                    <Button
                        type="link"
                        onClick={() => setIsRegister(!isRegister)}
                        style={{ padding: 0 }}
                    >
                        {isRegister ? 'Sign In' : 'Create Account'}
                    </Button>
                </div>

                {/* Terms */}
                <Paragraph
                    type="secondary"
                    style={{
                        textAlign: 'center',
                        marginTop: 24,
                        marginBottom: 0,
                        fontSize: 12,
                    }}
                >
                    By continuing, you agree to our{' '}
                    <Button type="link" style={{ padding: 0, fontSize: 12 }}>
                        Terms of Service
                    </Button>{' '}
                    and{' '}
                    <Button type="link" style={{ padding: 0, fontSize: 12 }}>
                        Privacy Policy
                    </Button>
                </Paragraph>
            </Card>

            {/* Footer */}
            <div
                style={{
                    position: 'absolute',
                    bottom: 20,
                    left: 0,
                    right: 0,
                    textAlign: 'center',
                }}
            >
                <Text type="secondary" style={{ fontSize: 12 }}>
                    © 2024 HawkNine. All rights reserved.
                </Text>
            </div>
        </div>
    );
}

export default Login;
