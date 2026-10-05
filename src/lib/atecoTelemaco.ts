// Quali codici ATECO chiedere a Telemaco per trovare i clienti di un SuperService:
// aziende che usano auto e furgoni per lavorare, o che lavorano con le auto.
// L'ATECO dice che attività fa l'impresa, non quanti veicoli ha: nessun registro pubblico lo sa.
// Quindi si ragiona per settore (la flotta è il mestiere?) e per taglia (quanti addetti).
import type { Flotta } from './categories'
import type { Zona } from './zone'

export interface VoceAteco {
  codice: string
  nome: string
  /** true = tutta la divisione (2 cifre): serve alla stima con i dati ISTAT della zona */
  intera?: boolean
}

export interface PacchettoAteco {
  id: string
  nome: string
  flotta: Flotta
  perche: string
  /** avvertenza mostrata sotto la descrizione */
  nota?: string
  /** taglia minima consigliata, modificabile: 0 = tutte, 1 = 10 e oltre, 2 = 50 e oltre */
  soglia: 0 | 1 | 2
  voci: VoceAteco[]
}

const div = (codice: string, nome: string): VoceAteco => ({ codice, nome, intera: true })
const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => String(a + i).padStart(2, '0'))

export const PACCHETTI_ATECO: PacchettoAteco[] = [
  {
    id: 'flotta-mestiere',
    nome: 'La flotta è il mestiere',
    flotta: 'Alta',
    perche: 'Furgoni e auto sempre in strada: usano e consumano gomme di continuo. Valgono anche le imprese piccole.',
    soglia: 0,
    voci: [
      div('49', 'Trasporto terrestre: taxi, autobus, autotrasporto, traslochi'),
      div('52', 'Magazzinaggio e supporto ai trasporti: spedizionieri, parcheggi'),
      div('53', 'Servizi postali e corrieri'),
      div('43', 'Lavori specializzati: elettricisti, idraulici, impiantisti, serramentisti'),
      div('41', 'Costruzione di edifici'),
      div('42', 'Ingegneria civile: strade, reti'),
      div('38', 'Raccolta e smaltimento rifiuti'),
      div('81', 'Pulizie, giardinaggio, servizi per edifici'),
      div('80', 'Vigilanza e investigazione'),
      { codice: '77.1', nome: 'Noleggio di autovetture e autocarri' },
      { codice: '85.53', nome: 'Autoscuole' },
      { codice: '56.2', nome: 'Catering e fornitura di pasti (furgoni)' },
    ],
  },
  {
    id: 'lavora-con-auto',
    nome: 'Lavora con le auto',
    flotta: 'Alta',
    perche: 'Concessionarie, officine, carrozzerie, autolavaggi, ricambi: clienti per convenzioni e lavori in subappalto. I gommisti (45.20.40) restano nella Concorrenza.',
    soglia: 0,
    voci: [div('45', 'Commercio e riparazione di autoveicoli e moto, ricambi, autolavaggi (esclusi i gommisti 45.20.40)')],
  },
  {
    id: 'professionisti',
    nome: 'Professionisti e studi',
    flotta: 'Media',
    perche: 'Avvocati, commercialisti, ingegneri e architetti, geometri, medici, veterinari, agenti: pochi dipendenti ma auto per le visite. Per questo la taglia minima è 0.',
    nota: 'Molti liberi professionisti stanno negli albi e non nel Registro Imprese: su Telemaco compaiono solo società e ditte, quindi una parte degli studi manca.',
    soglia: 0,
    voci: [
      div('69', 'Studi legali, commercialisti, consulenti del lavoro, contabilità'),
      div('70', 'Consulenza gestionale e direzione aziendale'),
      div('71', 'Ingegneri, architetti, geometri, collaudi e analisi tecniche'),
      div('73', 'Pubblicità e ricerche di mercato'),
      div('74', 'Altre attività professionali: design, fotografi, periti'),
      div('75', 'Veterinari'),
      { codice: '86.2', nome: 'Studi medici e dentistici' },
      { codice: '66.2', nome: 'Agenti e mediatori di assicurazione' },
      { codice: '68.3', nome: 'Agenzie immobiliari e amministratori di condominio' },
    ],
  },
  {
    id: 'commercio',
    nome: 'Commercio, anche misto',
    flotta: 'Media',
    perche: 'Negozi, ingrosso, agenti, commercio non specializzato (merceologie miste): consegne, rappresentanti e auto per gli addetti. Sono tantissimi: serve una taglia minima.',
    soglia: 1,
    voci: [div('47', 'Commercio al dettaglio, anche non specializzato e ambulante'), div('46', "Commercio all'ingrosso e agenti di commercio")],
  },
  {
    id: 'industria-servizi',
    nome: 'Industria e altri servizi',
    flotta: 'Media',
    perche: 'Manifattura, agricoltura, energia, sanità, alberghi, istruzione, finanza, servizi: ogni impresa con dipendenti ha auto, ma solo da una certa taglia conviene.',
    soglia: 1,
    voci: [
      div('01', 'Agricoltura: aziende agricole e contoterzisti'),
      div('33', 'Riparazione e installazione di macchine: tecnici in furgone'),
      div('35', 'Energia elettrica e gas'),
      div('36', 'Acqua'),
      div('37', 'Reti fognarie'),
      div('55', 'Alberghi'),
      div('56', 'Ristorazione'),
      div('62', 'Software e consulenza informatica'),
      div('63', 'Servizi di informazione'),
      div('64', 'Servizi finanziari'),
      div('65', 'Assicurazioni'),
      div('68', 'Immobiliare'),
      div('85', 'Istruzione'),
      div('86', 'Sanità'),
      div('87', 'Assistenza residenziale'),
      div('88', 'Assistenza sociale non residenziale: assistenza domiciliare'),
      ...range(90, 96).map((c) => div(c, `Servizi ${c}`)),
      ...range(10, 32).map((c) => div(c, c === '10' ? 'Manifattura: da 10 a 32, tutte le industrie' : `Manifattura ${c}`)),
    ],
  },
]

export const NOME_SOGLIA = ['tutte le imprese', '10 addetti e oltre', '50 addetti e oltre'] as const

/** Codici da incollare nel selettore ATECO di Telemaco, senza ripetizioni. */
export const codiciPacchetti = (ids: string[]): string[] =>
  [...new Set(PACCHETTI_ATECO.filter((p) => ids.includes(p.id)).flatMap((p) => p.voci.map((v) => v.codice)))]

/** Imprese attese in una zona per un pacchetto, dai dati ISTAT per divisione (solo le divisioni intere). */
export function stimaPacchetto(zona: Zona, p: PacchettoAteco, soglia: 0 | 1 | 2 = p.soglia): { imprese: number; parziale: boolean } {
  const divisioni = new Set(p.voci.filter((v) => v.intera).map((v) => v.codice))
  let imprese = 0
  for (const s of zona.settori) {
    if (!divisioni.has(s.divisione)) continue
    // ulClassi: 0-9, 10-49, 50-249, 250+
    imprese += s.ulClassi.slice(soglia === 0 ? 0 : soglia === 1 ? 1 : 2).reduce((a, b) => a + b, 0)
  }
  return { imprese, parziale: p.voci.some((v) => !v.intera) }
}

/** Costo Telemaco: 5 € a elenco + 0,02 € a impresa (Indirizzi) o 0,12 € (Esteso), esente IVA. */
export const costoTelemaco = (imprese: number, formato: 'indirizzi' | 'esteso') => (imprese > 0 ? 5 + imprese * (formato === 'indirizzi' ? 0.02 : 0.12) : 0)
