# Customer Map Potential

Web app interna per la rete SuperService. Dato un dealer e un raggio, mostra chi c'è intorno: comuni, veicoli circolanti, imprese per settore e dimensione, e l'elenco nominativo delle aziende. Scarica un Excel in cui il dealer incolla i suoi clienti e la cernita tra clienti e potenziali clienti si fa da sola.

Non è un portale di convenzioni: serve a noi per decidere dove e su chi lavorare.

## Cosa fa

| Scheda | Contenuto | Fonte | Costo |
|---|---|---|---|
| Mappa | Comuni colorati per densità di auto, veicoli merci, addetti o abitanti; anelli di distanza; aziende colorate per intensità di flotta | ISTAT, ACI-PRA | gratis |
| Territorio | Fasce di distanza e tabella dei comuni: abitanti, autovetture, veicoli merci, mezzi pesanti, unità locali, addetti, officine | ISTAT, ACI-PRA | gratis |
| Settori | Unità locali e addetti per categoria e classe di addetti (0-9, 10-49, 50-249, 250+) | ISTAT ASIA 2023 | gratis |
| Aziende | Nominativi con P.IVA, ATECO, dipendenti, fatturato, PEC, distanza | Registro Imprese via Openapi, oppure file Telemaco | a consumo |
| Confronto clienti | Carichi la lista clienti del dealer: ogni azienda diventa Già cliente, Probabile cliente, Da verificare o Nuovo | lista del dealer | gratis |

Sulla **mappa** si può:

- trascinare il segnaposto giallo, o usare **Esplora un punto**, per rifare l'analisi da un punto qualsiasi e salvarlo come nuovo dealer;
- accendere e spegnere comuni, anelli, aziende e altri SuperService;
- filtrare le aziende per intensità di flotta, stato cliente e dipendenti;
- cliccare un comune o un'azienda per la scheda, cercare un indirizzo, andare a schermo intero.

**Scarica Excel** produce un file con sei fogli:

1. **Leggimi**: istruzioni per il dealer.
2. **Riepilogo**: fasce di distanza e conteggi della cernita, che si aggiornano da soli.
3. **Aziende**: elenco con la colonna **Stato** calcolata con formule.
4. **Clienti dealer**: vuoto. Il dealer incolla ragione sociale e partita IVA dalla riga 2 (fino a 10.000 clienti).
5. **Comuni** e 6. **Settori ISTAT**: i dati di zona.

La cernita nell'Excel funziona senza macro. Abbina per partita IVA, poi per nome uguale a meno di forma giuridica, punteggiatura e spazi. Il confronto dentro l'app è più fine: riconosce anche nomi scritti in modo diverso e lo stesso indirizzo.

## App locale da scaricare (consigliata)

Il pacchetto `CustomerMapPotential.zip` contiene tutto: l'app compilata, i dati e un piccolo server in Python.

1. Serve Python 3, lo stesso dell'ufficio trading. Se manca: python.org, spuntando "Add Python to PATH".
2. Estrai lo zip in una cartella, per esempio `Documenti\CustomerMapPotential`.
3. Doppio clic su **Avvia Customer Map.bat**. Si apre il browser su http://localhost:8790.
4. Per acquistare i nominativi, apri `impostazioni.txt` con il Blocco note e incolla il token Openapi.

L'app risponde solo dal PC su cui gira: dagli altri computer della rete non si raggiunge. Il token resta in `impostazioni.txt`.

Per rifare il pacchetto dopo una modifica: `npm run pacchetto`. Il file finisce in `pacchetto/`.

## Avvio per sviluppo

Serve Node.js 20 o superiore.

```
npm install
npm run dev
```

L'app si apre su http://localhost:5173. Senza token Openapi funziona tutto, con aziende dimostrative.

## Demo senza server

`npm run build:demo` crea in `dist-demo/` una versione che funziona come pagina autonoma su claude.ai: niente chiamate esterne, aziende dimostrative già caricate, Excel scaricabile. Mappa stradale di sfondo, ricerca indirizzi e acquisto Openapi sono disattivati.

## Messa online su Vercel

