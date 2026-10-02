# ETROM — UI/UX Standard v2.3

Obowiązujący standard interfejsu ETROM. Każdy nowy ekran i każda nowa funkcja
korzysta z tych tokenów, komponentów i elementów charakterystycznych.
Odstępstwo wymaga zmiany tego dokumentu, a nie lokalnego wyjątku w CSS.

- **Dlaczego tak wygląda** — [ART_DIRECTION.md](ART_DIRECTION.md) (język wizualny, elementy charakterystyczne, ruch).
- **Jak to stosować** — ten dokument.
- Wersja 1.0 ustaliła fundamenty i komponenty; wersja 2.0 nadała im tożsamość
  (kroje, warstwy, kolor „teraz / ryzyko”, rzędna, profil, inspektor).
- Wersja 2.3 wprowadza **ETROM Flow System** (Gauge, Flow, Level, Marker) — sekcja 2a.
- Wersja 2.2 przenosi paletę na barwy logo ETROM: łupek `#78909c` (neutralne tło i struktura
  w odcieniu stali), stalowy błękit jako „teraz”, magenta `#dd5799` wyłącznie jako znak marki.
- Wersja 2.1 (szlif produktu) nie zmienia kierunku: kokpit portfela stał się narzędziem
  filtrującym, puste ekrany prowadzą przez pierwsze kroki, tekst pomocniczy urósł do
  rozmiarów wygodnych przy całodziennej pracy.

Kolejność priorytetów przy każdej decyzji:
**czytelność → intuicyjność → szybkość pracy → hierarchia → spójność → dostępność → estetyka → wrażenie premium.**

## 1. Fundamenty — `styles/tokens.css`

Jedyne miejsce z wartościami. Każda barwa ma postać `light-dark(jasny, ciemny)`;
motyw wybiera `color-scheme` (`data-theme="light|dark"` albo ustawienie systemu).

### Warstwy

| Token | Rola |
|---|---|
| `--canvas` | kalka: tło okna i panelu nawigacji |
| `--sheet` | arkusz roboczy |
| `--wash`, `--wash-2` | ton w arkuszu: grupy, nagłówek projektu, kokpit, wnęki |
| `--raised` | arkusz pływający: inspektor, menu, okna |
| `--hover`, `--pressed` | stany interakcji |
| `--inverse`, `--on-inverse` | podpowiedzi, powiadomienia, pasek akcji zbiorczych |
| `--backdrop` | przyciemnienie pod oknem modalnym |

### Tusz (struktura i rzeczy zakończone)

`--ink` (tekst główny, przycisk główny, zaznaczenie) · `--ink-2` (opis) ·
`--ink-3` (metadane, ≥ 4,5:1 na każdej warstwie) · `--ink-4` (tylko dekoracja) ·
`--ink-hover`, `--on-ink` · `--done` (zakończone odcinki i węzły).

### Znak marki

`--brand` (magenta z logo) **nie oznacza stanu**. Używamy jej tylko do tożsamości: logo,
wskaźnika aktywnej pozycji nawigacji, zaznaczenia tekstu. Nie wolno jej używać do statusów,
przycisków ani ostrzeżeń — żeby nie pomylić z czerwienią ryzyka.
Logo: `docs/brand/etrom-logo.png` → `tools/build-logo.py` → `styles/logo.css`
(warstwa barwna + napis malowany `--ink`, więc działa w obu motywach).

### Kolor „teraz” i „ryzyko”

| Rola | Znacznik (≥ 3:1) | Tekst (≥ 4,5:1) | Tło |
|---|---|---|---|
| Nurt — w toku | `--flow` | `--flow-ink` | `--flow-wash` |
| Stan ostrzegawczy | `--warn` | `--warn-ink` | `--warn-wash` |
| Stan alarmowy | `--alarm` | `--alarm-ink` | `--alarm-wash` |
| Do zatwierdzenia | `--review` | `--review` | `--review-wash` |

Warianty barwy „teraz” (`data-accent`): **standard** (nurt) i **graphite**. Wariant malinowy usunięto: był zbyt blisko magenty z logo, która jest kolorem marki, a nie stanu.
Zmieniają tylko nurt — tusz i stany ryzyka zostają.

Kontrast sprawdza `tests/tokens.test.js` w obu motywach i każdym wariancie.

### Linie

`--line` (podział wewnątrz arkusza) · `--line-strong` · `--control-line` (krawędź pól, ≥ 3:1) ·
`--track`, `--track-done` (profil przebiegu).
Linia jest wyjątkiem: najpierw ton, odstęp i typografia.

