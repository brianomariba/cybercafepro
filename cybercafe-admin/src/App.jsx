import { useState, useEffect } from 'react';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';

dayjs.extend(relativeTime);
import { ConfigProvider, Layout, Menu, Badge, Avatar, Dropdown, Space, Typography, Button, Input, Tooltip, message, Switch, Spin } from 'antd';
import {
  DashboardOutlined,
  DesktopOutlined,
  PrinterOutlined,
  DollarOutlined,
  UserOutlined,
  SettingOutlined,
  BellOutlined,
  SearchOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  LogoutOutlined,
  TeamOutlined,
  WifiOutlined,
  ThunderboltOutlined,
  HistoryOutlined,
  SafetyOutlined,
  FileTextOutlined,
  PieChartOutlined,
  BarChartOutlined,
  ClockCircleOutlined,
  GlobalOutlined,
  SunOutlined,
  MoonOutlined,
  FileOutlined,
  FolderOutlined,
  OrderedListOutlined,
  DownloadOutlined,
  ReadOutlined,
  CompassOutlined,
} from '@ant-design/icons';

import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Computers from './pages/Computers';
import PrintManager from './pages/PrintManager';
import Finance from './pages/Finance';
import Users from './pages/Users';
import Sessions from './pages/Sessions';
import Reports from './pages/Reports';
import Settings from './pages/Settings';
import BrowserHistory from './pages/BrowserHistory';
import Documents from './pages/Documents';
import Tasks from './pages/Tasks';
import Templates from './pages/Templates';
import Learning from './pages/Learning';
import Guidance from './pages/Guidance';
import { verifyAdminToken, adminLogout, isAuthenticated as checkAuth, getStoredToken, getStats } from './services/api';

import './App.css';

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

