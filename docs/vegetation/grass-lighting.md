# Tráva: společné PBR světlo a zachovaný detail

11. 10. 2026. Původní vlastní shader kreslil trávu bez skutečných světel a stínů, s pevným nočním minimem. Nynější `grass-material.ts` používá PBR světla, oblohu, mlhu a stíny téže scény jako terén a stromy. Nemá vlastní emisní světlo. Lampy se nepřepočítávají samostatnou přibližnou funkcí trávy.

Vítr posouvá skutečné světové souřadnice po natočení a naklonění jednotlivého shluku. Tráva tedy nezmění směr větru náhodným natočením instance. Kořeny zůstávají ukotvené, pohyb roste směrem ke špičce a při nulovém větru je nulový. Místo jediné rovné křížové trojice má autorský shluk16 rozptýlených, zakřivených úzkých stébel se skutečnými normálami. Jde o obecnou trávu, nikoli fotogrammetrický inventář jednotlivých strahovských stébel.

| Kvalita | Kreslená stébla ve shluku | Trojúhelníky ve shluku |
|---|---:|---:|
| Úsporná | 4 | 16 |
| Střední | 8 | 32 |
| Vysoká | 16 | 64 |

Všech 96 zdrojových vrcholů a indexy nejvyššího detailu zůstávají zachované. Kvalita vybírá pouze jeden sdílený indexový buffer; nevytváří tři kopie 597 dlaždic ani jeden mesh na stéblo. Konzervativní bounds obsahují celý nejdetailnější shluk plus 10 cm v osách X/Z pro ohyb ve větru. Volba detailu nemůže zmenšit frustum hranice a nečekaně skrýt blízkou trávu. Od skutečných hran zpevněných ploch včetně děr se vylučuje 35 cm pro šířku shluku a maximální vítr. Rozmístění nyní obsahuje 80 576 shluků; aktivní zůstávají limity 16/24/32 dlaždic a vzdálenostní fade.

Tráva přijímá stíny. Její vrhání vlastních stínů zůstává vypnuté; ani nejvyšší indexový detail se nevydává za plnou světelnou simulaci každého stébla. Podkladové CC0 PBR textury terénu se nezměnily. Při kontrole v celé Game se první PBR verze načetla s `data-render-error-count=0`; po změně nejdetailnější geometrie je nutný nový cold reload a aktuální produkční benchmark. Komponentové pohledy a NullEngine nejsou důkazem FPS celé hry.
