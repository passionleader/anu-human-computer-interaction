$ErrorActionPreference='Stop'
$prototypeRoot = Split-Path -Parent $PSScriptRoot
$voice = New-Object -ComObject SAPI.SpVoice
$english = @($voice.GetVoices() | Where-Object { $_.GetDescription() -match 'David|English' })
if ($english.Count -gt 0) { $voice.Voice = $english[0] }
$voice.Rate = -1
$phrases = @{
 'welcome'='Welcome. Please scan your first item.'
 'unknown'='Item not recognised. Please try again.'
 'membership'='Scan your membership card, or select Skip.'
 'payment'='Tap your card or smartphone to pay.'
 'complete'='Thank you for shopping with us. Your receipt is digital.'
 'thanks-voice'='Thank you!'
}
foreach ($key in $phrases.Keys) {
 $stream=New-Object -ComObject SAPI.SpFileStream
 $stream.Open((Join-Path $prototypeRoot "asset-sources/$key.wav"),3)
 $voice.AudioOutputStream=$stream
 [void]$voice.Speak($phrases[$key])
 $stream.Close()
}
Write-Output $voice.Voice.GetDescription()
