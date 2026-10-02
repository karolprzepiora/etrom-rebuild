# ETROM — wersja 2

Aplikacja do prowadzenia projektów, etapów i terminów. Działa lokalnie,
**bez instalacji i bez serwera** — wystarczy dwuklik na `index.html`.

![ETROM — widok projektów](docs/screenshots/etrom-light.png)

![ETROM — ekran Zespołu](docs/screenshots/etrom-zespol.png)

## Uruchomienie

1. Pobierz i rozpakuj **cały** folder.
2. Kliknij dwukrotnie `index.html`.

To wszystko. Nie trzeba Node.js, npm ani niczego instalować.
Jeśli wolisz adres `http://`, działa też przez dowolny serwer statyczny,
na przykład `python -m http.server 8000`.

Pierwsze uruchomienie jest puste. Przycisk **Dane testowe** dopisuje pięć
przykładowych projektów, żeby było na czym sprawdzić listę, etapy i postęp.

## Co już działa

- lista projektów w kartach, z postępem rzeczowym liczonym **wagą godzin etapów**,
- dodawanie, edycja i usuwanie projektu, z walidacją przy polach
  (kod projektu musi być niepowtarzalny),
- 14 standardowych etapów jako **szablon do wyboru** — projekt bierze tylko te, które go dotyczą,
- **etapy spoza standardu** z własną nazwą, dziedziną, budżetem i terminem,
- kolejność etapów ustawiana w projekcie, więc własny etap może stanąć pomiędzy standardowymi,
- status etapu przełączany kliknięciem: *Do wykonania → W toku → Zakończony*,
- terminy z opisem stanu: *po terminie*, *termin dzisiaj*, *pozostało N dni*,
- szukanie po kodzie, nazwie i zamawiającym; filtr statusu; cztery sortowania,
- zapis lokalny w przeglądarce (`localStorage`) oraz pobieranie i wczytywanie kopii JSON,
- automatyczny odczyt danych ze starszej wersji ETROM (klucz `etrom.workspace.v2`) —
  stary zapis zostaje nietknięty,
- widok kart i gęsty widok listy z sortowaniem po kolumnach,
- motyw jasny, ciemny albo zgodny z systemem — wybór zostaje na urządzeniu,
- paleta poleceń pod `Ctrl+K`: skok do projektu po fragmencie nazwy albo uruchomienie działania,
- obsługa klawiatury: `N` nowy projekt, `/` skok do wyszukiwarki, `Esc` zamyka panel,
- pasek czternastu etapów na karcie — stan całego projektu bez rozwijania,
- usuwanie działa od razu i przez kilka sekund da się je cofnąć,
- trzy warianty barw (standard, hydro, topo) obok motywu jasnego i ciemnego,
- **ekran Zespołu**: katalog osób, role w organizacji, forma współpracy,
  wyłączanie z obiegu z zachowaniem historii,
- **funkcje w projekcie**: Lider, Koordynator, Pełnomocnik wiodący i dodatkowy
  oraz pozostali członkowie zespołu — relacje oparte o stabilny identyfikator osoby,
- awatary zespołu na kartach i w liście projektów, filtr projektów po osobie,
- **zadania w etapach**: nazwa, termin z godziną, nakład pracy, opis, znacznik ważności,
- przepływ statusów zadania: *Do wykonania → W toku → Do zatwierdzenia → Zakończone*,
  ze zwrotem **Do poprawy**, który wymaga podania powodu,
- **realizatorzy zadania** to jawny podzbiór zespołu projektu; każdy ma własny stan udziału
  (*Do wykonania / W toku / Gotowe*) przestawiany jednym kliknięciem,
- liczniki zadań otwartych i po terminie w wierszu etapu oraz na karcie projektu,
- formularz w panelu wysuwanym, potwierdzenia we własnych oknach aplikacji.

## Świadome uproszczenia wobec poprzedniej wersji

Poprzedni ETROM miał w przepływie zadania osobny status **Zatwierdzone**
obok **Zakończone**. W jego własnej mapie przejść oba prowadziły w to samo
miejsce, więc tutaj jest jeden stan końcowy. Jeśli rozróżnienie okaże się
potrzebne w pracy biura, wraca jako jeden wpis w mapie przejść.

Nie ma jeszcze **Kroków** — wydzielonych czynności jednej osoby wewnątrz
zadania. Ich rolę częściowo pełni stan udziału każdego realizatora.

