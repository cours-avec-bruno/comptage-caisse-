' Lanceur "application de bureau" pour Windows.
'
' Il fait trois choses que le .bat ne peut pas faire :
'   - demarrer le serveur SANS fenetre noire ;
'   - attendre qu'il reponde vraiment avant d'ouvrir quoi que ce soit ;
'   - ouvrir une fenetre de navigateur en mode application, sans barre
'     d'adresse ni onglets, avec sa propre icone dans la barre des taches.
'
' Relance alors que la caisse tourne deja, il n'en demarre pas une deuxieme :
' il rouvre simplement la fenetre. Deux serveurs sur la meme base seraient un
' tres mauvais moment a passer.
'
' Ce fichier est en ASCII pur, sans BOM, et doit le rester. L'hote de script
' de Windows ne reconnait que le BOM UTF-16 : un BOM UTF-8 lui arrive comme
' trois caracteres et il refuse de compiler des la premiere colonne.

Option Explicit

Const PORT = 4173
Const ATTENTE_MAX = 60   ' demi-secondes : 30 s, large meme sur un PC poussif

Dim shell, fso, racine, adresse
Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

racine = fso.GetParentFolderName(WScript.ScriptFullName)
shell.CurrentDirectory = racine
adresse = "http://localhost:" & PORT & "/"

' --- Le serveur repond-il deja ? -------------------------------------------
If Not RepondDeja(adresse) Then
  If Not Preparer() Then WScript.Quit 1

  ' Fenetre cachee (0), et on ne l'attend pas (False) : elle vit sa vie.
  shell.Run "cmd /c npm start", 0, False

  Dim essais
  essais = 0
  Do While essais < ATTENTE_MAX
    WScript.Sleep 500
    If RepondDeja(adresse) Then Exit Do
    essais = essais + 1
  Loop

  If essais >= ATTENTE_MAX Then
    MsgBox "La caisse n'a pas demarre." & vbCrLf & vbCrLf & _
           "Double-cliquez sur demarrer-caisse.bat : il affiche le message" & vbCrLf & _
           "d'erreur au lieu de le cacher.", vbCritical, "Caisse"
    WScript.Quit 1
  End If
End If

Ouvrir adresse

' ---------------------------------------------------------------------------

' Vrai si quelque chose repond a cette adresse. Sert aussi de detection de
' double lancement : le port occupe, c'est la caisse deja en route.
Function RepondDeja(url)
  Dim requete
  RepondDeja = False
  On Error Resume Next
  Set requete = CreateObject("MSXML2.XMLHTTP")
  ' Adresse unique a chaque essai : une reponse gardee en cache ferait croire
  ' que le serveur repond alors qu'il n'est pas encore leve.
  requete.Open "GET", url & "?_=" & Timer, False
  requete.setRequestHeader "Cache-Control", "no-cache"
  requete.Send
  If Err.Number = 0 Then RepondDeja = (requete.Status > 0)
  On Error GoTo 0
End Function

' Premiere utilisation, ou apres une mise a jour. Ces deux etapes-la prennent
' du temps : la fenetre reste visible pour qu'on voie qu'il se passe quelque
' chose, et pour lire l'erreur si Node.js manque.
Function Preparer()
  Preparer = False

  If Not fso.FolderExists(fso.BuildPath(racine, "node_modules")) Then
    If shell.Run("cmd /c title Caisse - installation & npm install", 1, True) <> 0 Then
      MsgBox "L'installation a echoue." & vbCrLf & vbCrLf & _
             "Node.js est-il installe ? https://nodejs.org (version LTS)", _
             vbCritical, "Caisse"
      Exit Function
    End If
  End If

  If Not fso.FileExists(fso.BuildPath(racine, "client\dist\index.html")) Then
    If shell.Run("cmd /c title Caisse - preparation & npm run build", 1, True) <> 0 Then
      MsgBox "La preparation de l'affichage a echoue.", vbCritical, "Caisse"
      Exit Function
    End If
  End If

  Preparer = True
End Function

' Une fenetre d'application plutot qu'un onglet : c'est tout ce qui separe
' "un site ouvert dans le navigateur" de "le logiciel de la caisse".
Sub Ouvrir(url)
  Dim candidats, chemin, i
  candidats = Array( _
    "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe", _
    "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe", _
    "%ProgramFiles%\Google\Chrome\Application\chrome.exe", _
    "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe", _
    "%LocalAppData%\Google\Chrome\Application\chrome.exe")

  For i = 0 To UBound(candidats)
    chemin = shell.ExpandEnvironmentStrings(candidats(i))
    If fso.FileExists(chemin) Then
      shell.Run """" & chemin & """ --app=" & url, 1, False
      Exit Sub
    End If
  Next

  ' Ni Edge ni Chrome : le navigateur par defaut, avec sa barre d'adresse.
  shell.Run url, 1, False
End Sub
