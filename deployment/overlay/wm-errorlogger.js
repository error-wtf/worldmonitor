(function(){
  window.addEventListener("error", function(e){
    try{ fetch("/worldmapp/wm-client-error",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({t:"error",msg:String(e.message).slice(0,300),src:(e.filename||"").slice(-60),line:e.lineNo,stack:String(e.error&&e.error.stack||"").slice(0,600)})}); }catch(_){}
  }, true);
  window.addEventListener("unhandledrejection", function(e){
    try{ fetch("/worldmapp/wm-client-error",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({t:"rejection",msg:String(e.reason).slice(0,300)})}); }catch(_){}
  }, true);
})();