## Czego jeszcze nie ma

Kroki wewnątrz zadań, ewidencja czasu pracy, Nadzór, Plan pracy, moduł Moje,
Kanban i Gantt. To kolejne kroki przebudowy — poprzednia wersja aplikacji
ma je i zostaje nienaruszona do czasu, aż nowa je dogoni.

## Układ plików

```
index.html              jedyny plik do otwarcia
styles/
  tokens.css            kolory, odstępy, typografia — jedno źródło prawdy
  app.css               komponenty i układ
src/core/               logika, zero kodu dotykającego DOM
  catalog.js            14 etapów i dziedziny
  team.js               katalog osób i funkcje w projektach
  tasks.js              zadania, przepływ statusów i udziały realizatorów
  model.js              fabryki i walidacja
  progress.js           postęp i terminy
  query.js              szukanie, filtrowanie, sortowanie
  storage.js            zapis lokalny i odczyt starej wersji
  store.js              pojemnik na stan
src/ui/                 warstwa widoku
  dom.js                budowanie elementów
  stageList.js          lista etapów
  projectCard.js        karta projektu
  projectForm.js        formularz
  app.js                spięcie całości
tests/                  testy logiki (Node) i test przeglądarki
tools/screenshot.js     zrzuty ekranu obu motywów
```

Podział jest celowy: w `src/core` nie ma ani jednego odwołania do DOM, więc
liczenie postępu, terminów i walidację da się przetestować bez przeglądarki.
Widok tylko czyta stan i rysuje.

## Testy

```bash
node --test tests/*.test.js     # 161 testów logiki, bez przeglądarki
node tests/browser/smoke.js     # 66 sprawdzeń w Chromium, na adresie file://
node tools/screenshot.js        # zrzuty ekranu do docs/screenshots
```

Testy nie mają żadnych zależności z npm — korzystają z wbudowanego
`node:test` i protokołu DevTools. Test przeglądarkowy uruchamia aplikację
dokładnie tak, jak robi to dwuklik z dysku, więc sprawdza także to,
czy zapis lokalny działa na `file://`.

Wymagany Node.js 22 lub nowszy — **tylko do testów**, nie do działania aplikacji.

## Decyzje techniczne

**Dlaczego klasyczne skrypty, a nie moduły ES ani framework?**
Aplikacja ma działać po dwukliku z rozpakowanego folderu. Moduły ES
(`<script type="module">`) nie wczytują się z adresu `file://`, bo przeglądarka
blokuje je regułami CORS. Framework taki jak React wymagałby kroku budowania,
czyli instalacji Node.js po stronie użytkownika. Dlatego pliki ładują się jako
zwykłe skrypty i wystawiają się w jednej przestrzeni nazw `window.ETROM`,
z zabezpieczeniem pozwalającym wczytać je też w Node do testów.

**Dlaczego elementy budowane są przez DOM, a nie przez sklejanie HTML?**
Nazwa projektu wpisana przez użytkownika nigdy nie trafia do `innerHTML`.
Znika przez to cała klasa błędów z escapowaniem — jest na to test.

**Skąd biorą się kolory okładek projektów?**
Barwa jest wyliczana z kodu projektu (`src/core/identity.js`), więc ten sam
projekt zawsze wygląda tak samo, a sąsiednie kody dostają odległe odcienie.
Warstwice na okładce nawiązują do map terenu — to język tej branży.
Paleta marki (malinowy akcent, mięta, granatowy pasek) jest przeniesiona
z poprzedniej wersji aplikacji, nie wymyślona od nowa.

**Dlaczego własne okna zamiast `confirm()` przeglądarki?**
Systemowe okienko z napisem „localhost mówi” wygląda jak awaria, a nie jak
część programu. Potwierdzenia i panel formularza korzystają z natywnego
`<dialog>`, więc uwięzienie fokusa i zamykanie Escapem działają bez
dopisywania własnej obsługi, a wygląd jest w całości nasz.

**Dlaczego „Cofnij” zamiast „czy na pewno”?**
Pytanie przed każdym usunięciem spowalnia pracę, a i tak klika się je
odruchowo. Usunięcie wykonuje się od razu, a pasek na dole pozwala je
odwołać przez kilka sekund — to ratuje również pomyłki, które zostałyby
potwierdzone bez czytania. Okno potwierdzenia zostało tam, gdzie znika
wszystko naraz: przy czyszczeniu danych programu.

