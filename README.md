# Energia Advisor 3D

Tájékoztató épületenergetikai döntéstámogató kalkulátor. Nem energetikai tanúsítvány és nem helyettesít helyszíni felmérést vagy jogosult szakértő számítását.

## Számítási modell

- szerkezeti hőveszteség: U × A
- légcsereveszteség: 0,33 × n × V
- éves fűtési hőigény: H × HDD × 24 / 1000
- a hőhíd-korrekció kizárólag a szerkezeti veszteséget növeli
- a talajjal érintkező padló egyszerűsített 0,65-ös korrekciót kap
- a modell a felhasználó tényleges éves fűtési költségéhez kalibrál
- a célköltség és megtakarítás ±15%-os műszaki bizonytalansági sávval jelenik meg

A kalkulátor valós éves fűtési költség nélkül nem készít eredményt.

## Energiaárak

A gyors tarifaprofilok 2026. júliusi tájékoztató értékek:

- kedvezményes közelítés: gáz 10,4 Ft/kWh, villany 36,9 Ft/kWh
- magasabb lakossági ársáv: gáz 79,2 Ft/kWh, villany 70,104 Ft/kWh

A pontos eredményhez a számlából számított tényleges átlagárat kell megadni. A gázszámla Ft/MJ értéke Ft/kWh értékre 3,6-tal szorozva váltható át.

## Beruházási árak

A fal komplett célrendszerének nettó egységára a SzakiPiac referencia-adatbázisából frissül. A födém, padló, nyílászáró és gépészet költségét helyi ajánlattal kell pontosítani. A költség nem nő lineárisan a szigetelés centiméterével.

## Korlátok

Az egyszerűsített modell nem kezeli teljes részletességgel a napsugárzási és belső hőnyereséget, tájolást, hőtároló tömeget, talajhőáramot, használati melegvizet, elosztási veszteségeket és a hőszivattyú előremenő hőmérsékletét.

## Szakmai és árforrások

- 9/2023. (V. 25.) ÉKM rendelet az épületek energetikai jellemzőiről
- MVM Next lakossági villamosenergia- és földgáz-díjtájékoztatók
- SzakiPiac építőipari referenciaár-adatbázis

Frissítve: 2026-07-12.

