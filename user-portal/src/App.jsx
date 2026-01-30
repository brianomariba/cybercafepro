import { useState, useEffect } from 'react';
import { ConfigProvider, Layout, Menu, Badge, Avatar, Dropdown, Space, Typography, Button, Input, Tooltip, message, Switch } from 'antd';
import {
  DashboardOutlined,
  BookOutlined,
  FileTextOutlined,
  UserOutlined,
  SettingOutlined,
  BellOutlined,
  SearchOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  LogoutOutlined,
  BulbOutlined,
  ClockCircleOutlined,
  GlobalOutlined,
  SunOutlined,
  MoonOutlined,
  HeartOutlined,
  QuestionCircleOutlined,
  DollarOutlined,
} from '@ant-design/icons';

import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Account from './pages/Account';
import Learning from './pages/Learning';
import Templates from './pages/Templates';
import Guidance from './pages/Guidance';
import Services from './pages/Services';

import './index.css';

const { Header, Sider, Content } = Layout;
const { Text } = Typography;

// HawkNine Dark theme configuration
const darkTheme = {
  token: {
    colorPrimary: '#00B4D8',
    colorBgBase: '#011627',
    colorTextBase: '#ffffff',
    borderRadius: 10,
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  },
  components: {
    Layout: {
      siderBg: 'transparent',
      headerBg: 'transparent',
      bodyBg: '#011627',
    },
    Menu: {
      darkItemBg: 'transparent',
      darkSubMenuItemBg: 'transparent',
    },
  },
};

// HawkNine Light theme configuration
const lightTheme = {
  token: {
    colorPrimary: '#00B4D8',
    colorBgBase: '#f8fafc',
    colorTextBase: '#1e293b',
    borderRadius: 10,
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  },
  components: {
    Layout: {
      siderBg: '#ffffff',
      headerBg: '#ffffff',
      bodyBg: '#f1f5f9',
    },
    Menu: {
      itemBg: 'transparent',
      subMenuItemBg: 'transparent',
    },
  },
};

