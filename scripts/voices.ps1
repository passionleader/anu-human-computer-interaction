$ErrorActionPreference='Stop'
$prototypeRoot = Split-Path -Parent $PSScriptRoot
$voice = New-Object -ComObject SAPI.SpVoice
$english = @($voice.GetVoices() | Where-Object { $_.GetDescription() -match 'Zira' })
if (!$english.Count) { throw 'Microsoft Zira Desktop female English voice is required.' }
$voice.Voice = $english[0]
$voice.Rate = -1
$phrases = @{
 'welcome'='Welcome. Please scan your first item.'
 'unknown'='Item not recognised. Please try again.'
 'membership'='Scan your membership card, or select Skip.'
 'payment'='Tap your card, or pay directly on your smartphone.'
 'complete'='Thank you for shopping with us. Your receipt has been sent to your smartphone.'
}
foreach ($key in $phrases.Keys) {
 $stream=New-Object -ComObject SAPI.SpFileStream
 $stream.Open((Join-Path $prototypeRoot "asset-sources/$key.wav"),3)
 $voice.AudioOutputStream=$stream
 [void]$voice.Speak($phrases[$key])
 $stream.Close()
}
Write-Output $voice.Voice.GetDescription()
