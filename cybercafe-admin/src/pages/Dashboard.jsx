import { useState, useEffect } from 'react';
import { Row, Col, Card, Typography, Spin, message } from 'antd';
import { CalendarOutlined, DownOutlined, DesktopOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { getStats, connectSocket } from '../services/api';
import { Column } from '@ant-design/charts';
import './DashboardRef.css';

const { Text } = Typography;

function Dashboard() {
    const [loading, setLoading] = useState(true);
    const [connected, setConnected] = useState(false);
    const [stats, setStats] = useState({ shops: [] });
    const [activeTab, setActiveTab] = useState('Today');

    useEffect(() => {
        const fetchData = async () => {
            setLoading(true);
            try {
                const s = await getStats().catch(() => null);
                if (s) setStats(s);
            } catch (error) {
                console.error('Failed to fetch dashboard data:', error);
            }
            setLoading(false);
        };

        fetchData();

        const socket = connectSocket({
            onConnect: () => setConnected(true),
            onDisconnect: () => setConnected(false),
            onComputerUpdate: (data) => {
                fetchData(); // Quick refresh on PC change
            }
        });

        const interval = setInterval(fetchData, 30000);
        return () => {
            clearInterval(interval);
            if (socket) socket.disconnect();
        };
    }, []);

    const formatCurrency = (val) => `KSH ${(val || 0).toLocaleString()}`;

    const trafficConfig = (color, data) => ({
        data,
        xField: 'type',
        yField: 'value',
        color,
        columnWidthRatio: 0.6,
        xAxis: { label: { style: { fill: '#9ca3af', fontSize: 10 } }, grid: null, line: null },
        yAxis: { label: { style: { fill: '#9ca3af', fontSize: 10 } }, grid: { line: { style: { stroke: 'rgba(255,255,255,0.05)' } } } },
        label: {
            position: 'top',
            style: { fill: '#ffffff', opacity: 0.8, fontSize: 10 },
        },
        tooltip: false,
        height: 200,
        appendPadding: [10, 0, 0, 0]
    });

    const getRankBadge = (rank) => {
        if (rank === 1) return <div className="ref-rank-badge gold">1</div>;
        if (rank === 2) return <div className="ref-rank-badge silver">2</div>;
        if (rank === 3) return <div className="ref-rank-badge bronze">3</div>;
        return <div style={{width: 20, textAlign: 'center', fontSize: 12, color: '#9ca3af'}}>{rank}</div>;
    };

    const getPanelClass = (index) => {
        const classes = ['ref-panel-blue', 'ref-panel-green', 'ref-panel-purple'];
        return classes[index % classes.length];
    };

    const getColorStr = (index) => {
        const colors = ['blue', 'green', 'purple'];
        return colors[index % colors.length];
    };

    const getHexColor = (index) => {
        const colors = ['#3b82f6', '#22c55e', '#a855f7'];
        return colors[index % colors.length];
    };

    // Find the shop with the highest revenue today
    let topShop = { name: 'N/A', total: 0 };
    let totalOnline = 0;
    let totalComputers = 0;
    if (stats.shops && stats.shops.length > 0) {
        topShop = stats.shops.reduce((prev, current) => (prev.revenue.total > current.revenue.total) ? prev : current, stats.shops[0]);
        topShop = { name: topShop.name, total: topShop.revenue.total };
        
        stats.shops.forEach(s => {
            totalOnline += s.computers.online;
            totalComputers += s.computers.total;
        });
    }

    return (
        <div className="dashboard-ref-container">
            {/* Header */}
            <div className="ref-header">
                <div className="ref-title">
                    <h1>Dashboard Overview</h1>
                    <p>Real-time overview of your cyber cafes</p>
                </div>
                <div className="ref-header-actions">
                    <div className="ref-date-picker">
                        <CalendarOutlined style={{ color: '#9ca3af' }} />
                        <span>{dayjs().format('MMM DD, YYYY')}</span>
                    </div>
                    <div className="ref-user-profile">
                        <img src="https://api.dicebear.com/7.x/avataaars/svg?seed=Admin" alt="User" style={{width: 32, height: 32, borderRadius: '50%'}} />
                        <div style={{display: 'flex', flexDirection: 'column'}}>
                            <span style={{fontSize: 13, fontWeight: 600}}>Admin</span>
                            <span style={{fontSize: 11, color: '#9ca3af'}}>Super Admin <DownOutlined style={{fontSize: 10}}/></span>
                        </div>
                    </div>
                </div>
            </div>

            <Spin spinning={loading}>
                {/* Top Row Grid (3 cards) */}
                <div className="ref-grid" style={{ gridTemplateColumns: 'repeat(12, 1fr)' }}>
                    
                    {/* Card 1: Total Revenue */}
                    <div className="ref-card" style={{ gridColumn: 'span 4' }}>
                        <div className="ref-card-header">
                            <div className="ref-badge">1</div>
                            <div>
                                <div className="ref-card-title">TOTAL REVENUE TODAY</div>
                                <span className="ref-card-subtitle">Users listed with their revenue</span>
                            </div>
                        </div>
                        <div className="ref-panels">
                            {stats.shops.map((shop, i) => (
                                <div key={shop.name} className={`ref-panel ${getPanelClass(i)}`}>
                                    <div className="ref-panel-title">{shop.name.toUpperCase()}</div>
                                    <div className="ref-revenue-val">{formatCurrency(shop.revenue.total)}</div>
                                    <div style={{display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#9ca3af', marginBottom: 8, borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: 4}}>
                                        <span>User</span><span>Revenue</span>
                                    </div>
                                    {shop.allAgents.slice(0, 5).map((u, j) => (
                                        <div key={j} className="ref-list-item">
                                            <span>{u.name}</span>
                                            <span style={{color: '#9ca3af'}}>{formatCurrency(u.rev)}</span>
                                        </div>
                                    ))}
                                    {shop.allAgents.length > 5 && <span className="ref-list-link">View all users &gt;</span>}
                                </div>
                            ))}
                        </div>
                        <div className="ref-footer-bar">
                            <div className="ref-footer-title">
                                <div style={{width: 20, height: 20, background: '#eab308', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center'}}><i className="fas fa-trophy" style={{fontSize: 10, color: 'white'}}></i></div>
                                <div>
                                    <div style={{fontSize: 10, color: '#eab308'}}>TOP REVENUE SHOP TODAY</div>
                                    <div>{topShop.name}</div>
                                </div>
                            </div>
                            <div className="ref-footer-val">{formatCurrency(topShop.total)}</div>
                        </div>
                    </div>

                    {/* Card 2: Online Computers */}
                    <div className="ref-card" style={{ gridColumn: 'span 4' }}>
                        <div className="ref-card-header">
                            <div className="ref-badge">2</div>
                            <div>
                                <div className="ref-card-title">ONLINE COMPUTERS</div>
                                <span className="ref-card-subtitle">Live status per shop</span>
                            </div>
                        </div>
                        <div className="ref-panels" style={{ flexDirection: 'column' }}>
                            {stats.shops.map((shop, i) => (
                                <div key={shop.name} className={`ref-panel ${getPanelClass(i)}`} style={{ flex: 'unset' }}>
                                    <div className="ref-stat-header">
                                        <div className="ref-panel-title" style={{margin: 0}}>{shop.name.toUpperCase()}</div>
                                        <div className="ref-online-count"><strong>{shop.computers.online} Online</strong><br/>out of {shop.computers.total}</div>
                                    </div>
                                    <div className="ref-pc-grid" style={{ gridTemplateColumns: `repeat(${Math.max(3, Math.min(5, shop.computers.total))}, 1fr)` }}>
                                        {shop.computers.list.map(pc => (
                                            <div key={pc.clientId} className="ref-pc-item">
                                                <div className={`ref-pc-icon ${pc.isOnline ? 'online' : ''}`}><DesktopOutlined /></div>
                                                <div className="ref-pc-label">{pc.hostname || pc.clientId}</div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 'auto', paddingTop: 16 }}>
                            <span style={{ color: '#22c55e', fontSize: 13, fontWeight: 600 }}>Total Online</span>
                            <span style={{ color: '#22c55e', fontSize: 16, fontWeight: 'bold' }}>{totalOnline} <span style={{color: '#9ca3af', fontSize: 12}}>/ {totalComputers}</span></span>
                        </div>
                    </div>

                    {/* Card 3: Top Performing Agent */}
                    <div className="ref-card" style={{ gridColumn: 'span 4' }}>
                        <div className="ref-card-header">
                            <div className="ref-badge">3</div>
                            <div>
                                <div className="ref-card-title">TOP PERFORMING AGENT TODAY</div>
                                <span className="ref-card-subtitle">Ranked by revenue</span>
                            </div>
                        </div>
                        <div className="ref-panels">
                            {stats.shops.map((shop, i) => (
                                <div key={shop.name} className={`ref-panel ${getPanelClass(i)}`}>
                                    <div className="ref-panel-title">{shop.name.toUpperCase()}</div>
                                    <div style={{flex: 1, display: 'flex', flexDirection: 'column', gap: 12, marginTop: 12}}>
                                        {shop.topAgents.map(a => (
                                            <div key={a.rank} style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                                                <div style={{display: 'flex', alignItems: 'center', gap: 12}}>
                                                    {getRankBadge(a.rank)}
                                                    <span style={{fontSize: 13, color: '#d1d5db'}}>{a.name}</span>
                                                </div>
                                                <span style={{fontSize: 12, color: '#9ca3af'}}>{formatCurrency(a.rev)}</span>
                                            </div>
                                        ))}
                                    </div>
                                    {shop.allAgents.length > 5 && <span className="ref-list-link">View all agents &gt;</span>}
                                </div>
                            ))}
                        </div>
                    </div>

                </div>

                {/* Bottom Row Grid (2 cards) */}
                <div className="ref-grid" style={{ gridTemplateColumns: 'repeat(12, 1fr)' }}>
                    
                    {/* Card 4: Service Analytics */}
                    <div className="ref-card" style={{ gridColumn: 'span 8' }}>
                        <div className="ref-card-header" style={{ justifyContent: 'space-between' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                <div className="ref-badge">4</div>
                                <div className="ref-card-title">SERVICE ANALYTICS (REVENUE)</div>
                            </div>
                            <div className="ref-toggle-group">
                                <div className={`ref-toggle-btn ${activeTab === 'Today' ? 'active' : ''}`} onClick={() => setActiveTab('Today')}>Today</div>
                                <div className={`ref-toggle-btn ${activeTab === 'Weekly' ? 'active' : ''}`} onClick={() => setActiveTab('Weekly')}>Weekly</div>
                                <div className={`ref-toggle-btn ${activeTab === 'Monthly' ? 'active' : ''}`} onClick={() => setActiveTab('Monthly')}>Monthly</div>
                            </div>
                        </div>
                        
                        {stats.shops.map((shop, i) => (
                            <div key={shop.name} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16, marginTop: i > 0 ? 16 : 0 }}>
                                <div className={`ref-panel ${getPanelClass(i)}`} style={{ flexDirection: 'column' }}>
                                    <div className="ref-panel-title" style={{color: '#d1d5db'}}>{shop.name.toUpperCase()} - TODAY'S REVENUE BY SERVICE</div>
                                    <Column {...trafficConfig(getHexColor(i), [
                                        { type: 'Internet Sessions', value: shop.revenue.sessions },
                                        { type: 'Printing', value: shop.revenue.printing }
                                    ])} />
                                </div>
                                <div className={`ref-panel ${getPanelClass(i)}`} style={{ justifyContent: 'center' }}>
                                    <div className="ref-panel-title">{shop.name.toUpperCase()} INSIGHTS</div>
                                    <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 12 }}>Top Service</div>
                                    <div style={{ fontSize: 14, fontWeight: 'bold', color: '#ffffff' }}>
                                        {shop.revenue.sessions > shop.revenue.printing ? 'Internet Sessions' : 'Printing'}
                                    </div>
                                    <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 12 }}>Sessions Revenue</div>
                                    <div style={{ fontSize: 14, fontWeight: 'bold', color: '#ffffff' }}>{formatCurrency(shop.revenue.sessions)}</div>
                                    <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 12 }}>Printing Revenue</div>
                                    <div style={{ fontSize: 14, fontWeight: 'bold', color: '#ffffff' }}>{formatCurrency(shop.revenue.printing)}</div>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Card 5: Most Used Service (Percentage Breakdown) */}
                    <div className="ref-card" style={{ gridColumn: 'span 4' }}>
                        <div className="ref-card-header">
                            <div className="ref-badge">5</div>
                            <div className="ref-card-title">MOST USED SERVICE TODAY</div>
                        </div>
                        <div className="ref-panels">
                            {stats.shops.map((shop, i) => {
                                const total = shop.revenue.sessions + shop.revenue.printing || 1; // avoid / 0
                                const sessionPct = Math.round((shop.revenue.sessions / total) * 100);
                                const printPct = Math.round((shop.revenue.printing / total) * 100);
                                
                                return (
                                    <div key={shop.name} className={`ref-panel ${getPanelClass(i)}`} style={{ gap: 16 }}>
                                        <div className="ref-panel-title">{shop.name.toUpperCase()}</div>
                                        {[
                                            { label: 'Internet Sessions', val: sessionPct },
                                            { label: 'Printing', val: printPct }
                                        ].map(s => (
                                            <div key={s.label} className="ref-service-row">
                                                <div className="ref-service-labels">
                                                    <span>{s.label}</span>
                                                    <span>{s.val}%</span>
                                                </div>
                                                <div className="ref-service-bar-bg">
                                                    <div className={`ref-service-bar-fill ${getColorStr(i)}`} style={{ width: `${s.val}%` }}></div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                </div>
            </Spin>
        </div>
    );
}

export default Dashboard;
