const fs = require('fs');
try {
    const content = fs.readFileSync('C:\\Users\\Admin\\.gemini\\antigravity\\brain\\587de305-9efb-4ceb-ba1a-0146f5a3463f\\.system_generated\\logs\\overview.txt', 'utf-8');
    
    const searchStr = 'File Path: `file:///C:/Users/Admin/OneDrive/Desktop/HawkNine/desktop-agent/sheets-monitor.js`\nTotal Lines: 497';
    let idx = content.indexOf(searchStr);
    
    if (idx === -1) {
        console.log('Could not find the original view_file block for 497 lines.');
        process.exit(1);
    }
    
    const startStr = 'The following code has been modified to include a line number before every line, in the format: <line_number>: <original_line>. Please note that any changes targeting the original code should remove the line number, colon, and leading space.\n';
    const startIdx = content.indexOf(startStr, idx) + startStr.length;
    
    const endIdx = content.indexOf('The above content shows the entire, complete file contents', startIdx);
    
    if (startIdx > startStr.length && endIdx > startIdx) {
        const textBlock = content.substring(startIdx, endIdx);
        const lines = textBlock.split('\n');
        
        const finalLines = [];
        let num = 1;
        for (const line of lines) {
            const prefix = num + ': ';
            if (line.startsWith(prefix)) {
                finalLines.push(line.substring(prefix.length));
                num++;
            } else if (line.trim() === '') {
                finalLines.push('');
                // Note: sometimes empty lines are just numbered. If not, it could mess up.
                // Let's rely on standard line matching for view_file
            }
        }
        
        fs.writeFileSync('desktop-agent/sheets-monitor.js', finalLines.join('\n'), 'utf-8');
        console.log(`Successfully restored ${finalLines.length} lines directly from the transcript.`);
    } else {
        console.log('Markers not found');
    }
} catch (e) {
    console.error(e);
}
