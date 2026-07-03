import { useState, useEffect } from 'react';
import { Row, Col, Card, Typography, Spin, message } from 'antd';
import { CalendarOutlined, DownOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { getComputers, getStats, connectSocket } from '../services/api';
import { Column } from '@ant-design/charts';
import './DashboardRef.css';

const { Text } = Typography;

function Dashboard() {
    const [loading, setLoading] = useState(true);
    const [connected, setConnected] = useState(false);
    const [computers, setComputers] = useState([]);
    const [activeTab, setActiveTab] = useState('Today');

    useEffect(() => {
        const fetchData = async () => {
            setLoading(true);
            try {
                const comp = await getComputers().catch(() => []);
                setComputers(comp || []);
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
                setComputers(prev => {
                    const existing = prev.find(c => c.clientId === data.clientId);
                    if (existing) {
                        return prev.map(c => c.clientId === data.clientId ? { ...c, ...data } : c);
                    }
                    return [...prev, data];
                });
            }
        });

        const interval = setInterval(fetchData, 30000);
        return () => {
            clearInterval(interval);
            if (socket) socket.disconnect();
        };
    }, []);

    // Mock Data for exact reference match
    const revenueData = {
        main: { total: 28450, users: [{name: 'James', rev: 9650}, {name: 'Peter', rev: 7850}, {name: 'Collins', rev: 6420}, {name: 'Brian', rev: 3850}, {name: 'Samuel', rev: 720}] },
        endgame: { total: 16230, users: [{name: 'James', rev: 6250}, {name: 'Peter', rev: 4820}, {name: 'Collins', rev: 3650}, {name: 'Brian', rev: 1280}, {name: 'Samuel', rev: 230}] }
    };

    const topAgents = {
        main: [{name: 'James', rev: 9650, rank: 1}, {name: 'Peter', rev: 7850, rank: 2}, {name: 'Collins', rev: 6420, rank: 3}, {name: 'Brian', rev: 3850, rank: 4}, {name: 'Samuel', rev: 720, rank: 5}],
        endgame: [{name: 'James', rev: 6250, rank: 1}, {name: 'Peter', rev: 4820, rank: 2}, {name: 'Collins', rev: 3650, rank: 3}, {name: 'Brian', rev: 1280, rank: 4}, {name: 'Samuel', rev: 230, rank: 5}]
    };

    const formatCurrency = (val) => `KSH ${val.toLocaleString()}`;

    const trafficConfig = (color, data) => ({
        data,
        xField: 'time',
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

    const trafficDataMain = [
        { time: '6AM', value: 5 }, { time: '7AM', value: 8 }, { time: '8AM', value: 12 }, { time: '9AM', value: 25 },
        { time: '10AM', value: 35 }, { time: '11AM', value: 42 }, { time: '12PM', value: 38 }, { time: '1PM', value: 30 },
        { time: '2PM', value: 22 }, { time: '3PM', value: 18 }, { time: '4PM', value: 10 }, { time: '5PM', value: 6 }, { time: '6PM', value: 4 }
    ];

    const trafficDataEndgame = [
        { time: '6AM', value: 3 }, { time: '7AM', value: 6 }, { time: '8AM', value: 9 }, { time: '9AM', value: 15 },
        { time: '10AM', value: 22 }, { time: '11AM', value: 28 }, { time: '12PM', value: 25 }, { time: '1PM', value: 20 },
        { time: '2PM', value: 15 }, { time: '3PM', value: 10 }, { time: '4PM', value: 6 }, { time: '5PM', value: 4 }, { time: '6PM', value: 2 }
    ];

    const getRankBadge = (rank) => {
        if (rank === 1) return <div className="ref-rank-badge gold">1</div>;
        if (rank === 2) return <div className="ref-rank-badge silver">2</div>;
        if (rank === 3) return <div className="ref-rank-badge bronze">3</div>;
        return <div style={{width: 20, textAlign: 'center', fontSize: 12, color: '#9ca3af'}}>{rank}</div>;
    };

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
                        <span>May 27, 2025</span>
                    </div>
                    <div className="ref-user-profile">
                        <img src="https://api.dicebear.com/7.x/avataaars/svg?seed=Jose" alt="User" style={{width: 32, height: 32, borderRadius: '50%'}} />
                        <div style={{display: 'flex', flexDirection: 'column'}}>
                            <span style={{fontSize: 13, fontWeight: 600}}>Jose</span>
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
                            <div className="ref-panel ref-panel-blue">
                                <div className="ref-panel-title">MAIN SHOP</div>
                                <div className="ref-revenue-val">{formatCurrency(revenueData.main.total)}</div>
                                <div style={{display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#9ca3af', marginBottom: 8, borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: 4}}>
                                    <span>User</span><span>Revenue</span>
                                </div>
                                {revenueData.main.users.map((u, i) => (
                                    <div key={i} className="ref-list-item">
                                        <span>{u.name}</span>
                                        <span style={{color: '#9ca3af'}}>{formatCurrency(u.rev)}</span>
                                    </div>
                                ))}
                                <span className="ref-list-link">View all users &gt;</span>
                            </div>
                            <div className="ref-panel ref-panel-green">
                                <div className="ref-panel-title">ENDGAME SHOP</div>
                                <div className="ref-revenue-val">{formatCurrency(revenueData.endgame.total)}</div>
                                <div style={{display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#9ca3af', marginBottom: 8, borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: 4}}>
                                    <span>User</span><span>Revenue</span>
                                </div>
                                {revenueData.endgame.users.map((u, i) => (
                                    <div key={i} className="ref-list-item">
                                        <span>{u.name}</span>
                                        <span style={{color: '#9ca3af'}}>{formatCurrency(u.rev)}</span>
                                    </div>
                                ))}
                                <span className="ref-list-link">View all users &gt;</span>
                            </div>
                        </div>
                        <div className="ref-footer-bar">
                            <div className="ref-footer-title">
                                <div style={{width: 20, height: 20, background: '#eab308', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center'}}><i className="fas fa-trophy" style={{fontSize: 10, color: 'white'}}></i></div>
                                <div>
                                    <div style={{fontSize: 10, color: '#eab308'}}>TOP REVENUE SHOP TODAY</div>
                                    <div>Main Shop</div>
                                </div>
                            </div>
                            <div className="ref-footer-val">{formatCurrency(revenueData.main.total)}</div>
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
                            <div className="ref-panel ref-panel-blue" style={{ flex: 'unset' }}>
                                <div className="ref-stat-header">
                                    <div className="ref-panel-title" style={{margin: 0}}>MAIN SHOP</div>
                                    <div className="ref-online-count"><strong>4 Online</strong><br/>out of 5</div>
                                </div>
                                <div className="ref-pc-grid">
                                    {['PC01', 'PC02', 'PC03', 'PC04'].map(pc => (
                                        <div key={pc} className="ref-pc-item">
                                            <div className="ref-pc-icon online"><DesktopOutlined /></div>
                                            <div className="ref-pc-label">{pc}</div>
                                        </div>
                                    ))}
                                    <div className="ref-pc-item">
                                        <div className="ref-pc-icon"><DesktopOutlined /></div>
                                        <div className="ref-pc-label">PC05</div>
                                    </div>
                                </div>
                            </div>
                            <div className="ref-panel ref-panel-green" style={{ flex: 'unset' }}>
                                <div className="ref-stat-header">
                                    <div className="ref-panel-title" style={{margin: 0}}>ENDGAME SHOP</div>
                                    <div className="ref-online-count"><strong>1 Online</strong><br/>out of 3</div>
                                </div>
                                <div className="ref-pc-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
                                    <div className="ref-pc-item">
                                        <div className="ref-pc-icon online"><DesktopOutlined /></div>
                                        <div className="ref-pc-label">PC01</div>
                                    </div>
                                    <div className="ref-pc-item">
                                        <div className="ref-pc-icon"><DesktopOutlined /></div>
                                        <div className="ref-pc-label">PC02</div>
                                    </div>
                                    <div className="ref-pc-item">
                                        <div className="ref-pc-icon"><DesktopOutlined /></div>
                                        <div className="ref-pc-label">PC03</div>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 'auto', paddingTop: 16 }}>
                            <span style={{ color: '#22c55e', fontSize: 13, fontWeight: 600 }}>Total Online</span>
                            <span style={{ color: '#22c55e', fontSize: 16, fontWeight: 'bold' }}>5 <span style={{color: '#9ca3af', fontSize: 12}}>/ 8</span></span>
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
                            <div className="ref-panel ref-panel-blue">
                                <div className="ref-panel-title">MAIN SHOP</div>
                                <div style={{flex: 1, display: 'flex', flexDirection: 'column', gap: 12, marginTop: 12}}>
                                    {topAgents.main.map(a => (
                                        <div key={a.rank} style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                                            <div style={{display: 'flex', alignItems: 'center', gap: 12}}>
                                                {getRankBadge(a.rank)}
                                                <span style={{fontSize: 13, color: '#d1d5db'}}>{a.name}</span>
                                            </div>
                                            <span style={{fontSize: 12, color: '#9ca3af'}}>{formatCurrency(a.rev)}</span>
                                        </div>
                                    ))}
                                </div>
                                <span className="ref-list-link">View all agents &gt;</span>
                            </div>
                            <div className="ref-panel ref-panel-green">
                                <div className="ref-panel-title">ENDGAME SHOP</div>
                                <div style={{flex: 1, display: 'flex', flexDirection: 'column', gap: 12, marginTop: 12}}>
                                    {topAgents.endgame.map(a => (
                                        <div key={a.rank} style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                                            <div style={{display: 'flex', alignItems: 'center', gap: 12}}>
                                                {getRankBadge(a.rank)}
                                                <span style={{fontSize: 13, color: '#d1d5db'}}>{a.name}</span>
                                            </div>
                                            <span style={{fontSize: 12, color: '#9ca3af'}}>{formatCurrency(a.rev)}</span>
                                        </div>
                                    ))}
                                </div>
                                <span className="ref-list-link">View all agents &gt;</span>
                            </div>
                        </div>
                    </div>

                </div>

                {/* Bottom Row Grid (2 cards) */}
                <div className="ref-grid" style={{ gridTemplateColumns: 'repeat(12, 1fr)' }}>
                    
                    {/* Card 4: Traffic Analytics */}
                    <div className="ref-card" style={{ gridColumn: 'span 8' }}>
                        <div className="ref-card-header" style={{ justifyContent: 'space-between' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                <div className="ref-badge">4</div>
                                <div className="ref-card-title">TRAFFIC ANALYTICS</div>
                            </div>
                            <div className="ref-toggle-group">
                                <div className={`ref-toggle-btn ${activeTab === 'Today' ? 'active' : ''}`} onClick={() => setActiveTab('Today')}>Today</div>
                                <div className={`ref-toggle-btn ${activeTab === 'Weekly' ? 'active' : ''}`} onClick={() => setActiveTab('Weekly')}>Weekly</div>
                                <div className={`ref-toggle-btn ${activeTab === 'Monthly' ? 'active' : ''}`} onClick={() => setActiveTab('Monthly')}>Monthly</div>
                            </div>
                        </div>
                        
                        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16 }}>
                            <div className="ref-panel ref-panel-blue" style={{ flexDirection: 'column' }}>
                                <div className="ref-panel-title" style={{color: '#d1d5db'}}>MAIN SHOP - TODAY'S TRAFFIC</div>
                                <Column {...trafficConfig('#3b82f6', trafficDataMain)} />
                            </div>
                            <div className="ref-panel ref-panel-blue" style={{ justifyContent: 'center' }}>
                                <div className="ref-panel-title">MAIN SHOP INSIGHTS</div>
                                <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 12 }}>Highest Traffic Day</div>
                                <div style={{ fontSize: 14, fontWeight: 'bold', color: '#ffffff' }}>Saturday</div>
                                <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 12 }}>Highest Traffic Time</div>
                                <div style={{ fontSize: 14, fontWeight: 'bold', color: '#ffffff' }}>11AM - 1PM</div>
                                <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 12 }}>Highest Traffic Month</div>
                                <div style={{ fontSize: 14, fontWeight: 'bold', color: '#ffffff' }}>March 2025</div>
                                <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 12 }}>Peak Time</div>
                                <div style={{ fontSize: 14, fontWeight: 'bold', color: '#ffffff' }}>12PM</div>
                            </div>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16, marginTop: 16 }}>
                            <div className="ref-panel ref-panel-green" style={{ flexDirection: 'column' }}>
                                <div className="ref-panel-title" style={{color: '#d1d5db'}}>ENDGAME SHOP - TODAY'S TRAFFIC</div>
                                <Column {...trafficConfig('#22c55e', trafficDataEndgame)} />
                            </div>
                            <div className="ref-panel ref-panel-green" style={{ justifyContent: 'center' }}>
                                <div className="ref-panel-title">ENDGAME SHOP INSIGHTS</div>
                                <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 12 }}>Highest Traffic Day</div>
                                <div style={{ fontSize: 14, fontWeight: 'bold', color: '#ffffff' }}>Friday</div>
                                <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 12 }}>Highest Traffic Time</div>
                                <div style={{ fontSize: 14, fontWeight: 'bold', color: '#ffffff' }}>11AM - 12PM</div>
                                <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 12 }}>Highest Traffic Month</div>
                                <div style={{ fontSize: 14, fontWeight: 'bold', color: '#ffffff' }}>April 2025</div>
                                <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 12 }}>Peak Time</div>
                                <div style={{ fontSize: 14, fontWeight: 'bold', color: '#ffffff' }}>11AM</div>
                            </div>
                        </div>
                    </div>

                    {/* Card 5: Most Used Service */}
                    <div className="ref-card" style={{ gridColumn: 'span 4' }}>
                        <div className="ref-card-header">
                            <div className="ref-badge">5</div>
                            <div className="ref-card-title">MOST USED SERVICE TODAY</div>
                        </div>
                        <div className="ref-panels">
                            <div className="ref-panel ref-panel-blue" style={{ gap: 16 }}>
                                <div className="ref-panel-title">MAIN SHOP</div>
                                {[
                                    { label: 'Printing', val: 40 },
                                    { label: 'Lamination', val: 15 },
                                    { label: 'Scanning', val: 10 },
                                    { label: 'Photocopy', val: 8 },
                                    { label: 'Passport Photos', val: 7 },
                                    { label: 'Binding', val: 5 },
                                    { label: 'Others', val: 15 },
                                ].map(s => (
                                    <div key={s.label} className="ref-service-row">
                                        <div className="ref-service-labels">
                                            <span>{s.label}</span>
                                            <span>{s.val}%</span>
                                        </div>
                                        <div className="ref-service-bar-bg">
                                            <div className="ref-service-bar-fill blue" style={{ width: `${s.val}%` }}></div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                            <div className="ref-panel ref-panel-green" style={{ gap: 16 }}>
                                <div className="ref-panel-title">ENDGAME SHOP</div>
                                {[
                                    { label: 'Photocopy', val: 45 },
                                    { label: 'Printing', val: 20 },
                                    { label: 'Passport Photos', val: 15 },
                                    { label: 'Scanning', val: 10 },
                                    { label: 'Lamination', val: 5 },
                                    { label: 'Others', val: 5 },
                                ].map(s => (
                                    <div key={s.label} className="ref-service-row">
                                        <div className="ref-service-labels">
                                            <span>{s.label}</span>
                                            <span>{s.val}%</span>
                                        </div>
                                        <div className="ref-service-bar-bg">
                                            <div className="ref-service-bar-fill green" style={{ width: `${s.val}%` }}></div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                </div>
            </Spin>
        </div>
    );
}

export default Dashboard;
