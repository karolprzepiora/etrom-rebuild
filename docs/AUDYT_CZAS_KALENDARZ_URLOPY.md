# Audyt: Czas, Kalendarz, Urlopy (10.10.2026)

## Poprawione w audycie
- Widoki roczne (Urlopy, Kalendarz): każdy miesiąc na delikatnie szarym podkładzie (jasny i ciemny motyw).
- Urlop na przełomie roku liczył wszystkie dni do puli jednego roku. Teraz liczy osobno w puli każdego roku (test).
- Zakres bez dni roboczych (np. sama sobota i niedziela) był możliwy przy ręcznym zapisie nieobecności. Teraz jest odrzucany.
- Kafle sald w Urlopach zawsze dotyczyły bieżącego roku, nawet przy oglądaniu innego. Teraz podążają za oglądanym rokiem (etykieta „Pozostało w 2027”).
- Kalendarz, „Najmniejsza obsada”: pokazywała dni, które już minęły (np. lipiec w październiku). Teraz patrzy w przód.
- Urlopy na telefonie: strzałki okresu rozjeżdżały się od tytułu. Teraz są jedną grupą.
- Czas na telefonie, tydzień: nagłówek z nazwami dni stał osobno nad listą. Teraz jest ukryty.
- Obrys podkreślenia dni z wydarzeniami dopasowany do szarego podkładu.

## Lista optymalizacji (priorytet)
### Przed domknięciem (wysoki). Punkty 2–7 wdrożone 10.10.2026
1. Migracja starych szkoleń i „innych” nieobecności do wyjazdów (dziś są szare w Kalendarzu, a ukryte w Urlopach).
2. (zrobione) Anulowanie zatwierdzonego, przyszłego urlopu (prośba do zarządu, zarząd może od razu).
3. (zrobione) Edycja i skracanie L4 („wróciłem wcześniej”, „przedłuż”).
4. (zrobione) Klik w własny pasek lub wniosek w Urlopach otwiera szczegóły (wycofaj, anuluj, zmień).
5. (zrobione) Czas, Dzień: nawigacja wstecz, żeby uzupełnić i poprawić zapomniany dzień.
6. (zrobione) Podgląd wpływu przy składaniu wniosku (kto jeszcze nieobecny, terminy etapów) dla pracownika, nie tylko dla decydenta.
7. (zrobione) Powiadomienia o decyzji (Skrzynka lub Aktualności, potem e-mail).

### Szybkie wygrane (niski koszt). Punkty 8–12 wdrożone 10.10.2026
8. (zrobione) Legenda reaguje na wybraną warstwę („Pokaż”).
9. (zrobione) Wyjazd w bieżącym dniu liczony do czasu pracy dopiero od godziny rozpoczęcia, z podziałem na zaplanowane i zrealizowane.
10. (zrobione) Skok do daty (klik w tytuł otwiera wybór daty) w trzech zakładkach.
11. (zrobione) Skróty klawiszowe widoków i strzałek we wszystkich trzech zakładkach.
12. (zrobione) Etykiety „Pokaż” na telefonie nie zawijają się; agenda zamiast kafli miesiąca na telefonie.

### Wartość dodana (średni)
13. Urlop zaległy (ważny do 30 września), wymiar proporcjonalny dla nowych osób, opieka na dziecko (2 dni), okolicznościowy, bezpłatny; alert o wygasającym urlopie.
14. Dni wolne firmowe (mostki) ustawiane przez zarząd; okresy zamknięte dla urlopów.
15. Zespół w roku: osobno oczekujące wnioski, lista osób po kliknięciu dnia.
16. Eksport karty urlopowej (CSV, potem .xlsx) dla księgowości.
17. Czas: bilans narastający (nadgodziny, odbiór dnia wolnego), plan a wykonanie w tygodniu, „powtórz wczoraj”.
18. Czas dla zarządu: kto nie uzupełnił zapisów (mapa kompletności tygodnia).
19. Zamknięcie tygodnia i akceptacja lidera, blokada edycji po zamknięciu.
20. Kalendarz: tworzenie wyjazdu przez kliknięcie lub przeciągnięcie w kalendarzu, widok „Agenda”.
21. Dostępność: oznaczenia dni nie tylko kolorem (wzór lub litera).

### Później (platforma)
22. Subskrypcja kalendarza (webcal) zamiast jednorazowego .ics.
23. Pół dnia i godziny urlopu.
24. Przeciąganie terminów w kalendarzu.
