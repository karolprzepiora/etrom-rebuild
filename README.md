# ETROM — wersja 2

Aplikacja do prowadzenia projektów, etapów i terminów. Działa lokalnie,
**bez instalacji i bez serwera** — wystarczy dwuklik na `index.html`.

Interfejs jest zbudowany według **[UI/UX Standard v1.0](docs/DESIGN_SYSTEM.md)** —
obowiązującego dla każdego kolejnego ekranu i każdej nowej funkcji.

![ETROM — lista projektów](docs/screenshots/etrom-projekty.png)

![ETROM — szczegóły projektu](docs/screenshots/etrom-projekt.png)

## Uruchomienie

1. Pobierz i rozpakuj **cały** folder.
2. Kliknij dwukrotnie `index.html`.

To wszystko. Nie trzeba Node.js, npm ani niczego instalować.
Jeśli wolisz adres `http://`, działa też przez dowolny serwer statyczny,
na przykład `python -m http.server 8000`.

Pierwsze uruchomienie jest puste. Przycisk **Dodaj dane przykładowe** dopisuje pięć
projektów z etapami, zadaniami i zespołem, żeby było na czym sprawdzić program.
Później ta sama czynność, kopia zapasowa i usuwanie danych są w menu
**Ustawienia i dane** na dole panelu bocznego.

## Co już działa

- lista projektów w tabeli (domyślnie) albo w kartach, z postępem rzeczowym liczonym **wagą godzin etapów**,
- **szczegóły projektu pod własnym adresem** (`#/projekty/12`) z zakładkami Etapy, Zadania, Zespół
  i paskiem kluczowych liczb — działa przycisk Wstecz i link do konkretnego projektu,
- dodawanie, edycja i usuwanie projektu, z walidacją przy polach
  (kod projektu musi być niepowtarzalny),
- 14 standardowych etapów jako **szablon do wyboru** — projekt bierze tylko te, które go dotyczą,
- **etapy spoza standardu** z własną nazwą, dziedziną, budżetem i terminem,
- kolejność etapów ustawiana w projekcie, więc własny etap może stanąć pomiędzy standardowymi,
- status etapu przełączany kliknięciem: *Do wykonania → W toku → Zakończony*,
- terminy z opisem stanu: *po terminie*, *termin dzisiaj*, *pozostało N dni*,
- szukanie po kodzie, nazwie i zamawiającym; filtry statusu i osoby; cztery sortowania,
- tabela z przyklejonym nagłówkiem, sortowaniem z nagłówka, wyborem kolumn,
  zaznaczaniem wierszy i **akcjami zbiorczymi** (zmiana statusu, usunięcie z cofnięciem),
- zapis lokalny w przeglądarce (`localStorage`) oraz pobieranie i wczytywanie kopii JSON,
- automatyczny odczyt danych ze starszej wersji ETROM (klucz `etrom.workspace.v2`) —
  stary zapis zostaje nietknięty,
- motyw jasny, ciemny albo zgodny z systemem — wybór zostaje na urządzeniu,
- paleta poleceń pod `Ctrl+K`: skok do projektu po fragmencie nazwy albo uruchomienie działania,
- obsługa klawiatury: `N` nowy projekt lub osoba, `E` edycja projektu, `/` wyszukiwarka,
  `Esc` zamyka menu i panel, `Ctrl+Enter` zapisuje formularz, strzałki w menu,
- usuwanie działa od razu i przez kilka sekund da się je cofnąć,
- trzy warianty akcentu (malinowy, morski, grafitowy) obok motywu jasnego i ciemnego,
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
- formularze w panelu wysuwanym, potwierdzenia we własnych oknach aplikacji,
- układ dopasowany do szerokości: pełny na monitorze, uproszczony na laptopie,
  z wysuwanym panelem bocznym na telefonie.

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
  tokens.css            barwy, typografia, odstępy, promienie, warstwy, ruch — jedno źródło prawdy
  base.css              reset, role typograficzne, fokus
  components.css        komponenty bazowe (przyciski, pola, menu, tabela, okna…)
  layout.css            szkielet: panel boczny, pasek górny, strona, szerokości
  views.css             układ treści konkretnych ekranów
docs/
  DESIGN_SYSTEM.md      UI/UX Standard v1.0 — obowiązujące zasady interfejsu
  UI_AUDIT.md           audyt interfejsu przed przebudową
src/core/               logika, zero kodu dotykającego DOM
  catalog.js            14 etapów i dziedziny
  team.js               katalog osób i funkcje w projektach
  tasks.js              zadania, przepływ statusów i udziały realizatorów
  model.js              fabryki i walidacja
  progress.js           postęp i terminy
  query.js              szukanie, filtrowanie, sortowanie
  storage.js            zapis lokalny i odczyt starej wersji
  store.js              pojemnik na stan
  format.js             daty, liczby i polska odmiana przez liczby
