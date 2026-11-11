#!/bin/zsh
cd -- "${0:A:h}"
python3 - <<'PY'
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
import threading, webbrowser
url = 'http://localhost:8083/spp3_BLE/preview.html'
try:
    server = ThreadingHTTPServer(('127.0.0.1', 8083), SimpleHTTPRequestHandler)
except OSError as e:
    print('無法啟動預覽：', e)
    input('按 Enter 結束')
    raise SystemExit(1)
print('模擬操作預覽：', url)
print('完整實機 Web：http://localhost:8083/spp3_BLE/')
print('關閉此視窗或按 Ctrl+C 可停止伺服器。')
threading.Timer(0.7, lambda: webbrowser.open(url)).start()
try:
    server.serve_forever()
except KeyboardInterrupt:
    pass
finally:
    server.server_close()
PY
