Set word = CreateObject("Word.Application")
Set doc = word.Documents.Add()
doc.Range.Text = "Test Print"
word.ActivePrinter = "HawkNineTestPrinter"
word.PrintOut False, False, 0, False, False, "", "", 3
WScript.Sleep 3000
doc.Close 0
word.Quit