// User Menu items
const menuItems = [
  {
    key: 'dashboard',
    icon: <DashboardOutlined />,
    label: 'Dashboard',
  },
  {
    key: 'services',
    icon: <DollarOutlined />,
    label: 'Services & Pricing',
  },
  {
    key: 'learning',
    icon: <BookOutlined />,
    label: 'Learning Center',
  },
  {
    key: 'templates',
    icon: <FileTextOutlined />,
    label: 'Templates',
  },
  {
    key: 'guidance',
    icon: <BulbOutlined />,
    label: 'Guidance',
  },
  {
    type: 'divider',
  },
  {
    key: 'account',
    icon: <UserOutlined />,
    label: 'My Account',
  },
];

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState(null);
  const [collapsed, setCollapsed] = useState(window.innerWidth < 768);
  const [selectedKey, setSelectedKey] = useState('dashboard');
  const [currentTime, setCurrentTime] = useState(new Date());
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  // Handle window resize for responsive behavior
  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      if (mobile) {
        setCollapsed(true);
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Check for saved session and theme on mount
  useEffect(() => {
    const savedUser = localStorage.getItem('hawknine_user');
    if (savedUser) {
      setUser(JSON.parse(savedUser));
      setIsAuthenticated(true);
    }
    const savedTheme = localStorage.getItem('hawknine_theme');
    if (savedTheme) {
      setIsDarkMode(savedTheme === 'dark');
    }
  }, []);

  // Update time every second
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Apply theme class to body
  useEffect(() => {
    document.body.setAttribute('data-theme', isDarkMode ? 'dark' : 'light');
    localStorage.setItem('hawknine_theme', isDarkMode ? 'dark' : 'light');
  }, [isDarkMode]);

  // Inactivity Timeout (10 minutes)
  useEffect(() => {
    if (!isAuthenticated) return;

    let timeoutId;
    const TIMEOUT_DURATION = 10 * 60 * 1000; // 10 minutes

    const resetTimer = () => {
      if (timeoutId) clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        handleLogout();
        message.warning('Logged out due to inactivity');
      }, TIMEOUT_DURATION);
    };

    // Events to track activity
    const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart'];

    // Set initial timer
    resetTimer();

    // Add listeners
    events.forEach(event => {
      document.addEventListener(event, resetTimer);
    });

    return () => {
      if (timeoutId) clearTimeout(timeoutId);
      events.forEach(event => {
        document.removeEventListener(event, resetTimer);
      });
    };
  }, [isAuthenticated]);

  const handleLogin = (userData) => {
    setUser(userData);
    setIsAuthenticated(true);
    localStorage.setItem('hawknine_user', JSON.stringify(userData));
  };

  const handleUpdateUser = (userData) => {
    setUser(userData);
    localStorage.setItem('hawknine_user', JSON.stringify(userData));
  };

  const handleLogout = () => {
    setUser(null);
    setIsAuthenticated(false);
    localStorage.removeItem('hawknine_user');
    message.success('Logged out successfully');
  };

  const handleMenuClick = (e) => {
    setSelectedKey(e.key);
    // Auto-collapse sidebar on mobile after selecting menu item
    if (isMobile) {
      setCollapsed(true);
    }
  };

  const handleNavigate = (key) => {
    setSelectedKey(key);
  };

  const toggleTheme = () => {
    setIsDarkMode(!isDarkMode);
    message.success(`Switched to ${!isDarkMode ? 'dark' : 'light'} mode`);
  };

  // Notification dropdown items
  const notificationItems = [
    {
      key: '1',
      label: (
        <div style={{ maxWidth: 280 }}>
          <Text strong style={{ color: isDarkMode ? '#fff' : '#1e293b' }}>New guide available!</Text>
          <br />
          <Text type="secondary" style={{ fontSize: 12 }}>"Document Printing Best Practices" is now live</Text>
          <br />
          <Text type="secondary" style={{ fontSize: 11 }}>2 hours ago</Text>
        </div>
      ),
    },
    {
      key: '2',
      label: (
        <div style={{ maxWidth: 280 }}>
          <Text strong style={{ color: isDarkMode ? '#fff' : '#1e293b' }}>New templates added</Text>
          <br />
          <Text type="secondary" style={{ fontSize: 12 }}>Check out 5 new professional templates</Text>
          <br />
          <Text type="secondary" style={{ fontSize: 11 }}>Yesterday</Text>
        </div>
      ),
    },
    {
      key: '3',
      label: (
        <div style={{ maxWidth: 280 }}>
          <Text strong style={{ color: isDarkMode ? '#fff' : '#1e293b' }}>New learning content</Text>
          <br />
          <Text type="secondary" style={{ fontSize: 12 }}>Computer basics course updated</Text>
          <br />
          <Text type="secondary" style={{ fontSize: 11 }}>3 days ago</Text>
        </div>
      ),
    },
    {
      type: 'divider',
    },
    {
      key: 'view-all',
      label: <Text style={{ color: '#00B4D8' }}>View all notifications</Text>,
    },
  ];

  // User dropdown items
  const userMenuItems = [
    {
      key: 'profile',
      icon: <UserOutlined />,
      label: 'My Profile',
      onClick: () => setSelectedKey('account'),
    },
    {
      key: 'help',
      icon: <QuestionCircleOutlined />,
      label: 'Help & Support',
      onClick: () => setSelectedKey('guidance'),
    },
    {
      type: 'divider',
    },
    {
      key: 'logout',
      icon: <LogoutOutlined />,
      label: 'Logout',
      danger: true,
      onClick: handleLogout,
    },
  ];

  // Render content based on selected menu
  const renderContent = () => {
    switch (selectedKey) {
      case 'dashboard':
        return <Dashboard user={user} isDarkMode={isDarkMode} onNavigate={handleNavigate} />;
      case 'account':
        return <Account user={user} isDarkMode={isDarkMode} onUpdateUser={handleUpdateUser} />;
      case 'services':
        return <Services isDarkMode={isDarkMode} />;
      case 'learning':
        return <Learning isDarkMode={isDarkMode} />;
      case 'templates':
        return <Templates isDarkMode={isDarkMode} />;
      case 'guidance':
        return <Guidance isDarkMode={isDarkMode} />;
      default:
        return <Dashboard user={user} isDarkMode={isDarkMode} onNavigate={handleNavigate} />;
    }
  };

  // Show login page if not authenticated
  if (!isAuthenticated) {
    return (
      <ConfigProvider theme={darkTheme}>
        <Login onLogin={handleLogin} />
      </ConfigProvider>
    );
  }

  const currentTheme = isDarkMode ? darkTheme : lightTheme;

  return (
    <ConfigProvider theme={currentTheme}>
      <Layout style={{ minHeight: '100vh' }} className={isDarkMode ? 'theme-dark' : 'theme-light'}>
        {/* Animated Background */}
        {isDarkMode && <div className="animated-bg" />}

        {/* Sidebar */}
        <Sider
          trigger={null}
          collapsible
          collapsed={collapsed}
          width={260}
          collapsedWidth={isMobile ? 0 : 80}
          style={{
            position: 'fixed',
            left: 0,
            top: 0,
            bottom: 0,
            zIndex: 100,
            background: isDarkMode ? 'linear-gradient(180deg, #011627 0%, #023047 50%, #011627 100%)' : '#ffffff',
            borderRight: `1px solid ${isDarkMode ? 'rgba(0, 180, 216, 0.15)' : '#e2e8f0'}`,
          }}
        >
          {/* HawkNine Logo */}
          <div className="logo-container">
            <div className={`logo ${isDarkMode ? '' : 'logo-light'}`}>
              <img
                src="/logo.jpg"
                alt="HawkNine"
                style={{
                  width: 42,
                  height: 42,
                  borderRadius: 10,
                  objectFit: 'cover',
                }}
              />
              {!collapsed && <span className="logo-text">HawkNine</span>}
            </div>
          </div>

          {/* Menu */}
          <Menu
            theme={isDarkMode ? 'dark' : 'light'}
            mode="inline"
            selectedKeys={[selectedKey]}
            items={menuItems}
            onClick={handleMenuClick}
            style={{ marginTop: 16 }}
          />

          {/* Quick Links Card */}
          {!collapsed && (
            <div className="sidebar-status">
              <div className={`status-card ${isDarkMode ? '' : 'status-card-light'}`}>
                <div className="status-header">
                  <BulbOutlined style={{ color: '#00B4D8' }} />
                  <span>Quick Links</span>
                </div>
                <div className="status-item">
                  <span className="status-dot online" />
                  <span>Need help? Check Guidance</span>
                </div>
                <div className="status-info">
                  <span>Browse templates & guides</span>
                </div>
              </div>
            </div>
          )}
        </Sider>

        {/* Mobile Backdrop */}
        {isMobile && !collapsed && (
          <div
            className="mobile-backdrop"
            onClick={() => setCollapsed(true)}
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: 'rgba(0, 0, 0, 0.5)',
              zIndex: 99,
            }}
          />
        )}

        {/* Main Layout */}
        <Layout style={{ marginLeft: isMobile ? 0 : (collapsed ? 80 : 260), transition: 'margin-left 0.25s ease' }}>
          {/* Header */}
          <Header
            className={`main-header ${isDarkMode ? '' : 'header-light'}`}
            style={{
              background: isDarkMode ? 'rgba(1, 22, 39, 0.85)' : '#ffffff',
              borderBottom: `1px solid ${isDarkMode ? 'rgba(0, 180, 216, 0.15)' : '#e2e8f0'}`,
            }}
          >
            <div className="header-left">
              <Button
                type="text"
                icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
                onClick={() => setCollapsed(!collapsed)}
                className="collapse-btn"
                style={{ color: isDarkMode ? '#94A3B8' : '#64748b' }}
              />
              <Input
                placeholder="Search courses, templates, guides..."
                prefix={<SearchOutlined style={{ color: isDarkMode ? '#64748B' : '#94a3b8' }} />}
                className={`search-input ${isDarkMode ? '' : 'search-input-light'}`}
              />
            </div>

            <div className="header-right">
              {/* Theme Toggle */}
              <Tooltip title={isDarkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}>
                <Button
                  type="text"
                  icon={isDarkMode ? <SunOutlined /> : <MoonOutlined />}
                  onClick={toggleTheme}
                  className="header-btn theme-toggle"
                  style={{
                    color: isDarkMode ? '#FFB703' : '#023047',
                    background: isDarkMode ? 'rgba(255, 183, 3, 0.15)' : 'rgba(2, 48, 71, 0.1)',
                  }}
                />
              </Tooltip>

              {/* Live Clock */}
              <div className={`live-clock ${isDarkMode ? '' : 'live-clock-light'}`}>
                <ClockCircleOutlined />
                <span>{currentTime.toLocaleTimeString()}</span>
              </div>

              {/* Notifications */}
              <Dropdown
                menu={{ items: notificationItems }}
                placement="bottomRight"
                trigger={['click']}
              >
                <Badge count={3} size="small" offset={[-3, 3]}>
                  <Button
                    type="text"
                    icon={<BellOutlined />}
                    className={`header-btn ${isDarkMode ? '' : 'header-btn-light'}`}
                  />
                </Badge>
              </Dropdown>

              {/* User Menu */}
              <Dropdown
                menu={{ items: userMenuItems }}
                placement="bottomRight"
                trigger={['click']}
              >
                <Space className={`user-info ${isDarkMode ? '' : 'user-info-light'}`}>
                  <Avatar
                    size={40}
                    src={user?.avatar || "https://api.dicebear.com/7.x/avataaars/svg?seed=user"}
                    style={{ border: '2px solid #00B4D8' }}
                  />
                  <div className="user-details">
                    <Text strong style={{ color: isDarkMode ? '#fff' : '#1e293b', display: 'block', lineHeight: 1.2 }}>
                      {user?.name || 'User'}
                    </Text>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      {user?.email || 'user@hawknine.com'}
                    </Text>
                  </div>
                </Space>
              </Dropdown>
            </div>
          </Header>

          {/* Content */}
          <Content className={`main-content ${isDarkMode ? '' : 'main-content-light'}`}>
            {renderContent()}
          </Content>
        </Layout>
      </Layout>
    </ConfigProvider>
  );
}

export default App;
