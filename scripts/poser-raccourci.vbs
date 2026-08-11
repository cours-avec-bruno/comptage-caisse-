' Pose l'icone "Caisse piscine" sur le Bureau et dans le menu Demarrer.
'
' Le raccourci vise wscript.exe plutot que le .vbs directement : sur un poste
' ou l'extension .vbs n'est pas associee, Windows demanderait "avec quel
' programme ouvrir ce fichier ?" -- la derniere question a poser a quelqu'un
' qui vient de double-cliquer sur une icone.
'
' ASCII pur, sans BOM : voir l'entete de demarrer-caisse.vbs.

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
