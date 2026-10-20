// Owner-only setup helper. Never expose authorization URLs through HTTP.
function authorizeFacebookCloud() {
  var auth = ScriptApp.getAuthorizationInfo(ScriptApp.AuthMode.FULL);
  Logger.log(String(auth.getAuthorizationStatus()));
  if (auth.getAuthorizationStatus() === ScriptApp.AuthorizationStatus.REQUIRED) Logger.log(auth.getAuthorizationUrl());
}

function testFacebookCloudConnection() {
  var p=PropertiesService.getScriptProperties(),t=p.getProperty('BMP_APIFY_READ_TOKEN'),task=p.getProperty('BMP_APIFY_TASK_ID');
  var r=UrlFetchApp.fetch('https://api.apify.com/v2/actor-tasks/'+task+'/runs/last?status=SUCCEEDED',{headers:{Authorization:'Bearer '+t},muteHttpExceptions:true});
  var j=JSON.parse(r.getContentText());
  Logger.log(JSON.stringify({stage:'task_run',http:r.getResponseCode(),error:j.error?.type,message:j.error?.message}));
  if(r.getResponseCode()!==200)return;
  var d=UrlFetchApp.fetch('https://api.apify.com/v2/datasets/'+j.data.defaultDatasetId+'/items?format=json&clean=true&limit=1',{headers:{Authorization:'Bearer '+t},muteHttpExceptions:true});
  var e=d.getResponseCode()===200?{}:JSON.parse(d.getContentText()).error||{};
  Logger.log(JSON.stringify({stage:'dataset',http:d.getResponseCode(),error:e.type,message:e.message}));
}