### Typografia

| Rola | Krój | Rozmiar | Gdzie |
|---|---|---|---|
| Tytuł ekranu | Display 600–700 | `--fs-3xl` 28 | Projekty, Zespół |
| Nazwa projektu | Display | `--fs-4xl` 36 | nagłówek przestrzeni projektu |
| Liczba kluczowa | Display, cyfry tabelaryczne | `--fs-5xl`–`--fs-6xl` 44–56 | kokpit, postęp w nagłówku |
| Tytuł sekcji | Text 600 | `--fs-lg` 16 | sekcje, formularze |
| Nazwa w wierszu | Text 600 | `--fs-row` 14 | projekty, osoby, etapy |
| Tekst roboczy | Text 400 | `--fs-md` 14 | wiersze, menu, formularze |
| Pomocniczy | Text | `--fs-sm` 13 | opisy, powody, drugi wiersz w tabeli |
| Metadane | Text | `--fs-meta` 12, `--ink-3` | kody, podpisy w tabelce |
| Kod projektu | Text, `.code` | `--fs-meta`, tnum, przekreślone zero | wszędzie, gdzie stoi kod |

`--font-display` = ETROM Display (Instrument Sans), `--font-text` = ETROM Text (Inter);
oba osadzone w `styles/fonts.css` (generuje `tools/build-fonts.py`, licencje w `docs/licenses/`).
Nagłówki zdaniem, nie wersalikami. Liczby przez `ETROM.Format` (polska odmiana).
**Dolna granica: 12 px** dla każdego tekstu, który trzeba przeczytać (wyjątek: inicjały
w awatarze). Elegancji nie osiąga się zmniejszaniem — tylko odstępem, grubością i tonem.

### Odstępy, promienie, elewacja, ruch

- **Odstępy:** siatka 4 px, `--space-0-5` … `--space-16`.
- **Promienie rosną ze skalą:** `--radius-xs` 4 (plakietki) · `--radius-sm` 7 (przyciski, pola, nawigacja) ·
  `--radius-md` 10 (płaszczyzny, menu, okna) · `--radius-lg` 14 (arkusz, inspektor) · `--radius-full`.
- **Elewacja:** `--elev-lift` (pozycja wzniesiona do arkusza) · `--elev-hover` · `--elev-sheet` (arkusz) ·
  `--elev-pop` (menu) · `--elev-float` (inspektor, okna).
- **Ruch:** `--duration-instant` 80 · `fast` 140 · `base` 200 · `slow` 300 ms;
  `--ease-out` (wejście), `--ease-spring` (drobne „wyskoczenie” węzła, pola wyboru).
  Ruch ciągły kończy się po kilku cyklach. `prefers-reduced-motion` zeruje czasy.

## 2. Elementy charakterystyczne — `src/ui/signature.js` + `styles/signature.css`

| Element | Funkcja | Zasady |
|---|---|---|
| Rzędna ▽ | `Sig.datum(level)` | `normal` / `warning` / `alarm` / `closed`; zawsze z powodem w słowach lub w podpowiedzi |
| Oś etapów | klasy `.rail`, `.rail__node--*` | węzły: tusz/ptaszek, nurt/pierścień, pusty, czerwony pierścień |
| Inspektor | `ETROM.Inspector.render` | zadanie, osoba, projekt; Escape zamyka i oddaje fokus |
| Widoki listy | `ProjectList.views(projects, ctx)` | zakładki z licznikami: Wszystkie, Moje, Wymaga uwagi, Po terminie, Zakończone + własne (`prefs.customViews`, do 6); wybór w `prefs.projectView` |
| Pasek stanu | `ProjectList.strip` | cienki pasek: wymaga uwagi / w normie / zakończone + godziny; kolor czerwony tylko dla „wymaga uwagi” |
| Panel terminów | `ProjectList.rail` | `Insight.dueItems`: zadania, odpowiedzi na pisma, terminy umów; Po terminie / Ten tydzień / Później |
| Postęp wobec planu | `.pf-meter` | pasek 6 px z kreską planu; kolor tylko przy zaległości (bursztyn ≥ 15 p.p., czerwień ≥ 30 p.p.) |

#### Zasady listy projektów