src/ui/                 warstwa widoku
  dom.js                budowanie elementów, przerysowanie z zachowaniem fokusu
  icons.js              jeden zestaw ikon
  components.js         komponenty bazowe (ETROM.UI)
  menu.js, tooltip.js   menu rozwijane, popover, podpowiedzi
  dialog.js, toast.js   okna, panel boczny, powiadomienia
  shell.js              panel boczny, ścieżka, ustawienia
  projectList.js        tabela i karty projektów
  projectDetail.js      szczegóły projektu z zakładkami
  stageList.js          etapy
  taskList.js           zadania
  teamScreen.js         ekran Zespołu
  *Form.js              formularze w panelu bocznym
  app.js                stan, adresy, działania, rysowanie
tests/                  testy logiki (Node) i test przeglądarki
tools/screenshot.js     zrzuty ekranu obu motywów
```

Podział jest celowy: w `src/core` nie ma ani jednego odwołania do DOM, więc
liczenie postępu, terminów i walidację da się przetestować bez przeglądarki.
Widok tylko czyta stan i rysuje.

## Testy

```bash
node --test tests/*.test.js     # 174 testy logiki i kontrastu barw, bez przeglądarki
node tests/browser/smoke.js     # 97 sprawdzeń w Chromium, na adresie file://, z prawdziwą klawiaturą
node tools/screenshot.js        # 25 zrzutów: ekrany, motywy, 1440/1024/390 px, menu, panel, puste stany
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

**Dlaczego projekt ma tylko mały kwadrat koloru, a nie okładkę?**
Barwa jest wyliczana z kodu projektu (`src/core/identity.js`), więc ten sam
projekt zawsze ma ten sam znacznik — w tabeli, na karcie i w panelu bocznym.
Gradientowe okładki z warstwicami wyglądały efektownie przy pięciu projektach,
ale przy kilkudziesięciu robiły z listy mozaikę, w której kolor przestawał
cokolwiek znaczyć. Został znacznik tożsamości, a kolor pracuje dla stanu.
Malinowy akcent marki został — jako kolor interakcji, nie dekoracji.

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

**Dlaczego przejścia widoku tylko przy zmianie ekranu?**
`startViewTransition` odkłada zmianę o klatkę i na czas przejścia zamraża
stronę. Przy zmianie ekranu i układu to się opłaca — widać, skąd przyszła
nowa treść. Przy rozwijaniu etapu czy zmianie statusu nie: tam reakcja
ma być natychmiastowa.

**Dlaczego szczegóły projektu to osobny ekran, a nie rozwinięta karta?**
Rozwinięta karta mieściła portfel, projekt, czternaście etapów i ich zadania
w jednym przewijanym ekranie. Nie dało się do projektu wrócić linkiem, a lista
przestawała być listą. Teraz lista służy porównaniu projektów, a szczegóły —
pracy w jednym projekcie, z adresem, który działa z przyciskiem Wstecz.

**Dlaczego status zadania zmienia się z menu, a nie dowolnie?**
Dozwolone przejścia są w modelu (`src/core/tasks.js`), a menu pokazuje
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
reakcji, więc została po niej tylko mała ikona. Ciężar wizualny przejął
stan — ikona o kształcie stanu i nazwa; zakończony etap jest wyciszony. Kolor terminu pojawia się wyłącznie przy przekroczeniu lub
tygodniu zapasu — bursztyn dla miesięcznego zapasu w czternastu wierszach
był szumem, nie informacją.

**Dlaczego status ma ikonę o kształcie, a nie tylko kolor?**
Osoba z zaburzeniami widzenia barw nie odróżni „W toku” od „Do zatwierdzenia”
po samym kolorze plakietki. Każdy stan ma własny kształt (puste koło, półkole,
trzy czwarte, ptaszek…), więc da się go odczytać nawet na wydruku czarno-białym.

**Dlaczego ruch pojawia się tylko miejscami?**
Aplikacja przerysowuje listę przy każdej zmianie, więc animacja wejścia
na każdym elemencie włączałaby się także przy wpisywaniu w wyszukiwarkę.
Zamiast tego pamiętany jest poprzedni stan i ruch pokazuje wyłącznie to,
co naprawdę się zmieniło: pasek postępu przechodzi ze starej wartości,
zmieniony etap lub zadanie na chwilę się podświetla.
Wszystko ustępuje przy włączonym ograniczeniu ruchu w systemie.

**Dlaczego nie ma webfontu?**
Aplikacja musi działać z dysku, bez sieci. Pobierany krój by się nie wczytał,
więc charakter buduje skala, grubość i światło, a nie plik z serwera.

**Dlaczego sortowanie po terminie odsuwa projekty zakończone?**
Projekt zamknięty nie ma już czynnego terminu, a przy sortowaniu po dacie
potrafił zająć czoło listy datą sprzed wielu tygodni. Wyszło to dopiero
w teście przeglądarkowym.
