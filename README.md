# 🎡 Rad van Fortuin

Een Nederlands Rad van Fortuin spelshow spel — speelbaar in de browser, gehost via GitHub Pages.

## 🎮 Spelen

**Live spel:** `https://<jouw-gebruikersnaam>.github.io/rad-van-fortuin/`

Of download de bestanden en open `index.html` lokaal in je browser.

---

## 📁 Bestandsstructuur

```
rad-van-fortuin/
├── index.html     # HTML structuur en modals
├── style.css      # Alle opmaak en animaties
├── script.js      # Spellogica, wiel, AI, geluiden
├── puzzles.js     # 795 puzzels in 17 categorieën
└── README.md      # Dit bestand
```

---

## ✨ Features

- 🎡 **Animated wiel** met echte tick-geluiden via Web Audio API
- 🧠 **3 moeilijkheidsgraden** — Makkelijk, Gemiddeld, Moeilijk
- 🤖 **Computer tegenstander** met intelligente letter-strategie per niveau
- 📱 **Mobielvriendelijk** — volledig speelbaar op telefoon
- ⌨️ **Fysiek toetsenbord** ondersteund op desktop
- 🎯 **Wie Raadt Het Eerst** — spannende eindfase als het spel vastloopt
- 🎉 **795 puzzels** verdeeld over 17 categorieën
- 🔊 **Spelshow geluiden** — fanfare, failliet-doom, letter-ping, en meer

### Categorieën
`UITDRUKKING` · `DING` · `PLAATS` · `ETEN & DRINKEN` · `BEKENDE PERSOON` · `FILM & TV` · `SPORT` · `DIER` · `NATUUR` · `WETENSCHAP` · `MUZIEK` · `GESCHIEDENIS` · `SPROOKJE` · `EVENT` · `BEROEP` · `GEZEGDE` · `HOBBY`

---

## 🚀 Hosten op GitHub Pages

1. Maak een nieuw repository aan op GitHub (bijv. `rad-van-fortuin`)
2. Upload alle bestanden uit deze map naar de repository
3. Ga naar **Settings → Pages**
4. Selecteer onder **Source** de branch `main` en map `/ (root)`
5. Klik **Save** — je spel is binnen een minuut live!

---

## 🎲 Spelregels

| Actie | Omschrijving |
|---|---|
| 🎰 Draaien | Draai het rad voor een geldbedrag per letter |
| Medeklinker raden | Verdien het bedrag × aantal keer de letter voorkomt |
| 🔤 Klinker kopen | Kost €250, onthult alle instanties van de klinker |
| ✓ Oplossen | Raad de volledige puzzel om de ronde te winnen |
| 💸 Failliet | Verlies alle rondeverdiensten |
| 😬 Beurt verlies | Sla een beurt over |

### Moeilijkheidsgraden

| Niveau | Letters onthuld | Computer strategie |
|---|---|---|
| 😊 Makkelijk | R, S, T, L | Raadt willekeurig |
| 🧠 Gemiddeld | R, S | Mix van slim en willekeurig |
| 💀 Moeilijk | Geen | Altijd de beste letter |

---

## 🛠️ Technologie

- Vanilla HTML, CSS, JavaScript — geen frameworks of dependencies
- Web Audio API voor spelshow geluiden
- Canvas API voor het wiel
- Volledig offline speelbaar (behalve Google Fonts)