1. Su vercel.com: **Add New → Project**, importa questo repository. Vercel riconosce Vite da solo.
2. In **Settings → Environment Variables** aggiungi le variabili di `.env.example`:
   - `APP_PASSWORD`: una password per te e i colleghi. È obbligatoria quando c'è il token: senza, stima e acquisto restano bloccati.
   - `OPENAPI_TOKEN`: il token Openapi.
   - `OPENAPI_SANDBOX`: `1` per provare senza costi, poi togli la variabile per i dati veri.
3. Pubblica. Nell'app apri **Impostazioni** e inserisci la password.

Il piano gratuito di Vercel basta. I dati statici pesano circa 24 MB e la mappa carica solo le province vicine al dealer.

## Openapi: come si paga

1. Registrati su console.openapi.com e attiva il servizio **Company**.
2. Ricarica il credito: si paga a consumo, senza canone.
3. Crea un token con accesso a `IT-search` e mettilo in `OPENAPI_TOKEN`.

Nell'app, **Stima costo** chiede a Openapi quante aziende ci sono e quanto costano, senza spendere. **Acquista** chiede conferma con il prezzo davanti. Gli acquisti finiscono nel **registro** del dealer, così la stessa zona non si ricompra.

Prova prima con `OPENAPI_SANDBOX=1`: la forma esatta della risposta di stima va verificata con il primo token. L'app la legge in modo tollerante, ma se mostra "prezzo n.d." serve un ritocco a `server/openapi.ts`.

## Da sapere sui dati

- **Sede legale**: Openapi restituisce l'indirizzo della sede legale. Uno stabilimento in zona di un'azienda con sede altrove non compare tra i nominativi. Compare invece nei numeri ISTAT, che contano le sedi operative.
- **Ripartizione per superficie**: un comune tagliato a metà dal raggio conta per metà. Per i comuni con centro abitato da un lato è un'approssimazione.
- **Intensità flotta**: Alta, Media e Bassa sono una stima per settore, non un dato. Si cambia in `src/lib/categories.ts`.
- **Esclusi da ISTAT**: agricoltura e pubblica amministrazione. Ospedali pubblici, comuni e scuole vanno aggiunti a mano.
- **Officine**: unità locali ATECO 45.2, cioè meccanici, carrozzieri e gommisti insieme.
- **Privacy**: dealer, acquisti e liste clienti restano nel browser di chi usa l'app. Per condividerli tra colleghi si usa l'export dei dealer nelle Impostazioni.

## Fonti dei dati

| Dato | Fonte | Anno |
|---|---|---|
| Confini comunali | ISTAT, via openpolis/geojson-italy (CC-BY) | 1/1/2026 |
| Popolazione | ISTAT, popolazione residente | 1/1/2026 |
| Unità locali e addetti per settore e classe | ISTAT, registro ASIA-UL | 2023 |
| Officine, carrozzerie, gommisti | ISTAT, ASIA-UL, ATECO 45.2 | 2023 |
| Parco veicolare per comune | ISTAT su dati ACI-PRA | 31/12/2024 |

Per aggiornare i dati quando ISTAT pubblica un nuovo anno:

```
pip install shapely pyproj
npm run dati
```

Lo script `scripts/build_data.py` scarica le fonti in `data/raw/` e rigenera `public/data/`. Gli anni sono indicati in cima allo script.

## Struttura

| Percorso | Cosa contiene |
|---|---|
| `src/lib/zone.ts` | Calcolo della zona: comuni nel raggio, quote di superficie, totali per anello e per settore |
| `src/lib/match.ts` | Normalizzazione nomi e P.IVA, confronto con la lista clienti |
| `src/lib/excel.ts` | Export Excel con le formule di cernita |
| `src/lib/categories.ts` | Raggruppamento ATECO e intensità di flotta |
| `server/openapi.ts`, `api/companies.ts` | Chiamate a Openapi lato server: il token non arriva al browser |
| `scripts/build_data.py` | Costruzione dei dati statici |
| `tests/` | Test: `npm test` |

Il test dell'Excel ricalcola le formule con LibreOffice, se installato, e verifica che la cernita dia lo stato giusto.
