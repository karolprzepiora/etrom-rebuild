# ETROM: kierunek rozwoju

**Cel:** najlepsze narzędzie do prowadzenia biura projektowego z branży hydrotechnicznej. Nie ogólny menedżer zadań, tylko system, który zna pracę biura: umowy, etapy projektowe, postępowania administracyjne, godziny i odbiory.

## Jedna pętla, na której stoi całość

**Umowa → Plan → Praca → Czas → Nadzór → Rozliczenie → Wiedza**

Każda część zasila następną: umowa daje terminy i budżet, plan rozdziela pracę, zegar zapisuje czas, nadzór zatwierdza, rozliczenie porównuje budżet z rzeczywistością, a z tego powstają lepsze budżety kolejnych projektów.

## Filary

| # | Filar | Stan | Co zawiera |
|---|---|---|---|
| 1 | Przebieg pracy | **gotowe** | projekty, etapy z rodzajami pracy, zadania i statusy, Flow, Moja praca, zegar czasu |
| 2 | Postępowania administracyjne | następny | wnioski i decyzje: urząd, numer sprawy, data złożenia, terminy ustawowe i odliczanie, uzupełnienia, odwołania, ważność decyzji i alarm przed wygaśnięciem |
| 3 | Plan i zasoby | planowany | oś czasu portfela, obciążenie osób w tygodniach, urlopy i dostępność, prognoza terminów z faktycznego tempa |
| 4 | Nadzór i jakość | planowany | kolejka do zatwierdzenia, kontrola wewnętrzna etapu (lista kontrolna), historia decyzji, zwroty z uzasadnieniem |
| 5 | Platforma | do decyzji o serwerze | konta i hasła, role i uprawnienia, wspólna baza w chmurze, kopie zapasowe, dziennik zmian, aplikacja na telefon do zegara |
| 6 | Finanse (dla dyrekcji) | planowany | wartość umowy i harmonogram płatności wg odbiorów, koszt godzin, rentowność projektu, prognoza |
| 7 | Dokumenty i komunikacja | planowany | pliki przy etapie i zadaniu, komentarze i wzmianki, powiadomienia, korespondencja urzędowa |
| 8 | Wiedza biura | planowany | budżety godzin wyliczane z historii czasu (dla każdego typu etapu), szablony projektów, raporty |

## Dlaczego taka kolejność

1. **Postępowania administracyjne najpierw.** To część pracy, której nie obsługuje żadne ogólne narzędzie, a przekłada się na terminy i ryzyko. Rodzaje pracy (Decyzje) już rozróżniają takie etapy.
2. **Plan pracy i Nadzór** korzystają z danych o ludziach, czasie i postępowaniach, które już mamy lub dopiero dodamy.
3. **Platforma** wchodzi wtedy, gdy zapadnie decyzja o miejscu działania serwera. Model danych jest już przygotowany (identyfikatory, dopisywane rekordy, wersjonowanie), więc nowe ekrany nie będą wymagały przebudowy. Kolejne funkcje powstają na obecnym zapisie lokalnym.
4. **Finanse i Wiedza biura** potrzebują miesięcy realnych danych o czasie, więc najpierw trzeba zbierać czas.

## Zasady, których się trzymamy

- Jeden spójny język wizualny (ETROM Flow System): kolor znaczy stan, nie ozdobę.
- Każda funkcja pokazuje, co wymaga reakcji, zanim pokaże dane.
- Dane zapisywane tak, żeby wspólna baza nie wymagała ich przebudowy.
- Każdy krok kończy się testami, zrzutami ekranu i aktualną dokumentacją.
