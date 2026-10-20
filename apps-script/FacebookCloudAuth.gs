// Owner-only setup helper. Never expose authorization URLs through HTTP.
function authorizeFacebookCloud() {
  var auth = ScriptApp.getAuthorizationInfo(ScriptApp.AuthMode.FULL);
  Logger.log(String(auth.getAuthorizationStatus()));
  if (auth.getAuthorizationStatus() === ScriptApp.AuthorizationStatus.REQUIRED) Logger.log(auth.getAuthorizationUrl());
}
