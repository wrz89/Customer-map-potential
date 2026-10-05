# Customer Map Potential

## Scarica il programma per Windows

**[Scarica Customer-Map-Potential-Windows.zip](https://github.com/wrz89/Customer-map-potential/releases/latest/download/Customer-Map-Potential-Windows.zip)**: estrai lo zip e fai doppio clic su `Customer-Map-Potential-Portable.exe`. Non serve installare nulla.

Oppure **[Customer-Map-Potential-Setup.exe](https://github.com/wrz89/Customer-map-potential/releases/latest/download/Customer-Map-Potential-Setup.exe)** per installarlo con icona sul desktop e nel menu Start. Tutte le versioni sono nella pagina [Releases](https://github.com/wrz89/Customer-map-potential/releases).

**Si aggiorna da solo.** Il programma, installato o portatile, all'avvio e ogni 6 ore controlla l'ultima release di questa repo. Se trova una versione nuova la scarica e la installa al riavvio; si può controllare anche da menu Aiuto → Verifica aggiornamenti. Ogni modifica su `main` crea una nuova release con versione `1.0.<numero build>`, e la CI prova che la versione precedente, installata e portatile, passi davvero a quella nuova.

Il pulsante verde "Code → Download ZIP" scarica invece il codice sorgente, che serve solo per modificare il programma.

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

## Applicazione per PC (Windows)

Due file, da scegliere:

- **Customer-Map-Potential-Setup-1.0.0.exe**: installatore. Crea l'icona sul desktop e nel menu Start, si disinstalla da "App installate".
- **Customer-Map-Potential-Portable-1.0.0.exe**: versione portatile, si avvia con doppio clic senza installare.

Al primo avvio Windows può mostrare "Windows ha protetto il PC": il programma non ha una firma digitale a pagamento. Clic su **Ulteriori informazioni**, poi **Esegui comunque**.

- I dati di comuni, veicoli e settori sono dentro il programma. Dealer, acquisti e liste clienti restano sul PC, nella cartella che si apre da **File → Apri la cartella dei dati**.
- Il token Openapi si inserisce in **Impostazioni**. Viene cifrato con la protezione di Windows e la pagina non lo vede mai.
- Internet serve solo per lo sfondo stradale, la ricerca indirizzi, OpenStreetMap e Openapi.
- L'app non apre porte di rete: dagli altri PC non si raggiunge.

Per ricreare i file: `npm run installer` su Windows, oppure dalla scheda **Actions** di GitHub, flusso "Installer Windows", che crea installatore e versione portatile, li installa, avvia l'app e ne controlla il funzionamento.

Per provare l'app sul proprio PC durante lo sviluppo: `npm run desktop`.

## App locale con Python (alternativa)

Il pacchetto `CustomerMapPotential.zip`, creato con `npm run pacchetto`, fa la stessa cosa con un piccolo server Python e il browser. Resta utile su PC dove non si possono installare programmi.

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

## Dati reali: API e costi

Prezzi verificati il 5 ottobre 2026 sui siti dei fornitori, IVA esclusa dove non indicato.

| Fonte | Per cosa | Prezzo | Gratis |
|---|---|---|---|
| ISTAT e ACI-PRA | comuni, veicoli, età del parco, settori | 0 € | tutto, già nel pacchetto |
| OpenStreetMap | concorrenza di base | 0 € | tutto, ma copre circa un gommista su dieci |
| Openapi, ricerca aziende con dettaglio "advanced" | aziende con ATECO, dipendenti, fatturato, PEC, coordinate | 0,10 € + IVA | stima del costo: 100 al giorno |
| Openapi, stessa ricerca per i gommisti ATECO 45.20.40 | concorrenza completa | 0,10 € + IVA | come sopra |
| Telemaco, elenco "Indirizzi" | gommisti di una provincia, solo nome e indirizzo | 5 € a elenco + 0,02 € a impresa, esente IVA | nessuno |
| Telemaco, elenco "Esteso" | aziende con addetti e fatturato, senza coordinate | 5 € a elenco + 0,12 € a impresa, esente IVA | nessuno |

Openapi non chiarisce se gli 0,10 € valgono per ogni chiamata o per ogni azienda restituita. La **Stima costo** nell'app chiede il prezzo esatto a Openapi prima di comprare: fai la prima prova nell'ambiente di test. Fonti: openapi.com/products/italian-company-search, registroimprese.it/elenchi-di-imprese.

**Google Places non si usa**: le condizioni Google, punto 3.2.3, vietano di mostrare i dati Places su mappe non Google e di salvarne nomi e indirizzi, quindi anche l'Excel.

### Openapi: attivazione

1. Registrati su console.openapi.com e attiva il servizio **Company**.
2. Ricarica il portafoglio prepagato: carta, PayPal o bonifico, senza canone. C'è anche la ricarica automatica.
3. Crea un token con accesso a `IT-search`, anche per l'ambiente di test.
4. App locale: incolla il token in `impostazioni.txt` alla riga `OPENAPI_TOKEN=`, lascia `OPENAPI_SANDBOX=1` per la prova e riavvia. Per i dati veri metti `OPENAPI_SANDBOX=0`.
5. Nell'app: **Aziende → Stima costo → Acquista** per i clienti potenziali, **Territorio → Concorrenza → Stima con Openapi** per i gommisti.

Gli acquisti restano nel registro del dealer, così la stessa zona non si ricompra.

### Telemaco: elenco gommisti di una provincia

1. Su registroimprese.it, **Elenchi di imprese**: filtra per provincia e attività **45.20.40**, solo imprese attive.
2. Scegli il formato **Indirizzi**. Il prezzo appare prima dell'acquisto.
3. Scarica il CSV e caricalo in **Territorio → Concorrenza → Importa elenco Telemaco**. Ogni gommista compare al centro del suo comune.

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
