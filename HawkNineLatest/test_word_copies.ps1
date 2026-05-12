try {
    $word = [System.Runtime.InteropServices.Marshal]::GetActiveObject("Word.Application")
    
    # Method 1: Read Application.PrintOut parameters
    Write-Output ("ActivePrinter=" + $word.ActivePrinter)
    Write-Output ("DocName=" + $word.ActiveDocument.Name)
    
    # Method 2: Check the wdDialogFilePrint dialog properties
    $dlg = $word.Dialogs.Item(88) # wdDialogFilePrint
    Write-Output ("NumCopies=" + $dlg.NumCopies)
    Write-Output ("Copies=" + $dlg.Copies)
    Write-Output ("Range=" + $dlg.Range)
    Write-Output ("Pages=" + $dlg.Pages)
    
    # Method 3: Try wdDialogFilePrintSetup
    $dlg2 = $word.Dialogs.Item(97) # wdDialogFilePrintSetup
    Write-Output ("PrintSetup.NumCopies=" + $dlg2.NumCopies)
    
    # Method 4: Try Options.PrintCopies (global setting)
    try { Write-Output ("Options.PrintDraft=" + $word.Options.PrintDraft) } catch {}

    # Method 5: Word's recent file access - BuiltInDocumentProperties
    try {
        $doc = $word.ActiveDocument
        $props = $doc.BuiltInDocumentProperties
        foreach ($p in $props) {
            try {
                $name = $p.Name
                if ($name -match 'copy|print|page') {
                    Write-Output ("DocProp: " + $name + "=" + $p.Value)
                }
            } catch {}
        }
    } catch {}

} catch {
    Write-Output ("ERROR: " + $_.Exception.Message)
}
