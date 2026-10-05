"""Test del server dell'app locale (solo libreria standard)."""
import json
import sys
import threading
import unittest
import urllib.error
import urllib.request
from http.server import ThreadingHTTPServer
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "locale"))
import server  # noqa: E402


class Logica(unittest.TestCase):
    def test_stima_in_forme_diverse(self):
        self.assertEqual(server.leggi_stima({"data": {"count": 120, "price": 6}}), (120, 6))
        self.assertEqual(server.leggi_stima({"data": {"totalRecords": 80, "cost": {"amount": 4.5}}}), (80, 4.5))

    def test_senza_token_modalita_dimostrativa(self):
        self.assertTrue(server.gestisci({"azione": "stima", "lat": 45, "lon": 9, "raggioKm": 10}, {})["demo"])

    def test_parametri(self):
        p = server.parametri({"lat": 45.1, "lon": 9.2, "raggioKm": 15, "minDipendenti": 10}, "49")
        self.assertEqual(p["radius"], "15000")
        self.assertEqual(p["long"], "9.2")
        self.assertEqual(p["minEmployees"], "10")
        self.assertEqual(p["atecoCode"], "49")


class Http(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = Path(__file__).resolve().parent / "_app_finta"
        cls.tmp.mkdir(exist_ok=True)
        (cls.tmp / "index.html").write_text("<p>app</p>", encoding="utf-8")
        (cls.tmp / "data.json").write_text("{}", encoding="utf-8")
        server.APP = cls.tmp
        server.PORTA = 18790
        server.HOST_AMMESSI = {"localhost:18790", "127.0.0.1:18790"}
        cls.srv = ThreadingHTTPServer(("127.0.0.1", 18790), server.Gestore)
        threading.Thread(target=cls.srv.serve_forever, daemon=True).start()

    @classmethod
    def tearDownClass(cls):
        cls.srv.shutdown()
        for f in cls.tmp.iterdir():
            f.unlink()
        cls.tmp.rmdir()

    def get(self, path, host="localhost:18790"):
        req = urllib.request.Request(f"http://127.0.0.1:18790{path}", headers={"Host": host})
        with urllib.request.urlopen(req) as r:
            return r.status, r.read().decode()

    def post(self, body, host="localhost:18790", origin=None):
        h = {"Host": host, "Content-Type": "application/json"}
        if origin:
            h["Origin"] = origin
        req = urllib.request.Request("http://127.0.0.1:18790/api/companies", data=json.dumps(body).encode(), headers=h, method="POST")
        try:
            with urllib.request.urlopen(req) as r:
                return r.status, json.loads(r.read())
        except urllib.error.HTTPError as e:
            return e.code, json.loads(e.read() or b"{}")

    def test_file_e_pagina_unica(self):
        self.assertEqual(self.get("/data.json"), (200, "{}"))
        self.assertEqual(self.get("/qualsiasi/percorso")[1], "<p>app</p>")

    def test_niente_uscita_dalla_cartella(self):
        # un percorso che risale le cartelle viene rifiutato: nessun file fuori da app/
        with self.assertRaises(urllib.error.HTTPError) as e:
            self.get("/../server.py")
        self.assertEqual(e.exception.code, 403)
        with self.assertRaises(urllib.error.HTTPError):
            self.get("/%2e%2e/server.py")

    def test_host_estraneo_bloccato(self):
        with self.assertRaises(urllib.error.HTTPError):
            self.get("/data.json", host="evil.example:18790")
        self.assertEqual(self.post({"azione": "stima"}, host="evil.example")[0], 403)

    def test_origine_estranea_bloccata(self):
        self.assertEqual(self.post({"azione": "stima"}, origin="https://evil.example")[0], 403)

    def test_api_in_modalita_dimostrativa(self):
        server.IMPOSTAZIONI = self.tmp / "nessuna.txt"
        codice, body = self.post({"azione": "stima", "lat": 45, "lon": 9, "raggioKm": 10}, origin="http://localhost:18790")
        self.assertEqual(codice, 200)
        self.assertTrue(body["demo"])


if __name__ == "__main__":
    unittest.main()

