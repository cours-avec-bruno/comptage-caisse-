' Pose l'icône « Caisse piscine » sur le Bureau et dans le menu Démarrer.
'
' Le raccourci vise `wscript.exe` plutôt que le .vbs directement : sur un poste
' où l'extension .vbs n'est pas associée, Windows demanderait « avec quel
' programme ouvrir ce fichier ? » — la dernière question à poser à quelqu'un
' qui vient de double-cliquer sur une icône.

Option Explicit

Dim shell, fso, racine, lanceur, icone, cible, lien
Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

' Ce script vit dans scripts/ : la racine du projet est le dossier au-dessus.
racine = fso.GetParentFolderName(fso.GetParentFolderName(WScript.ScriptFullName))
lanceur = fso.BuildPath(racine, "demarrer-caisse.vbs")
icone = fso.BuildPath(racine, "caisse.ico")

If Not fso.FileExists(lanceur) Then
  MsgBox "Fichier manquant : " & lanceur, vbCritical, "Caisse"
  WScript.Quit 1
End If

For Each cible In Array(shell.SpecialFolders("Desktop"), shell.SpecialFolders("StartMenu"))
  Set lien = shell.CreateShortcut(fso.BuildPath(cible, "Caisse piscine.lnk"))
  lien.TargetPath = "wscript.exe"
  lien.Arguments = Chr(34) & lanceur & Chr(34)
  lien.WorkingDirectory = racine
  lien.IconLocation = icone
  lien.Description = "Caisse - accueil piscine"
  lien.Save
Next
