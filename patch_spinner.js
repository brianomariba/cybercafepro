const fs = require('fs');
let code = fs.readFileSync('desktop-agent/dist/test_ui_automation.ps1', 'utf8');

const findCopies = /\ = \[int\]\\.Current\.Value\s*\} catch \{\}/;
const replaceCopies = "\ = [int]\.Current.Value\n                    } catch {\n                        try {\n                            \ = \.Current.Name\n                            if (\ -match '^\d+$') { \ = [int]\ }\n                        } catch {}\n                    }";

code = code.replace(findCopies, replaceCopies);
fs.writeFileSync('desktop-agent/dist/test_ui_automation.ps1', code);

let mCode = fs.readFileSync('desktop-agent/print-monitor.js', 'utf8');
mCode = mCode.replace(findCopies, replaceCopies);
fs.writeFileSync('desktop-agent/print-monitor.js', mCode);