- Kolor tylko dla wyjątków: czerwony i bursztynowy wyłącznie dla tego, co wymaga reakcji; reszta w tuszu i szarościach.
- Wiersz: nazwa, pod nią kod i jedna linia powodu (dla projektów wymagających uwagi) albo zamawiający.
- Edycja w komórce: klik w lidera otwiera wybór osoby; zmiana jest od razu zapisywana (z „Cofnij”).
- Gęstość: `prefs.density` → `data-density` na `<html>`, zmienne `--row-h`, `--row-pad`.
- Język: „zaległość 12 p.p. wobec planu” z objaśnieniem w podpowiedzi, a nie sam skrót.
- Filtr `health: overdue` (`Query`) to projekty z czymkolwiek po terminie: umowa, zadanie albo odpowiedź na pismo (`Insight.hasOverdue`).

Miernik, tor przebiegu, poziom i znaczniki to **ETROM Flow System** (sekcja 2a).

Wnioski liczy `src/core/insight.js` (testy w `tests/insight.test.js`): stan projektu i powody,
profil, harmonogram (opóźnienie wobec czasu), najbliższe zdarzenie, przegląd portfela,
obciążenie osoby. Interfejs tylko to rysuje.

## 2a. ETROM Flow System

### Filozofia

Interfejs mówi językiem **pomiaru**, nie wody. Hydrotechnika jest strukturą, nie ozdobą:
wodowskaz → **Gauge**, przepływ → **Flow**, stan wody → **Level**, punkt pomiarowy → **Marker**.
Nie ma fal, kropel ani niebieskich gradientów. Po usunięciu koloru system nadal się czyta.
Cztery elementy to jeden język: **jedna linia (`--line-w` 1,5 px)**, jedne znaczniki,
jedne cyfry tabelaryczne, jeden ruch (`--motion-measure`). Kod: `src/ui/flowSystem.js`,
`styles/flow.css`, dane: `src/core/insight.js` (`gauge`, `profile`, `ladder`, `health`).

**Status ≠ Stan.** *Status* mówi, co się dzieje z projektem (Przygotowanie, W realizacji, Wstrzymany,
Zakończony) — to przycisk, bo użytkownik go zmienia. *Stan* mówi, czy projekt przebiega prawidłowo
(W normie, Stan ostrzegawczy, Stan alarmowy) — jest **liczony z danych**, nikt go nie ustawia.
Oba wymiary są niezależne i nigdy nie dzielą jednego znacznika.

### Pas planu — postęp na torze (`Flow.planBar`)

Jedna skala zamiast dwóch: **tor etapów** (odcinki ∝ godzinom) jest jednocześnie paskiem postępu.
Na torze leży **znacznik planu na dziś** (tyle czasu umowy już minęło): cienka linia z kółkiem
i pasek odległości od postępu (szary / bursztyn / czerwień wg odchylenia). Nad torem: duża liczba
postępu, bieżący etap i odczyt „Plan na dziś 100% · Za planem o 39 pp” (przycisk → Plan i odchylenia).
Pod torem **jedyne miejsce terminu umowy**: „Termin umowy 26 wrz 2026 · minął 6 dni temu” z rombem.
Ten sam fakt nie występuje w kafelkach ani w werdykcie.

### Flow — tor przebiegu (`Flow.flowTrack`)

Odcinek na etap, długość ∝ godzinom. Stany (`state` z `Insight.profile`):

| Stan | Rysunek |
|---|---|
| zakończony | tusz |
| bieżący | nurt z kreskowaniem (płynie 3 cykle), podkreślenie i pogrubiony numer |
| przyszły | ślad |
| opóźniony | czerwone kreskowanie jak w przekroju + czerwony romb terminu |
| zagrożony terminem | bursztynowy romb nad odcinkiem (termin ≤ 7 dni) |
| wstrzymany | kreskowanie tuszem, bez ruchu |
| zablokowany | zarezerwowany (gdy model dostanie blokadę etapu; dziś mapowany z projektu wstrzymanego) |

Rozmiary: **hero** (numery, znaczniki, odcinki jako przyciski), **compact** (karta, inspektor: tor
z odczytem procentu i grotem), **mini** (wiersz listy: sam tor, 5 px).
Odcinek węższy niż ~2% toru nie ma numeru (zostaje w podpowiedzi); bieżący numer zawsze widać.

### Werdykt i Level — stan projektu (`Flow.verdict`, `Flow.level`)

**Werdykt** (nagłówek projektu): pas z jednym stanem (kształt ▽ + nazwa), jednym zdaniem o powodzie
(klikalnym) i po prawej „Co teraz zrobić” z przyciskiem działania. Alarm i ostrzeżenie barwią cały pas
delikatnym tłem; w normie pas jest spokojny. Poniżej opis drabinki progów, której pełna wersja
zostaje w inspektorze (`Flow.level` w rozmiarze compact).

