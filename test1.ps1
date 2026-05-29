
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes

Add-Type @"
using System;
using System.Runtime.InteropServices;
using System.Text;
public class DlgReader {
    [DllImport("user32.dll")]
    public static extern IntPtr FindWindow(string className, string windowName);
    [DllImport("user32.dll")]
    public static extern IntPtr GetDlgItem(IntPtr hDlg, int nIDDlgItem);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    public static extern int SendMessage(IntPtr hWnd, int msg, int wParam, StringBuilder lParam);
    [DllImport("user32.dll")]
    public static extern bool IsWindowVisible(IntPtr hWnd);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);
}
"@

\$root = [System.Windows.Automation.AutomationElement]::RootElement
\$lastJson = ""
\$dialogWasOpen = \$false
\$lastResult = \$null

function Find-UIValue(\$parent, \$name) {
    try {
        \$cond = New-Object System.Windows.Automation.PropertyCondition(
            [System.Windows.Automation.AutomationElement]::NameProperty, \$name)
        \$els = \$parent.FindAll([System.Windows.Automation.TreeScope]::Descendants, \$cond)
        foreach (\$el in \$els) {
            \$ct = \$el.Current.ControlType.ProgrammaticName
            if (\$ct -eq 'ControlType.Text') { continue }
            # 1. Try ValuePattern (works for text inputs, web controls)
            try {
                \$vp = \$el.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern)
                \$val = \$vp.Current.Value
                if (\$val -and \$val -ne '') { return \$val }
            } catch {}
            # 2. Try SelectionPattern (works for ComboBoxes, ListBoxes - EPSON Paper Type dropdown)
            try {
                \$sp = \$el.GetCurrentPattern([System.Windows.Automation.SelectionPattern]::Pattern)
                \$sel = \$sp.Current.GetSelection()
                if (\$sel -and \$sel.Length -gt 0) {
                    return \$sel[0].Current.Name
                }
            } catch {}
            # 3. For ComboBox: find selected ListItem inside
            if (\$ct -eq 'ControlType.ComboBox') {
                try {
                    \$liCond = New-Object System.Windows.Automation.PropertyCondition(
                        [System.Windows.Automation.AutomationElement]::ControlTypeProperty,
                        [System.Windows.Automation.ControlType]::ListItem)
                    \$items = \$el.FindAll([System.Windows.Automation.TreeScope]::Descendants, \$liCond)
                    foreach (\$item in \$items) {
                        try {
                            \$si = \$item.GetCurrentPattern([System.Windows.Automation.SelectionItemPattern]::Pattern)
                            if (\$si.Current.IsSelected) {
                                return \$item.Current.Name
                            }
                        } catch {}
        