// Menu items
const menuItems = [
  {
    key: 'dashboard',
    icon: <DashboardOutlined />,
    label: 'Dashboard',
  },
  {
    key: 'computers',
    icon: <DesktopOutlined />,
    label: 'Computers',
  },
  {
    key: 'sessions',
    icon: <ClockCircleOutlined />,
    label: 'Sessions',
  },
  {
    key: 'browser-history',
    icon: <GlobalOutlined />,
    label: 'Browser History',
  },
  {
    key: 'print-manager',
    icon: <PrinterOutlined />,
    label: 'Print Manager',
  },
  {
    key: 'finance',
    icon: <DollarOutlined />,
    label: 'Finance',
  },
  {
    key: 'users',
    icon: <TeamOutlined />,
    label: 'Users',
  },
  {
    key: 'tasks',
    icon: <OrderedListOutlined />,
    label: 'Tasks',
  },
  {
    key: 'documents',
    icon: <FolderOutlined />,
    label: 'Documents',
  },
  {
    key: 'content',
    icon: <FileTextOutlined />,
    label: 'Content',
    children: [
      { key: 'admin-templates', icon: <FileOutlined />, label: 'Templates' },
      { key: 'admin-learning', icon: <ReadOutlined />, label: 'Learning' },
      { key: 'admin-guidance', icon: <CompassOutlined />, label: 'Guidance' },
    ]
  },
  {
    key: 'reports',
    icon: <BarChartOutlined />,
    label: 'Reports',
  },
  {
    type: 'divider',
  },
  {
    key: 'settings',
    icon: <SettingOutlined />,
    label: 'Settings',
  },
];

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [user, setUser] = useState(null);
  const [collapsed, setCollapsed] = useState(window.innerWidth < 768);
  const [selectedKey, setSelectedKey] = useState(localStorage.getItem('hawknine_selected_key') || 'dashboard');
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

  // Check for saved session and theme on mount, verify token is still valid
  useEffect(() => {
    const checkSession = async () => {
      const savedUser = localStorage.getItem('cybercafe_user');
      const hasToken = checkAuth();

      if (savedUser && hasToken) {
        // Verify the token is still valid
        try {
          const isValid = await verifyAdminToken();
          if (isValid) {
            setUser(JSON.parse(savedUser));
            setIsAuthenticated(true);
          } else {
            // Token expired, clear session
            localStorage.removeItem('cybercafe_user');
          }
        } catch (error) {
          console.error('Token verification failed:', error);
          // If server is unreachable but we have a token, allow offline access
          if (error.code === 'ECONNREFUSED' || error.message?.includes('Network')) {
            setUser(JSON.parse(savedUser));
            setIsAuthenticated(true);
          } else {
            localStorage.removeItem('cybercafe_user');
          }
        }
      }
      setIsInitialLoading(false);
    };

    checkSession();

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

  // Persist selected key
  useEffect(() => {
    localStorage.setItem('hawknine_selected_key', selectedKey);
  }, [selectedKey]);

  const handleLogin = (userData) => {
    setUser(userData);
    setIsAuthenticated(true);
    localStorage.setItem('cybercafe_user', JSON.stringify(userData));
  };

  const handleLogout = async () => {
    try {
      await adminLogout(); // Call API to invalidate token
    } catch (e) {
      // Ignore logout errors
    }
    setUser(null);
    setIsAuthenticated(false);
    localStorage.removeItem('cybercafe_user');
    setSelectedKey('dashboard'); // Reset to dashboard
    message.success('Logged out successfully');
  };

  const handleMenuClick = (e) => {
    setSelectedKey(e.key);
    // Auto-collapse sidebar on mobile after selecting menu item
    if (isMobile) {
      setCollapsed(true);
    }
  };

  const [systemStats, setSystemStats] = useState({ online: 0, active: 0 });
  const [notifications, setNotifications] = useState([]);

  // Fetch system stats for sidebar
  const updateSystemStatus = async () => {
    try {
      const stats = await getStats();
      if (stats && stats.computers) {
        setSystemStats({
          online: stats.computers.online || 0,
          active: stats.computers.activeSessions || 0
        });
      }
    } catch (error) {
      console.error('Failed to fetch system stats:', error);
    }
  };

  useEffect(() => {
    if (isAuthenticated) {
      updateSystemStatus();
      const interval = setInterval(updateSystemStatus, 30000);
      return () => clearInterval(interval);
    }
  }, [isAuthenticated]);

  const toggleTheme = () => {
    setIsDarkMode(!isDarkMode);
    message.success(`Switched to ${!isDarkMode ? 'dark' : 'light'} mode`);
  };

  // Notification dropdown items
  const notificationItems = notifications.length > 0 ? notifications.map(n => ({
    key: n.id,
    label: (
      <div style={{ maxWidth: 280 }}>
        <Text strong style={{ color: isDarkMode ? '#fff' : '#1e293b' }}>{n.title}</Text>
        <br />
        <Text type="secondary" style={{ fontSize: 12 }}>{n.message}</Text>
        <br />
        <Text type="secondary" style={{ fontSize: 11 }}>{dayjs(n.timestamp).fromNow()}</Text>
      </div>
    ),
  })).concat([
    { type: 'divider' },
    { key: 'view-all', label: <Text style={{ color: '#00B4D8' }}>View all notifications</Text> }
  ]) : [
    { key: 'none', label: <Text type="secondary">No new notifications</Text> }
  ];

  // User dropdown items
  const userMenuItems = [
    {
      key: 'profile',
      icon: <UserOutlined />,
      label: 'Profile',
    },
    {
      key: 'settings',
      icon: <SettingOutlined />,
      label: 'Settings',
      onClick: () => setSelectedKey('settings'),
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
        return <Dashboard isDarkMode={isDarkMode} />;
      case 'computers':
        return <Computers />;
      case 'sessions':
        return <Sessions />;
      case 'browser-history':
        return <BrowserHistory />;
      case 'print-manager':
        return <PrintManager />;
      case 'finance':
        return <Finance />;
      case 'users':
        return <Users />;
      case 'tasks':
        return <Tasks />;
      case 'documents':
        return <Documents />;
      case 'admin-templates':
        return <Templates />;
      case 'admin-learning':
        return <Learning />;
      case 'admin-guidance':
        return <Guidance />;
      case 'reports':
        return <Reports />;
      case 'settings':
        return <Settings />;
      default:
        return <Dashboard isDarkMode={isDarkMode} />;
    }
  };

  // Show loading screen while checking session
  if (isInitialLoading) {
    return (
      <div style={{
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        background: '#011627',
        color: '#00B4D8'
      }}>
        <Spin size="large" />
        <div style={{ marginTop: 16, fontSize: 18, fontWeight: 600, letterSpacing: 1 }}>HAWKNINE</div>
      </div>
    );
  }

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
                src="/logo.png"
                alt="HawkNine"
                className="logo-image"
                onError={(e) => {
                  e.target.style.display = 'none';
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

          {/* Status Card */}
          {!collapsed && (
            <div className="sidebar-status">
              <div className={`status-card ${isDarkMode ? '' : 'status-card-light'}`}>
                <div className="status-header">
                  <WifiOutlined style={{ color: '#00C853' }} />
                  <span>System Status</span>
                </div>
                <div className="status-item">
                  <span className="status-dot online"></span>
                  <span>All systems operational</span>
                </div>
                <div className="status-info">
                  <span>{systemStats.online} PCs Online • {systemStats.active} Active Sessions</span>
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
                placeholder="Search computers, users, transactions..."
                prefix={<SearchOutlined style={{ color: isDarkMode ? '#64748B' : '#94a3b8' }} />}
                className={`search-input ${isDarkMode ? '' : 'search-input-light'}`}
              />
            </div>

            <div className="header-right">
              {/* Download Agent Button */}
              <Tooltip title="Download Desktop Agent Installer">
                <Button
                  type="primary"
                  icon={<DownloadOutlined />}
                  onClick={() => window.open(`${import.meta.env.VITE_API_URL || 'https://api.hawkninegroup.com/api/v1'}/admin/download-agent`, '_blank')}
                  className="header-btn"
                  style={{
                    background: 'rgba(0, 180, 216, 0.1)',
                    color: '#00B4D8',
                    border: '1px solid rgba(0, 180, 216, 0.3)',
                    marginRight: 8
                  }}
                >
                  {!isMobile && "Get Agent"}
                </Button>
              </Tooltip>

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

              {/* Network Status */}
              <Tooltip title="Network: Online">
                <div className={`network-status ${isDarkMode ? '' : 'network-status-light'}`}>
                  <GlobalOutlined style={{ color: '#00C853' }} />
                </div>
              </Tooltip>

              {/* Notifications */}
              <Dropdown
                menu={{ items: notificationItems }}
                placement="bottomRight"
                trigger={['click']}
              >
                <Badge count={4} size="small" offset={[-3, 3]}>
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
                    src={user?.avatar || "https://api.dicebear.com/7.x/avataaars/svg?seed=admin"}
                    style={{ border: '2px solid #00B4D8' }}
                  />
                  <div className="user-details">
                    <Text strong style={{ color: isDarkMode ? '#fff' : '#1e293b', display: 'block', lineHeight: 1.2 }}>
                      {user?.name || 'Admin User'}
                    </Text>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      {user?.role || 'Super Admin'}
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
