import { useState } from 'react';
import { Form, Input, Button, Card, Typography, Alert, Steps, Result } from 'antd';
import { MailOutlined, SafetyCertificateOutlined, ArrowLeftOutlined, CheckCircleFilled } from '@ant-design/icons';
import { requestAdminOtp, verifyAdminOtp } from '../services/api';

const { Title, Text, Paragraph } = Typography;

function Login({ onLogin }) {
    const [step, setStep] = useState(0); // 0: Email, 1: OTP
    const [email, setEmail] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [successMsg, setSuccessMsg] = useState('');

    const handleRequestOtp = async (values) => {
        setLoading(true);
        setError('');
        setSuccessMsg('');

        try {
            const response = await requestAdminOtp(values.email);
            if (response.success) {
                setEmail(values.email);
                setStep(1);
                setSuccessMsg('Verification code sent to your email.');
            } else {
                setError('Failed to send verification code.');
            }
        } catch (err) {
            console.error('OTP Request Error:', err);
            if (err.response?.data?.error) {
                setError(err.response.data.error);
            } else {
                setError('Unable to send code. Please try again.');
            }
        }
        setLoading(false);
    };

    const handleVerifyOtp = async (values) => {
        setLoading(true);
        setError('');

        try {
            const response = await verifyAdminOtp(email, values.otp);
            if (response.success) {
                const userData = {
                    name: response.user?.username || email.split('@')[0],
                    role: response.user?.role || 'Admin',
                    email: response.user?.email || email,
                    avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${response.user?.username || email}`,
                    token: response.token
                };

                // Show success animation briefly
                setSuccessMsg('Login successful redirecting...');
                setTimeout(() => {
                    onLogin(userData);
                }, 800);
            }
        } catch (err) {
            console.error('OTP Verify Error:', err);
            if (err.response?.data?.error) {
                setError(err.response.data.error);
            } else {
                setError('Invalid code. Please try again.');
            }
        }
        setLoading(false);
    };

    const handleBack = () => {
        setStep(0);
        setError('');
        setSuccessMsg('');
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
            <Card className="login-card" bordered={false} style={{ maxWidth: 420, margin: '0 auto' }}>
                {/* Logo */}
                <div className="login-logo" style={{ marginBottom: 32 }}>
                    <div className="login-logo-icon" style={{
                        background: 'linear-gradient(135deg, #00B4D8, #023047)',
                        borderRadius: 16,
                        padding: 16,
                        display: 'inline-flex',
                        marginBottom: 16,
                        boxShadow: '0 10px 25px rgba(0, 180, 216, 0.3)'
                    }}>
                        <img
                            src="/logo.png"
                            alt="HawkNine"
                            style={{ width: 48, height: 48, objectFit: 'contain' }}
                        />
                    </div>
                    <Title level={2} className="login-title" style={{
                        marginTop: 0,
                        marginBottom: 4,
                        background: 'linear-gradient(135deg, #00B4D8, #FFB703)',
                        WebkitBackgroundClip: 'text',
                        WebkitTextFillColor: 'transparent',
                        fontWeight: 700
                    }}>
                        HawkNine
                    </Title>
                    <Text type="secondary">Secure Admin Access</Text>
                </div>

                {/* Progress Steps (Subtle) */}
                <div style={{ marginBottom: 24, display: 'flex', justifyContent: 'center', gap: 8 }}>
                    <div style={{ height: 4, width: 24, borderRadius: 2, background: step >= 0 ? '#00B4D8' : '#334155' }} />
                    <div style={{ height: 4, width: 24, borderRadius: 2, background: step >= 1 ? '#00B4D8' : '#334155' }} />
                </div>

                {/* Messages */}
                {error && (
                    <Alert
                        message={error}
                        type="error"
                        showIcon
                        style={{ marginBottom: 24, borderRadius: 8 }}
                        closable
                        onClose={() => setError('')}
                    />
                )}

                {successMsg && (
                    <Alert
                        message={successMsg}
                        type="success"
                        showIcon
                        style={{ marginBottom: 24, borderRadius: 8 }}
                    />
                )}

                {/* Step 1: Email Input */}
                {step === 0 && (
                    <Form
                        name="email-login"
                        onFinish={handleRequestOtp}
                        layout="vertical"
                        size="large"
                        initialValues={{ email: '' }}
                    >
                        <div style={{ textAlign: 'center', marginBottom: 24 }}>
                            <Title level={4} style={{ color: '#fff', marginBottom: 8 }}>Welcome Back</Title>
                            <Text type="secondary">Enter your specialized admin email to continue</Text>
                        </div>

                        <Form.Item
                            name="email"
                            rules={[
                                { required: true, message: 'Please enter your email' },
                                { type: 'email', message: 'Please enter a valid email' }
                            ]}
                        >
                            <Input
                                prefix={<MailOutlined style={{ color: '#64748B' }} />}
                                placeholder="admin@hawknine.co.ke"
                                className="login-input"
                                autoFocus
                            />
                        </Form.Item>

                        <Form.Item>
                            <Button
                                type="primary"
                                htmlType="submit"
                                block
                                loading={loading}
                                className="login-button"
                                icon={<SafetyCertificateOutlined />}
                                style={{
                                    background: 'linear-gradient(135deg, #00B4D8, #023047)',
                                    border: 'none',
                                    height: 48,
                                    fontSize: 16,
                                    fontWeight: 600,
                                    marginTop: 8
                                }}
                            >
                                Send Verification Code
                            </Button>
                        </Form.Item>
                    </Form>
                )}

                {/* Step 2: OTP Input */}
                {step === 1 && (
                    <Form
                        name="otp-verify"
                        onFinish={handleVerifyOtp}
                        layout="vertical"
                        size="large"
                    >
                        <div style={{ textAlign: 'center', marginBottom: 24 }}>
                            <div style={{
                                background: 'rgba(0, 180, 216, 0.1)',
                                width: 64,
                                height: 64,
                                borderRadius: '50%',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                margin: '0 auto 16px'
                            }}>
                                <MailOutlined style={{ fontSize: 28, color: '#00B4D8' }} />
                            </div>
                            <Title level={4} style={{ color: '#fff', marginBottom: 8 }}>Check your inbox</Title>
                            <Text type="secondary">We sent a 6-digit code to <br /><span style={{ color: '#E2E8F0' }}>{email}</span></Text>
                        </div>

                        <Form.Item
                            name="otp"
                            rules={[
                                { required: true, message: 'Please enter the verification code' },
                                { len: 6, message: 'Code must be 6 digits' }
                            ]}
                        >
                            <Input
                                placeholder="123456"
                                className="login-input"
                                style={{
                                    textAlign: 'center',
                                    letterSpacing: 8,
                                    fontSize: 24,
                                    fontWeight: 'bold',
                                    height: 56
                                }}
                                maxLength={6}
                                autoFocus
                            />
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
                                Verify & Sign In
                            </Button>
                        </Form.Item>

                        <div style={{ textAlign: 'center', marginTop: 16 }}>
                            <Button
                                type="link"
                                icon={<ArrowLeftOutlined />}
                                onClick={handleBack}
                                style={{ color: '#94A3B8' }}
                            >
                                Change Email
                            </Button>
                        </div>
                    </Form>
                )}

                {/* Footer */}
                <div className="login-footer" style={{ marginTop: 32, textAlign: 'center' }}>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                        © 2024 HawkNine. Secure System for Cybercafe Management.
                    </Text>
                </div>
            </Card>
        </div>
    );
}

export default Login;