Drabinka progów: *Stan alarmowy* ▸ *Stan ostrzegawczy* ▸ *W normie*. Aktywny szczebel jest
podświetlony i oznaczony „teraz”, niesie **powód słowami** („Termin umowy minął 6 dni temu”).
Stan to najgorszy aktywny powód; reguły (`rule`) w `Insight.health`: `deadline-passed`, `deadline-near`,
`schedule-lag`, `tasks-late`, `stages-late`, `tasks-returned`, `project-paused`. Nowa reguła =
jeden blok w `health()` z identyfikatorem i poziomem (przewidziane: budżet godzin, brak wymaganych osób,
zablokowany kamień milowy, ryzyko). Kształt ▽ odróżnia stan bez koloru: kontur / wypełnienie /
wypełnienie ze znakiem / cienki kontur (zakończony). Rozmiary: **hero** (drabinka + powody),
**compact** (jeden szczebel + powody — inspektor); w portfolio ta sama drabinka jest legendą
stanu portfela z cienką miarą udziału pod każdym szczeblem.

### Marker (`Flow.marker`)

Znacznik punktu na osi, kształt niesie znaczenie: **grot** ▽ — teraz / bieżące położenie,
**pierścień** ○ — plan, **romb** ◇ — termin i kamień milowy (wypełniony, gdy minął),
**kreska** — próg etapu. Kolor tylko ostrzega (bursztyn, czerwień). Używany na torze, w mierniku,
pod torem pasa planu i na osi najbliższych terminów w portfolio.

### Semantyka koloru

| Barwa | Znaczy | Nie znaczy |
|---|---|---|
| Stalowy błękit (`--flow`) | przepływ teraz: bieżący etap, zakres etapu w mierniku, fokus, zaznaczenie | stan projektu |
| Bursztyn | stan ostrzegawczy, bliski termin, opóźnienie ≥ 15 pkt | marka |
| Czerwień | stan alarmowy, termin przekroczony, opóźnienie ≥ 30 pkt | marka |
| Tusz/grafit | zakończone, struktura, rzeczywisty postęp | — |
| Magenta (`--brand`) | wyłącznie marka (logo, wskaźnik nawigacji) | alarm, błąd, akcent akcji |

### Ruch

150–300 ms, `--ease-out`, bez odbicia. Grot i pasek miernika przesuwają się do nowej wartości,
liczba dolicza (`Flow.settle`), pasek miary w portfolio zmienia długość. Nurt płynie tylko w nagłówku
i tylko 3 cykle. `prefers-reduced-motion` zeruje czasy.

### Kiedy używać, a kiedy nie

- **Gauge** — tylko tam, gdzie postęp ma znaczenie decyzyjne: nagłówek projektu. Nie w wierszach, kartach ani raportach zbiorczych.
- **Flow mini/compact** — każdy projekt na liście i karcie; nie powielaj go na ekranie, który ma już hero.
- **Level hero** — jeden na ekran projektu; **compact** w panelach podglądu. W wierszu użyj samej rzędnej ▽ z powodem.
- **Marker** — tylko dla terminów i punktów na osi; nie jako ozdoba i nie jako licznik.
- Nie rysuj wody, fal, rur ani gradientów; nie koloruj stanu bez kształtu i słów; nie dubluj implementacji — nowe widoki wołają `ETROM.Flow.*`.

### Dostępność

Miernik i tor mają `role="img"`/`group` z pełnym opisem (postęp, plan, bieżący etap, zakres).
Odcinki toru w nagłówku to przyciski (`aria-current="step"` dla bieżącego), podpis etapu w mierniku też.
Szczebel stanu ma `aria-current`, powód jest tekstem. Informacja zawsze: kształt + tekst + liczba,
nigdy sam kolor. Fokus: ring nurtu. Kontrast par pilnuje `tests/tokens.test.js`.

### Tokeny

`--line-w`, `--tick-minor`, `--tick-major`, `--marker-size`, `--flow-seg-h`, `--flow-gap`, `--level-rung-h`, `--motion-measure`
(`styles/tokens.css`). Kolory wyłącznie semantyczne: `--flow`, `--done`, `--warn`, `--alarm`, `--track`, `--brand`.

## 2b. Etap: rodzaj pracy i ikona

