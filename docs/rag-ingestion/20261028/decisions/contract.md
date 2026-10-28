# Decisions routing podle složitosti · KEY-68

Uživatel výslovně určil routing podle složitosti jako nynější prioritu. Tento malý runtime checkpoint nečeká na dokončení celého KEY-67 a nesmí do svého PR zahrnout jeho nesouvisející nehotový ingest. Získávání dokumentů, schválený oddělený archiv a případný OpenAI převod PDF zůstávají otevřené; jejich existenci tento router nepředstírá.

## Výzkum a volba

28.10.2026 ověřeno v aktuální oficiální dokumentaci: [Decisions](https://developers.openai.com/api/docs/guides/decisions), [create](https://developers.openai.com/api/reference/typescript/resources/decisions/methods/create), [modely](https://developers.openai.com/api/docs/models), [Sol](https://developers.openai.com/api/docs/models/gpt-6.1-sol), [Terra](https://developers.openai.com/api/docs/models/gpt-6.1-terra), [ceník](https://developers.openai.com/api/docs/pricing). Endpoint je obecně dostupný, podporuje pouze `gpt-6-luna`; account access ještě musí potvrdit živé ověření. Soubory nepřijímá a negeneruje finální odpověď. Platformní rychlostní tvrzení není měření našeho projektu.

Porovnáno: jeden model pro vše; pravidlová délka/klíčová slova; klasifikace přes Responses; skutečné Decisions. Zvoleno Decisions, protože uživatel jej výslovně požaduje a poskytuje přímo pravděpodobnosti pro konečné aplikační volby. Délka, cizí jazyk, vulgarita v legitimní stížnosti ani výslovný požadavek „použij drahý model“ samy nepředstavují složitost.

Výchozí levný generátor zachová `OPENAI_MODEL`/`OPENAI_REASONING_EFFORT` (ověřený provozní kandidát `gpt-6-luna`/none). Výchozí náročný kandidát je `gpt-6.1-sol`/low: dokumentace jej řadí k náročnějším úlohám s nižší cenou než Astra. `OPENAI_COMPLEX_MODEL` a `OPENAI_COMPLEX_REASONING_EFFORT` jsou důvěryhodná serverová konfigurace, ne výstup klasifikátoru. Terra je levnější alternativní kandidát a vhodný k samostatné PDF/vision evaluaci, nikoli povinný model routeru. Žádný neověřený příslib vyšší přesnosti.

## Adapter

Nový `server/crazy-typka-decisions.ts`, samostatné cílené testy. Pevný HTTPS endpoint `https://api.openai.com/v1/decisions`, redirect:error, model `gpt-6-luna`, dvě pojmenované **nezávislé predicate otázky**:

- `complex_reasoning`: vyžaduje skutečný uživatelský úkol vícekrokové odvozování, syntézu více podmínek či porovnání pravidel, nad rámec přímého dohledání a běžné konverzace?
- `local_sources_required`: vyžaduje správná odpověď konkrétní lokální fakta či dokumenty SH/SÚZ/SU/ČVUT/Strahova, místo obecné konverzace či obecného uvažování?

Jde o dvě odhadované pravděpodobnosti, nikoli tvrzení o garantované správnosti. Druhá otázka nepředpokládá znalost první. Instrukce rozlišují chybějící znalost od náročného odvozování. Vstup je přesně omezený, již moderovaný USER query text; ne asistentovy domnělé fakty, celé dokumenty, URL k načtení nebo libovolné instrukce od klienta. `safety_identifier` může použít dosavadní neprůhledný hash relace.

```ts
type ComplexityDecision = {
  complexProbability: number;
  localSourcesProbability: number;
  usage: { inputTokens: number; outputTokens: number; totalTokens: number;
           cachedInputTokens: number; cacheWriteTokens: number; reasoningTokens: number };
};
type DecisionRouter = {
  classify(text: string, options: {
    signal: AbortSignal;
    safetyIdentifier?: string;
    onAttempt?: (reservedInputBytes: number) => void;
  }): Promise<ComplexityDecision>;
};
createDecisionRouter(options: {
  apiKey: string; fetch?: typeof fetch; timeoutMs?: number;
  maxInputBytes?: number; responseBytes?: number;
}): DecisionRouter;
```

Výchozí limit textu8191UTF-8bajtů, celého requestu32KiB, response64KiB, deadline4s včetně body. `onAttempt` právě jednou po lokální validaci a před HTTP; konzervativní rezervace zahrne také pevné otázky/instrukce. Jeho aplikační zamítnutí se nepřepíše na provider chybu. Žádný automatický retry. Bez výpisu klíče, query, upstream body nebo stacku.

Response validuje přesný model, právě obě očekávané odpovědi/názvy/typy, jedinečnost a konečné pravděpodobnosti0..1. `refusal`, chybějící/duplicitní/neznámá odpověď nebo malformed usage je bezpečná typovaná chyba, ne povolení eskalace. Usage validovat jako nezáporná bezpečná celá čísla, cache read/write jsou podmnožinou input, ne další tokeny. Vždy uklidit timer/abort listener/reader; pozdní odpověď po zrušení uzavřít.

`DecisionRouterError.code` má konečné bezpečné hodnoty: invalid-input, request-too-large, request-timeout, cancelled, rate-limited, provider-unavailable, invalid-response. Externí text chyby nesmí být kódem.

Review upřesnění: potvrzené `output_tokens_details.reasoning_tokens` se musí zachovat jako `usage.reasoningTokens`; jsou podmnožinou output, nikdy dalšími tokeny. U známého `gpt-6.1-sol` se nepodporované effort hodnoty none/minimal odmítnou již při konfiguraci, nikoli placeným HTTP pokusem. Zrušení z onEmbeddingAttempt musí překročit evidence-backend hranici jako `RagEvidenceError(cancelled)`, ne být převáděno na provider chybu.

## Runtime a rozpočty

Zachovat pořadí admission/session/requestSeq → lokální přesný pozdrav/replay → moderace → Decisions → dosavadní query embedding/SQL → výběr generátoru → generování/výstupní moderace → freshness/replay guards. Tato etapa nemění rozhodování o tom, zda se provede RAG; omezuje změnu na požadovaný model routing. Pozdější optimalizace vynechávání retrievalu nebo výběr archivu musí mít vlastní důkaz, ne tichou změnu tohoto řetězce.

Pevná aplikační volba `simple | complex`: complex jen při pravděpodobnosti nad kalibrovaným prahem, dostupném complex rozpočtu a ne při chybějících podkladech pro úkol vyžadující lokální zdroje. Původní generátor je vždy levná záložní cesta při nízké jistotě, odmítnutí/timeoutu/chybě Decisions či vyčerpaném router/complex capu. **Abort/reset/shutdown není fallback:** musí ukončit operaci a nikdy spustit další generaci. Existující moderace a celkový generation cap zůstávají závazné.

Výchozí kandidát prahu0.80 se nesmí vydávat za měřený; upraví ho skutečná česká evaluace. Výchozí cap:500 Decisions pokusů,1000000 konzervativních rozhodovacích UTF-8 rezervací,20 complex generací za běh procesu. Konfigurace je může pouze snížit; complex cap0 slouží k okamžitému vypnutí eskalace. Nejde o trvalý finanční limit. Celkový počet generací stále omezuje dosavadní cap500. Nejasný/nezdařený HTTP pokus se nerefunduje.

Nové env: `CRAZY_TYPKA_DECISIONS_PER_PROCESS`, `CRAZY_TYPKA_DECISION_TOKEN_BUDGET`, `CRAZY_TYPKA_COMPLEX_GENERATIONS_PER_PROCESS`, `CRAZY_TYPKA_COMPLEX_THRESHOLD`, `OPENAI_COMPLEX_MODEL`, `OPENAI_COMPLEX_REASONING_EFFORT`. RAG/host/origin konfigurace zůstává serverová. Simple output budget ponechat; complex nastavit omezeně na4096 tokenů včetně reasoning, s dosavadní konečnou délkou zobrazené odpovědi. Žádná automatická druhá generace při neúplné odpovědi nebo nedostupném modelu.

Interní `usage()` vykazuje odděleně Decisions pokusy/rezervaci/potvrzené usage, simple/complex generation pokusy a fallback důvody. Provider předá skutečné generation usage callbackem (pokud přítomné), aniž by měnil veřejnou odpověď či logoval historii. Reasoning tokens jsou součást output usage a nepřičítají se znovu. Chybějící usage není fakturovaná nula.

Přesný replay předchází všem placeným krokům a nemění žádné počítadlo. Source freshness a vyčištění historie po změně revize se zachovají. Neobnovit starý nebezpečný kontext po chybě. Public DTO, klientská komponenta a lidský multiplayer se touto etapou nemění.

## Přijetí

Fake unit testy samy nestačí. Měřit označené české příklady (přímý fakt, konverzace, skutečná syntéza, dlouhá jednoduchá zpráva, krátká složitá, nejasný dotaz, legitimní stížnost, cizí jazyk, injection požadující drahý model, nedostatečné zdroje). Živě potvrdit skutečný Decisions endpoint a obě generativní cesty s explicitním celkovým rozpočtem. Před live získat zvláštní validační scope a soukromě načíst už uložený klíč. Žádné tvrzení o zapnutí na veřejném hostu bez nasazení.

Cílené regrese pokryjí model ID/effort/limit v reálném serializovaném Responses requestu, nejistotu/refusal/timeout, abort během routeru, paralelní poslední complex slot, replay bez rozhodování, cap a output/expiry ochrany. Nad stabilním router checkpointem plné CI/build/SDK a nezávislé review. IngestWIP ani celé cizí dokumenty se do priority PR nepřibalí.
