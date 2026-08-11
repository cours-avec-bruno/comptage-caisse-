' Lanceur « application de bureau » pour Windows.
'
' Il fait trois choses que le .bat ne peut pas faire :
'   - démarrer le serveur SANS fenêtre noire ;
'   - attendre qu'il réponde vraiment avant d'ouvrir quoi que ce soit ;
'   - ouvrir une fenêtre de navigateur en mode application — sans barre
'     d'adresse, sans onglets, avec sa propre icône dans la barre des tâches.
'
' Relancé alors que la caisse tourne déjà, il n'en démarre pas une deuxième :
' il rouvre simplement la fenêtre. Deux serveurs sur la même base seraient un
' très mauvais moment à passer.

Option Explicit

Const PORT = 4173
Const ATTENTE_MAX = 60   ' demi-secondes : 30 s, large même sur un PC poussif

Dim shell, fso, racine, adresse
Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

racine = fso.GetParentFolderName(WScript.ScriptFullName)
shell.CurrentDirectory = racine
adresse = "http://localhost:" & PORT & "/"

' --- Le serveur répond-il déjà ? -------------------------------------------
If Not RepondDeja(adresse) Then
  If Not Preparer() Then WScript.Quit 1

  ' Fenêtre cachée (0), et on ne l'attend pas (False) : elle vit sa vie.
  shell.Run "cmd /c npm start", 0, False

  Dim essais
  essais = 0
  Do While essais < ATTENTE_MAX
    WScript.Sleep 500
    If RepondDeja(adresse) Then Exit Do
    essais = essais + 1
  Loop

  If essais >= ATTENTE_MAX Then
    MsgBox "La caisse n'a pas démarré." & vbCrLf & vbCrLf & _
           "Double-cliquez sur « demarrer-caisse.bat » : il affiche le message" & vbCrLf & _
           "d'erreur au lieu de le cacher.", vbCritical, "Caisse"
    WScript.Quit 1
  End If
End If

Ouvrir adresse

' ---------------------------------------------------------------------------

' Vrai si quelque chose répond à cette adresse. Sert aussi de détection de
' double lancement : le port occupé, c'est la caisse déjà en route.
Function RepondDeja(url)
  Dim requete
  RepondDeja = False
  On Error Resume Next
  Set requete = CreateObject("MSXML2.XMLHTTP")
  ' Adresse unique à chaque essai : une réponse gardée en cache ferait croire
  ' que le serveur répond alors qu'il n'est pas encore levé.
  requete.Open "GET", url & "?_=" & Timer, False
  requete.setRequestHeader "Cache-Control", "no-cache"
  requete.Send
  If Err.Number = 0 Then RepondDeja = (requete.Status > 0)
  On Error GoTo 0
End Function

' Première utilisation, ou après une mise à jour. Ces deux étapes-là prennent
' du temps : la fenêtre reste visible pour qu'on voie qu'il se passe quelque
' chose, et pour lire l'erreur si Node.js manque.
Function Preparer()
  Preparer = False

  If Not fso.FolderExists(fso.BuildPath(racine, "node_modules")) Then
    If shell.Run("cmd /c title Caisse - installation & npm install", 1, True) <> 0 Then
      MsgBox "L'installation a échoué." & vbCrLf & vbCrLf & _
             "Node.js est-il installé ? https://nodejs.org (version LTS)", _
             vbCritical, "Caisse"
      Exit Function
    End If
  End If

  If Not fso.FileExists(fso.BuildPath(racine, "client\dist\index.html")) Then
    If shell.Run("cmd /c title Caisse - preparation & npm run build", 1, True) <> 0 Then
      MsgBox "La préparation de l'affichage a échoué.", vbCritical, "Caisse"
      Exit Function
    End If
  End If

  Preparer = True
End Function

' Une fenêtre d'application plutôt qu'un onglet : c'est tout ce qui sépare
' « un site ouvert dans le navigateur » de « le logiciel de la caisse ».
Sub Ouvrir(url)
  Dim candidats, chemin
  candidats = Array( _
    "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe", _
    "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe", _
    "%ProgramFiles%\Google\Chrome\Application\chrome.exe", _
    "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe", _
    "%LocalAppData%\Google\Chrome\Application\chrome.exe")

  Dim i
  For i = 0 To UBound(candidats)
    chemin = shell.ExpandEnvironmentStrings(candidats(i))
    If fso.FileExists(chemin) Then
      shell.Run """" & chemin & """ --app=" & url, 1, False
      Exit Sub
    End If
  Next

  ' Ni Edge ni Chrome : le navigateur par défaut, avec sa barre d'adresse.
  shell.Run url, 1, False
End Sub