Każdy etap ma trzy niezależne cechy: **rodzaj pracy** (`kind`), **temat** (`domain`: środowisko, wody, lokalizacja…) i **kolejność** w projekcie. Kolejność jest chronologiczna i nie zależy od rodzaju.

- **Rodzaje:** *Materiały* (dane wyjściowe, pomiary, badania), *Dokumentacja* (opracowania projektowe), *Decyzje* (postępowania i uzgodnienia, czyli czekanie na urząd). Etap własny wybiera rodzaj sam; dawne etapy własne dostają „Dokumentacja”.
- **Ikona (`Icons.stageIcon`)** to rysunek etapu na kafelku, siatka 24×24, kontur 1,6. Etap decyzyjny ma plakietkę ✓ w rogu, więc ten sam temat (np. woda) widać od razu jako dokumentację albo postępowanie. Etap własny używa symbolu swojego tematu.
- **Kolor nie koduje rodzaju w wierszu.** Kolor jest zarezerwowany dla stanu. Rodzaj pokazują ikona i podpis („Dokumentacja · wodnoprawne · standard 09”). Jedyny kolor rodzaju to pasek budżetu (`--kind-materials/docs/decision`, trzy odcienie jednego błękitu), w którym wypełnienie oznacza godziny już wykonane.
- **Grupuj wg rodzaju** to przełącznik widoku listy: dodaje nagłówki rodzajów z sumą godzin, numeracja pozostaje chronologiczna.
- Dane: `Catalog.KINDS`, `Insight.budgetByKind(project)`.

## 3. Komponenty — `src/ui/components.js` + `styles/components.css`

Widoki nie składają klas ręcznie — wołają `ETROM.UI.*`:

| Komponent | Funkcja | Uwagi |
|---|---|---|
| Button | `UI.button({label, variant, size, icon, kbd})` | `primary` (tusz, jeden na ekran), `secondary`, `tertiary`, `ghost`, `danger`, `danger-solid`; rozmiary `sm` / `lg` |
| Icon button | `UI.iconButton({icon, label})` | etykieta obowiązkowa — `aria-label` + podpowiedź |
| Pola | `UI.input`, `UI.textarea`, `UI.select`, `UI.checkbox`, `UI.switchControl`, `UI.searchInput` | jedna wysokość, fokus = obrys nurtu |
| Field | `UI.field({id, label, control, required, optional, hint, error})` | gwiazdka, „opcjonalnie”, błąd z ikoną, `aria-describedby` / `aria-invalid` |
| Status | `UI.status`, `UI.statusButton`, `UI.statusGlyph` | koło o kształcie stanu + nazwa; ton `flow` dla pracy w toku, `done` (tusz) dla zakończonej |
| Badge | `UI.badge(text, tone)` | drobna etykieta |
| Termin | `UI.due(value, info)` | kolor i ikona tylko przy przekroczeniu lub pilnym terminie |
| Segmented, Tabs, Breadcrumb | `UI.segmented`, `UI.tabs`, `UI.breadcrumb` | zakładki to linki z adresem; wskaźnik przesuwa się przejściem |
| PageHeader, EmptyState, Alert, Skeleton, Pagination | `UI.pageHeader`, `UI.emptyState`, `UI.alert`, `UI.skeleton`, `UI.pagination` | pusty stan: co tu będzie, dlaczego pusto, następny krok |
| Onboarding | `UI.onboarding({title, text, steps, actions, note, preview})`, `UI.ghost(width)` | pierwszy start ekranu: tytuł, trzy kroki, przycisk główny ze skrótem, dane przykładowe, podgląd „tak to będzie wyglądać” z prawdziwych komponentów |
| Menu i popover | `ETROM.Menu.bind` / `open` | strzałki, Home/End, pierwsza litera, Escape oddaje fokus |
| Tooltip | atrybut `data-tooltip` | fokus klawiatury pokazuje od razu |
| Okna | `Dialog.confirm`, `Dialog.prompt`, `Dialog.openDrawer` + `Dialog.drawerForm` | formularze w panelu z przyklejoną stopką, `Ctrl+Enter` zapisuje |
| Toast | `Toast.show({message, tone, actionLabel, onAction})` | „Cofnij” zamiast „Czy na pewno?” |

## 4. Szkielet i nawigacja

- **Panel boczny na kalce** (240 px, zwijany do 56 px klawiszem `[`, stan zapamiętany):
  przełącznik przestrzeni ETROM, Szukaj (`Ctrl K`), Utwórz (`+`), Projekty i Zespół z licznikami
  (przy Projektach liczba stanów alarmowych), **Przypięte** i **Ostatnio otwierane** projekty
  ze znakiem rzędnej, na dole stan zapisu i skróty.
