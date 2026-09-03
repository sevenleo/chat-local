# server.py
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler

HOST = "127.0.0.1"
PORT = 8000

server = ThreadingHTTPServer((HOST, PORT), SimpleHTTPRequestHandler)

print(f"Servidor rodando em http://{HOST}:{PORT}")
print("Abra: http://127.0.0.1:8000/chat.html")
print("Pressione Ctrl+C para parar.")

try:
    server.serve_forever()
except KeyboardInterrupt:
    print("\nServidor encerrado.")
    server.server_close()