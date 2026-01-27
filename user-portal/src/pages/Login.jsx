import { useState } from 'react';
import { Form, Input, Button, Card, Typography, Alert, message } from 'antd';
import { UserOutlined, LockOutlined, SafetyCertificateOutlined, ArrowLeftOutlined, MailOutlined } from '@ant-design/icons';
import { loginUserStep1, loginUserStep2, setUserToken } from '../services/api';

const { Title, Text } = Typography;

function Login({ onLogin }) {
  const [step, setStep] = useState(0); // 0: Credentials, 1: OTP
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [tempToken, setTempToken] = useState(null);
  const [emailMask, setEmailMask] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const handleLoginStep1 = async (values) => {
    setLoading(true);
    setError('');
    setSuccessMsg('');

    try {
      const response = await loginUserStep1(values.username, values.password);
      if (response.success) {
        setTempToken(response.tempToken);
        setEmailMask(response.emailMask);
        setStep(1);
        message.success('Credentials verified. OTP sent.');
      }
    } catch (err) {
      console.error('Login Step 1 Error:', err);
      if (err.response?.data?.error) {
        setError(err.response.data.error);
      } else {
        setError('Login failed. Please check your connection.');
      }
    }
    setLoading(false);
  };

  const handleLoginStep2 = async (values) => {
    if (successMsg) return; // Prevent double submission if already successful
    setLoading(true);
    setError('');

    try {
      const response = await loginUserStep2(tempToken, values.otp);
      if (response.success) {
        const userData = {
          name: response.user?.name || response.user?.username || 'User',
          email: response.user?.email,
          avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${response.user?.username}`,
          token: response.token
        };

        // Store token for future requests
        setUserToken(response.token);

        setSuccessMsg('Authentication successful! Welcome back.');
        setTimeout(() => {
          onLogin(userData);
        }, 800);
      }
    } catch (err) {
      // Only show error if we haven't already marked success
      if (!successMsg) {
        console.error('Login Step 2 Error:', err);
        if (err.response?.data?.error) {
          setError(err.response.data.error);
        } else {
          setError('Verification failed. Please try again.');
        }
      }
    }
    setLoading(false);
  };

  const handleBack = () => {
    setStep(0);
    setError('');
    setSuccessMsg('');
    setTempToken(null);
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
              src="/logo.jpg"
              alt="HawkNine"
              style={{ width: 48, height: 48, objectFit: 'cover', borderRadius: 8 }}
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
          <Text type="secondary" style={{ color: '#94A3B8' }}>User Portal Access</Text>
        </div>

        {/* Progress Steps */}
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

        {/* Step 1: Credentials */}
        {step === 0 && (
          <Form
            name="login-step1"
            onFinish={handleLoginStep1}
            layout="vertical"
            size="large"
          >
            <div style={{ textAlign: 'center', marginBottom: 24 }}>
              <Title level={4} style={{ color: '#fff', marginBottom: 8 }}>Welcome Back</Title>
              <Text type="secondary" style={{ color: '#94A3B8' }}>Enter your username and password</Text>
            </div>

            <Form.Item
              name="username"
              rules={[{ required: true, message: 'Please enter your username' }]}
            >
              <Input
                prefix={<UserOutlined style={{ color: '#64748B' }} />}
                placeholder="Username"
                className="login-input"
                autoFocus
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
                  marginTop: 8
                }}
              >
                Continue
              </Button>
            </Form.Item>


          </Form>
        )}

        {/* Step 2: OTP Verification */}
        {step === 1 && (
          <Form
            name="login-step2"
            onFinish={handleLoginStep2}
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
              <Title level={4} style={{ color: '#fff', marginBottom: 8 }}>Two-Factor Auth</Title>
              <Text type="secondary" style={{ color: '#94A3B8' }}>Enter the code sent to <br /><span style={{ color: '#00B4D8' }}>{emailMask}</span></Text>
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
                  height: 56,
                  color: '#fff'
                }}
                maxLength={6}
                autoFocus
                prefix={<SafetyCertificateOutlined style={{ color: '#64748B' }} />}
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
                Verify & Login
              </Button>
            </Form.Item>

            <div style={{ textAlign: 'center', marginTop: 16 }}>
              <Button
                type="link"
                icon={<ArrowLeftOutlined />}
                onClick={handleBack}
                style={{ color: '#94A3B8' }}
              >
                Back to Login
              </Button>
            </div>
          </Form>
        )}

        {/* Footer */}
        <div className="login-footer" style={{ marginTop: 32, textAlign: 'center' }}>
          <Text type="secondary" style={{ fontSize: 12, color: '#64748B' }}>
            © 2024 HawkNine. Secure User Portal.
          </Text>
        </div>
      </Card>
    </div>
  );
}

export default Login;