- **Arkusz roboczy** uniesiony nad kalką; pasek górny ze ścieżką i działaniami kontekstowymi
  (przypnij, edytuj, więcej) przykleja się podczas przewijania.
- **Adresy:** `#/projekty`, `#/projekty/:id`, `…/zadania`, `…/zespol`, `#/zespol`.
- **Inspektor** pływa nad arkuszem po prawej, nie zmienia adresu ani przewinięcia.

## 5. Wzorce interakcji — od najlżejszego

1. **Podpowiedź** — pełna data, nazwa etapu w profilu, powód stanu.
2. **Menu** — status, filtr, sortowanie, akcje wiersza.
3. **Rozwinięcie w miejscu** — zadania etapu (bieżący etap otwarty sam).
4. **Inspektor** — podgląd zadania, osoby, projektu bez opuszczania miejsca.
5. **Panel boczny (drawer)** — każdy formularz tworzenia i edycji.
6. **Okno modalne** — tylko decyzja nieodwracalna albo pytanie o treść.
7. **Pełny widok** — przestrzeń projektu.

Zasady stałe: jeden przycisk główny na ekranie; rzadkie i ryzykowne akcje w menu „…”;
usunięcie od razu, z „Cofnij”; dane zmieniają się natychmiast, animacja tylko to pokazuje;
przerysowanie nie gubi fokusu (`data-fk`, `Dom.patch`).

### Skróty

`Ctrl K` paleta · `N` nowy projekt / osoba · `E` edycja projektu · `/` wyszukiwarka ·
`Spacja` na projekcie — podgląd · `G P` / `G Z` — Projekty / Zespół · `[` panel boczny ·
`?` lista skrótów · `Esc` zamyka inspektor, menu, panel, okno, odznacza ·
`Ctrl Enter` zapisuje formularz.

## 6. Informacja zwrotna

| Sytuacja | Wzorzec |
|---|---|
| Zapis | „Zapisano lokalnie” na dole panelu; ptaszek rysuje się przy każdym zapisie |
| Sukces po formularzu | toast `success` |
| Usunięcie, zmiana zbiorcza | toast z „Cofnij” |
| Odmowa reguły | toast `danger` z powodem i wyjściem |
| Błąd pola | pod polem, fokus na pierwszym błędnym |
| Ryzyko w projekcie | rzędna + powód w wierszu, w kokpicie i w panelu stanu projektu |
| Pierwszy start ekranu | `UI.onboarding` (Projekty, Zespół) |
| Brak wyników filtra | `EmptyState` z „Wyczyść filtry” |

## 7. Responsywność

Układ zmienia się według szerokości **obszaru treści** (container queries):
pełne kolumny na monitorze, mniej kolumn na laptopie, na telefonie panel boczny
wysuwany, kokpit w jednej kolumnie, nagłówek projektu z faktami w dwóch kolumnach,
formularze na całą szerokość.

## 8. Dostępność (WCAG 2.2 AA)

- Kontrast tekstu ≥ 4,5:1, znaczników i krawędzi pól ≥ 3:1 — sprawdzane testem.
- Stan nigdy tylko kolorem: kształt rzędnej i koła statusu + słowa.
- Pełna obsługa klawiaturą, `:focus-visible`, fokus wraca po zamknięciu inspektora, menu, okna.
- `aria-current` w nawigacji i zakładkach, `aria-sort`, `aria-expanded`, `role="switch"`,
  opis profilu przebiegu dla czytnika ekranu.
- `prefers-reduced-motion` respektowane, ruch ciągły kończy się sam.

## 9. Jak dodać nowy ekran

1. Struktura: tytuł krojem Display → zdanie z liczbami → kokpit lub pasek narzędzi → treść.
2. Kolor tylko dla „teraz” i „ryzyka”. Wszystko inne tuszem i tonem.
3. Stan projektu przez `Sig.datum`, postęp przez `Sig.profile`, statusy przez `UI.status`.
4. Formularz w panelu (`Dialog.drawerForm` + `UI.field`), podgląd w inspektorze.
5. Puste stany, brak wyników i błędy zaprojektowane.
6. Zrzuty w `tools/screenshot.js` (1440 / 1024 / 390 px, oba motywy) i sprawdzenie w `tests/browser/smoke.js`.
7. Pytania kontrolne z [ART_DIRECTION.md](ART_DIRECTION.md).
