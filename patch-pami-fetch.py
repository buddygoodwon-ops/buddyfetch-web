import io

pairs = {
    'ilendgirl.html': 'orig-ilendgirl.html',
    'ilendgirl2.html': 'orig-ilendgirl2.html',
    'ilendgirlv5.html': 'orig-ilendgirlv5.html',
}

lk_css = (
    "#lk-stage{display:none;max-width:360px;margin:40px auto;padding:20px;"
    "border-radius:20px;text-align:center;font-family:-apple-system,BlinkMacSystemFont,\"Segoe UI\",Roboto,sans-serif;}\n"
    "#lk-stage video{width:100%;aspect-ratio:1/1;object-fit:cover;border-radius:20px;background:#111;display:block;}\n"
    "#lk-status{min-height:20px;color:#888;font-size:14px;margin:10px 0;text-align:center;}\n"
    "#lk-end{display:none;width:100%;padding:12px;border-radius:999px;border:none;background:#7a1212;color:#fff;font-size:15px;font-weight:600;cursor:pointer;}\n"
)

stage = ('<div id="lk-stage"><video id="lk-video" autoplay playsinline muted></video>'
         '<div id="lk-status">Connecting...</div><button id="lk-end">End Call</button></div>\n')

lkjs = '<script src="https://cdn.jsdelivr.net/npm/livekit-client@2/dist/livekit-client.umd.min.js"></script>\n'

startfn = (
    "var lkRoom=null;\n"
    "function lkStatus(m){var e=document.getElementById('lk-status');if(e)e.textContent=m;}\n"
    "async function startPami(){try{var w=document.querySelector('lemon-slice-widget');if(w){w.setAttribute('controlled-widget-state','minimized');}\n"
    "var p=document.querySelector('.buddy-avatar-promo');if(p)p.style.display='none';\n"
    "document.getElementById('lk-stage').style.display='block';\n"
    "lkStatus('Getting a LiveKit token...');\n"
    "var part='visitor-'+Math.floor(Math.random()*1e5);\n"
    "var r=await fetch('/api/start?room=pami-demo&participant='+encodeURIComponent(part)+'&dispatch=0&t='+Date.now());\n"
    "if(!r.ok)throw new Error('token HTTP '+r.status);var t=await r.json();\n"
    "lkStatus('Connecting to PAMI...');\n"
    "lkRoom=new LivekitClient.Room({adaptiveStream:false,dynacast:false});\n"
    "lkRoom.on(LivekitClient.RoomEvent.TrackSubscribed,function(track){if(track.kind==='video'){track.attach(document.getElementById('lk-video'));document.getElementById('lk-video').play().catch(function(){});}else if(track.kind==='audio'){var a=track.attach();a.style.display='none';document.body.appendChild(a);}});\n"
    "lkRoom.on(LivekitClient.RoomEvent.TrackUnsubscribed,function(track){if(track.kind==='video')track.detach();});\n"
    "lkRoom.on(LivekitClient.RoomEvent.Disconnected,function(){lkRoom=null;document.getElementById('lk-stage').style.display='none';var p=document.querySelector('.buddy-avatar-promo');if(p)p.style.display='block';document.getElementById('lk-end').style.display='none';});\n"
    "await lkRoom.connect(t.url,t.token);\n"
    "try{await lkRoom.startAudio();}catch(e){}\n"
    "var mic=await LivekitClient.createLocalAudioTrack();\n"
    "await lkRoom.localParticipant.publishTrack(mic);\n"
    "lkStatus('Connected - PAMI (iLendGirl.com) is on.');\n"
    "document.getElementById('lk-end').style.display='block';}catch(e){lkStatus('Could not connect: '+e.message);}}\n"
    "document.getElementById('lk-end').addEventListener('click',async function(){if(lkRoom){await lkRoom.disconnect();lkRoom=null;}});\n"
)

for out, src in pairs.items():
    with io.open(src, 'r', encoding='utf-8') as f:
        c = f.read()
    assert '</style>' in c, out
    c = c.replace('</style>', lk_css + '</style>', 1)
    assert '<lemon-slice-widget' in c, out
    c = c.replace('<lemon-slice-widget', stage + '<lemon-slice-widget', 1)
    old_listener = "document.getElementById('start-buddy-avatar').addEventListener('click',openBuddyAvatar);"
    assert old_listener in c, 'listener missing in ' + out
    c = c.replace(old_listener, "document.getElementById('start-buddy-avatar').addEventListener('click',startPami);", 1)
    c = c.replace('<script>function openBuddyAvatar', lkjs + '<script>function openBuddyAvatar', 1)
    i = c.rfind('</script>')
    c = c[:i] + startfn + c[i:]
    with io.open(out, 'w', encoding='utf-8') as f:
        f.write(c)
    print('patched', out, len(c))
print('done')
