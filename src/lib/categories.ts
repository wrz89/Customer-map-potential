// Raggruppa le divisioni ATECO 2007 (2 cifre) in macro-categorie utili a un
// centro pneumatici. "flotta" è un giudizio qualitativo su quanti veicoli
// aziendali usa di solito il settore: non è un dato, serve a ordinare.

export type Flotta = 'Alta' | 'Media' | 'Bassa'

export interface Categoria {
  id: string
  nome: string
  flotta: Flotta
  nota: string
  divisioni: string[]
}

const range = (a: number, b: number) =>
  Array.from({ length: b - a + 1 }, (_, i) => String(a + i).padStart(2, '0'))

export const CATEGORIE: Categoria[] = [
  { id: 'trasporti', nome: 'Trasporti e logistica', flotta: 'Alta', nota: 'Autotrasporto, corrieri, magazzini: mezzi sempre su strada', divisioni: ['49', '50', '51', '52', '53'] },
  { id: 'edilizia', nome: 'Edilizia e impianti', flotta: 'Alta', nota: 'Furgoni e autocarri leggeri, impiantisti e cantieri', divisioni: ['41', '42', '43'] },
  { id: 'utility', nome: 'Energia, acqua e rifiuti', flotta: 'Alta', nota: 'Flotte tecniche e mezzi pesanti', divisioni: ['35', '36', '37', '38', '39'] },
  { id: 'noleggio', nome: 'Noleggio, vigilanza e servizi alle imprese', flotta: 'Alta', nota: 'Noleggio veicoli, pulizie, vigilanza, facility', divisioni: ['77', '78', '79', '80', '81', '82'] },
  { id: 'auto', nome: 'Commercio e riparazione auto', flotta: 'Media', nota: 'Concessionarie e officine: partner o subappalto gomme', divisioni: ['45'] },
  { id: 'ingrosso', nome: 'Commercio all\'ingrosso', flotta: 'Media', nota: 'Distribuzione e agenti con auto e furgoni', divisioni: ['46'] },
  { id: 'manifattura', nome: 'Manifattura', flotta: 'Media', nota: 'Stabilimenti: molti addetti, flotta variabile', divisioni: range(10, 33) },
  { id: 'estrattive', nome: 'Cave e miniere', flotta: 'Media', nota: 'Mezzi pesanti e movimento terra', divisioni: range(5, 9) },
  { id: 'sanita', nome: 'Sanità e assistenza', flotta: 'Media', nota: 'Assistenza domiciliare e mezzi di servizio; molti addetti', divisioni: ['86', '87', '88'] },
  { id: 'dettaglio', nome: 'Commercio al dettaglio', flotta: 'Bassa', nota: 'Molte unità piccole; consegne per alcuni', divisioni: ['47'] },
  { id: 'ricettivo', nome: 'Alberghi e ristorazione', flotta: 'Bassa', nota: 'Pochi mezzi aziendali', divisioni: ['55', '56'] },
  { id: 'professioni', nome: 'Servizi professionali, ICT e media', flotta: 'Bassa', nota: 'Auto aziendali per commerciali e tecnici', divisioni: [...range(58, 63), ...range(69, 75)] },
  { id: 'finanza', nome: 'Finanza e immobiliare', flotta: 'Bassa', nota: 'Auto di rappresentanza', divisioni: ['64', '65', '66', '68'] },
  { id: 'istruzione', nome: 'Istruzione', flotta: 'Bassa', nota: 'Scuole private e formazione', divisioni: ['85'] },
  { id: 'altri', nome: 'Altri servizi', flotta: 'Bassa', nota: 'Cultura, sport, servizi alla persona, riparazioni', divisioni: range(90, 96) },
]

const BY_DIV = new Map<string, Categoria>()
for (const c of CATEGORIE) for (const d of c.divisioni) BY_DIV.set(d, c)

export function categoriaDaAteco(codice: string | undefined | null): Categoria | undefined {
  if (!codice) return undefined
  const digits = codice.replace(/\D/g, '')
  return BY_DIV.get(digits.slice(0, 2))
}

export const FLOTTA_ORDINE: Flotta[] = ['Alta', 'Media', 'Bassa']

// Colori per intensità di flotta: i primi tre slot della palette categoriale
// validata (sicuri anche per daltonici su mappa, dove tutte le coppie si toccano).
export const FLOTTA_COLORE: Record<Flotta, { light: string; dark: string }> = {
  Alta: { light: '#eb6834', dark: '#d95926' },
  Media: { light: '#2a78d6', dark: '#3987e5' },
  Bassa: { light: '#1baf7a', dark: '#199e70' },
}

export const CLASSI_ADDETTI = [
  { id: 'W0_9', nome: '0-9' },
  { id: 'W10_49', nome: '10-49' },
  { id: 'W50_249', nome: '50-249' },
  { id: 'W_GE250', nome: '250 e oltre' },
] as const
