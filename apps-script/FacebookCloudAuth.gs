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

// Owner-only audit: aggregates only, never token/image payloads or contacts.
function auditFacebookCloud(){
 var b=SpreadsheetApp.openById(GP_PUBLICATION_SPREADSHEET),q=b.getSheetByName('FB_QUEUE').getDataRange().getValues().slice(1),counts={};
 q.forEach(function(r){counts[r[2]]=(counts[r[2]]||0)+1;});
 var ids=q.map(fbCloudQueuePostId_),prefixed=q.every(function(r,i){return r[0]==='POST_'+ids[i];});
 var p=PropertiesService.getScriptProperties(),token=p.getProperty('BMP_APIFY_READ_TOKEN'),task=p.getProperty('BMP_APIFY_TASK_ID');
 var run=fbCloudApi_('/actor-tasks/'+task+'/runs/last?status=SUCCEEDED',token).data;
 var items=fbCloudApi_('/datasets/'+run.defaultDatasetId+'/items?format=json&clean=true&limit=50',token),known=new Set(ids);
 var missing=0;items.forEach(function(item){try{if(!known.has(normalizeFacebookPost(item,FB_IMPORT_SOURCES).post_id))missing++;}catch(error){}});
 Logger.log(JSON.stringify({enabled:p.getProperty('BMP_FACEBOOK_CLOUD_ENABLED')==='true',hourly_triggers:ScriptApp.getProjectTriggers().filter(function(t){return t.getHandlerFunction()==='syncFacebookCloud';}).length,queue:q.length,statuses:counts,unique_posts:known.size,exact_text_ids:prefixed,replay_missing_posts:missing}));
}
function testFacebookCloudDedupe(){
 var lock=LockService.getScriptLock();if(!lock.tryLock(10000))throw Error('IMPORT_BUSY');
 try{
  var book=SpreadsheetApp.openById(GP_PUBLICATION_SPREADSHEET),records=JSON.parse(JSON.stringify(FB_IMPORT_BATCH.filter(function(r){return r.year_verified===true&&!r.date_conflict;})));
  var result=fbCloudSave_(book,records,Utilities.formatDate(new Date(),'Europe/Paris','yyyy-MM-dd'));
  Logger.log(JSON.stringify(result));
 }finally{lock.releaseLock();}
}

function processFacebookCloudBacklog(){
 var start=Date.now(),runs=0;
 while(runs<9&&Date.now()-start<240000){
  var sheet=SpreadsheetApp.openById(GP_PUBLICATION_SPREADSHEET).getSheetByName('FB_QUEUE');
  if(sheet&&sheet.getLastRow()>1&&!sheet.getDataRange().getValues().slice(1).some(function(r){return r[2]==='PENDING';}))break;
  var report=syncFacebookCloud();if(report.enabled===false||report.busy)break;runs++;
 }
 Logger.log(JSON.stringify({batches:runs}));
}
