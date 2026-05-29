const fs = require('fs');
let code = fs.readFileSync('desktop-agent/print-monitor.js', 'utf8');

// Replace the 'if (-not \)' for METHOD 5 with a block that always checks driver properties
// and merges the properties into existing result if found.
const findStr = "    # === METHOD 5: Printer Driver Properties/Preferences Dialog ===\n    # (e.g. \"EPSON L3150 Series Properties\" opened from Word or system dialog)\n    # This dialog has Paper Type, Color, Copies, Quality, Document Size, etc.\n    if (-not \\\) {";

const replaceStr = "    # === METHOD 5: Printer Driver Properties/Preferences Dialog ===\n    # (e.g. \"EPSON L3150 Series Properties\" opened from Word or system dialog)\n    # This dialog has Paper Type, Color, Copies, Quality, Document Size, etc.\n    \ = \\\False\n    if (\\\True) {";

code = code.replace(findStr, replaceStr);

// Then, at the bottom of METHOD 5 where it assigns \ = @{ ... }
const findAssign = "                        if (\\\) { try { \\\ = [int]\\\ } catch {} }\n\n                        \\\ = @{";
const replaceAssign = "                        if (\\\) { try { \\\ = [int]\\\ } catch {} }\n\n                        \\\ = \\\True\n                        if (\\\) {\n                            if (\\\) { \\\.color = \\\ }\n                            if (\\\) { \\\.media = \\\ }\n                            if (\\\) { \\\.paper = \\\ }\n                            if (\\\) { \\\.orient = \\\ }\n                            if (\\\) { \\\.duplex = \\\ }\n                            if (\\\ -and -not \\\.p) { \\\.p = \\\ }\n                        } else {\n                            \\\ = @{";

code = code.replace(findAssign, replaceAssign);

// Close the else block
const findEnd = "                            final = 0; t = (Get-Date -Format o)\n                        }\n                    }\n                }\n            }\n        } catch {}";
const replaceEnd = "                            final = 0; t = (Get-Date -Format o)\n                        }\n                        }\n                    }\n                }\n            }\n        } catch {}";

code = code.replace(findEnd, replaceEnd);

fs.writeFileSync('desktop-agent/print-monitor.js', code);
