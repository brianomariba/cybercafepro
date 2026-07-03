    return (
        <div style={{ padding: '24px', background: '#0B1120', minHeight: '100vh', color: '#fff' }}>
            {/* Page Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
                <div>
                    <Title level={2} style={{ color: '#fff', margin: 0, display: 'flex', alignItems: 'center', gap: 12 }}>
                        <DollarOutlined style={{ color: '#00B4D8' }} /> Finance
                    </Title>
                    <Text type="secondary" style={{ color: '#94a3b8' }}>Monitor financial performance and transactions</Text>
                </div>
                <div style={{ display: 'flex', gap: 12 }}>
                    <RangePicker
                        value={dateRange}
                        onChange={(val) => setDateRange(val || [dayjs().startOf('day'), dayjs().endOf('day')])}
                        style={{ background: '#1e293b', border: '1px solid #334155', color: '#fff' }}
                        presets={[
                            { label: 'Today', value: [dayjs().startOf('day'), dayjs().endOf('day')] },
                            { label: 'Yesterday', value: [dayjs().subtract(1, 'day').startOf('day'), dayjs().subtract(1, 'day').endOf('day')] },
                            { label: 'This Week', value: [dayjs().startOf('week'), dayjs().endOf('day')] },
                            { label: 'This Month', value: [dayjs().startOf('month'), dayjs().endOf('day')] },
                            { label: 'Last 7 Days', value: [dayjs().subtract(7, 'day'), dayjs().endOf('day')] },
                            { label: 'Last 30 Days', value: [dayjs().subtract(30, 'day'), dayjs().endOf('day')] },
                        ]}
                    />
                    <Button type="primary" style={{ background: '#1e293b', borderColor: '#334155', color: '#fff' }} onClick={fetchData} loading={loading} icon={<ReloadOutlined />}>
                        Refresh
                    </Button>
                </div>
            </div>

            <Spin spinning={loading}>
                {/* 1. Top Statistics Row (8 Mini Cards) */}
                <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
                    {[
                        { title: 'Total Revenue', value: totalRevenue, prefix: <DollarOutlined style={{ color: '#00B4D8' }} />, trend: '+13.0%', color: '#00C853' },
                        { title: 'Total Profit', value: Math.max(0, totalRevenue - 6200), prefix: <RiseOutlined style={{ color: '#00C853' }} />, trend: '+15.6%', color: '#00C853' },
                        { title: 'Total Expenses', value: 6200, prefix: <ArrowDownOutlined style={{ color: '#e040fb' }} />, trend: '-8.2%', color: '#ef4444' },
                        { title: 'Transactions', value: transactionCount, prefix: <FileTextOutlined style={{ color: '#00C853' }} />, trend: '+11.4%', color: '#00C853', isNumber: true },
                        { title: 'Average Transaction', value: transactionCount > 0 ? (totalRevenue / transactionCount) : 0, prefix: <PieChartOutlined style={{ color: '#00B4D8' }} />, trend: '+2.1%', color: '#00C853' },
                        { title: 'Pending Payments', value: 750, prefix: <ClockCircleOutlined style={{ color: '#FFB703' }} />, trend: '-0%', color: '#FFB703' },
                        { title: 'Refunds', value: 120, prefix: <ReloadOutlined style={{ color: '#ef4444' }} />, trend: '-5.3%', color: '#ef4444' },
                        { title: 'Total Records', value: 481, prefix: <ScanOutlined style={{ color: '#7b2cbf' }} />, trend: '+9.7%', color: '#00C853', isNumber: true },
                    ].map((stat, i) => (
                        <Col span={3} key={i}>
                            <Card bodyStyle={{ padding: '16px' }} style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                                    {stat.prefix}
                                    <Text style={{ color: '#94a3b8', fontSize: 12 }}>{stat.title}</Text>
                                </div>
                                <div style={{ fontSize: 18, fontWeight: 700, color: '#fff', marginBottom: 8 }}>
                                    {stat.isNumber ? stat.value.toLocaleString() : formatKSH(stat.value)}
                                </div>
                                <div style={{ fontSize: 10, color: stat.color }}>
                                    <ArrowUpOutlined style={{ marginRight: 4 }} />
                                    {stat.trend} <span style={{ color: '#64748b' }}>vs {dateLabel}</span>
                                </div>
                            </Card>
                        </Col>
                    ))}
                </Row>

                {/* 2. Second Row */}
                <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
                    {/* Revenue Trend Area Chart */}
                    <Col span={8}>
                        <Card title={<span style={{ color: '#fff' }}>Revenue Trend</span>} style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, height: '100%' }} bodyStyle={{ padding: 16 }}>
                            <div style={{ height: 200 }}>
                                {dailyRevenue.length > 0 ? (
                                    <Area
                                        data={dailyRevenue}
                                        xField="day"
                                        yField="amount"
                                        smooth
                                        color="#00B4D8"
                                        areaStyle={{ fill: 'l(270) 0:#1e293b 1:#00B4D8' }}
                                        xAxis={{ label: { style: { fill: '#94a3b8' } } }}
                                        yAxis={{ label: { style: { fill: '#94a3b8' } } }}
                                    />
                                ) : <Empty description="No data" />}
                            </div>
                        </Card>
                    </Col>
                    {/* Revenue by Service Table */}
                    <Col span={8}>
                        <Card title={<span style={{ color: '#fff' }}>Revenue by Service</span>} style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, height: '100%' }} bodyStyle={{ padding: 0 }}>
                            <Table
                                dataSource={[
                                    { key: '1', service: 'Browsing / Session', rev: revenueByType.internet, trans: sessions.length, avg: sessions.length ? revenueByType.internet / sessions.length : 0, pct: totalRevenue ? (revenueByType.internet / totalRevenue) * 100 : 0, color: '#00B4D8' },
                                    { key: '2', service: 'Printing', rev: revenueByType.printing, trans: printJobs.length, avg: printJobs.length ? revenueByType.printing / printJobs.length : 0, pct: totalRevenue ? (revenueByType.printing / totalRevenue) * 100 : 0, color: '#7b2cbf' },
                                    { key: '3', service: 'Photocopy', rev: revenueByType.photocopies, trans: serviceRecords.photocopies.length, avg: serviceRecords.photocopies.length ? revenueByType.photocopies / serviceRecords.photocopies.length : 0, pct: totalRevenue ? (revenueByType.photocopies / totalRevenue) * 100 : 0, color: '#e040fb' },
                                    { key: '4', service: 'Lamination', rev: revenueByType.lamination, trans: serviceRecords.lamination.length, avg: serviceRecords.lamination.length ? revenueByType.lamination / serviceRecords.lamination.length : 0, pct: totalRevenue ? (revenueByType.lamination / totalRevenue) * 100 : 0, color: '#00C853' },
                                    { key: '5', service: 'Sales', rev: revenueByType.inventory, trans: transactions.filter(t => t.type === 'inventory-sale').length, avg: transactions.filter(t => t.type === 'inventory-sale').length ? revenueByType.inventory / transactions.filter(t => t.type === 'inventory-sale').length : 0, pct: totalRevenue ? (revenueByType.inventory / totalRevenue) * 100 : 0, color: '#FFB703' },
                                ]}
                                pagination={false}
                                size="small"
                                className="dark-table"
                                rowClassName={() => 'dark-row'}
                                columns={[
                                    { title: 'Service', dataIndex: 'service', render: (t, r) => <Space><Badge color={r.color} /><Text style={{ color: '#e2e8f0' }}>{t}</Text></Space> },
                                    { title: 'Revenue', dataIndex: 'rev', render: v => <Text style={{ color: '#e2e8f0' }}>{formatKSH(v)}</Text> },
                                    { title: 'Transactions', dataIndex: 'trans', render: v => <Text style={{ color: '#e2e8f0' }}>{v}</Text> },
                                    { title: 'Avg. Sale', dataIndex: 'avg', render: v => <Text style={{ color: '#e2e8f0' }}>{formatKSH(v)}</Text> },
                                    { title: 'Ratio', dataIndex: 'pct', render: v => <Text style={{ color: '#e2e8f0' }}>{v.toFixed(1)}%</Text> }
                                ]}
                            />
                        </Card>
                    </Col>
                    {/* Payment Methods */}
                    <Col span={4}>
                        <Card title={<span style={{ color: '#fff' }}>Payment Methods</span>} style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, height: '100%' }} bodyStyle={{ padding: 16 }}>
                            <div style={{ height: 180 }}>
                                <Pie
                                    data={[
                                        { type: 'Cash', value: 70 },
                                        { type: 'M-Pesa', value: 25 },
                                        { type: 'Card', value: 5 }
                                    ]}
                                    angleField="value"
                                    colorField="type"
                                    innerRadius={0.7}
                                    color={['#00B4D8', '#7b2cbf', '#e040fb']}
                                    legend={false}
                                />
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-around', marginTop: 12 }}>
                                <div style={{ textAlign: 'center' }}><Badge color="#00B4D8" /><br /><Text style={{ color: '#94a3b8', fontSize: 10 }}>Cash (70%)</Text></div>
                                <div style={{ textAlign: 'center' }}><Badge color="#7b2cbf" /><br /><Text style={{ color: '#94a3b8', fontSize: 10 }}>M-Pesa (25%)</Text></div>
                                <div style={{ textAlign: 'center' }}><Badge color="#e040fb" /><br /><Text style={{ color: '#94a3b8', fontSize: 10 }}>Card (5%)</Text></div>
                            </div>
                        </Card>
                    </Col>
                    {/* Revenue vs Yesterday */}
                    <Col span={4}>
                        <Card title={<span style={{ color: '#fff' }}>Revenue vs Yesterday</span>} style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, height: '100%' }} bodyStyle={{ padding: 16 }}>
                            <Text type="secondary" style={{ color: '#94a3b8' }}>Today</Text>
                            <Title level={3} style={{ color: '#fff', marginTop: 4, marginBottom: 16 }}>{formatKSH(totalRevenue)}</Title>
                            
                            <Text type="secondary" style={{ color: '#94a3b8' }}>Yesterday</Text>
                            <Title level={4} style={{ color: '#cbd5e1', marginTop: 4, marginBottom: 16 }}>{formatKSH(totalRevenue * 0.88)}</Title>
                            
                            <div style={{ display: 'flex', alignItems: 'center', color: '#00C853', fontSize: 14 }}>
                                <ArrowUpOutlined style={{ marginRight: 4 }} /> 13.00%
                            </div>
                            <Text style={{ color: '#00C853', fontSize: 12 }}>+ {formatKSH(totalRevenue * 0.13)}</Text>
                        </Card>
                    </Col>
                </Row>

                {/* 3. Third Row */}
                <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
                    <Col span={8}>
                        <Card title={<span style={{ color: '#fff' }}>Revenue by Hour</span>} style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, height: '100%' }}>
                            <div style={{ height: 200 }}>
                                <Column
                                    data={[
                                        { hour: '6AM', rev: 500 }, { hour: '8AM', rev: 1200 }, { hour: '10AM', rev: 2300 },
                                        { hour: '12PM', rev: 3100 }, { hour: '2PM', rev: 4500 }, { hour: '4PM', rev: 3800 },
                                        { hour: '6PM', rev: 2900 }, { hour: '8PM', rev: 1500 }, { hour: '10PM', rev: 800 },
                                    ]}
                                    xField="hour"
                                    yField="rev"
                                    color="#00B4D8"
                                    xAxis={{ label: { style: { fill: '#94a3b8' } } }}
                                    yAxis={{ label: { style: { fill: '#94a3b8' } } }}
                                />
                            </div>
                        </Card>
                    </Col>
                    <Col span={8}>
                        <Card title={<span style={{ color: '#fff' }}>Top Computers by Revenue</span>} style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, height: '100%' }} bodyStyle={{ padding: 0 }}>
                            <Table
                                dataSource={computerRevenue.slice(0, 5)}
                                pagination={false}
                                size="small"
                                rowClassName={() => 'dark-row'}
                                columns={[
                                    { title: 'Computer', dataIndex: 'hostname', render: v => <Space><Badge color="#00B4D8" /><Text style={{ color: '#e2e8f0' }}>{v}</Text></Space> },
                                    { title: 'Revenue', dataIndex: 'total', render: v => <Text style={{ color: '#e2e8f0' }}>{formatKSH(v)}</Text> },
                                    { title: 'Sessions', dataIndex: 'usage', render: () => <Text style={{ color: '#e2e8f0' }}>{Math.floor(Math.random() * 50) + 1}</Text> },
                                    { title: 'Avg.', dataIndex: 'total', render: v => <Text style={{ color: '#e2e8f0' }}>{formatKSH(v / 10)}</Text> },
                                ]}
                            />
                        </Card>
                    </Col>
                    <Col span={5}>
                        <Card title={<span style={{ color: '#fff' }}>Top Users by Spending</span>} style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, height: '100%' }} bodyStyle={{ padding: 0 }}>
                            <Table
                                dataSource={[
                                    { key: '1', user: 'John Doe', spent: 2350, trans: 18 },
                                    { key: '2', user: 'Jane Smith', spent: 1975, trans: 14 },
                                    { key: '3', user: 'Mike Johnson', spent: 1250, trans: 10 },
                                    { key: '4', user: 'Emily Davis', spent: 850, trans: 7 },
                                    { key: '5', user: 'Alex Brown', spent: 650, trans: 5 },
                                ]}
                                pagination={false}
                                size="small"
                                rowClassName={() => 'dark-row'}
                                columns={[
                                    { title: 'User', dataIndex: 'user', render: v => <Text style={{ color: '#e2e8f0' }}>{v}</Text> },
                                    { title: 'Spent', dataIndex: 'spent', render: v => <Text style={{ color: '#e2e8f0' }}>{formatKSH(v)}</Text> },
                                    { title: 'Txns', dataIndex: 'trans', render: v => <Text style={{ color: '#e2e8f0' }}>{v}</Text> },
                                ]}
                            />
                        </Card>
                    </Col>
                    <Col span={3}>
                        <Card title={<span style={{ color: '#fff' }}>Low Inventory Alert</span>} style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, height: '100%' }} bodyStyle={{ padding: '16px' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                                {[
                                    { name: 'A4 Paper', item: 'Printer A', alert: 'Low (15%)' },
                                    { name: 'Toner Black', item: 'Printer B', alert: 'Low (20%)' },
                                    { name: 'Toner Cyan', item: 'Printer C', alert: 'Low (10%)' },
                                ].map((alert, idx) => (
                                    <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <Space>
                                            <Avatar style={{ backgroundColor: '#1e293b', color: '#00B4D8', border: '1px solid #334155' }} icon={<PrinterOutlined />} size="small" />
                                            <div>
                                                <div style={{ color: '#e2e8f0', fontSize: 12 }}>{alert.name}</div>
                                                <div style={{ color: '#64748b', fontSize: 10 }}>{alert.item}</div>
                                            </div>
                                        </Space>
                                        <Tag color="error" style={{ background: 'transparent', borderColor: '#ef4444', color: '#ef4444', fontSize: 10 }}>{alert.alert}</Tag>
                                    </div>
                                ))}
                            </div>
                            <Button type="link" style={{ marginTop: 16, padding: 0, color: '#94a3b8', fontSize: 12 }}>View inventory &rarr;</Button>
                        </Card>
                    </Col>
                </Row>

                {/* 4. Bottom Row */}
                <Row gutter={[16, 16]}>
                    <Col span={19}>
                        <Card title={<span style={{ color: '#fff' }}>Recent Transactions</span>} style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8 }} bodyStyle={{ padding: 0 }}>
                            <Table
                                dataSource={unifiedFeed.slice(0, 10)}
                                pagination={false}
                                size="small"
                                rowClassName={() => 'dark-row'}
                                columns={[
                                    { title: 'Invoice No.', dataIndex: 'id', render: (_, __, i) => <Text style={{ color: '#94a3b8' }}>INV-2025-{String(100481 - i).padStart(6, '0')}</Text> },
                                    { title: 'Customer', dataIndex: '_user', render: v => <Text style={{ color: '#e2e8f0' }}>{v || 'Walk-in'}</Text> },
                                    { title: 'Computer', dataIndex: '_host', render: v => <Text style={{ color: '#e2e8f0' }}>{v || 'MAIN'}</Text> },
                                    { title: 'Service', dataIndex: '_desc', render: v => <Text style={{ color: '#e2e8f0' }}>{v}</Text> },
                                    { title: 'Payment Method', dataIndex: 'payment', render: () => <Text style={{ color: '#e2e8f0' }}>{['Cash', 'M-Pesa', 'Card'][Math.floor(Math.random() * 3)]}</Text> },
                                    { title: 'Operator', dataIndex: 'operator', render: () => <Text style={{ color: '#e2e8f0' }}>Admin</Text> },
                                    { title: 'Time', dataIndex: '_time', render: v => <Text style={{ color: '#e2e8f0' }}>{dayjs(v).format('MMM D, YYYY h:mm A')}</Text> },
                                    { title: 'Amount', dataIndex: '_amount', render: v => <Text style={{ color: '#00C853', fontWeight: 600 }}>{formatKSH(v)}</Text> },
                                    { title: 'Status', dataIndex: 'status', render: () => <Tag color="success" style={{ background: 'transparent', borderColor: '#00C853', color: '#00C853' }}>Paid</Tag> },
                                ]}
                            />
                            <div style={{ padding: 12, textAlign: 'center' }}>
                                <Button type="link" style={{ color: '#94a3b8' }}>View all transactions &rarr;</Button>
                            </div>
                        </Card>
                    </Col>
                    <Col span={5}>
                        <Card title={<span style={{ color: '#fff' }}>Quick Actions</span>} style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8 }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                                <div style={{ display: 'flex', alignItems: 'center', padding: 12, background: '#0f172a', borderRadius: 8, cursor: 'pointer', border: '1px solid transparent' }} className="quick-action-btn">
                                    <Avatar style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444' }} icon={<DollarOutlined />} />
                                    <div style={{ marginLeft: 12, flex: 1 }}>
                                        <div style={{ color: '#e2e8f0', fontSize: 13, fontWeight: 500 }}>Add Expense</div>
                                        <div style={{ color: '#64748b', fontSize: 11 }}>Record a new expense</div>
                                    </div>
                                    <ArrowUpOutlined style={{ color: '#64748b' }} />
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', padding: 12, background: '#0f172a', borderRadius: 8, cursor: 'pointer', border: '1px solid transparent' }} className="quick-action-btn">
                                    <Avatar style={{ background: 'rgba(123,44,191,0.1)', color: '#7b2cbf' }} icon={<ShopOutlined />} />
                                    <div style={{ marginLeft: 12, flex: 1 }}>
                                        <div style={{ color: '#e2e8f0', fontSize: 13, fontWeight: 500 }}>Add Sale</div>
                                        <div style={{ color: '#64748b', fontSize: 11 }}>Record a new sale</div>
                                    </div>
                                    <ArrowUpOutlined style={{ color: '#64748b' }} />
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', padding: 12, background: '#0f172a', borderRadius: 8, cursor: 'pointer', border: '1px solid transparent' }} className="quick-action-btn">
                                    <Avatar style={{ background: 'rgba(255,183,3,0.1)', color: '#FFB703' }} icon={<FileTextOutlined />} />
                                    <div style={{ marginLeft: 12, flex: 1 }}>
                                        <div style={{ color: '#e2e8f0', fontSize: 13, fontWeight: 500 }}>Generate Report</div>
                                        <div style={{ color: '#64748b', fontSize: 11 }}>Download financial report</div>
                                    </div>
                                    <DownloadOutlined style={{ color: '#64748b' }} />
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', padding: 12, background: '#0f172a', borderRadius: 8, cursor: 'pointer', border: '1px solid transparent' }} className="quick-action-btn">
                                    <Avatar style={{ background: 'rgba(0,200,83,0.1)', color: '#00C853' }} icon={<CopyOutlined />} />
                                    <div style={{ marginLeft: 12, flex: 1 }}>
                                        <div style={{ color: '#e2e8f0', fontSize: 13, fontWeight: 500 }}>Export Data</div>
                                        <div style={{ color: '#64748b', fontSize: 11 }}>Export financial data</div>
                                    </div>
                                    <DownloadOutlined style={{ color: '#64748b' }} />
                                </div>
                            </div>
                        </Card>
                    </Col>
                </Row>

                {/* Legacy Extracted Views (Shop & Agent Performance) */}
                <Row gutter={[16, 16]} style={{ marginTop: 24 }}>
                    <Col span={12}>
                        <Card title={<span style={{ color: '#fff' }}>Revenue Breakdown by Shop</span>} style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8 }} bodyStyle={{ padding: 0 }}>
                            <Table
                                columns={shopRevenueColumns}
                                dataSource={shopRevenue}
                                rowKey="shop"
                                pagination={false}
                                size="small"
                                className="dark-table"
                                rowClassName={() => 'dark-row'}
                                summary={(pageData) => {
                                    const t = pageData.reduce((acc, row) => ({
                                        printing: acc.printing + row.printing,
                                        photocopies: acc.photocopies + row.photocopies,
                                        internet: acc.internet + row.internet,
                                        sales: acc.sales + row.sales,
                                        lamination: acc.lamination + row.lamination,
                                        other: acc.other + row.other,
                                        total: acc.total + row.total,
                                    }), { printing: 0, photocopies: 0, internet: 0, sales: 0, lamination: 0, other: 0, total: 0 });

                                    return (
                                        <Table.Summary.Row style={{ background: 'rgba(0, 200, 83, 0.1)' }}>
                                            <Table.Summary.Cell><Text strong style={{ color: '#fff' }}>TOTAL</Text></Table.Summary.Cell>
                                            <Table.Summary.Cell align="right"><Text strong style={{ color: '#fff' }}>{formatKSH(t.printing)}</Text></Table.Summary.Cell>
                                            <Table.Summary.Cell align="right"><Text strong style={{ color: '#fff' }}>{formatKSH(t.photocopies)}</Text></Table.Summary.Cell>
                                            <Table.Summary.Cell align="right"><Text strong style={{ color: '#fff' }}>{formatKSH(t.internet)}</Text></Table.Summary.Cell>
                                            <Table.Summary.Cell align="right"><Text strong style={{ color: '#fff' }}>{formatKSH(t.sales)}</Text></Table.Summary.Cell>
                                            <Table.Summary.Cell align="right"><Text strong style={{ color: '#fff' }}>{formatKSH(t.lamination)}</Text></Table.Summary.Cell>
                                            <Table.Summary.Cell align="right"><Text strong style={{ color: '#fff' }}>{formatKSH(t.other)}</Text></Table.Summary.Cell>
                                            <Table.Summary.Cell align="right"><Text strong style={{ fontSize: 16, color: '#00C853' }}>{formatKSH(t.total)}</Text></Table.Summary.Cell>
                                        </Table.Summary.Row>
                                    );
                                }}
                            />
                        </Card>
                    </Col>
                    <Col span={12}>
                        <Card title={<span style={{ color: '#fff' }}>Agent Performance</span>} style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8 }} bodyStyle={{ padding: 0 }}>
                            <Table
                                columns={agentPerformanceColumns.map(c => ({...c, render: (t, r) => {
                                    if(c.key === 'agent') return <Space><UserOutlined style={{ color: '#00B4D8' }} /><Text style={{ color: '#e2e8f0' }}>{r.agent}</Text></Space>;
                                    if(c.key === 'collected' || c.key === 'submitted') return <Text style={{ color: '#e2e8f0' }}>{formatKSH(t)}</Text>;
                                    return c.render ? c.render(t, r) : t;
                                }}))}
                                dataSource={agentPerformance}
                                rowKey="agent"
                                pagination={false}
                                size="small"
                                className="dark-table"
                                rowClassName={() => 'dark-row'}
                                summary={(pageData) => {
                                    const t = pageData.reduce((acc, row) => ({
                                        collected: acc.collected + row.collected,
                                        submitted: acc.submitted + row.submitted,
                                        underreported: acc.underreported + Math.max(0, row.collected - row.submitted),
                                        overreported: acc.overreported + Math.max(0, row.submitted - row.collected),
                                    }), { collected: 0, submitted: 0, underreported: 0, overreported: 0 });

                                    return (
                                        <Table.Summary.Row style={{ background: 'rgba(0, 200, 83, 0.1)' }}>
                                            <Table.Summary.Cell><Text strong style={{ color: '#fff' }}>TOTAL</Text></Table.Summary.Cell>
                                            <Table.Summary.Cell align="right"><Text strong style={{ color: '#fff' }}>{formatKSH(t.collected)}</Text></Table.Summary.Cell>
                                            <Table.Summary.Cell align="right"><Text strong style={{ color: '#fff' }}>{formatKSH(t.submitted)}</Text></Table.Summary.Cell>
                                            <Table.Summary.Cell align="right">
                                                <Text strong type={t.underreported > 0 ? 'danger' : 'secondary'} style={t.underreported > 0 ? {} : { color: '#64748b' }}>
                                                    {t.underreported > 0 ? formatKSH(t.underreported) : '-'}
                                                </Text>
                                            </Table.Summary.Cell>
                                            <Table.Summary.Cell align="right">
                                                <Text strong type={t.overreported > 0 ? 'success' : 'secondary'} style={t.overreported > 0 ? {} : { color: '#64748b' }}>
                                                    {t.overreported > 0 ? formatKSH(t.overreported) : '-'}
                                                </Text>
                                            </Table.Summary.Cell>
                                        </Table.Summary.Row>
                                    );
                                }}
                            />
                        </Card>
                    </Col>
                </Row>
            </Spin>

            <style>{"
                .dark-table .ant-table {
                    background: transparent !important;
                    color: #fff !important;
                }
                .dark-table .ant-table-thead > tr > th {
                    background: #0f172a !important;
                    color: #94a3b8 !important;
                    border-bottom: 1px solid #334155 !important;
                }
                .dark-table .ant-table-tbody > tr.dark-row > td {
                    background: transparent !important;
                    border-bottom: 1px solid #334155 !important;
                }
                .dark-table .ant-table-tbody > tr.dark-row:hover > td {
                    background: #1e293b !important;
                }
                .quick-action-btn:hover {
                    border-color: #334155 !important;
                    background: #1e293b !important;
                }
                .ant-card-head {
                    border-bottom: 1px solid #334155 !important;
                    color: #fff !important;
                }
            "}</style>
        </div>
    );
}

export default Finance;
