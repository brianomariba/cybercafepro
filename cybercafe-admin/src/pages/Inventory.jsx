import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Card, Table, Button, Modal, Form, Input, InputNumber, Switch, Space, Tag, message, Popconfirm, Row, Col, Statistic, Alert, Badge, Tooltip, Typography, Divider, Tabs, Progress, List, DatePicker, Select, Empty, Radio, Transfer, Checkbox } from 'antd';
import {
    PlusOutlined, EditOutlined, DeleteOutlined, ShoppingCartOutlined, SettingOutlined,
    WarningOutlined, CheckCircleOutlined, MailOutlined, ReloadOutlined, DollarOutlined,
    InboxOutlined, HistoryOutlined, UserOutlined, ArrowRightOutlined, ClockCircleOutlined,
    BarChartOutlined, SearchOutlined, ExportOutlined, EyeOutlined, RiseOutlined,
    FallOutlined, LineChartOutlined, FilterOutlined, DownloadOutlined, LockOutlined,
    TeamOutlined, EyeInvisibleOutlined, StopOutlined, MobileOutlined, ThunderboltOutlined
} from '@ant-design/icons';
import { getInventory, addInventoryItem, updateInventoryItem, deleteInventoryItem, getInventorySettings, updateInventorySettings, sellInventoryItem, connectSocket, getTransactions, updateInventoryAccessControl, getPortalUsers, getAgentUsers, clearAllInventory, clearSalesHistory } from '../services/api';
import ServicesTab from './ServicesTab';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
dayjs.extend(relativeTime);

const { Text, Title } = Typography;
const { Search } = Input;
const { RangePicker } = DatePicker;
const formatKSH = (val) => `KSH ${(val || 0).toLocaleString()}`;

// Simple inline bar chart component (no external dependency needed for this)
function MiniBar({ value, max, color = '#00B4D8', height = 18 }) {
    const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ flex: 1, height, background: 'rgba(255,255,255,0.06)', borderRadius: 4, overflow: 'hidden', minWidth: 60 }}>
                <div style={{
                    width: `${pct}%`, height: '100%', borderRadius: 4,
                    background: pct < 20 ? '#ff4d4f' : pct < 50 ? '#faad14' : color,
                    transition: 'width 0.6s ease'
                }} />
            </div>
            <Text style={{ fontFamily: 'JetBrains Mono', fontSize: 12, minWidth: 30, textAlign: 'right' }}>{value}</Text>
        </div>
    );
}

