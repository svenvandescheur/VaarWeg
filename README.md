# VaarWeg

**VaarWeg** is een eenvoudige routeplanner voor boten.  
Met deze app kun je snel een vaarroute uitzetten op een kaart.  
De applicatie is volledig statisch en werkt zonder backend of database.

## ⚓ Kenmerken

- Start- en eindpunt selecteren
- Route weergeven op de kaart
- Volledig statische webapplicatie
- Geen backend of database nodig

## 🚀 Installatie

```bash
git clone https://github.com/svenvandescheur/vaarweg.git
cd vaarweg/app
npx live-server  # Of gebruik een andere statische webserver
```

## 📥 Data bijwerken

De data voor **VaarWeg** is gebaseerd op OpenStreetMap (OSM).  
Een overzicht van de gebruikte datasets en waar ze te downloaden zijn staat in het bestand `datasources.md`.

### 1. Download OSM-data

Plaats het gedownloade `.osm.pbf` bestand in de `data/` map, bijvoorbeeld:  
`data/netherlands-latest.osm.pbf`

### 2. Filter waterwegen naar JSON

Gebruik het verwerk-script om waterwegen te filteren en exporteer naar JSON:

```bash
./bin/process_osm_bbf.sh data/netherlands-latest.osm.pbf data/netherlands-latest.json
```

### 3. Transformeer JSON naar routeplanner-formaat

Gebruik het Python transform-script om de gefilterde JSON-data om te zetten naar bestanden die de routeplanner gebruikt:

```bash
./bin/transform.py data/netherlands-latest.json app/assets/nl_graph.json app/assets/nl_links.json app/assets/nl_locators.json
``` 

Na deze stappen is de dataset up-to-date en direct bruikbaar door **VaarWeg**. Standaard zoekt de app naar
`nl_graph.json`, `nl_links.json` en `nl_locators.json` in de `assets` map.

## 📜 Bronvermelding

De waterwegdata in **VaarWeg** is gebaseerd op OpenStreetMap (OSM).  
OSM-data © OpenStreetMap contributors, gebruikt onder
de [Open Database License (ODbL)](https://opendatacommons.org/licenses/odbl/1-0/).  
Een overzicht van de gebruikte datasets en downloads is te vinden in `datasources.md`.