**Dlaczego przejścia widoku tylko przy zmianie kart na listę?**
`startViewTransition` odkłada zmianę o klatkę i na czas przejścia zamraża
stronę. Przy zmianie układu, gdzie ten sam projekt wędruje z kafla do
wiersza, to się opłaca. Przy rozwijaniu etapów nie — tam wystarcza tania
animacja wejścia, a przejście tylko opóźniałoby reakcję.

**Dlaczego status zadania zmienia się z listy, a nie dowolnie?**
Dozwolone przejścia są w modelu (`src/core/tasks.js`), a lista pokazuje
tylko te, które wolno wykonać z bieżącego stanu. Interfejs nie zna reguł
przepływu — pyta o nie model, więc nie da się obejść ich klikaniem.
Zwrot do poprawy bez powodu jest odrzucany przez model, nie przez formularz.

**Dlaczego funkcje w projekcie wskazują na identyfikator, a nie na imię?**
Wpisane imię i nazwisko rozjeżdża się przy pierwszej literówce i przy zmianie
nazwiska. Funkcja jest relacją `osoba ↔ projekt` opartą o stabilne `id`, więc
zmiana danych osoby nie gubi jej przypisań. Dwa pełnomocnictwa to niezależne
sloty, a osoba pełniąca funkcję należy do zespołu z urzędu.

**Dlaczego osoby się nie usuwa, tylko wyłącza?**
Usunięcie zerwałoby historię projektów, w których ktoś pracował. Osobę
z przypisaniami da się tylko wyłączyć z obiegu — znika z list wyboru,
ale zostaje w projektach. Wyłączenie jest blokowane, dopóki pełni funkcję
w niezakończonym projekcie. Usunąć wprost można tylko osobę bez żadnych
przypisań.

**Skąd numery etapów, skoro projekt nie ma wszystkich czternastu?**
Na kafelku jest numer kolejny w tym projekcie, żeby lista nie miała dziur,
a przynależność do standardu stoi w podpisie („Wodnoprawne · standard 07”).
Dzięki temu lista czyta się ciągle, a wspólny język biura zostaje.
Etap dopisany w projekcie ma w podpisie „własny”.

**Dlaczego lista etapów jest tak oszczędna w kolorze?**
Wcześniej każdy etap miał duży nagłówek w kolorze dziedziny — czternaście
plam konkurujących o uwagę. Dziedzina to klasyfikacja, nie powód do
reakcji, więc został po niej tylko mały kafelek ikony. Ciężar wizualny
przejął stan: etap w toku ma krawędź w kolorze akcentu, zakończony jest
wyciszony. Kolor terminu pojawia się wyłącznie przy przekroczeniu lub
tygodniu zapasu — bursztyn dla miesięcznego zapasu w czternastu wierszach
był szumem, nie informacją.

**Dlaczego pasek etapów pokazuje stan, a nie dziedzinę?**
Czternaście segmentów w kolorach dziedzin zlewało się w tęczę, z której
nie dało się odczytać postępu. Teraz kolor niesie stan: zakończone,
w toku, przed nami. Dziedzinę pokazuje pasek na okładce i karty etapów.

**Dlaczego ruch pojawia się tylko miejscami?**
Aplikacja przerysowuje listę przy każdej zmianie, więc animacja wejścia
na każdym elemencie włączałaby się także przy wpisywaniu w wyszukiwarkę.
Zamiast tego pamiętany jest poprzedni stan i ruch pokazuje wyłącznie to,
co naprawdę się zmieniło: pasek postępu przechodzi ze starej wartości,
zmieniony etap błyska, lista etapów wsuwa się przy rozwinięciu.
Wszystko ustępuje przy włączonym ograniczeniu ruchu w systemie.

**Dlaczego nie ma webfontu?**
Aplikacja musi działać z dysku, bez sieci. Pobierany krój by się nie wczytał,
więc charakter buduje skala, grubość i światło, a nie plik z serwera.

**Dlaczego sortowanie po terminie odsuwa projekty zakończone?**
Projekt zamknięty nie ma już czynnego terminu, a przy sortowaniu po dacie
potrafił zająć czoło listy datą sprzed wielu tygodni. Wyszło to dopiero
w teście przeglądarkowym.