function Inventory() {
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(false);
    const [modalVisible, setModalVisible] = useState(false);
    const [editingItem, setEditingItem] = useState(null);
    const [settingsVisible, setSettingsVisible] = useState(false);
    const [settings, setSettings] = useState({ showTotalItemsToUser: true, lowStockEmailEnabled: true });
    const [sellModalVisible, setSellModalVisible] = useState(false);
    const [sellingItem, setSellingItem] = useState(null);
    const [lastSaleResult, setLastSaleResult] = useState(null);
    const [salesHistory, setSalesHistory] = useState([]);
    const [salesLoading, setSalesLoading] = useState(false);
    const [activeTab, setActiveTab] = useState('dashboard');

    // Detail modal for clicking low stock items
    const [detailItem, setDetailItem] = useState(null);
    const [detailVisible, setDetailVisible] = useState(false);

    // Low stock list modal
    const [lowStockModalVisible, setLowStockModalVisible] = useState(false);

    // Sales search & filter
    const [salesSearch, setSalesSearch] = useState('');
    const [salesDateRange, setSalesDateRange] = useState(null);
    const [salesItemFilter, setSalesItemFilter] = useState('all');
    const [salesPaymentFilter, setSalesPaymentFilter] = useState('all');
    const [salesSellerFilter, setSalesSellerFilter] = useState('all');

    // Inventory search & filter
    const [invSearch, setInvSearch] = useState('');
    const [invCategoryFilter, setInvCategoryFilter] = useState('all');
    const [invStockFilter, setInvStockFilter] = useState('all');

    const [form] = Form.useForm();
    const [sellForm] = Form.useForm();

    // Access control state
    const [accessModalVisible, setAccessModalVisible] = useState(false);
    const [accessItem, setAccessItem] = useState(null);
    const [allUsers, setAllUsers] = useState([]);
    const [acHiddenUsers, setAcHiddenUsers] = useState([]);
    const [acVisibilityMode, setAcVisibilityMode] = useState('all');
    const [acAllowedUsers, setAcAllowedUsers] = useState([]);
    const [acStockLimits, setAcStockLimits] = useState([]);
    const [acSaving, setAcSaving] = useState(false);

    // Bulk selection state
    const [selectedRowKeys, setSelectedRowKeys] = useState([]);

    // Guard against React StrictMode double-mount causing duplicate fetches/sockets
    const mountedRef = useRef(false);
    // Guard against double form submission
    const [saving, setSaving] = useState(false);

    const fetchInventory = async () => {
        setLoading(true);
        try { setItems(await getInventory()); } catch { message.error('Failed to load inventory'); }
        setLoading(false);
    };

    const fetchSettings = async () => {
        try { const d = await getInventorySettings(); if (d) setSettings(p => ({ ...p, ...d })); } catch { }
    };

    const fetchSalesHistory = async () => {
        setSalesLoading(true);
        try {
            const data = await getTransactions({ type: 'inventory-sale', limit: 500 });
            setSalesHistory(Array.isArray(data) ? data : (data?.transactions || []));
        } catch { setSalesHistory([]); }
        setSalesLoading(false);
    };

    useEffect(() => {
        // Skip the first (throwaway) mount in StrictMode dev — only run on the second
        if (mountedRef.current) return;
        mountedRef.current = true;

        fetchInventory(); fetchSettings(); fetchSalesHistory();
        const socket = connectSocket({ onConnect: () => { } });
        socket.on('low-stock-alert', (data) => {
            message.warning({ content: `⚠️ Low Stock: ${data.itemName} (${data.currentStock} left)`, duration: 10 });
            fetchInventory();
        });
        socket.on('inventory-update', () => fetchInventory());
        socket.on('transaction-created', (txn) => {
            if (txn?.type === 'inventory-sale') {
                // Deduplicate: only prepend if the transaction isn't already in the list
                setSalesHistory(prev => {
                    const txnId = txn._id || txn.id;
                    if (prev.some(s => (s._id || s.id) === txnId)) return prev;
                    return [txn, ...prev];
                });
            }
        });
        return () => socket?.disconnect();
    }, []);

    const handleEdit = (item) => { setEditingItem(item); form.setFieldsValue(item); setModalVisible(true); };
    const handleDelete = async (id) => { try { await deleteInventoryItem(id); message.success('Deleted'); fetchInventory(); } catch { message.error('Failed'); } };
    const handleCreate = async (values) => {
        if (saving) return; // Prevent double-submit
        setSaving(true);
        try {
            if (editingItem) { await updateInventoryItem(editingItem._id, values); message.success('Updated'); }
            else { await addInventoryItem(values); message.success('Added'); }
            setModalVisible(false); form.resetFields(); setEditingItem(null); fetchInventory();
        } catch { message.error('Failed'); }
        setSaving(false);
    };
    const handleUpdateSettings = async (key, value) => {
        try { const n = { ...settings, [key]: value }; setSettings(n); await updateInventorySettings(n); message.success('Settings updated'); } catch { message.error('Failed'); }
    };
    const handleSell = (item) => { setSellingItem(item); setLastSaleResult(null); sellForm.setFieldsValue({ quantity: 1, reason: '', paymentMethod: 'cash' }); setSellModalVisible(true); };
    const submitSell = async (values) => {
        if (!sellingItem) return;
        try {
            const result = await sellInventoryItem(sellingItem._id, { quantity: values.quantity, reason: values.reason, paymentMethod: values.paymentMethod || 'cash', clientId: 'admin' });
            setLastSaleResult({ itemName: sellingItem.name, quantity: values.quantity, unitPrice: sellingItem.price, totalAmount: sellingItem.price * values.quantity, previousStock: result.item?.previousStock, currentStock: result.item?.currentStock, seller: result.transaction?.seller || 'admin', reason: values.reason, paymentMethod: values.paymentMethod || 'cash' });
            message.success(`Sold ${values.quantity}x ${sellingItem.name}`); fetchInventory(); fetchSalesHistory();
        } catch (error) { message.error(error.response?.data?.error || 'Sale failed'); }
    };

    const doClearInventory = async () => {
        try {
            await clearAllInventory();
            message.success('All inventory items cleared');
            setSelectedRowKeys([]);
            fetchInventory();
        } catch { message.error('Failed to clear inventory'); }
    };

    // Bulk delete selected items
    const handleBulkDelete = () => {
        if (selectedRowKeys.length === 0) return;
        Modal.confirm({
            title: `Delete ${selectedRowKeys.length} item(s)?`,
            icon: <WarningOutlined style={{ color: '#ff4d4f' }} />,
            content: (
                <div>
                    <p>This will permanently delete the following items:</p>
                    <div style={{ maxHeight: 200, overflowY: 'auto', marginTop: 8 }}>
                        {items.filter(i => selectedRowKeys.includes(i._id)).map(i => (
                            <Tag key={i._id} color="red" style={{ margin: '2px 4px' }}>{i.name} ({i.stock} units)</Tag>
                        ))}
                    </div>
                </div>
            ),
            okText: `Delete ${selectedRowKeys.length} Items`,
            okType: 'danger',
            cancelText: 'Cancel',
            onOk: async () => {
                try {
                    let successCount = 0;
                    for (const id of selectedRowKeys) {
                        try {
                            await deleteInventoryItem(id);
                            successCount++;
                        } catch { /* continue with others */ }
                    }
                    message.success(`Deleted ${successCount} of ${selectedRowKeys.length} items`);
                    setSelectedRowKeys([]);
                    fetchInventory();
                } catch { message.error('Bulk delete failed'); }
            }
        });
    };

    // Bulk sell — opens a combined modal (simple approach: sell 1 each)
    const handleBulkSell = () => {
        if (selectedRowKeys.length === 0) return;
        const sellableItems = items.filter(i => selectedRowKeys.includes(i._id) && i.stock > 0);
        if (sellableItems.length === 0) {
            message.warning('None of the selected items have stock available');
            return;
        }
        Modal.confirm({
            title: `Sell 1 unit of ${sellableItems.length} item(s)?`,
            icon: <ShoppingCartOutlined style={{ color: '#52c41a' }} />,
            content: (
                <div>
                    <p>This will sell <strong>1 unit</strong> of each selected item (cash payment):</p>
                    <div style={{ maxHeight: 200, overflowY: 'auto', marginTop: 8 }}>
                        {sellableItems.map(i => (
                            <div key={i._id} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                                <Text>{i.name}</Text>
                                <Text strong style={{ color: '#52c41a' }}>{formatKSH(i.price)}</Text>
                            </div>
                        ))}
                    </div>
                    <div style={{ marginTop: 12, padding: 8, background: 'rgba(82,196,26,0.1)', borderRadius: 8, textAlign: 'right' }}>
                        <Text strong style={{ fontSize: 16, color: '#52c41a' }}>Total: {formatKSH(sellableItems.reduce((s, i) => s + i.price, 0))}</Text>
                    </div>
                </div>
            ),
            okText: `Sell ${sellableItems.length} Items`,
            okButtonProps: { style: { background: '#52c41a', borderColor: '#52c41a' } },
            cancelText: 'Cancel',
            onOk: async () => {
                try {
                    let successCount = 0;
                    for (const item of sellableItems) {
                        try {
                            await sellInventoryItem(item._id, { quantity: 1, paymentMethod: 'cash', clientId: 'admin', reason: 'Bulk sale from admin' });
                            successCount++;
                        } catch { /* continue */ }
                    }
                    message.success(`Sold 1 unit each of ${successCount} items`);
                    setSelectedRowKeys([]);
                    fetchInventory();
                    fetchSalesHistory();
                } catch { message.error('Bulk sell failed'); }
            }
        });
    };

    const doClearSalesHistory = async () => {
        try {
            await clearSalesHistory();
            message.success('Sales history cleared');
            fetchSalesHistory();
        } catch (err) {
            console.error('Clear sales history failed:', err);
            message.error('Failed to clear sales history');
        }
    };

    // Show item detail with its sales history
    const showItemDetail = (item) => { setDetailItem(item); setDetailVisible(true); };

    // Fetch all users for access control
    const fetchUsers = async () => {
        try {
            const [portalUsers, agentUsers] = await Promise.all([getPortalUsers(), getAgentUsers()]);
            const combined = [
                ...(portalUsers || []).map(u => ({ ...u, userType: 'portal' })),
                ...(agentUsers || []).map(u => ({ ...u, userType: 'agent' }))
            ];
            setAllUsers(combined);
        } catch { setAllUsers([]); }
    };

    // Open access control modal
    const openAccessControl = (item) => {
        setAccessItem(item);
        setAcHiddenUsers(item.hiddenFromUsers || []);
        setAcVisibilityMode(item.visibilityMode || 'all');
        setAcAllowedUsers(item.allowedUsers || []);
        setAcStockLimits(item.stockLimitForUsers || []);
        fetchUsers();
        setAccessModalVisible(true);
    };

    // Save access control settings
    const saveAccessControl = async () => {
        if (!accessItem) return;
        setAcSaving(true);
        try {
            await updateInventoryAccessControl(accessItem._id, {
                hiddenFromUsers: acHiddenUsers,
                visibilityMode: acVisibilityMode,
                allowedUsers: acAllowedUsers,
                stockLimitForUsers: acStockLimits
            });
            message.success(`Access control updated for ${accessItem.name}`);
            setAccessModalVisible(false);
            fetchInventory();
        } catch { message.error('Failed to update access control'); }
        setAcSaving(false);
    };

    // Computed stats
    const totalStockValue = items.reduce((a, i) => a + (i.price * i.stock), 0);
    const totalUnits = items.reduce((a, i) => a + i.stock, 0);
    const lowStockItems = items.filter(i => i.stock <= (i.lowStockThreshold || 5) && i.stock > 0);
    const outOfStockItems = items.filter(i => i.stock === 0);
    const maxStock = Math.max(...items.map(i => i.stock), 1);

    const todayStart = dayjs().startOf('day');
    const todaySales = salesHistory.filter(s => dayjs(s.createdAt).isAfter(todayStart));
    const todayRevenue = todaySales.reduce((s, t) => s + (t.amount || 0), 0);
    const totalSalesRevenue = salesHistory.reduce((s, t) => s + (t.amount || 0), 0);

    // Sales for detail item
    const detailItemSales = useMemo(() => {
        if (!detailItem) return [];
        return salesHistory.filter(s => s.itemName === detailItem.name || s.itemId === detailItem._id);
    }, [detailItem, salesHistory]);

    // Filtered sales history
    const filteredSales = useMemo(() => {
        return salesHistory.filter(s => {
            const matchesSearch = !salesSearch || (s.itemName || '').toLowerCase().includes(salesSearch.toLowerCase()) || (s.seller || '').toLowerCase().includes(salesSearch.toLowerCase()) || (s.reason || '').toLowerCase().includes(salesSearch.toLowerCase());
            const matchesItem = salesItemFilter === 'all' || s.itemName === salesItemFilter;
            const matchesDate = !salesDateRange || (dayjs(s.createdAt).isAfter(salesDateRange[0].startOf('day')) && dayjs(s.createdAt).isBefore(salesDateRange[1].endOf('day')));
            const matchesPayment = salesPaymentFilter === 'all' || (s.paymentMethod || 'cash') === salesPaymentFilter;
            const matchesSeller = salesSellerFilter === 'all' || (s.seller || '') === salesSellerFilter;
            return matchesSearch && matchesItem && matchesDate && matchesPayment && matchesSeller;
        });
    }, [salesHistory, salesSearch, salesItemFilter, salesDateRange, salesPaymentFilter, salesSellerFilter]);

    // Sales by day for chart (last 7 days)
    const salesByDay = useMemo(() => {
        const days = [];
        for (let i = 6; i >= 0; i--) {
            const day = dayjs().subtract(i, 'day').startOf('day');
            const daySales = salesHistory.filter(s => dayjs(s.createdAt).isSame(day, 'day'));
            days.push({ date: day.format('ddd'), revenue: daySales.reduce((s, t) => s + (t.amount || 0), 0), count: daySales.length });
        }
        return days;
    }, [salesHistory]);
    const maxDayRevenue = Math.max(...salesByDay.map(d => d.revenue), 1);

    // Category breakdown
    const categoryStats = useMemo(() => {
        const cats = {};
        items.forEach(i => { const c = i.category || 'General'; if (!cats[c]) cats[c] = { count: 0, value: 0, units: 0 }; cats[c].count++; cats[c].value += i.price * i.stock; cats[c].units += i.stock; });
        return Object.entries(cats).sort((a, b) => b[1].value - a[1].value);
    }, [items]);

    // Top selling items
    const topSelling = useMemo(() => {
        const map = {};
        salesHistory.forEach(s => { const n = s.itemName || 'Unknown'; if (!map[n]) map[n] = { name: n, qty: 0, revenue: 0 }; map[n].qty += s.quantity || 0; map[n].revenue += s.amount || 0; });
        return Object.values(map).sort((a, b) => b.revenue - a.revenue).slice(0, 8);
    }, [salesHistory]);

    // Export sales to CSV
    const exportCSV = () => {
        const rows = [['Date', 'Item', 'Quantity', 'Unit Price', 'Total', 'Payment Method', 'Seller', 'Reason']];
        filteredSales.forEach(s => {
            const qty = s.quantity || 0; const total = s.amount || 0; const unit = qty > 0 ? Math.round(total / qty) : 0;
            rows.push([dayjs(s.createdAt).format('YYYY-MM-DD HH:mm'), s.itemName, qty, unit, total, (s.paymentMethod || 'cash').toUpperCase(), s.seller, s.reason || '']);
        });
        const csv = rows.map(r => r.join(',')).join('\n');
        const blob = new Blob([csv], { type: 'text/csv' });
        const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `sales_${dayjs().format('YYYY-MM-DD')}.csv`; a.click();
        message.success('Sales exported');
    };

    // Generate PDF Report
    const generatePDFReport = () => {
        const doc = new jsPDF('p', 'mm', 'a4');
        const pageW = doc.internal.pageSize.getWidth();
        const now = dayjs();
        let y = 15;

        // Helper: add page header
        const addHeader = () => {
            doc.setFillColor(1, 22, 39);
            doc.rect(0, 0, pageW, 28, 'F');
            doc.setFontSize(18);
            doc.setTextColor(0, 180, 216);
            doc.text('HawkNine', 14, 13);
            doc.setFontSize(9);
            doc.setTextColor(200, 200, 200);
            doc.text('Inventory Management Report', 14, 20);
            doc.text(`Generated: ${now.format('MMM D, YYYY h:mm A')}`, pageW - 14, 13, { align: 'right' });
            doc.text(`Page ${doc.internal.getNumberOfPages()}`, pageW - 14, 20, { align: 'right' });
            return 35;
        };

        // Helper: section title
        const sectionTitle = (title, yPos) => {
            if (yPos > 260) { doc.addPage(); yPos = addHeader(); }
            doc.setFontSize(13);
            doc.setTextColor(0, 180, 216);
            doc.text(title, 14, yPos);
            doc.setDrawColor(0, 180, 216);
            doc.line(14, yPos + 2, pageW - 14, yPos + 2);
            return yPos + 8;
        };

        // Page 1 Header
        y = addHeader();

        // === INVENTORY SUMMARY ===
        y = sectionTitle('Inventory Summary', y);
        const summaryData = [
            ['Total Items', items.length.toString()],
            ['Total Stock Units', totalUnits.toLocaleString()],
            ['Total Stock Value', formatKSH(totalStockValue)],
            ['Low Stock Items', lowStockItems.length.toString()],
            ['Out of Stock Items', outOfStockItems.length.toString()],
            ['Categories', categoryStats.length.toString()],
        ];
        autoTable(doc, {
            startY: y, head: [['Metric', 'Value']], body: summaryData,
            margin: { left: 14, right: 14 }, theme: 'grid',
            headStyles: { fillColor: [0, 180, 216], fontSize: 10 },
            styles: { fontSize: 9, cellPadding: 3 }
        });
        y = doc.lastAutoTable.finalY + 10;

        // === CATEGORY BREAKDOWN ===
        if (categoryStats.length > 0) {
            y = sectionTitle('Category Breakdown', y);
            const catData = categoryStats.map(([name, data]) => [
                name, data.count.toString(), data.units.toLocaleString(), formatKSH(data.value)
            ]);
            autoTable(doc, {
                startY: y, head: [['Category', 'Items', 'Units', 'Value']], body: catData,
                margin: { left: 14, right: 14 }, theme: 'striped',
                headStyles: { fillColor: [123, 44, 191], fontSize: 10 },
                styles: { fontSize: 9 }
            });
            y = doc.lastAutoTable.finalY + 10;
        }

        // === STOCK LISTING ===
        y = sectionTitle('Stock Listing', y);
        const stockData = items.map(i => [
            i.name, i.category || 'General', i.stock.toString(),
            `KSH ${i.price.toLocaleString()}`, formatKSH(i.price * i.stock),
            i.stock <= (i.lowStockThreshold || 5) ? (i.stock === 0 ? 'OUT' : 'LOW') : 'OK'
        ]);
        autoTable(doc, {
            startY: y, head: [['Item', 'Category', 'Stock', 'Price', 'Value', 'Status']], body: stockData,
            margin: { left: 14, right: 14 }, theme: 'striped',
            headStyles: { fillColor: [0, 119, 182], fontSize: 9 },
            styles: { fontSize: 8 },
            didParseCell: (data) => {
                if (data.section === 'body' && data.column.index === 5) {
                    if (data.cell.raw === 'OUT') { data.cell.styles.textColor = [239, 68, 68]; data.cell.styles.fontStyle = 'bold'; }
                    else if (data.cell.raw === 'LOW') { data.cell.styles.textColor = [245, 158, 11]; data.cell.styles.fontStyle = 'bold'; }
                    else { data.cell.styles.textColor = [82, 196, 26]; }
                }
            }
        });
        y = doc.lastAutoTable.finalY + 10;

        // === TOP SELLING ITEMS ===
        if (topSelling.length > 0) {
            y = sectionTitle('Top Selling Items', y);
            const topData = topSelling.map((t, i) => [
                `#${i + 1}`, t.name, t.qty.toString(), formatKSH(t.revenue)
            ]);
            autoTable(doc, {
                startY: y, head: [['Rank', 'Item', 'Qty Sold', 'Revenue']], body: topData,
                margin: { left: 14, right: 14 }, theme: 'striped',
                headStyles: { fillColor: [82, 196, 26], fontSize: 9 },
                styles: { fontSize: 9 }
            });
            y = doc.lastAutoTable.finalY + 10;
        }

        // === PAYMENT METHOD BREAKDOWN ===
        const cashSales = salesHistory.filter(s => (s.paymentMethod || 'cash') === 'cash');
        const mpesaSales = salesHistory.filter(s => s.paymentMethod === 'mpesa');
        const cashTotal = cashSales.reduce((s, t) => s + (t.amount || 0), 0);
        const mpesaTotal = mpesaSales.reduce((s, t) => s + (t.amount || 0), 0);
        y = sectionTitle('Payment Method Breakdown', y);
        autoTable(doc, {
            startY: y,
            head: [['Payment Method', 'Transactions', 'Total Revenue']],
            body: [
                ['Cash', cashSales.length.toString(), formatKSH(cashTotal)],
                ['M-Pesa', mpesaSales.length.toString(), formatKSH(mpesaTotal)],
                ['Total', salesHistory.length.toString(), formatKSH(cashTotal + mpesaTotal)]
            ],
            margin: { left: 14, right: 14 }, theme: 'grid',
            headStyles: { fillColor: [255, 149, 0], fontSize: 10 },
            styles: { fontSize: 9 },
            didParseCell: (data) => {
                if (data.section === 'body' && data.row.index === 2) {
                    data.cell.styles.fontStyle = 'bold';
                }
            }
        });
        y = doc.lastAutoTable.finalY + 10;

        // === SALES HISTORY ===
        y = sectionTitle('Sales History', y);
        const salesData = filteredSales.map(s => {
            const qty = s.quantity || 0; const total = s.amount || 0;
            const unit = qty > 0 ? Math.round(total / qty) : 0;
            return [
                dayjs(s.createdAt).format('MMM D, YYYY HH:mm'),
                s.itemName || '?', qty.toString(),
                `KSH ${unit.toLocaleString()}`, formatKSH(total),
                (s.paymentMethod || 'cash') === 'mpesa' ? 'M-Pesa' : 'Cash',
                s.seller || '?', s.reason || ''
            ];
        });
        autoTable(doc, {
            startY: y,
            head: [['Date', 'Item', 'Qty', 'Unit', 'Total', 'Payment', 'Seller', 'Note']],
            body: salesData,
            margin: { left: 14, right: 14 }, theme: 'striped',
            headStyles: { fillColor: [0, 119, 182], fontSize: 8 },
            styles: { fontSize: 7, cellPadding: 2 },
            columnStyles: { 0: { cellWidth: 30 }, 7: { cellWidth: 25 } }
        });

        // Footer on all pages
        const totalPages = doc.internal.getNumberOfPages();
        for (let i = 1; i <= totalPages; i++) {
            doc.setPage(i);
            doc.setFontSize(8);
            doc.setTextColor(150, 150, 150);
            doc.text(`HawkNine Inventory Report - ${now.format('YYYY-MM-DD')} - Page ${i} of ${totalPages}`, pageW / 2, 290, { align: 'center' });
        }

        doc.save(`HawkNine_Inventory_Report_${now.format('YYYY-MM-DD')}.pdf`);
        message.success('PDF report generated!');
    };

    const catColors = ['#00B4D8', '#7B2CBF', '#52c41a', '#ff9500', '#ff4d4f', '#00ff88', '#faad14', '#eb2f96'];

    // Filtered inventory items
    const filteredItems = useMemo(() => {
        return items.filter(item => {
            const matchesSearch = !invSearch || item.name.toLowerCase().includes(invSearch.toLowerCase()) || (item.category || '').toLowerCase().includes(invSearch.toLowerCase()) || (item.description || '').toLowerCase().includes(invSearch.toLowerCase());
            const matchesCategory = invCategoryFilter === 'all' || item.category === invCategoryFilter;
            const matchesStock = invStockFilter === 'all'
                || (invStockFilter === 'in-stock' && item.stock > (item.lowStockThreshold || 5))
                || (invStockFilter === 'low' && item.stock > 0 && item.stock <= (item.lowStockThreshold || 5))
                || (invStockFilter === 'out' && item.stock === 0);
            return matchesSearch && matchesCategory && matchesStock;
        });
    }, [items, invSearch, invCategoryFilter, invStockFilter]);

    const inventoryCategories = useMemo(() => [...new Set(items.map(i => i.category).filter(Boolean))], [items]);

    // Inventory table columns
    const columns = [
        {
            title: 'Item', dataIndex: 'name', key: 'name', sorter: (a, b) => a.name.localeCompare(b.name),
            render: (text, record) => (
                <Space>
                    <Button type="link" style={{ padding: 0, fontWeight: 600 }} onClick={() => showItemDetail(record)}>{text}</Button>
                    {record.stock === 0 && <Tag color="red">OUT</Tag>}
                </Space>
            )
        },
        { title: 'Category', dataIndex: 'category', key: 'category', filters: [...new Set(items.map(i => i.category))].filter(Boolean).map(c => ({ text: c, value: c })), onFilter: (v, r) => r.category === v, render: (cat) => <Tag color="blue">{cat}</Tag> },
        { title: 'Price', dataIndex: 'price', key: 'price', sorter: (a, b) => a.price - b.price, render: (p) => <Text strong style={{ color: '#00B4D8' }}>{formatKSH(p)}</Text> },
        {
            title: 'Stock', dataIndex: 'stock', key: 'stock', sorter: (a, b) => a.stock - b.stock, width: 200,
            render: (stock, record) => {
                const isLow = stock <= (record.lowStockThreshold || 5);
                return (
                    <div>
                        <MiniBar value={stock} max={maxStock} color={isLow ? '#ff4d4f' : '#52c41a'} />
                        {isLow && stock > 0 && <Text type="warning" style={{ fontSize: 10 }}>⚠ Low (threshold: {record.lowStockThreshold || 5})</Text>}
                    </div>
                );
            }
        },
        { title: 'Value', key: 'value', sorter: (a, b) => (a.price * a.stock) - (b.price * b.stock), render: (_, r) => <Text type="secondary">{formatKSH(r.price * r.stock)}</Text> },
        {
            title: 'Access', key: 'access', width: 60, align: 'center',
            render: (_, record) => {
                const hasRestrictions = (record.hiddenFromUsers?.length > 0) || (record.visibilityMode === 'whitelist') || (record.stockLimitForUsers?.length > 0);
                return (
                    <Tooltip title="Access Control">
                        <Badge dot={hasRestrictions} offset={[-2, 2]} color="#ff9500">
                            <Button size="small" icon={<LockOutlined />} onClick={() => openAccessControl(record)}
                                style={hasRestrictions ? { borderColor: '#ff9500', color: '#ff9500' } : {}} />
                        </Badge>
                    </Tooltip>
                );
            }
        },
        {
            title: 'Actions', key: 'actions', width: 160, render: (_, record) => (
                <Space>
                    <Tooltip title="View Details"><Button size="small" icon={<EyeOutlined />} onClick={() => showItemDetail(record)} /></Tooltip>
                    <Tooltip title="Sell"><Button size="small" type="primary" ghost icon={<DollarOutlined />} onClick={() => handleSell(record)} disabled={record.stock <= 0} /></Tooltip>
                    <Tooltip title="Edit"><Button size="small" icon={<EditOutlined />} onClick={() => handleEdit(record)} /></Tooltip>
                    <Popconfirm title="Delete?" onConfirm={() => handleDelete(record._id)} okButtonProps={{ danger: true }}>
                        <Tooltip title="Delete"><Button size="small" icon={<DeleteOutlined />} danger /></Tooltip>
                    </Popconfirm>
                </Space>
            )
        }
    ];

    // Sales table columns
    const salesColumns = [
        {
            title: 'Date', dataIndex: 'createdAt', key: 'date', width: 160, sorter: (a, b) => new Date(a.createdAt) - new Date(b.createdAt), defaultSortOrder: 'descend',
            render: (d) => (<><Text style={{ fontSize: 13 }}>{dayjs(d).format('MMM D, YYYY')}</Text><br /><Text type="secondary" style={{ fontSize: 11 }}>{dayjs(d).format('hh:mm A')} • {dayjs(d).fromNow()}</Text></>)
        },
        { title: 'Item', dataIndex: 'itemName', key: 'item', render: (n) => <Text strong>{n || 'Unknown'}</Text> },
        { title: 'Seller', dataIndex: 'seller', key: 'seller', width: 140, render: (s) => <Tag icon={<UserOutlined />} color={s === 'admin' ? 'blue' : 'purple'}>{s || '?'}</Tag> },
        {
            title: 'Sale Details', key: 'comp', width: 280, render: (_, r) => {
                const qty = r.quantity || 0; const total = r.amount || 0; const unit = qty > 0 ? Math.round(total / qty) : 0;
                return (
                    <div style={{ background: 'rgba(82,196,26,0.08)', borderRadius: 8, padding: '4px 10px', border: '1px solid rgba(82,196,26,0.2)' }}>
                        <Space size={4}><Tag color="blue">{qty}x</Tag><Text type="secondary">×</Text><Text>KSH {unit.toLocaleString()}</Text><ArrowRightOutlined style={{ color: '#52c41a', fontSize: 11 }} /><Text strong style={{ color: '#52c41a', fontSize: 14 }}>KSH {total.toLocaleString()}</Text></Space>
                    </div>
                );
            }
        },
        {
            title: 'Payment', dataIndex: 'paymentMethod', key: 'payment', width: 110, align: 'center',
            filters: [{ text: '💵 Cash', value: 'cash' }, { text: '📱 M-Pesa', value: 'mpesa' }],
            onFilter: (v, r) => (r.paymentMethod || 'cash') === v,
            render: (method) => {
                const m = method || 'cash';
                return m === 'mpesa'
                    ? <Tag icon={<MobileOutlined />} color="#108ee9">M-Pesa</Tag>
                    : <Tag icon={<DollarOutlined />} color="#52c41a">Cash</Tag>;
            }
        },
        { title: 'Buyer/Reason', dataIndex: 'reason', key: 'reason', width: 160, render: (r) => <Text type="secondary">{r || '—'}</Text> },
    ];

    return (
        <div>
            <div className="page-header">
                <div className="page-title"><ShoppingCartOutlined className="icon" /><h1>Inventory Management</h1></div>
                <Space>
                    <Button icon={<ReloadOutlined />} onClick={() => { fetchInventory(); fetchSalesHistory(); }} loading={loading}>Refresh</Button>
                    <Button icon={<SettingOutlined />} onClick={() => setSettingsVisible(true)}>Settings</Button>
                    <Button type="primary" icon={<PlusOutlined />} onClick={() => { setEditingItem(null); form.resetFields(); setModalVisible(true); }}>Add Item</Button>
                </Space>
            </div>

            {/* Alerts */}
            {lowStockItems.length > 0 && (
                <Alert message={<span style={{ color: '#000' }}>{`⚠️ ${lowStockItems.length} item(s) running low`}</span>} type="warning" showIcon closable style={{ marginBottom: 12 }}
                    description={<Space wrap>{lowStockItems.map(i => <Tag key={i._id} color="volcano" style={{ cursor: 'pointer' }} onClick={() => showItemDetail(i)}>{i.name}: {i.stock} left</Tag>)}</Space>} />
            )}
            {outOfStockItems.length > 0 && (
                <Alert message={<span style={{ color: '#000' }}>{`🚫 ${outOfStockItems.length} item(s) out of stock`}</span>} type="error" showIcon closable style={{ marginBottom: 12 }}
                    description={<Space wrap>{outOfStockItems.map(i => <Tag key={i._id} color="red" style={{ cursor: 'pointer' }} onClick={() => showItemDetail(i)}>{i.name}</Tag>)}</Space>} />
            )}

            {/* Stats Row */}
            <div className="stats-row">
                <div className="stat-card blue"><div className="stat-header"><div className="stat-icon blue"><InboxOutlined /></div></div><div className="stat-value">{items.length}</div><div className="stat-label">Total Items ({totalUnits} units)</div></div>
                <div className="stat-card green"><div className="stat-header"><div className="stat-icon green"><DollarOutlined /></div></div><div className="stat-value">{formatKSH(totalStockValue)}</div><div className="stat-label">Stock Value</div></div>
                <div className="stat-card purple"><div className="stat-header"><div className="stat-icon purple"><ShoppingCartOutlined /></div></div><div className="stat-value">{todaySales.length}</div><div className="stat-label">Today's Sales ({formatKSH(todayRevenue)})</div></div>
                <div className="stat-card pink" style={{ cursor: 'pointer' }} onClick={() => setLowStockModalVisible(true)}><div className="stat-header"><div className="stat-icon pink"><WarningOutlined /></div></div><div className="stat-value">{lowStockItems.length + outOfStockItems.length}</div><div className="stat-label">Stock Alerts — Click to view</div></div>
            </div>

            {/* Tabs */}
            <Tabs activeKey={activeTab} onChange={setActiveTab} items={[
                {
                    key: 'dashboard', label: <span><BarChartOutlined style={{ marginRight: 6 }} />Dashboard</span>, children: (
                        <Row gutter={[16, 16]}>
                            {/* Stock Levels Chart */}
                            <Col xs={24} lg={14}>
                                <Card title={<Space><BarChartOutlined style={{ color: '#00B4D8' }} /><span>Stock Levels</span></Space>} size="small">
                                    {items.length === 0 ? <Empty description="No items" /> : (
                                        <div style={{ maxHeight: 400, overflowY: 'auto' }}>
                                            {[...items].sort((a, b) => a.stock - b.stock).map(item => {
                                                const isLow = item.stock <= (item.lowStockThreshold || 5);
                                                return (
                                                    <div key={item._id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.04)', cursor: 'pointer' }} onClick={() => showItemDetail(item)}>
                                                        <Text ellipsis style={{ width: 140, fontSize: 13 }}>{item.name}</Text>
                                                        <div style={{ flex: 1 }}><MiniBar value={item.stock} max={maxStock} color={isLow ? '#ff4d4f' : '#52c41a'} /></div>
                                                        {isLow && <WarningOutlined style={{ color: '#ff4d4f', fontSize: 12 }} />}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </Card>
                            </Col>

                            {/* Right sidebar */}
                            <Col xs={24} lg={10}>
                                {/* Revenue Trend */}
                                <Card title={<Space><LineChartOutlined style={{ color: '#52c41a' }} /><span>7-Day Revenue</span></Space>} size="small" style={{ marginBottom: 16 }}>
                                    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 120, padding: '0 4px' }}>
                                        {salesByDay.map((d, i) => (
                                            <Tooltip key={i} title={`${d.date}: ${formatKSH(d.revenue)} (${d.count} sales)`}>
                                                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                                                    <div style={{ width: '100%', background: d.revenue > 0 ? 'linear-gradient(to top, #52c41a, #00B4D8)' : 'rgba(255,255,255,0.06)', borderRadius: 4, height: `${Math.max((d.revenue / maxDayRevenue) * 90, 4)}px`, transition: 'height 0.5s', minHeight: 4 }} />
                                                    <Text style={{ fontSize: 10, color: '#8c8c8c' }}>{d.date}</Text>
                                                </div>
                                            </Tooltip>
                                        ))}
                                    </div>
                                </Card>

                                {/* Category Breakdown */}
                                <Card title={<Space><FilterOutlined style={{ color: '#7B2CBF' }} /><span>By Category</span></Space>} size="small" style={{ marginBottom: 16 }}>
                                    {categoryStats.map(([cat, stats], i) => (
                                        <div key={cat} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                                            <Space><Tag color={catColors[i % catColors.length]}>{cat}</Tag><Text type="secondary" style={{ fontSize: 11 }}>{stats.count} items</Text></Space>
                                            <Text style={{ fontFamily: 'JetBrains Mono', fontSize: 12 }}>{formatKSH(stats.value)}</Text>
                                        </div>
                                    ))}
                                </Card>

                                {/* Top Selling */}
                                <Card title={<Space><RiseOutlined style={{ color: '#ff9500' }} /><span>Top Selling</span></Space>} size="small">
                                    {topSelling.length === 0 ? <Text type="secondary">No sales yet</Text> : topSelling.slice(0, 5).map((item, i) => (
                                        <div key={item.name} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                                            <Space><Badge count={i + 1} style={{ backgroundColor: i < 3 ? '#52c41a' : '#6b6b80' }} /><Text ellipsis style={{ maxWidth: 120, fontSize: 13 }}>{item.name}</Text></Space>
                                            <Space><Tag>{item.qty} sold</Tag><Text strong style={{ color: '#52c41a', fontSize: 12 }}>{formatKSH(item.revenue)}</Text></Space>
                                        </div>
                                    ))}
                                </Card>
                            </Col>
                        </Row>
                    )
                },
                {
                    key: 'inventory', label: <span><InboxOutlined style={{ marginRight: 6 }} />Items <Badge count={items.length} style={{ backgroundColor: '#00B4D8', marginLeft: 4 }} /></span>, children: (
                        <Card
                            title={<Space><InboxOutlined /><span>Inventory Items ({filteredItems.length}{filteredItems.length !== items.length ? ` of ${items.length}` : ''})</span></Space>}
                            extra={
                                <Space wrap size={8}>
                                    <Search placeholder="Search items..." style={{ width: 200 }} value={invSearch} onChange={e => setInvSearch(e.target.value)} allowClear />
                                    <Select value={invCategoryFilter} onChange={setInvCategoryFilter} style={{ width: 150 }} options={[{ value: 'all', label: 'All Categories' }, ...inventoryCategories.map(c => ({ value: c, label: c }))]} />
                                    <Select value={invStockFilter} onChange={setInvStockFilter} style={{ width: 140 }} options={[
                                        { value: 'all', label: '📦 All Stock' },
                                        { value: 'in-stock', label: '✅ In Stock' },
                                        { value: 'low', label: '⚠️ Low Stock' },
                                        { value: 'out', label: '🚫 Out of Stock' }
                                    ]} />
                                    <Popconfirm
                                        title="Clear All Inventory?"
                                        description={<span>This will permanently delete <strong>all {items.length} items</strong>. This cannot be undone.</span>}
                                        onConfirm={doClearInventory}
                                        okText="Yes, Clear All"
                                        okButtonProps={{ danger: true }}
                                        placement="bottomRight"
                                    >
                                        <Button icon={<DeleteOutlined />} size="small" danger type="primary" ghost
                                            disabled={items.length === 0}
                                        >Clear Inventory</Button>
                                    </Popconfirm>
                                </Space>
                            }
                        >
                            {/* Bulk Actions Toolbar */}
                            {selectedRowKeys.length > 0 && (
                                <div style={{
                                    marginBottom: 16, padding: '10px 16px',
                                    background: 'linear-gradient(135deg, rgba(0,180,216,0.12), rgba(123,44,191,0.08))',
                                    borderRadius: 10, border: '1px solid rgba(0,180,216,0.25)',
                                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                    animation: 'fadeIn 0.2s ease'
                                }}>
                                    <Space>
                                        <Badge count={selectedRowKeys.length} style={{ backgroundColor: '#00B4D8' }} />
                                        <Text strong>{selectedRowKeys.length} item{selectedRowKeys.length > 1 ? 's' : ''} selected</Text>
                                    </Space>
                                    <Space size={8}>
                                        <Button size="small" icon={<DollarOutlined />} onClick={handleBulkSell}
                                            style={{ background: '#52c41a', borderColor: '#52c41a', color: '#fff' }}
                                        >Sell 1 Each</Button>
                                        <Button size="small" icon={<DeleteOutlined />} onClick={handleBulkDelete} danger type="primary">Delete Selected</Button>
                                        <Button size="small" onClick={() => setSelectedRowKeys([])}>Deselect All</Button>
                                    </Space>
                                </div>
                            )}
                            <Table
                                columns={columns}
                                dataSource={filteredItems}
                                rowKey="_id"
                                loading={loading}
                                pagination={{ pageSize: 15, showSizeChanger: true, pageSizeOptions: ['10', '15', '25', '50'] }}
                                rowClassName={(r) => r.stock <= (r.lowStockThreshold || 5) ? 'low-stock-row' : ''}
                                rowSelection={{
                                    selectedRowKeys,
                                    onChange: (keys) => setSelectedRowKeys(keys),
                                    selections: [
                                        Table.SELECTION_ALL,
                                        Table.SELECTION_NONE,
                                        {
                                            key: 'low-stock',
                                            text: '⚠️ Select Low Stock',
                                            onSelect: () => {
                                                const keys = items.filter(i => i.stock > 0 && i.stock <= (i.lowStockThreshold || 5)).map(i => i._id);
                                                setSelectedRowKeys(keys);
                                            }
                                        },
                                        {
                                            key: 'out-of-stock',
                                            text: '🚫 Select Out of Stock',
                                            onSelect: () => {
                                                const keys = items.filter(i => i.stock === 0).map(i => i._id);
                                                setSelectedRowKeys(keys);
                                            }
                                        },
                                        {
                                            key: 'in-stock',
                                            text: '✅ Select In Stock',
                                            onSelect: () => {
                                                const keys = items.filter(i => i.stock > (i.lowStockThreshold || 5)).map(i => i._id);
                                                setSelectedRowKeys(keys);
                                            }
                                        }
                                    ]
                                }}
                            />
                        </Card>
                    )
                },
                {
                    key: 'sales', label: <span><HistoryOutlined style={{ marginRight: 6 }} />Sales History <Badge count={todaySales.length} style={{ marginLeft: 4, backgroundColor: '#52c41a' }} /></span>, children: (
                        <div>
                            <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
                                <Col xs={8}><Card size="small" style={{ background: 'rgba(82,196,26,0.05)', border: '1px solid rgba(82,196,26,0.2)' }}><Statistic title="Today" value={todaySales.length} prefix={<ShoppingCartOutlined style={{ color: '#52c41a' }} />} suffix="sales" /></Card></Col>
                                <Col xs={8}><Card size="small" style={{ background: 'rgba(0,180,216,0.05)', border: '1px solid rgba(0,180,216,0.2)' }}><Statistic title="Today Revenue" value={todayRevenue} prefix={<DollarOutlined style={{ color: '#00B4D8' }} />} formatter={v => formatKSH(v)} /></Card></Col>
                                <Col xs={8}><Card size="small" style={{ background: 'rgba(123,44,191,0.05)', border: '1px solid rgba(123,44,191,0.2)' }}><Statistic title="All-Time Revenue" value={totalSalesRevenue} prefix={<DollarOutlined style={{ color: '#7B2CBF' }} />} formatter={v => formatKSH(v)} /></Card></Col>
                            </Row>
                            <Card title={<Space><HistoryOutlined /><span>Sales ({filteredSales.length})</span></Space>}
                                extra={<Space wrap>
                                    <Search placeholder="Search..." style={{ width: 180 }} value={salesSearch} onChange={e => setSalesSearch(e.target.value)} allowClear />
                                    <Select value={salesItemFilter} onChange={setSalesItemFilter} style={{ width: 150 }} options={[{ value: 'all', label: 'All Items' }, ...[...new Set(salesHistory.map(s => s.itemName).filter(Boolean))].map(n => ({ value: n, label: n }))]} />
                                    <Select value={salesSellerFilter} onChange={setSalesSellerFilter} style={{ width: 150 }} options={[{ value: 'all', label: '👤 All Sellers' }, ...[...new Set(salesHistory.map(s => s.seller).filter(Boolean))].sort().map(s => ({ value: s, label: s }))]} />
                                    <Select value={salesPaymentFilter} onChange={setSalesPaymentFilter} style={{ width: 130 }} options={[{ value: 'all', label: '💰 All Payments' }, { value: 'cash', label: '💵 Cash' }, { value: 'mpesa', label: '📱 M-Pesa' }]} />
                                    <RangePicker size="small" onChange={setSalesDateRange} style={{ width: 220 }} />
                                    <Button icon={<DownloadOutlined />} onClick={exportCSV} size="small">Export CSV</Button>
                                    <Button icon={<ExportOutlined />} onClick={generatePDFReport} size="small" type="primary" style={{ background: '#7B2CBF', borderColor: '#7B2CBF' }}>PDF Report</Button>
                                    <Button icon={<ReloadOutlined />} onClick={fetchSalesHistory} loading={salesLoading} size="small">Refresh</Button>
                                    <Popconfirm
                                        title="Clear All Sales History?"
                                        description={<span>This will permanently delete <strong>all {salesHistory.length} sales records</strong>. This cannot be undone.</span>}
                                        onConfirm={doClearSalesHistory}
                                        okText="Yes, Clear All Sales"
                                        okButtonProps={{ danger: true }}
                                        placement="bottomRight"
                                    >
                                        <Button icon={<DeleteOutlined />} size="small" danger type="primary" ghost
                                            disabled={salesHistory.length === 0}
                                        >Clear Sales</Button>
                                    </Popconfirm>
                                </Space>}>
                                <Table columns={salesColumns} dataSource={filteredSales} rowKey={r => r._id || r.id} loading={salesLoading} pagination={{ pageSize: 20, showSizeChanger: true }} scroll={{ x: 900 }} locale={{ emptyText: 'No sales found' }} />
                            </Card>
                        </div>
                    )
                },
                {
                    key: 'services', label: <span><ThunderboltOutlined style={{ marginRight: 6 }} />Agent Services</span>, children: <ServicesTab />
                }
            ]} />

            {/* Item Detail Modal */}
            <Modal title={<Space><EyeOutlined style={{ color: '#00B4D8' }} /><span>{detailItem?.name}</span></Space>} open={detailVisible} onCancel={() => setDetailVisible(false)} footer={[
                <Button key="sell" type="primary" icon={<DollarOutlined />} disabled={!detailItem || detailItem.stock <= 0} onClick={() => { setDetailVisible(false); handleSell(detailItem); }} style={{ background: '#52c41a' }}>Sell</Button>,
                <Button key="edit" icon={<EditOutlined />} onClick={() => { setDetailVisible(false); handleEdit(detailItem); }}>Edit</Button>,
                <Button key="close" onClick={() => setDetailVisible(false)}>Close</Button>
            ]} width={600}>
                {detailItem && (<>
                    <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
                        <Col span={8}><Card size="small"><Statistic title="Stock" value={detailItem.stock} suffix="units" valueStyle={{ color: detailItem.stock <= (detailItem.lowStockThreshold || 5) ? '#ff4d4f' : '#52c41a' }} /></Card></Col>
                        <Col span={8}><Card size="small"><Statistic title="Price" value={detailItem.price} formatter={v => formatKSH(v)} /></Card></Col>
                        <Col span={8}><Card size="small"><Statistic title="Stock Value" value={detailItem.price * detailItem.stock} formatter={v => formatKSH(v)} /></Card></Col>
                    </Row>
                    <Row gutter={[16, 8]} style={{ marginBottom: 16 }}>
                        <Col span={12}><Text type="secondary">Category:</Text> <Tag color="blue">{detailItem.category || 'General'}</Tag></Col>
                        <Col span={12}><Text type="secondary">Alert Threshold:</Text> <Tag color={detailItem.stock <= (detailItem.lowStockThreshold || 5) ? 'red' : 'green'}>{detailItem.lowStockThreshold || 5} units</Tag></Col>
                    </Row>
                    {detailItem.stock <= (detailItem.lowStockThreshold || 5) && <Alert message={detailItem.stock === 0 ? '🚫 OUT OF STOCK — Restock needed!' : `⚠️ Low stock — Only ${detailItem.stock} remaining`} type={detailItem.stock === 0 ? 'error' : 'warning'} showIcon style={{ marginBottom: 16 }} />}
                    <Divider>Sales History ({detailItemSales.length} records)</Divider>
                    {detailItemSales.length === 0 ? <Empty description="No sales for this item" /> : (
                        <List size="small" dataSource={detailItemSales.slice(0, 15)} renderItem={s => (
                            <List.Item extra={<Text strong style={{ color: '#52c41a' }}>{formatKSH(s.amount)}</Text>}>
                                <List.Item.Meta title={<Space><Tag color="blue">{s.quantity}x</Tag><Text>{s.seller || 'admin'}</Text></Space>}
                                    description={<Text type="secondary" style={{ fontSize: 11 }}>{dayjs(s.createdAt).format('MMM D, YYYY hh:mm A')} • {s.reason || 'Direct sale'}</Text>} />
                            </List.Item>
                        )} />
                    )}
                </>)}
            </Modal>

            {/* Add/Edit Modal */}
            <Modal title={editingItem ? "Edit Item" : "Add New Item"} open={modalVisible} onCancel={() => setModalVisible(false)} onOk={() => form.submit()} okText={editingItem ? "Update" : "Add Item"} confirmLoading={saving} width={600}>
                <Form form={form} layout="vertical" onFinish={handleCreate}>
                    <Form.Item name="name" label="Item Name" rules={[{ required: true }]}><Input placeholder="e.g. A4 Envelope" /></Form.Item>
                    <Row gutter={16}>
                        <Col span={12}><Form.Item name="category" label="Category" initialValue="General"><Input placeholder="e.g. Stationery" /></Form.Item></Col>
                        <Col span={12}><Form.Item name="price" label="Price (KSH)" rules={[{ required: true }]}><InputNumber style={{ width: '100%' }} min={0} formatter={v => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')} parser={v => v.replace(/\$\s?|(,*)/g, '')} /></Form.Item></Col>
                    </Row>
                    <Row gutter={16}>
                        <Col span={12}><Form.Item name="stock" label={editingItem ? "Current Stock" : "Opening Stock"} rules={[{ required: true }]}><InputNumber style={{ width: '100%' }} min={0} /></Form.Item></Col>
                        <Col span={12}><Form.Item name="lowStockThreshold" label="Low Stock Threshold" initialValue={5}><InputNumber style={{ width: '100%' }} min={1} /></Form.Item></Col>
                    </Row>
                    <Form.Item name="description" label="Description"><Input.TextArea rows={2} /></Form.Item>
                </Form>
            </Modal>

            {/* Settings Modal */}
            <Modal title={<><SettingOutlined /> Inventory Settings</>} open={settingsVisible} footer={null} onCancel={() => setSettingsVisible(false)} width={500}>
                <Form layout="vertical">
                    <Form.Item label="User Portal Visibility">
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Show stock to users</span><Switch checked={settings.showTotalItemsToUser} onChange={v => handleUpdateSettings('showTotalItemsToUser', v)} /></div>
                    </Form.Item>
                    <Divider />
                    <Form.Item label={<Space><MailOutlined />Email Notifications</Space>}>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Low stock email alerts</span><Switch checked={settings.lowStockEmailEnabled} onChange={v => handleUpdateSettings('lowStockEmailEnabled', v)} /></div>
                    </Form.Item>
                </Form>
            </Modal>

            {/* Sell Modal */}
            <Modal title={<Space><DollarOutlined style={{ color: '#52c41a' }} /><span>Sell: {sellingItem?.name}</span></Space>} open={sellModalVisible}
                onCancel={() => { setSellModalVisible(false); setSellingItem(null); setLastSaleResult(null); }}
                footer={lastSaleResult ? [<Button key="done" type="primary" onClick={() => { setSellModalVisible(false); setSellingItem(null); setLastSaleResult(null); }}>Done</Button>] : undefined}
                onOk={lastSaleResult ? undefined : () => sellForm.submit()} okText="Complete Sale" okButtonProps={{ style: { background: '#52c41a' } }} width={520}>
                {lastSaleResult ? (
                    <div>
                        <Alert message="Sale Completed ✅" type="success" showIcon style={{ marginBottom: 16 }} />
                        <Card size="small" style={{ background: 'linear-gradient(135deg, rgba(82,196,26,0.05), rgba(0,180,216,0.05))' }}>
                            <div style={{ textAlign: 'center', marginBottom: 12 }}><Title level={4} style={{ margin: 0, color: '#52c41a' }}>{lastSaleResult.itemName}</Title></div>
                            <div style={{ background: 'rgba(255,255,255,0.8)', borderRadius: 12, padding: '12px 16px', textAlign: 'center', marginBottom: 12 }}>
                                <Space size={12} style={{ fontSize: 18 }}><span style={{ fontWeight: 600, color: '#1890ff' }}>{lastSaleResult.quantity}</span><span style={{ color: '#8c8c8c' }}>×</span><span>KSH {lastSaleResult.unitPrice?.toLocaleString()}</span><span style={{ color: '#8c8c8c' }}>=</span><span style={{ fontWeight: 700, color: '#52c41a', fontSize: 22 }}>KSH {lastSaleResult.totalAmount?.toLocaleString()}</span></Space>
                            </div>
                            <Row gutter={16}><Col span={8}><Text type="secondary">Seller</Text><br /><Tag icon={<UserOutlined />} color="blue">{lastSaleResult.seller}</Tag></Col><Col span={8}><Text type="secondary">Payment</Text><br />{lastSaleResult.paymentMethod === 'mpesa' ? <Tag icon={<MobileOutlined />} color="#108ee9">M-Pesa</Tag> : <Tag icon={<DollarOutlined />} color="#52c41a">Cash</Tag>}</Col><Col span={8}><Text type="secondary">Stock</Text><br /><Space size={4}><Tag color="orange">{lastSaleResult.previousStock}</Tag><ArrowRightOutlined style={{ fontSize: 10 }} /><Tag color={lastSaleResult.currentStock <= 5 ? 'red' : 'green'}>{lastSaleResult.currentStock}</Tag></Space></Col></Row>
                        </Card>
                    </div>
                ) : (
                    <>
                        <Alert message={`Stock: ${sellingItem?.stock} units`} type="info" showIcon style={{ marginBottom: 16 }} />
                        <Form form={sellForm} layout="vertical" onFinish={submitSell}>
                            <Form.Item name="quantity" label="Quantity" initialValue={1} rules={[{ required: true }, { type: 'number', min: 1, max: sellingItem?.stock }]}><InputNumber style={{ width: '100%' }} min={1} max={sellingItem?.stock} autoFocus /></Form.Item>
                            <Form.Item name="paymentMethod" label="Payment Method" initialValue="cash" rules={[{ required: true }]}>
                                <Radio.Group buttonStyle="solid" style={{ width: '100%' }}>
                                    <Radio.Button value="cash" style={{ width: '50%', textAlign: 'center' }}><DollarOutlined style={{ marginRight: 4 }} />Cash</Radio.Button>
                                    <Radio.Button value="mpesa" style={{ width: '50%', textAlign: 'center' }}><MobileOutlined style={{ marginRight: 4 }} />M-Pesa</Radio.Button>
                                </Radio.Group>
                            </Form.Item>
                            <Form.Item name="reason" label="Buyer / Reason"><Input placeholder="e.g. Walk-in Customer" /></Form.Item>
                            <div style={{ padding: 12, background: 'rgba(82,196,26,0.1)', borderRadius: 8, textAlign: 'right' }}>
                                <Form.Item shouldUpdate style={{ marginBottom: 0 }}>{() => { const q = sellForm.getFieldValue('quantity') || 0; const p = sellingItem?.price || 0; return <><Text type="secondary">{q} × KSH {p.toLocaleString()} = </Text><Text strong style={{ fontSize: 18, color: '#52c41a' }}>KSH {(q * p).toLocaleString()}</Text></>; }}</Form.Item>
                            </div>
                        </Form>
                    </>
                )}
            </Modal>

            {/* Low Stock Items Modal */}
            <Modal
                title={<Space><WarningOutlined style={{ color: '#ff4d4f' }} /><span>Low Stock & Out of Stock Items ({lowStockItems.length + outOfStockItems.length})</span></Space>}
                open={lowStockModalVisible}
                onCancel={() => setLowStockModalVisible(false)}
                footer={[<Button key="close" onClick={() => setLowStockModalVisible(false)}>Close</Button>]}
                width={750}
            >
                {(lowStockItems.length + outOfStockItems.length) === 0 ? (
                    <Alert message="All items are well stocked!" type="success" showIcon icon={<CheckCircleOutlined />} />
                ) : (
                    <>
                        {outOfStockItems.length > 0 && (
                            <Alert message={`${outOfStockItems.length} item(s) completely out of stock`} type="error" showIcon style={{ marginBottom: 12 }} />
                        )}
                        {lowStockItems.length > 0 && (
                            <Alert message={`${lowStockItems.length} item(s) below their low stock threshold`} type="warning" showIcon style={{ marginBottom: 12 }} />
                        )}
                        <Table
                            dataSource={[...outOfStockItems, ...lowStockItems].sort((a, b) => a.stock - b.stock)}
                            rowKey="_id"
                            pagination={false}
                            size="small"
                            columns={[
                                {
                                    title: 'Item', dataIndex: 'name', key: 'name',
                                    render: (name, record) => (
                                        <Space>
                                            <Text strong>{name}</Text>
                                            {record.stock === 0 && <Tag color="red">OUT OF STOCK</Tag>}
                                            {record.stock > 0 && record.stock <= (record.lowStockThreshold || 5) && <Tag color="volcano">LOW</Tag>}
                                        </Space>
                                    )
                                },
                                { title: 'Category', dataIndex: 'category', key: 'cat', width: 100, render: (c) => <Tag color="blue">{c || 'General'}</Tag> },
                                {
                                    title: 'Stock', dataIndex: 'stock', key: 'stock', width: 80, align: 'center',
                                    render: (stock) => <Text strong style={{ color: stock === 0 ? '#ff4d4f' : '#faad14', fontSize: 16 }}>{stock}</Text>
                                },
                                {
                                    title: 'Threshold', dataIndex: 'lowStockThreshold', key: 'thresh', width: 90, align: 'center',
                                    render: (t) => <Text type="secondary">{t || 5}</Text>
                                },
                                {
                                    title: 'Price', dataIndex: 'price', key: 'price', width: 110,
                                    render: (p) => <Text>{formatKSH(p)}</Text>
                                },
                                {
                                    title: 'Actions', key: 'actions', width: 140,
                                    render: (_, record) => (
                                        <Space>
                                            <Tooltip title="View Details">
                                                <Button size="small" icon={<EyeOutlined />} onClick={() => { setLowStockModalVisible(false); showItemDetail(record); }} />
                                            </Tooltip>
                                            <Tooltip title="Edit / Restock">
                                                <Button size="small" icon={<EditOutlined />} onClick={() => { setLowStockModalVisible(false); handleEdit(record); }} />
                                            </Tooltip>
                                            {record.stock > 0 && (
                                                <Tooltip title="Sell">
                                                    <Button size="small" type="primary" ghost icon={<DollarOutlined />} onClick={() => { setLowStockModalVisible(false); handleSell(record); }} />
                                                </Tooltip>
                                            )}
                                        </Space>
                                    )
                                }
                            ]}
                        />
                    </>
                )}
            </Modal>

            {/* Access Control Modal */}
            <Modal
                title={<Space><LockOutlined style={{ color: '#ff9500' }} /><span>Access Control: {accessItem?.name}</span></Space>}
                open={accessModalVisible}
                onCancel={() => setAccessModalVisible(false)}
                onOk={saveAccessControl}
                confirmLoading={acSaving}
                okText="Save Access Rules"
                okButtonProps={{ style: { background: '#ff9500', borderColor: '#ff9500' } }}
                width={680}
                destroyOnClose
            >
                {accessItem && (<>
                    <Alert message="Control who can see this item and how much stock is visible to each user." type="info" showIcon style={{ marginBottom: 20 }} />

                    {/* Section 1: Visibility Mode */}
                    <div style={{ marginBottom: 24 }}>
                        <Text strong style={{ fontSize: 14, display: 'block', marginBottom: 8 }}>
                            <TeamOutlined style={{ marginRight: 6, color: '#7B2CBF' }} />Visibility Mode
                        </Text>
                        <Radio.Group value={acVisibilityMode} onChange={e => setAcVisibilityMode(e.target.value)}>
                            <Radio.Button value="all">
                                <EyeOutlined style={{ marginRight: 4 }} />All Users (default)
                            </Radio.Button>
                            <Radio.Button value="whitelist">
                                <LockOutlined style={{ marginRight: 4 }} />Whitelist Only
                            </Radio.Button>
                        </Radio.Group>
                        <div style={{ marginTop: 8 }}>
                            <Text type="secondary" style={{ fontSize: 12 }}>
                                {acVisibilityMode === 'all'
                                    ? 'All users can see this item (except those explicitly hidden below).'
                                    : 'Only users in the allowed list below can see this item.'}
                            </Text>
                        </div>
                    </div>

                    {/* Section 2: Whitelist (only shown if whitelist mode) */}
                    {acVisibilityMode === 'whitelist' && (
                        <div style={{ marginBottom: 24, padding: 16, background: 'rgba(123,44,191,0.06)', borderRadius: 8, border: '1px solid rgba(123,44,191,0.15)' }}>
                            <Text strong style={{ display: 'block', marginBottom: 8 }}>
                                <CheckCircleOutlined style={{ marginRight: 6, color: '#52c41a' }} />Allowed Users
                            </Text>
                            <Select mode="multiple" style={{ width: '100%' }} placeholder="Select users who CAN see this item..."
                                value={acAllowedUsers} onChange={setAcAllowedUsers}
                                options={allUsers.map(u => ({ value: u.username, label: `${u.name || u.username} (${u.userType})` }))}
                                filterOption={(input, option) => (option?.label || '').toLowerCase().includes(input.toLowerCase())}
                            />
                            {acAllowedUsers.length === 0 && <Text type="warning" style={{ fontSize: 12, marginTop: 4, display: 'block' }}>⚠ No users selected — item will be hidden from everyone!</Text>}
                        </div>
                    )}

                    <Divider style={{ margin: '16px 0' }} />

                    {/* Section 3: Hidden From Users */}
                    <div style={{ marginBottom: 24 }}>
                        <Text strong style={{ fontSize: 14, display: 'block', marginBottom: 8 }}>
                            <EyeInvisibleOutlined style={{ marginRight: 6, color: '#ff4d4f' }} />Hide from Specific Users
                        </Text>
                        <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 8 }}>
                            These users will not see this item at all in their store.
                        </Text>
                        <Select mode="multiple" style={{ width: '100%' }} placeholder="Select users to hide this item from..."
                            value={acHiddenUsers} onChange={setAcHiddenUsers}
                            options={allUsers.map(u => ({ value: u.username, label: `${u.name || u.username} (${u.userType})` }))}
                            filterOption={(input, option) => (option?.label || '').toLowerCase().includes(input.toLowerCase())}
                        />
                        {acHiddenUsers.length > 0 && (
                            <div style={{ marginTop: 8 }}>
                                <Space wrap>{acHiddenUsers.map(u => <Tag key={u} color="red" closable onClose={() => setAcHiddenUsers(prev => prev.filter(x => x !== u))}><EyeInvisibleOutlined /> {u}</Tag>)}</Space>
                            </div>
                        )}
                    </div>

                    <Divider style={{ margin: '16px 0' }} />

                    {/* Section 4: Stock Limits Per User */}
                    <div>
                        <Text strong style={{ fontSize: 14, display: 'block', marginBottom: 8 }}>
                            <StopOutlined style={{ marginRight: 6, color: '#faad14' }} />Stock Limits Per User
                        </Text>
                        <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 12 }}>
                            Cap the visible stock for specific users. They will see the lower of the actual stock and the limit you set.
                        </Text>
                        {acStockLimits.map((sl, idx) => (
                            <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                                <Select style={{ flex: 1 }} placeholder="Select user" value={sl.username}
                                    onChange={val => { const n = [...acStockLimits]; n[idx] = { ...n[idx], username: val }; setAcStockLimits(n); }}
                                    options={allUsers.filter(u => !acStockLimits.some((s, i) => i !== idx && s.username === u.username)).map(u => ({ value: u.username, label: `${u.name || u.username} (${u.userType})` }))}
                                    filterOption={(input, option) => (option?.label || '').toLowerCase().includes(input.toLowerCase())}
                                />
                                <InputNumber min={0} value={sl.maxVisible} placeholder="Max stock" style={{ width: 120 }}
                                    onChange={val => { const n = [...acStockLimits]; n[idx] = { ...n[idx], maxVisible: val }; setAcStockLimits(n); }}
                                    addonAfter="units"
                                />
                                <Button danger size="small" icon={<DeleteOutlined />} onClick={() => setAcStockLimits(prev => prev.filter((_, i) => i !== idx))} />
                            </div>
                        ))}
                        <Button type="dashed" icon={<PlusOutlined />} onClick={() => setAcStockLimits(prev => [...prev, { username: '', maxVisible: 0 }])} block>
                            Add Stock Limit Rule
                        </Button>
                    </div>

                    {/* Summary */}
                    {(acHiddenUsers.length > 0 || acVisibilityMode === 'whitelist' || acStockLimits.length > 0) && (
                        <Alert style={{ marginTop: 20 }} type="warning" showIcon message="Active Restrictions"
                            description={<Space direction="vertical" size={2}>
                                {acVisibilityMode === 'whitelist' && <Text>• Whitelist mode: Only {acAllowedUsers.length} user(s) can see this item</Text>}
                                {acHiddenUsers.length > 0 && <Text>• Hidden from {acHiddenUsers.length} user(s)</Text>}
                                {acStockLimits.filter(s => s.username && s.maxVisible >= 0).length > 0 && <Text>• Stock limited for {acStockLimits.filter(s => s.username).length} user(s)</Text>}
                            </Space>}
                        />
                    )}
                </>)}
            </Modal>

            <style>{`
                .low-stock-row { background: rgba(255,77,79,0.05) !important; }
                .low-stock-row:hover td { background: rgba(255,77,79,0.1) !important; }
                @keyframes fadeIn { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: translateY(0); } }
            `}</style>
        </div>
    );
}

export default Inventory;
